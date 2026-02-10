import express from "express";
import protect from "../middlewares/authMiddleware.js";
import { uploadReportPDF } from "../utils/reportUpload.js";
import { uploadReport, getMyReports } from "../controllers/reportController.js";

const router = express.Router();

router.post(
  "/upload",
  uploadReportPDF.single("pdf"),
  uploadReport
);

router.get("/my", getMyReports);

export default router;
