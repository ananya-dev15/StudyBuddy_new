import Report from "../models/Report.js";

export const uploadReport = async (req, res) => {
  console.log("🔥 uploadReport HIT");
  console.log("FILE:", req.file);
  console.log("BODY:", req.body);

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "PDF not received" });
    }

    const report = await Report.create({
      title: req.body.title || "StudyBuddy Report",
      fileUrl: `/uploads/reports/${req.file.filename}`,
    });

    console.log("✅ SAVED:", report._id);

    res.json({ success: true, report });
  } catch (err) {
    console.error("❌ DB ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


export const getMyReports = async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }); // 👈 YAHI LINE

    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
