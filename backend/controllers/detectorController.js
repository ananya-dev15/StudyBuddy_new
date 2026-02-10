import { spawn } from "child_process";

let pyProcess = null;

export const startDetector = (req, res) => {
  try {
    if (pyProcess) {
      return res.json({ success: true, message: "Detector already running" });
    }

    pyProcess = spawn("./detector/venv/bin/python", ["./detector/stream_server.py"]);


    pyProcess.stdout.on("data", (data) => {
      console.log("PY:", data.toString());
    });

    pyProcess.stderr.on("data", (data) => {
      console.log("PY ERR:", data.toString());
    });

    pyProcess.on("close", () => {
      pyProcess = null;
      console.log("✅ Detector stopped");
    });

    res.json({ success: true, message: "✅ Detector started" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const stopDetector = (req, res) => {
  try {
    if (!pyProcess) {
      return res.json({ success: true, message: "Detector not running" });
    }

    pyProcess.kill();
    pyProcess = null;

    res.json({ success: true, message: "🛑 Detector stopped" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const saveDetection = (req, res) => {
  return res.json({ success: true, message: "saveDetection disabled" });
};

export const statusDetector = (req, res) => {
  return res.json({
    success: true,
    running: !!pyProcess,
    message: pyProcess ? "Detector is running" : "Detector is stopped",
  });
};
