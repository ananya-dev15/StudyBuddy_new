from flask import Flask, Response, jsonify
import cv2
import mediapipe as mp
from ultralytics import YOLO
import numpy as np
import time
import os
import csv
from datetime import datetime

# ========= Settings =========
ALERT_COOLDOWN_SEC = 3.0
LOG_DIR = "focus_logs"
FOCUS_MAX = 100
FOCUS_MIN = 0
AWAY_THRESHOLD = 10.0
# ===========================

app = Flask(__name__)

# ----- Sound helper -----
def play_alert():
    try:
        import winsound
        winsound.Beep(1000, 300)
        return
    except:
        pass
    try:
        os.system('say "Stay Focused" >/dev/null 2>&1 &')
        return
    except:
        pass
    print("\a")

# ----- CSV helpers -----
def ensure_log_dir():
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR)

def today_csv_path():
    ensure_log_dir()
    fname = datetime.now().strftime("%Y-%m-%d") + ".csv"
    return os.path.join(LOG_DIR, fname)

def init_csv_if_needed():
    path = today_csv_path()
    if not os.path.exists(path):
        with open(path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow([
                "timestamp","status","gaze_status","faces_detected",
                "phone_detected","focus_score"
            ])

def log_row(ts, status, gaze_status, faces_detected, phone_detected, focus_score):
    init_csv_if_needed()
    with open(today_csv_path(), "a", newline="") as f:
        w = csv.writer(f)
        w.writerow([ts, status, gaze_status, faces_detected, int(phone_detected), focus_score])

# ===== Mediapipe + YOLO init =====
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils
yolo_model = YOLO("yolov8n.pt")

def get_head_pose(landmarks, img_shape):
    h, w = img_shape
    nose = np.array([landmarks[1].x * w, landmarks[1].y * h])
    chin = np.array([landmarks[152].x * w, landmarks[152].y * h])
    left_ear = np.array([landmarks[234].x * w, landmarks[234].y * h])
    right_ear = np.array([landmarks[454].x * w, landmarks[454].y * h])

    dy = chin[1] - nose[1]
    dx = chin[0] - nose[0]
    pitch_angle = np.degrees(np.arctan2(dy, dx))

    dist_left = np.linalg.norm(nose - left_ear)
    dist_right = np.linalg.norm(nose - right_ear)
    yaw_ratio = dist_left / (dist_right + 1e-6)

    if 0.7 < yaw_ratio < 1.3:
        if -15 < pitch_angle < 15:
            return "screen"
        elif pitch_angle > 15:
            return "notebook"
        else:
            return "away"
    else:
        return "away"

# ===== Global state =====
cap = cv2.VideoCapture(0)
focus_score = 100
last_tick = time.time()
last_alert_time = 0.0
sound_enabled = True
frame_counter_for_log = 0
look_away_start = None

latest_payload = {
    "status": "Waiting...",
    "gaze_status": "away",
    "faces_detected": 0,
    "phone_detected": False,
    "focus_score": 100
}

face_mesh = mp_face_mesh.FaceMesh(refine_landmarks=True, max_num_faces=2)

def generate_frames():
    global focus_score, last_tick, last_alert_time, frame_counter_for_log, look_away_start, latest_payload

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = face_mesh.process(rgb)

        faces_detected = 0
        gaze_status = "away"

        if result.multi_face_landmarks:
            faces_detected = len(result.multi_face_landmarks)
            if faces_detected == 1:
                landmarks = result.multi_face_landmarks[0].landmark
                gaze_status = get_head_pose(landmarks, frame.shape[:2])
                mp_drawing.draw_landmarks(
                    frame,
                    result.multi_face_landmarks[0],
                    mp_face_mesh.FACEMESH_CONTOURS
                )

        # Phone detection
        phone_detected = False
        results = yolo_model(frame, verbose=False)
        for r in results:
            for box in r.boxes:
                cls = int(box.cls[0])
                conf = float(box.conf[0])
                if r.names[cls] == "cell phone" and conf > 0.5:
                    phone_detected = True
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    cv2.putText(frame, "Phone", (x1, y1 - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

        # away timer
        if gaze_status == "away":
            if look_away_start is None:
                look_away_start = time.time()
        else:
            look_away_start = None

        away_long_enough = False
        if look_away_start is not None:
            if time.time() - look_away_start >= AWAY_THRESHOLD:
                away_long_enough = True

        # STATUS
        if faces_detected != 1:
            status = "Not Focused (Multiple/No Face)"
            color = (0, 0, 255)
        elif phone_detected:
            status = "Not Focused (Phone Detected)"
            color = (0, 0, 255)
        elif gaze_status in ["screen", "notebook"]:
            status = f"Focused ({gaze_status})"
            color = (0, 255, 0)
        elif away_long_enough:
            status = "Not Focused (Looking Away >10s)"
            color = (0, 0, 255)
        else:
            status = "Focused (temporary glance away)"
            color = (0, 255, 255)

        # Focus score update
        now = time.time()
        dt = now - last_tick
        if dt < 0: dt = 0
        last_tick = now

        if status.startswith("Focused (screen)") or status.startswith("Focused (notebook)"):
            focus_score += int(+20 * dt)
        elif "temporary glance" in status:
            focus_score += int(+5 * dt)
        elif "Phone Detected" in status:
            focus_score -= int(25 * dt)
        else:
            focus_score -= int(15 * dt)

        focus_score = max(FOCUS_MIN, min(FOCUS_MAX, focus_score))

        # Sound alert
        if (("Not Focused" in status) or phone_detected) and sound_enabled:
            if (now - last_alert_time) >= ALERT_COOLDOWN_SEC:
                play_alert()
                last_alert_time = now

        # CSV logging ~1 sec
        frame_counter_for_log += 1
        if frame_counter_for_log >= 30:
            frame_counter_for_log = 0
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            log_row(ts, status, gaze_status, faces_detected, phone_detected, focus_score)

        # update latest payload
        latest_payload = {
            "status": status,
            "gaze_status": gaze_status,
            "faces_detected": faces_detected,
            "phone_detected": phone_detected,
            "focus_score": focus_score
        }

                # draw overlay
        cv2.putText(frame, status, (30, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 3)

        cv2.putText(frame, f"Focus Score: {focus_score}/100", (30, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)

        bar_x, bar_y, bar_w, bar_h = 30, 110, 300, 20
        cv2.rectangle(frame, (bar_x, bar_y),
                      (bar_x + bar_w, bar_y + bar_h),
                      (200, 200, 200), 2)

        fill_w = int(bar_w * (focus_score / 100.0))
        cv2.rectangle(frame, (bar_x, bar_y),
                      (bar_x + fill_w, bar_y + bar_h),
                      (0, 255, 0), -1)

        # encode to jpg
        ret, buffer = cv2.imencode(".jpg", frame)
        frame_bytes = buffer.tobytes()

        yield (b"--frame\r\n"
               b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")

@app.route("/video_feed")
def video_feed():
    return Response(generate_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/analysis")
def analysis():
    return jsonify(latest_payload)

# if __name__ == "__main__":
#     app.run(host="0.0.0.0", port=5001, debug=True)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False, use_reloader=False)

