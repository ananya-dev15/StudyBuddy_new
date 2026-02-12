// routes/trackingRoutes.js
import express from "express";
import User from "../models/User.js";
import protect from "../middlewares/authMiddleware.js";
// ✅ use JWT middleware

const router = express.Router();

// ✅ Helper: Get local date string in YYYY-MM-DD format (respects timezone)
const getLocalDateString = (date = new Date()) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Increment coins (userId comes from token)
router.post("/coins", protect, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = req.user; // ✅ got from JWT
    if (!user) return res.status(404).json({ message: "User not found" });

    user.coins = (user.coins || 0) + (amount || 1);
    await user.save();
    res.json({ success: true, coins: user.coins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Increment videos watched + maintain streak
// ✅ Increment videos watched + maintain streak
router.post("/videos-watched", protect, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(404).json({ message: "User not found" });

    // Allow client to provide their local date (YYYY-MM-DD). If provided, use it
    // so streak calculations reflect the user's local calendar day.
    const clientDate = req.body?.lastDayWatched;
    const today = clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate) ? clientDate : getLocalDateString();

    // Use stored lastDayWatched if available (assumed stored as YYYY-MM-DD), else null
    const lastWatchedDate = user.lastDayWatched ? String(user.lastDayWatched) : null;

    // ✅ Increment total videos watched
    user.videosWatched = (user.videosWatched || 0) + 1;


    // ✅ Streak logic using YYYY-MM-DD dates (robust against timezone differences)
    const parseYMD = (s) => {
      if (!s) return null;
      const parts = s.split("-");
      if (parts.length !== 3) return null;
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return Date.UTC(y, m, d);
    };

    if (!lastWatchedDate) {
      // first time
      user.streak = 1;
    } else if (lastWatchedDate === today) {
      // same calendar day (in user's local date) — do nothing
    } else {
      const lastUTC = parseYMD(lastWatchedDate);
      const todayUTC = parseYMD(today);
      if (lastUTC == null || todayUTC == null) {
        user.streak = 1; // fallback
      } else {
        const diffDays = Math.round((todayUTC - lastUTC) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          // watched next day → increment streak
          user.streak = (user.streak || 0) + 1;
        } else if (diffDays > 1) {
          // missed one or more days → reset streak
          user.streak = 1;
        } else {
          // negative or zero difference — treat as same day
        }
      }
    }

    // ✅ Persist the user's last watched date as the user's local YYYY-MM-DD
    user.lastDayWatched = today;

    // ✅ Save changes
    await user.save();

    res.json({
      success: true,
      videosWatched: user.videosWatched,
      streak: user.streak,
      lastDayWatched: user.lastDayWatched,
    });
  } catch (err) {
    console.error("⚠️ Error updating videos watched:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});



// Reduce coins when user switches tab
router.post("/coins-loss", protect, async (req, res) => {
  try {
    const { loss = 1 } = req.body;
    const user = req.user;

    if (!user) return res.status(404).json({ message: "User not found" });

    user.coins = Math.max(0, (user.coins || 0) - loss); // never negative
    user.videosSwitched = (user.videosSwitched || 0) + 1;

    await user.save();

    res.json({
      success: true,
      message: `Coins reduced by ${loss}`,
      coins: user.coins,
      videosSwitched: user.videosSwitched,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/coins-gain", async (req, res) => {
  try {
    const { userId, gain } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.coins += gain;
    await user.save();

    res.json({ success: true, coins: user.coins });
  } catch (err) {
    console.error("Error in coins-gain:", err);
    res.status(500).json({ error: "Server error" });
  }
});



// Get user stats
router.get("/stats", protect, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      coins: user.coins,
      videosWatched: user.videosWatched,
      videosSwitched: user.videosSwitched,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 🪙 Fetch user coins by ID (for frontend coin sync)
// router.get("/coins/:userId", async (req, res) => {
//   try {
//     const user = await User.findById(req.params.userId);
//     if (!user) return res.status(404).json({ message: "User not found" });
//     res.json({ coins: user.coins });
//   } catch (err) {
//     console.error("Error fetching coins:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// });


// backend/routes/tracking.js (or controller)
router.get("/coins/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    res.json({
      success: true,
      coins: user.coins,
      streak: user.streak,
      videosWatched: user.videosWatched || 0,
      videosSwitched: user.videosSwitched || 0,
    });
  } catch (err) {
    console.error("Error fetching coins:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});



// ✅ Add video watch history (keeps last 5 days)
// router.post("/add-history", protect, async (req, res) => {
//   try {
//     const { videoId, url, secondsWatched, tabSwitches } = req.body;
//     const user = req.user;
//     if (!user) return res.status(404).json({ message: "User not found" });

//     // create history entry
//     const newEntry = {
//       videoId,
//       url,
//       secondsWatched: secondsWatched || 0,
//       tabSwitches: tabSwitches || 0,
//       watchedAt: new Date(),
//     };

//     // push new entry
//     user.history.push(newEntry);

//     // only keep last 5 entries
//     if (user.history.length > 5) {
//       user.history = user.history.slice(-5);
//     }

//     await user.save();

//     res.json({ success: true, history: user.history });
//   } catch (err) {
//     console.error("⚠️ Error adding history:", err);
//     res.status(500).json({ success: false, message: err.message });
//   }
// });


router.post("/add-history", protect, async (req, res) => {
  try {
    const user = req.user;
    const { videoId, url, secondsWatched, tabSwitches } = req.body;

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // 🚫 Don’t save empty sessions
    if (!secondsWatched || secondsWatched < 5) {
      return res.json({ success: false, message: "Session too short, not saved" });
    }

    const newEntry = {
      videoId,
      url,
      secondsWatched: Math.round(secondsWatched),
      tabSwitches: tabSwitches || 0,
      watchedAt: getLocalDateString(), // ✅ Use local date string (YYYY-MM-DD)
    };

    // ✅ Keep full history in DB
    user.history.unshift(newEntry);
    await user.save();

    res.json({ success: true, history: user.history });
  } catch (err) {
    console.error("❌ Error adding history:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ✅ Get last 5 video history entries
router.get("/history", protect, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(404).json({ message: "User not found" });

    // ✅ Send full history for chart
    res.json({ success: true, history: user.history || [] });
  } catch (err) {
    console.error("⚠️ Error fetching history:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ Weekly stats: total minutes watched in last 7 days
// 📊 Weekly study performance (past 7 days)
router.get("/weekly-stats", protect, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(404).json({ message: "User not found" });

    const now = new Date();
    const pastWeek = new Date(now);
    pastWeek.setDate(now.getDate() - 6);

    // Filter user history for last 7 days
    const recentHistory = (user.history || []).filter(
      (entry) => new Date(entry.watchedAt) >= pastWeek
    );

    // Group by date
    const stats = {};
    for (let i = 0; i < 7; i++) {
      const date = new Date(pastWeek);
      date.setDate(pastWeek.getDate() + i);
      const key = date.toISOString().split("T")[0];
      stats[key] = 0;
    }

    recentHistory.forEach((entry) => {
      const dateKey = new Date(entry.watchedAt).toISOString().split("T")[0];
      if (stats[dateKey] !== undefined) {
        stats[dateKey] += Math.round(entry.secondsWatched / 60); // convert to minutes
      }
    });

    res.json({ success: true, stats });
  } catch (err) {
    console.error("⚠️ Error fetching weekly stats:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


router.get("/dashboard", protect, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      success: true,
      coins: user.coins,
      videosWatched: user.videosWatched,
      videosSwitched: user.videosSwitched,
      streak: user.streak,
      history: user.history.slice(-5).reverse(), // last 5 sessions
    });
  } catch (err) {
    console.error("⚠️ Error fetching dashboard:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 📅 Get 30-day activity for dashboard
router.get("/monthly-activity", protect, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(404).json({ message: "User not found" });

    // Group by date
    const activity = {};
    user.history.forEach((session) => {
      const date = new Date(session.watchedAt).toISOString().split("T")[0];
      if (!activity[date]) activity[date] = { totalSeconds: 0 };
      activity[date].totalSeconds += session.secondsWatched || 0;
    });

    res.json({ success: true, activity });
  } catch (err) {
    console.error("⚠️ Error fetching monthly activity:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ✅ Save or update notes & tags for a specific video
// ✅ Save or update notes & tags for a specific video
router.post("/save-note-tag", protect, async (req, res) => {
  try {
    const { videoId, noteText, tagText } = req.body;
    const user = req.user;

    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    if (!videoId)
      return res
        .status(400)
        .json({ success: false, message: "Missing videoId" });

    // Ensure proper Object initialization
    if (!user.notes) user.notes = {};
    if (!user.tags) user.tags = {};

    // ✅ Save note & tag
    if (noteText !== undefined) user.notes[videoId] = noteText;
    if (tagText !== undefined) user.tags[videoId] = tagText;

    // ✅ Crucial for Object persistence in Mongoose
    user.markModified("notes");
    user.markModified("tags");

    // ✅ Update existing history entry (instead of adding new one)
    const existing = user.history.find((h) => h.videoId === videoId);
    if (existing) {
      if (noteText !== undefined) existing.note = noteText;
      if (tagText !== undefined) existing.tag = tagText;
    } else {
      // If no entry found (edge case), add one cleanly
      user.history.unshift({
        videoId,
        url: `https://youtu.be/${videoId}`,
        secondsWatched: 0,
        tabSwitches: 0,
        watchedAt: new Date(),
        note: noteText || "",
        tag: tagText || "",
      });
    }

    await user.save();

    // Return clean objects for frontend
    res.json({
      success: true,
      message: "Notes and tags saved successfully!",
      notes: user.notes,
      tags: user.tags,
      history: user.history,
    });
  } catch (err) {
    console.error("❌ Error saving note/tag:", err);
    res
      .status(500)
      .json({ success: false, message: err?.message || "Server error" });
  }
});



// ✅ Fetch notes + tags
router.get("/notes-tags", protect, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.json({
      success: true,
      notes: user.notes || {},
      tags: user.tags || {},
    });
  } catch (err) {
    console.error("⚠️ Error fetching notes/tags:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});




export default router;
