import express from "express";
import protect from "../middlewares/authMiddleware.js";
import { saveDetection } from "../controllers/detectorController.js";

const router = express.Router();

// POST: /api/detections/save
router.post("/save", protect, saveDetection);

export default router;
