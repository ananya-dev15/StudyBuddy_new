import mongoose from "mongoose";

const detectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    focused: { type: Boolean, default: false },
    faces_count: { type: Number, default: 0 },

    direction: {
      type: String,
      enum: ["left", "right", "center", "unknown"],
      default: "unknown",
    },

    phone_detected: { type: Boolean, default: false },

    source: {
      type: String,
      enum: ["frontend", "backend"],
      default: "frontend",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Detection", detectionSchema);
