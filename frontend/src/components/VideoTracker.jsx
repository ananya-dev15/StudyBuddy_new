import React, { useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/*
  Complete Video Tracker with:
  - YouTube IFrame API player
  - Accurate play-time counting (counts played seconds; rewinds + rewatch counted)
  - Tab-switch counting (viewsTaken) while playing
  - Focus-timer popup (on load) — while focus timer active, tab-switch deducts coins
  - Coin system:
      * start with 50 coins
      * -5 coins per tab-switch during active focus timer (cannot go negative)
      * if coins == 0 => player locked, must "Purchase Premium" (dummy)
      * daily +1 coin for watching at least one session per day; if streak maintained, +5 extra
  - Notes per video (saved to localStorage)
  - Weekly stats and last 5 days list
  - Persist everything to localStorage (single object key)
*/

const STORAGE_KEY = "video_tracker_v3";
const INITIAL_COINS = 50;
const TAB_SWITCH_COST = 5;
const DAILY_BONUS = 1;
const STREAK_BONUS = 5;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        history: [],
        notes: {}, // videoId -> text
        stats: {}, // videoId -> { totalSeconds, totalViews }
        coins: INITIAL_COINS,
        streak: 0,
        lastDayWatched: null, // ISO date string
      };
    }
    return JSON.parse(raw);
  } catch (e) {
    return {
      history: [],
      notes: {},
      stats: {},
      coins: INITIAL_COINS,
      streak: 0,
      lastDayWatched: null,
    };
  }
}
function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function extractYouTubeId(urlOrId) {
  if (!urlOrId) return null;
  if (/^[0-9A-Za-z_-]{11}$/.test(urlOrId)) return urlOrId;
  const regex =
    /(?:youtube\.com\/.*(?:v=|embed\/)|youtu\.be\/)([0-9A-Za-z_-]{11})/;
  const m = urlOrId.match(regex);
  return m ? m[1] : null;
}

export default function VideoTracker() {
  // App state
  const [appState, setAppState] = useState(() => loadState());
  const [inputUrl, setInputUrl] = useState("");
  const [videoId, setVideoId] = useState(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [sessionPlayedSeconds, setSessionPlayedSeconds] = useState(0);
  const [sessionViewsTaken, setSessionViewsTaken] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [tagText, setTagText] = useState("");
  const [weeklyStats, setWeeklyStats] = useState({});
  const [lastFiveDays, setLastFiveDays] = useState([]);
  const [showTimerPopup, setShowTimerPopup] = useState(false);
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [focusRemaining, setFocusRemaining] = useState(null);
  const [isPlayerMaximized, setIsPlayerMaximized] = useState(false);
  const [player, setPlayer] = useState(null);
  const [earnedThisSessionCoins, setEarnedThisSessionCoins] = useState(false);
  const [showZeroCoinsPopup, setShowZeroCoinsPopup] = useState(false);

  // State for starting timer on play
  const [focusDuration, setFocusDuration] = useState(null);
  const [isFocusTimerPending, setIsFocusTimerPending] = useState(false);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);

  // refs
  const playerRef = useRef(null);
  const pollRef = useRef(null);
  const lastSampleRef = useRef(0);

  // load YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
  }, []);

  // persist overall state when appState changes
  useEffect(() => {
    saveState(appState);
    computeWeeklyStats(appState.history);
    computeLastFiveDays(appState.history);
  }, [appState]);

  // Focus timer countdown - PAUSES when video is not playing
  useEffect(() => {
    if (focusRemaining === null || !isPlaying) return; // Pauses timer if video not playing

    if (focusRemaining <= 0) {
      setFocusRemaining(null);
      alert("🎉 Focus session complete! You've earned +1 coin.");

      // Give +1 coin for completing the session
      setAppState(prev => ({
          ...prev,
          coins: prev.coins + 1
      }));
      
      return;
    }
    const t = setTimeout(() => setFocusRemaining((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [focusRemaining, isPlaying]); // Reruns when play state changes

  // Initialize YT player when videoId is set
  useEffect(() => {
    if (!videoId) return;

    function createPlayer() {
      if (!window.YT || !window.YT.Player) {
        setTimeout(createPlayer, 300);
        return;
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {}
        playerRef.current = null;
      }

      const p = new window.YT.Player("vt-player", {
        videoId,
        playerVars: { controls: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => {
            setPlayerReady(true);
            setPlayer(p);
            lastSampleRef.current = p.getCurrentTime() || 0;
            setSessionPlayedSeconds(0);
            setSessionViewsTaken(0);
            setEarnedThisSessionCoins(false);
            setNoteText(appState.notes?.[videoId] || "");
            setTagText("");
            setHasPlaybackStarted(false); // Reset for the new video session
          },
          onStateChange: (e) => {
            const state = e.data;
            if (state === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              startPolling();
              // If a focus timer is waiting, start it now on first play
              if (isFocusTimerPending && !hasPlaybackStarted) {
                setFocusRemaining(focusDuration);
                setIsFocusTimerPending(false);
                setHasPlaybackStarted(true);
              }
            } else {
              setIsPlaying(false);
              stopPolling();
              if (state === window.YT.PlayerState.ENDED) {
                finalizeSession(true);
              }
            }
          },
        },
      });
      playerRef.current = p;
    }

    createPlayer();
    return () => stopPolling();
  }, [videoId, focusDuration, hasPlaybackStarted, isFocusTimerPending]);

  // Polling logic
  const startPolling = () => {
    if (!playerRef.current || pollRef.current) return;
    lastSampleRef.current = playerRef.current.getCurrentTime() || 0;
    pollRef.current = setInterval(() => {
      if (!playerRef.current) return;
      const now = playerRef.current.getCurrentTime() || 0;
      const last = lastSampleRef.current || 0;
      if (now >= last) {
        const delta = now - last;
        if (delta > 0 && delta < 60) {
          setSessionPlayedSeconds((s) => s + delta);
        }
      }
      lastSampleRef.current = now;
      setCurrentTime(now);
    }, 800);
  };
  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // Tab switch handling
  useEffect(() => {
    const onVisibility = () => {
      if (!playerRef.current) return;
      if (document.visibilityState === "hidden" && isPlaying) {
        setSessionViewsTaken((v) => v + 1);
        if (focusRemaining && focusRemaining > 0) {
          setAppState((prev) => ({
            ...prev,
            coins: Math.max(0, (prev.coins || 0) - TAB_SWITCH_COST),
          }));
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, [isPlaying, focusRemaining]);

  // Finalize session logic (Handles daily streak)
  const finalizeSession = (ended = false) => {
    if (!videoId) return;
    const secondsWatched = Math.floor(sessionPlayedSeconds);
    if (secondsWatched <= 0 && sessionViewsTaken === 0) {
      cleanupAfterSession();
      return;
    }

    const now = new Date();
    const newHistoryEntry = {
      videoId,
      url: `https://youtu.be/${videoId}`,
      watchedAt: now.toISOString(),
      seconds: secondsWatched,
      viewsTaken: sessionViewsTaken,
      notes: noteText || appState.notes?.[videoId] || "",
      tag: tagText || "",
    };

    setAppState((prev) => {
      const stats = { ...(prev.stats || {}) };
      const prevStat = stats[videoId] || { totalSeconds: 0, totalViews: 0 };
      stats[videoId] = {
        totalSeconds: prevStat.totalSeconds + secondsWatched,
        totalViews: prevStat.totalViews + sessionViewsTaken,
      };

      let coins = prev.coins ?? INITIAL_COINS;
      let streak = prev.streak ?? 0;
      let lastDay = prev.lastDayWatched
        ? new Date(prev.lastDayWatched)
        : null;
      const todayStr = now.toISOString().split("T")[0];
      const lastDayStr = lastDay ? lastDay.toISOString().split("T")[0] : null;

      if (lastDayStr !== todayStr) {
        coins += DAILY_BONUS;
        if (lastDay) {
          const diff = (now - lastDay) / (1000 * 60 * 60 * 24);
          if (diff <= 1.5) {
            streak = (streak || 0) + 1; // Streak increases here
            if (streak > 1) coins += STREAK_BONUS;
          } else {
            streak = 1; // Streak resets here
          }
        } else {
          streak = 1; // First day of streak
        }
        lastDay = new Date(now.toISOString().split("T")[0]);
      }

      const notes = { ...(prev.notes || {}) };
      if (noteText) notes[videoId] = noteText;
      const history = [...(prev.history || []), newHistoryEntry];

      return {
        ...prev,
        history,
        stats,
        notes,
        coins,
        streak,
        lastDayWatched: lastDay ? lastDay.toISOString() : prev.lastDayWatched,
      };
    });

    setEarnedThisSessionCoins(true);
    cleanupAfterSession(ended);
  };

  // Cleanup after session
  const cleanupAfterSession = (ended = false) => {
    try {
      if (playerRef.current) {
        playerRef.current.pauseVideo();
        if (ended) {
          playerRef.current.stopVideo();
          playerRef.current.destroy();
          playerRef.current = null;
        }
      }
    } catch (e) {}
    setVideoId(ended ? null : videoId);
    setPlayer(null);
    setIsPlaying(false);
    setSessionPlayedSeconds(0);
    setSessionViewsTaken(0);
    setCurrentTime(0);
    stopPolling();

    // Reset timer states
    setFocusRemaining(null);
    setFocusDuration(null);
    setIsFocusTimerPending(false);
    setHasPlaybackStarted(false);
  };

  // Event Handlers
  const handleLoadClick = () => {
    if (appState.coins <= 0) {
      setShowZeroCoinsPopup(true);
      return;
    }
    const id = extractYouTubeId(inputUrl.trim());
    if (!id) {
      alert("Please paste a valid YouTube URL or ID.");
      return;
    }
    setVideoId(id);
    setShowTimerPopup(true);
    setInputUrl("");
  };

  const confirmStartFocus = () => {
    // Set timer to pending state; it will start on video play
    setFocusDuration(focusMinutes * 60);
    setIsFocusTimerPending(true);
    setShowTimerPopup(false);
  };

  const handleStopSave = () => finalizeSession(false);

  const handleSaveNotes = () => {
    if (!videoId) return alert("Load a video first");
    setAppState((prev) => ({
      ...prev,
      notes: { ...(prev.notes || {}), [videoId]: noteText },
    }));
    alert("Notes saved locally");
  };

  const purchasePremium = () => {
    if (!window.confirm("Purchase Premium (demo): add 100 coins?")) return;
    setAppState((prev) => ({ ...prev, coins: (prev.coins || 0) + 100 }));
    setShowZeroCoinsPopup(false);
    alert("Premium purchase successful! 100 coins added.");
  };

  const clearHistory = () => {
    if (!window.confirm("Clear all history, stats, and notes?")) return;
    setAppState({
      history: [],
      notes: {},
      stats: {},
      coins: INITIAL_COINS,
      streak: 0,
      lastDayWatched: null,
    });
  };

  // Data computation
  const computeWeeklyStats = (history) => {
    const stats = {};
    history.forEach((h) => {
      const key = new Date(h.watchedAt).toLocaleDateString();
      stats[key] = (stats[key] || 0) + Math.floor(h.seconds / 60);
    });
    setWeeklyStats(stats);
  };

  const computeLastFiveDays = (history) => {
    const fiveDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 5;
    const recent = history.filter(
      (h) => new Date(h.watchedAt).getTime() >= fiveDaysAgo
    );
    recent.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt));
    setLastFiveDays(recent);
  };

  useEffect(() => {
    computeWeeklyStats(appState.history);
    computeLastFiveDays(appState.history);
  }, []);

  // Save on unload
  useEffect(() => {
    const onBeforeUnload = () => {
      if (isPlaying && (sessionPlayedSeconds > 0 || sessionViewsTaken > 0)) {
        finalizeSession(false);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isPlaying, sessionPlayedSeconds, sessionViewsTaken, videoId]);

  // Utility
  const niceTime = (s) => {
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h) return `${h}h ${m}m ${sec}s`;
    return m ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Study Video Tracker</h1>
          <div style={styles.wallet}>
            <span style={styles.statChip}>🪙 {appState.coins}</span>
            <span style={styles.statChip}>
              🔥 {appState.streak} day streak
            </span>
          </div>
        </div>

        {/* Input + Load */}
        <div style={styles.panel}>
          <div style={{ display: "flex", gap: "12px" }}>
            <input
              placeholder="Paste YouTube URL or id..."
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              style={styles.input}
              disabled={appState.coins <= 0}
            />
            <button
              onClick={handleLoadClick}
              style={styles.button}
              disabled={appState.coins <= 0}
            >
              {appState.coins <= 0 ? "Locked" : "Load Video"}
            </button>
            <button
              onClick={clearHistory}
              style={{ ...styles.button, ...styles.secondaryButton }}
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Popups */}
        {showTimerPopup && (
          <div style={styles.popup}>
            <div style={styles.popupInner}>
              <h3 style={styles.popupTitle}>Set Focus Timer</h3>
              <div style={styles.focusInputContainer}>
                <input
                  type="number"
                  min={25}
                  max={180}
                  value={focusMinutes}
                  onChange={(e) => setFocusMinutes(Number(e.target.value))}
                  style={styles.input}
                />
                <span>minutes</span>
              </div>
              <div style={{ marginTop: "16px" }}>
                <button onClick={confirmStartFocus} style={styles.button}>
                  Set Timer ({focusMinutes} min)
                </button>
                <button
                  onClick={() => {
                    setShowTimerPopup(false);
                    setVideoId(null);
                  }}
                  style={{
                    ...styles.button,
                    ...styles.secondaryButton,
                    marginLeft: 8,
                  }}
                >
                  Cancel
                </button>
              </div>
              <p style={styles.popupText}>
                The timer will begin when you start playing the video. During
                the timer, each tab switch costs {TAB_SWITCH_COST} coins.
              </p>
            </div>
          </div>
        )}

        {showZeroCoinsPopup && (
          <div style={styles.popup}>
            <div
              style={{ ...styles.popupInner, border: "2px solid #ef4444" }}
            >
              <h3 style={{ ...styles.popupTitle, color: "#ef4444" }}>
                Out of Coins!
              </h3>
              <p style={styles.popupText}>
                Purchase Premium to continue watching.
              </p>
              <div style={{ marginTop: "16px" }}>
                <button onClick={purchasePremium} style={styles.button}>
                  Purchase (Add 100 🪙)
                </button>
                <button
                  onClick={() => setShowZeroCoinsPopup(false)}
                  style={{
                    ...styles.button,
                    ...styles.secondaryButton,
                    marginLeft: 8,
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Player Area */}
        <div style={styles.panel}>
          {focusRemaining !== null && (
            <div style={styles.focusBar}>
              ⏱ Focus Time Remaining:{" "}
              <strong>
                {Math.floor(focusRemaining / 60)}:
                {String(focusRemaining % 60).padStart(2, "0")}
              </strong>
            </div>
          )}

          {videoId ? (
            <>
              <div
                style={isPlayerMaximized ? styles.playerMax : styles.player}
              >
                <div
                  id="vt-player"
                  style={{ width: "100%", height: "100%" }}
                />
                 <button
                    onClick={() => setIsPlayerMaximized((s) => !s)}
                    style={styles.toggleMaxMinButton}
                  >
                    {isPlayerMaximized ? "Minimize" : "Maximize"}
                  </button>
              </div>
              <div style={styles.controlsAndStats}>
                <div>
                  {/* Maximize button is now inside the player div */}
                  <button
                    onClick={handleStopSave}
                    style={{
                      ...styles.smallBtn,
                      background: "#ef4444",
                    }}
                  >
                    Stop & Save
                  </button>
                </div>
                <div style={styles.statsText}>
                  <div>
                    Watched:{" "}
                    <strong>{niceTime(sessionPlayedSeconds)}</strong>
                  </div>
                  <div>
                    Tab Switches: <strong>{sessionViewsTaken}</strong>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: "16px" }}>
                <textarea
                  placeholder="Your notes for this video..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  style={styles.textarea}
                />
                <div
                  style={{
                    marginTop: "12px",
                    display: "flex",
                    gap: "12px",
                  }}
                >
                  <input
                    placeholder="Tag (e.g., 'React Hooks')"
                    value={tagText}
                    onChange={(e) => setTagText(e.target.value)}
                    style={{ ...styles.input, width: "250px" }}
                  />
                  <button onClick={handleSaveNotes} style={styles.button}>
                    Save Notes
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={styles.placeholder}>
              Paste a YouTube link to begin your study session.
            </div>
          )}
        </div>

        {/* Stats & History */}
        <div style={styles.panel}>
          <h3 style={styles.sectionTitle}>
            📊 Weekly Study Performance (minutes)
          </h3>
          <div style={{ height: 220, marginTop: "16px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={Object.keys(weeklyStats).map((k) => ({
                  date: k,
                  mins: weeklyStats[k],
                }))}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(0,0,0,0.1)"
                />
                <XAxis dataKey="date" tick={{ fill: "#4b5563" }} />
                <YAxis tick={{ fill: "#4b5563" }} />
                <Tooltip contentStyle={styles.tooltip} />
                <Bar
                  dataKey="mins"
                  fill="url(#colorUv)"
                  radius={[8, 8, 0, 0]}
                />
                <defs>
                  <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="#4f46e5"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="#d946ef"
                      stopOpacity={0.8}
                    />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
            gap: "20px",
          }}
        >
          <div style={styles.panel}>
            <h3 style={styles.sectionTitle}>📅 Last 5 Days History</h3>
            {lastFiveDays.length === 0 ? (
              <p style={styles.emptyState}>
                No activity in the last 5 days.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  marginTop: "16px",
                }}
              >
                {lastFiveDays.map((h, idx) => (
                  <div key={idx} style={styles.historyCard}>
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noreferrer"
                      style={styles.cardLink}
                    >
                      {h.url.replace("https://youtu.be/", "")}
                    </a>
                    <p style={styles.cardDate}>
                      {new Date(h.watchedAt).toLocaleString()}
                    </p>
                    <p style={styles.cardNotes}>
                      <strong>Notes:</strong> {h.notes || <i>No notes</i>}
                    </p>
                    <div style={styles.cardStats}>
                      <span>
                        <strong>{niceTime(h.seconds)}</strong> watched
                      </span>
                      <span>
                        <strong>{h.viewsTaken}</strong> tab switches
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.panel}>
            <h3 style={styles.sectionTitle}>🏆 All Videos Summary</h3>
            {Object.keys(appState.stats || {}).length === 0 ? (
              <p style={styles.emptyState}>
                No stats yet. Watch a video to begin!
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  marginTop: "16px",
                }}
              >
                {Object.entries(appState.stats).map(([vid, s]) => (
                  <div key={vid} style={styles.historyCard}>
                    <a
                      href={`https://youtu.be/${vid}`}
                      target="_blank"
                      rel="noreferrer"
                      style={styles.cardLink}
                    >
                      {vid}
                    </a>
                    <p style={styles.cardNotes}>
                      {(appState.notes && appState.notes[vid])
                        ? appState.notes[vid].slice(0, 80) + "..."
                        : <i>No notes</i>}
                    </p>
                    <div style={styles.cardStats}>
                      <span>
                        Total Watched:{" "}
                        <strong>{niceTime(s.totalSeconds)}</strong>
                      </span>
                      <span>
                        Total Switches: <strong>{s.totalViews}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ height: "60px" }} />
        <style>{`
          @media (max-width: 760px) { #vt-player { height: 220px !important; } }
        `}</style>
      </div>
    </div>
  );
}

/* ---------- Inline styles for StudyBuddy Theme ---------- */
const styles = {
  page: {
    background: "linear-gradient(to bottom right, #f3e8ff, #e0e7ff)",
    minHeight: "100vh",
    padding: "16px",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial",
    color: "#1f2937",
  },
  container: {
    maxWidth: "980px",
    margin: "20px auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    padding: "0 8px",
  },
  title: {
    fontSize: "28px",
    fontWeight: "800",
    background: "linear-gradient(to right, #4f46e5, #a855f7, #d946ef)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    letterSpacing: "-1px",
  },
  wallet: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
  },
  statChip: {
    background: "rgba(255, 255, 255, 0.5)",
    padding: "8px 14px",
    borderRadius: "12px",
    fontWeight: "600",
    fontSize: "14px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  },
  panel: {
    background: "rgba(255, 255, 255, 0.4)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderRadius: "1.5rem",
    padding: "20px",
    boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.15)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    marginTop: "20px",
  },
  sectionTitle: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#374151",
  },
  input: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.4)",
    background: "rgba(255, 255, 255, 0.5)",
    fontSize: "15px",
    outline: "none",
  },
  textarea: {
    width: "100%",
    minHeight: "100px",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.4)",
    background: "rgba(255, 255, 255, 0.5)",
    fontSize: "15px",
    outline: "none",
    boxSizing: "border-box",
  },
  button: {
    padding: "12px 18px",
    borderRadius: "12px",
    background: "linear-gradient(to right, #4f46e5, #a855f7)",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontWeight: "600",
    boxShadow: "0 4px 15px rgba(0, 0, 0, 0.1)",
    transition: "transform 0.2s",
  },
  secondaryButton: {
    background: "rgba(255, 255, 255, 0.6)",
    color: "#4f46e5",
    border: "1px solid rgba(79, 70, 229, 0.2)",
  },
  popup: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  popupInner: {
    background: "rgba(255, 255, 255, 0.7)",
    backdropFilter: "blur(15px)",
    WebkitBackdropFilter: "blur(15px)",
    padding: "24px",
    borderRadius: "1.5rem",
    width: "420px",
    textAlign: "center",
    boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.2)",
    border: "1px solid rgba(255, 255, 255, 0.3)",
  },
  popupTitle: {
    fontSize: "22px",
    fontWeight: "700",
    margin: "0 0 16px 0",
  },
  popupText: {
    marginTop: "16px",
    color: "#4b5563",
    fontSize: "14px",
  },
  focusInputContainer: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "16px",
  },
  focusBar: {
    marginBottom: "16px",
    padding: "10px",
    background: "rgba(79, 70, 229, 0.1)",
    borderRadius: "12px",
    textAlign: "center",
    fontWeight: "500",
    color: "#4f46e5",
  },
  player: {
    position: "relative", // Needed for child positioning
    width: "100%",
    height: "420px",
    borderRadius: "1.25rem",
    overflow: "hidden",
    background: "#000",
  },
  playerMax: {
    position: "fixed",
    inset: "0",
    background: "#000",
    zIndex: 60,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  smallBtn: {
    padding: "8px 14px",
    borderRadius: "10px",
    border: "none",
    background: "#4f46e5",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "500",
  },
  toggleMaxMinButton: {
    position: 'absolute',
    top: '15px',
    right: '15px',
    zIndex: 70,
    padding: '8px 14px',
    borderRadius: '10px',
    border: 'none',
    background: 'rgba(79, 70, 229, 0.8)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: '500',
    opacity: 0.8,
    transition: 'opacity 0.2s'
  },
  controlsAndStats: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "12px",
    gap: "12px",
  },
  statsText: {
    textAlign: "right",
    fontSize: "14px",
    color: "#4b5563",
  },
  placeholder: {
    padding: "40px",
    border: "2px dashed rgba(0,0,0,0.1)",
    borderRadius: "1.25rem",
    textAlign: "center",
    color: "#6b7280",
    fontSize: "16px",
  },
  historyCard: {
    padding: "16px",
    borderRadius: "1rem",
    background: "rgba(255, 255, 255, 0.6)",
    border: "1px solid rgba(255, 255, 255, 0.3)",
  },
  cardLink: {
    fontWeight: "700",
    color: "#4f46e5",
    textDecoration: "none",
  },
  cardDate: {
    color: "#6b7280",
    fontSize: "12px",
    margin: "4px 0 8px 0",
  },
  cardNotes: {
    fontSize: "14px",
    color: "#374151",
    marginBottom: "10px",
  },
  cardStats: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px",
    color: "#4b5563",
    borderTop: "1px solid rgba(0,0,0,0.05)",
    paddingTop: "8px",
  },
  emptyState: {
    color: "#6b7280",
    textAlign: "center",
    padding: "20px 0",
  },
  tooltip: {
    background: "rgba(255, 255, 255, 0.8)",
    backdropFilter: "blur(5px)",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: "12px",
    padding: "8px 12px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  },
};