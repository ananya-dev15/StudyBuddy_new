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
  - NEW: Local video file playback with tracking
  - NEW: Maximize/Minimize functionality for Focus Timer Popup
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
  const [videoId, setVideoId] = useState(null); // For YouTube videos
  const [localVideoFile, setLocalVideoFile] = useState(null); // For local files
  const [localVideoObjectUrl, setLocalVideoObjectUrl] = useState(null); // Object URL for local files

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
  const [isFocusTimerPopupMaximized, setIsFocusTimerPopupMaximized] = useState(false); // NEW STATE
  const [youtubePlayerInstance, setYoutubePlayerInstance] = useState(null); // Renamed for clarity
  const [earnedThisSessionCoins, setEarnedThisSessionCoins] = useState(false);
  const [showZeroCoinsPopup, setShowZeroCoinsPopup] = useState(false);

  // State for starting timer on play
  const [focusDuration, setFocusDuration] = useState(null);
  const [isFocusTimerPending, setIsFocusTimerPending] = useState(false);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);

  // refs
  const youtubePlayerRef = useRef(null); // Ref for YouTube Player instance
  const localVideoRef = useRef(null); // Ref for HTML <video> element
  const pollRef = useRef(null);
  const lastSampleRef = useRef(0);

  // load YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
  }, []);

  // Create/Revoke Object URL for local video file
  useEffect(() => {
    if (localVideoFile) {
      const url = URL.createObjectURL(localVideoFile);
      setLocalVideoObjectUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setLocalVideoObjectUrl(null); // Clear the object URL when component unmounts or file changes
      };
    }
  }, [localVideoFile]);


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

  // Initialize YT player when videoId is set OR set up local video listeners
  useEffect(() => {
    if (!videoId && !localVideoObjectUrl) return;

    // Reset states common to both players
    setPlayerReady(false);
    setIsPlaying(false);
    setSessionPlayedSeconds(0);
    setSessionViewsTaken(0);
    setEarnedThisSessionCoins(false);
    setHasPlaybackStarted(false); // Reset for the new video session
    setNoteText(appState.notes?.[videoId || localVideoFile?.name] || ""); // Use videoId or file name as key
    setTagText("");
    stopPolling();


    if (videoId) {
      function createYoutubePlayer() {
        if (!window.YT || !window.YT.Player) {
          setTimeout(createYoutubePlayer, 300);
          return;
        }
        if (youtubePlayerRef.current) {
          try {
            youtubePlayerRef.current.destroy();
          } catch (e) {}
          youtubePlayerRef.current = null;
        }

        const p = new window.YT.Player("vt-youtube-player", { // Changed ID for clarity
          videoId,
          playerVars: { controls: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: (e) => {
              setPlayerReady(true);
              setYoutubePlayerInstance(p);
              lastSampleRef.current = p.getCurrentTime() || 0;
            },
            onStateChange: (e) => {
              const state = e.data;
              if (state === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
                startPolling();
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
        youtubePlayerRef.current = p;
      }
      createYoutubePlayer();
    } else if (localVideoObjectUrl) {
      // Setup for local video
      const videoElement = localVideoRef.current;
      if (!videoElement) return;

      const onPlay = () => {
        setIsPlaying(true);
        startPolling();
        if (isFocusTimerPending && !hasPlaybackStarted) {
          setFocusRemaining(focusDuration);
          setIsFocusTimerPending(false);
          setHasPlaybackStarted(true);
        }
      };
      const onPause = () => {
        setIsPlaying(false);
        stopPolling();
      };
      const onEnded = () => {
        setIsPlaying(false);
        stopPolling();
        finalizeSession(true);
      };
      const onTimeUpdate = () => {
        setCurrentTime(videoElement.currentTime);
      };
      const onReady = () => {
        setPlayerReady(true);
        lastSampleRef.current = videoElement.currentTime || 0;
      };


      videoElement.addEventListener("play", onPlay);
      videoElement.addEventListener("pause", onPause);
      videoElement.addEventListener("ended", onEnded);
      videoElement.addEventListener("timeupdate", onTimeUpdate);
      videoElement.addEventListener("loadedmetadata", onReady); // When video data is loaded

      return () => {
        videoElement.removeEventListener("play", onPlay);
        videoElement.removeEventListener("pause", onPause);
        videoElement.removeEventListener("ended", onEnded);
        videoElement.removeEventListener("timeupdate", onTimeUpdate);
        videoElement.removeEventListener("loadedmetadata", onReady);
        stopPolling();
      };
    }

    return () => stopPolling();
  }, [videoId, localVideoObjectUrl, focusDuration, hasPlaybackStarted, isFocusTimerPending]);

  // Polling logic (adjusted to work with either player)
  const startPolling = () => {
    if (pollRef.current) return;

    const getPlayerCurrentTime = () => {
      if (videoId && youtubePlayerRef.current) {
        return youtubePlayerRef.current.getCurrentTime() || 0;
      } else if (localVideoRef.current) {
        return localVideoRef.current.currentTime || 0;
      }
      return 0;
    };

    lastSampleRef.current = getPlayerCurrentTime();
    pollRef.current = setInterval(() => {
      const now = getPlayerCurrentTime();
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
      // Check if any player is active (YouTube or local)
      const anyPlayerPlaying = isPlaying; // isPlaying already tracks the active player
      
      if (document.visibilityState === "hidden" && anyPlayerPlaying) {
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
    const currentVideoIdentifier = videoId || localVideoFile?.name;
    if (!currentVideoIdentifier) return;
    const secondsWatched = Math.floor(sessionPlayedSeconds);
    if (secondsWatched <= 0 && sessionViewsTaken === 0) {
      cleanupAfterSession();
      return;
    }

    const now = new Date();
    const newHistoryEntry = {
      videoId: currentVideoIdentifier, // Use YouTube ID or local file name
      url: videoId ? `https://youtu.be/${videoId}` : `file://${localVideoFile.name}`, // Placeholder for local files
      watchedAt: now.toISOString(),
      seconds: secondsWatched,
      viewsTaken: sessionViewsTaken,
      notes: noteText || appState.notes?.[currentVideoIdentifier] || "",
      tag: tagText || "",
    };

    setAppState((prev) => {
      const stats = { ...(prev.stats || {}) };
      const prevStat = stats[currentVideoIdentifier] || { totalSeconds: 0, totalViews: 0 };
      stats[currentVideoIdentifier] = {
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
      if (noteText) notes[currentVideoIdentifier] = noteText;
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

  // Cleanup after session (adjusted for both players)
  const cleanupAfterSession = (ended = false) => {
    try {
      if (videoId && youtubePlayerRef.current) {
        youtubePlayerRef.current.pauseVideo();
        if (ended) {
          youtubePlayerRef.current.stopVideo();
          youtubePlayerRef.current.destroy();
          youtubePlayerRef.current = null;
        }
      } else if (localVideoRef.current) {
        localVideoRef.current.pause();
        if (ended) {
          localVideoRef.current.currentTime = 0; // Reset local video to start
          // No destroy equivalent for HTML5 video, just reset source if needed
        }
      }
    } catch (e) {}

    setVideoId(null); // Clear YouTube video ID
    setLocalVideoFile(null); // Clear local video file
    // setLocalVideoObjectUrl(null); // This is handled by the useEffect for localVideoFile
    setYoutubePlayerInstance(null);
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
    setIsFocusTimerPopupMaximized(false); // Reset popup size on cleanup
  };

  // Event Handlers
  const handleLoadContent = () => {
    if (appState.coins <= 0) {
      setShowZeroCoinsPopup(true);
      return;
    }

    if (inputUrl.trim()) {
      const id = extractYouTubeId(inputUrl.trim());
      if (!id) {
        alert("Please paste a valid YouTube URL or ID.");
        return;
      }
      setLocalVideoFile(null); // Clear local video if loading YouTube
      setVideoId(id);
    } else if (localVideoFile) {
      setVideoId(null); // Clear YouTube video if loading local file
      // localVideoFile is already set by handleFileChange
    } else {
      alert("Please paste a YouTube URL or select a local video file.");
      return;
    }
    setShowTimerPopup(true);
    setInputUrl("");
    setIsFocusTimerPopupMaximized(false); // Ensure popup starts minimized
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLocalVideoFile(file);
      setInputUrl(""); // Clear YouTube URL input if a local file is chosen
    }
  };


  const confirmStartFocus = () => {
    // Set timer to pending state; it will start on video play
    setFocusDuration(focusMinutes * 60);
    setIsFocusTimerPending(true);
    setShowTimerPopup(false);
  };

  const handleStopSave = () => finalizeSession(false);

  const handleSaveNotes = () => {
    const currentVideoIdentifier = videoId || localVideoFile?.name;
    if (!currentVideoIdentifier) return alert("Load a video first");
    setAppState((prev) => ({
      ...prev,
      notes: { ...(prev.notes || {}), [currentVideoIdentifier]: noteText },
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
  }, [isPlaying, sessionPlayedSeconds, sessionViewsTaken, videoId, localVideoFile]);

  // Utility
  const niceTime = (s) => {
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h) return `${h}h ${m}m ${sec}s`;
    return m ? `${m}m ${sec}s` : `${sec}s`;
  };

  const currentActiveVideoIdentifier = videoId || localVideoFile?.name;
  const isVideoLoaded = videoId || localVideoObjectUrl; // Check if either type of video is loaded


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
          <div style={{ display: "flex", gap: "12px", flexDirection: "column" }}>
            <div style={{ display: "flex", gap: "12px" }}>
              <input
                placeholder="Paste YouTube URL or id..."
                value={inputUrl}
                onChange={(e) => { setInputUrl(e.target.value); setLocalVideoFile(null); }} // Clear local file if typing URL
                style={styles.input}
                disabled={appState.coins <= 0}
              />
              <button
                onClick={handleLoadContent}
                style={styles.button}
                disabled={appState.coins <= 0 || (!inputUrl.trim() && !localVideoFile)}
              >
                {appState.coins <= 0 ? "Locked" : (videoId || localVideoFile ? "Load New" : "Load Video")}
              </button>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <label htmlFor="local-video-upload" style={{ ...styles.button, ...styles.secondaryButton, flex: 1, textAlign: 'center' }}>
                Choose Video from System
              </label>
              <input
                id="local-video-upload"
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                style={{ display: "none" }}
                disabled={appState.coins <= 0}
              />
              {localVideoFile && <span style={{fontSize: "14px", color: "#4b5563"}}>Selected: {localVideoFile.name}</span>}
            </div>
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
            <div style={isFocusTimerPopupMaximized ? styles.maximizedPopupInner : styles.popupInner}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={styles.popupTitle}>Set Focus Timer</h3>
                <button
                  onClick={() => setIsFocusTimerPopupMaximized(!isFocusTimerPopupMaximized)}
                  style={{ ...styles.smallBtn, background: '#6b7280' }}
                >
                  {isFocusTimerPopupMaximized ? "Minimize" : "Maximize"}
                </button>
              </div>
              <div style={styles.focusInputContainer}>
                <input
                  type="number"
                  min={0}
                  max={180}
                  value={focusMinutes}
                  onChange={(e) => setFocusMinutes(Number(e.target.value))}
                  style={{ ...styles.input, fontSize: isFocusTimerPopupMaximized ? '1.5em' : '1em' }}
                />
                <span style={{ fontSize: isFocusTimerPopupMaximized ? '1.2em' : '1em' }}>minutes</span>
              </div>
              <div style={{ marginTop: "16px" }}>
                <button onClick={confirmStartFocus} style={{ ...styles.button, fontSize: isFocusTimerPopupMaximized ? '1.2em' : '1em' }}>
                  Set Timer ({focusMinutes} min)
                </button>
                <button
                  onClick={() => {
                    setShowTimerPopup(false);
                    // If the user cancels, clear the loaded video
                    setVideoId(null);
                    setLocalVideoFile(null);
                    setIsFocusTimerPopupMaximized(false); // Reset popup size on cancel
                  }}
                  style={{
                    ...styles.button,
                    ...styles.secondaryButton,
                    marginLeft: 8,
                    fontSize: isFocusTimerPopupMaximized ? '1.2em' : '1em'
                  }}
                >
                  Cancel
                </button>
              </div>
              <p style={{ ...styles.popupText, fontSize: isFocusTimerPopupMaximized ? '1.1em' : '14px' }}>
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

          {isVideoLoaded ? (
            <>
              <div
                style={isPlayerMaximized ? styles.playerMax : styles.player}
              >
                {videoId && (
                  <div
                    id="vt-youtube-player" // Updated ID
                    style={{ width: "100%", height: "100%" }}
                  />
                )}
                {localVideoObjectUrl && (
                  <video
                    ref={localVideoRef}
                    src={localVideoObjectUrl}
                    controls
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                )}
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
              Paste a YouTube link or choose a local video to begin your study session.
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
                      href={h.url.startsWith("http") ? h.url : "#"} // Prevent navigation for local files
                      target="_blank"
                      rel="noreferrer"
                      style={styles.cardLink}
                    >
                      {h.videoId}
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
                      href={vid.length === 11 ? `https://youtu.be/${vid}` : "#"} // Check if it's a YouTube ID
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
          @media (max-width: 760px) { #vt-youtube-player { height: 220px !important; } }
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
    transition: "all 0.3s ease-in-out", // Smooth transition for size change
  },
  maximizedPopupInner: { // NEW STYLE for maximized popup
    width: "90vw",
    height: "90vh",
    maxWidth: "90vw", // Ensure it doesn't exceed viewport
    maxHeight: "90vh", // Ensure it doesn't exceed viewport
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "1.2em", // Increase font size for better readability
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