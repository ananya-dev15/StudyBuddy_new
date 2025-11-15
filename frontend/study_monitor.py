import base64
import io
import numpy as np
from PIL import Image
import cv2
import json
import time
import os
import csv
from datetime import datetime
import mediapipe as mp
from ultralytics import YOLO
from flask import Flask
from flask_socketio import SocketIO, emit

# ========= CONFIG =========
ALERT_COOLDOWN_SEC = 3.0
LOG_DIR = "focus_logs"
FOCUS_MAX = 100
FOCUS_MIN = 0
AWAY_THRESHOLD = 10.0
# ==========================

# ===== Flask Socket Setup =====
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# ===== Models =====
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils
face_mesh = mp_face_mesh.FaceMesh(refine_landmarks=True, max_num_faces=2)
yolo_model = YOLO("yolov8n.pt")

# ===== State Vars =====
look_away_start = None
focus_score = 100
last_alert_time = 0.0
sound_enabled = True


# ===== Utilities =====
def play_alert():
    try:
        import winsound
        winsound.Beep(1000, 300)
        return
    except Exception:
        pass
    try:
        os.system('say "Stay Focused" >/dev/null 2>&1 &')
        return
    except Exception:
        pass
    print("\a")


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


# ======= Socket Event: receive frames from frontend =======
@socketio.on("frame")
def handle_frame(data):
    global look_away_start, focus_score, last_alert_time

    try:
        # Decode frame
        img_bytes = base64.b64decode(data)
        img = Image.open(io.BytesIO(img_bytes))
        frame = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

        # Detect faces
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = face_mesh.process(rgb)
        faces_detected = 0
        gaze_status = "away"

        if result.multi_face_landmarks:
            faces_detected = len(result.multi_face_landmarks)
            if faces_detected == 1:
                landmarks = result.multi_face_landmarks[0].landmark
                gaze_status = get_head_pose(landmarks, frame.shape[:2])

        # YOLO phone detection
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

        # Focus logic
        if gaze_status == "away":
            if look_away_start is None:
                look_away_start = time.time()
        else:
            look_away_start = None

        away_long = (
            look_away_start and (time.time() - look_away_start >= AWAY_THRESHOLD)
        )

        # Define focus status
        if faces_detected != 1:
            status = "Not Focused (Multiple/No Face)"
            color = (0, 0, 255)
        elif phone_detected:
            status = "Not Focused (Phone Detected)"
            color = (0, 0, 255)
        elif gaze_status in ["screen", "notebook"]:
            status = f"Focused ({gaze_status})"
            color = (0, 255, 0)
        elif away_long:
            status = "Not Focused (Looking Away)"
            color = (0, 0, 255)
        else:
            status = "Focused (temporary glance away)"
            color = (0, 255, 255)

        # Focus score logic
        if "Not Focused" in status or phone_detected:
            focus_score = max(FOCUS_MIN, focus_score - 2)
        else:
            focus_score = min(FOCUS_MAX, focus_score + 1)

        # Alert (beep)
        if ("Not Focused" in status or phone_detected) and (time.time() - last_alert_time) >= ALERT_COOLDOWN_SEC:
            play_alert()
            last_alert_time = time.time()

        # Send analysis result to frontend
        emit("analysis", json.dumps({
            "focused": "Not" not in status,
            "faces_count": faces_detected,
            "phone_detected": phone_detected,
            "focus_score": focus_score,
            "status": status,
            "gaze_status": gaze_status
        }))

    except Exception as e:
        print("⚠️ Error:", e)


# ======= Optional: Run directly with webcam for testing =======
def run_local_test():
    cap = cv2.VideoCapture(0)
    print("📹 Running local camera mode (press Q to quit)")

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        # basic face detection using same logic as above
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = face_mesh.process(rgb)
        faces_detected = 0
        if result.multi_face_landmarks:
            faces_detected = len(result.multi_face_landmarks)
            for landmarks in result.multi_face_landmarks:
                mp_drawing.draw_landmarks(frame, landmarks, mp_face_mesh.FACEMESH_CONTOURS)
        cv2.putText(frame, f"Faces: {faces_detected}", (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0,255,0), 2)
        cv2.imshow("Local Focus Monitor", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    cap.release()
    cv2.destroyAllWindows()


# ======= ENTRY POINT =======
if __name__ == "__main__":
    print("🚀 Study Monitor unified server running on ws://localhost:6000")
    print("🧠 Use your React app → VideoTracker → 'Start Camera Analysis' to connect.")
    print("💻 Or run local webcam mode manually with: python study_monitor.py local")

    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "local":
        run_local_test()
    else:
        socketio.run(app, host="0.0.0.0", port=6000)
