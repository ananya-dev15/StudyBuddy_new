import React, { useEffect, useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import Dashboard from "../pages/Dashboard";
import Blog from "./blogs";

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const Leaderboard = () => {
  const [students, setStudents] = useState([]);

  useEffect(() => {
    // Generate 100 sample students
    const names = [
      "Ananya", "Rohan", "Priya", "Karan", "Ishika", "Aarav", "Tanya", "Dev",
      "Sanya", "Arjun", "Riya", "Manav", "Simran", "Kritika", "Aditya"
    ];

    const studentsData = [];
    for (let i = 0; i < 100; i++) {
      const name =
        names[Math.floor(Math.random() * names.length)] +
        " " +
        ["Sharma", "Patel", "Singh", "Gupta", "Mehta", "Verma", "Mishra", "Jain"][
          Math.floor(Math.random() * 8)
        ];

      const coins = Math.floor(Math.random() * 500) + 100;
      const videos = Math.floor(Math.random() * 40) + 10;
      const tabs = Math.floor(Math.random() * 12);

      let focusScore = ((videos * 10) + (coins * 0.3) - (tabs * 4)) / 10;
      focusScore = Math.min(100, Math.max(0, parseFloat(focusScore.toFixed(1))));

      studentsData.push({ name, coins, videos, tabs, focusScore });
    }

    // Sort descending by focus score
    studentsData.sort((a, b) => b.focusScore - a.focusScore);
    setStudents(studentsData);
  }, []);

  const top10 = students.slice(0, 10);

  const chartData = {
    labels: top10.map((s) => s.name),
    datasets: [
      {
        label: "Average Focus Score (out of 100)",
        data: top10.map((s) => s.focusScore),
        backgroundColor: "rgba(155, 81, 224, 0.7)",
        borderRadius: 8,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: "Top 10 Focused Students",
        color: "#333",
        font: { size: 16, weight: "bold" },
      },
    },
    scales: {
      y: { beginAtZero: true, max: 100, ticks: { color: "#333" } },
      x: { ticks: { color: "#333" } },
    },
  };

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.logo}>StudyBuddy</div>
        <nav>
          <a href="/dashboard" style={styles.navLink}>Dashboard</a>
          <a href="#" style={styles.navLink}>About</a>
          <a href="/blogs" style={styles.navLink}>Blogs</a>
          <a href="#" style={styles.navLink}>Contact</a>
        </nav>
      </header>

      <h1 style={styles.title}>🎥 Video Tracker Leaderboard</h1>

      {/* ⭐ TOP 3 STUDENT CARDS */}
      <div style={styles.topThreeContainer}>
        {students.slice(0, 3).map((s, i) => (
          <div key={i} style={{
            ...styles.card,
            background:
              i === 0
                ? "linear-gradient(135deg, #ffdd55cc, #ffbb33cc)"
                : i === 1
                ? "linear-gradient(135deg, #d0d0d0dd, #bfbfbfdd)"
                : "linear-gradient(135deg, #cfa47cdd, #bf8f68dd)",
            border: "2px solid rgba(255,255,255,0.25)",
          }}>
            <h2 style={styles.cardName}>{s.name}</h2>

            <div style={styles.trophyIcon}>
              {i === 0 ? "🏆" : i === 1 ? "🥈" : "🥉"}
            </div>

            <div style={styles.statsRow}>
              <div style={styles.statBlock}>
                <div style={styles.statLabel}>Rank</div>
                <div style={styles.statValue}>{i + 1}</div>
              </div>

              <div style={styles.statBlock}>
                <div style={styles.statLabel}>Total</div>
                <div style={styles.statValue}>{s.coins}</div>
              </div>

              <div style={styles.statBlock}>
                <div style={styles.statLabel}>Focus</div>
                <div style={styles.statValue}>{s.focusScore}%</div>
              </div>
            </div>
          </div>
        ))}
      </div>
{/* CHART — moved above table */}
<div style={styles.chartContainer}>
  <Bar data={chartData} options={chartOptions} />
</div>

{/* TABLE — now after chart */}
<div style={styles.leaderboard}>
  <table style={styles.table}>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Student Name</th>
        <th>Coins</th>
        <th>Videos Watched</th>
        <th>Tab Switches</th>
        <th>Average Focus Score (100)</th>
      </tr>
    </thead>

    <tbody>
      {students.map((s, i) => (
        <tr key={i} style={styles.row}>
          <td
            style={{
              ...styles.rank,
              ...(i === 0
                ? styles.gold
                : i === 1
                ? styles.silver
                : i === 2
                ? styles.bronze
                : {}),
            }}
          >
            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
          </td>

          <td>{s.name}</td>
          <td>{s.coins}</td>
          <td>{s.videos}</td>
          <td>{s.tabs}</td>

          <td>
            <div>{s.focusScore}%</div>
            <div style={styles.focusBar}>
              <div
                style={{
                  ...styles.focusFill,
                  width: `${s.focusScore}%`,
                }}
              ></div>
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>


      <footer style={styles.footer}>©️ 2025 StudyBuddy | Built for better learning 🔥</footer>
    </div>
  );
};

// --------------------------------
// STYLES
// --------------------------------
const styles = {
  page: {
    background: "linear-gradient(135deg, #e0c3fc, #8ec5fc)",
    minHeight: "100vh",
    fontFamily: "Poppins, sans-serif",
    color: "#333",
    paddingBottom: "50px",
  },

  header: {
    width: "100%",
    background: "rgba(255,255,255,0.25)",
    backdropFilter: "blur(12px)",
    padding: "1rem 3rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  logo: { fontWeight: 700, fontSize: "1.5em", color: "#9b51e0" },

  navLink: {
    marginLeft: "1.5rem",
    textDecoration: "none",
    color: "#333",
    fontWeight: 500,
  },

  title: {
    marginTop: "30px",
    fontSize: "2.2rem",
    textAlign: "center",
  },

  // ⭐ TOP THREE CARDS
  topThreeContainer: {
    display: "flex",
    justifyContent: "center",
    gap: "25px",
    marginTop: "30px",
    flexWrap: "wrap",
  },

  card: {
    width: "290px",
    padding: "22px",
    borderRadius: "18px",
    boxShadow: "0 8px 25px rgba(0,0,0,0.15)",
    position: "relative",
    color: "white",
  },

  cardName: {
    margin: 0,
    fontSize: "1.4rem",
  },

  trophyIcon: {
    position: "absolute",
    top: "15px",
    right: "20px",
    fontSize: "2.2rem",
  },

  statsRow: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "25px",
    background: "rgba(0,0,0,0.25)",
    padding: "12px",
    borderRadius: "12px",
  },

  statBlock: { textAlign: "center" },

  statLabel: { opacity: 0.8, fontSize: "0.9rem" },

  statValue: { fontSize: "1.3rem", fontWeight: 700 },

  leaderboard: {
    width: "90%",
    margin: "40px auto",
    backdropFilter: "blur(12px)",
    background: "rgba(255,255,255,0.25)",
    borderRadius: "20px",
    overflow: "hidden",
  },

  table: { width: "100%", borderCollapse: "collapse" },

  row: { height: "50px" },

  rank: { fontWeight: 700, fontSize: "1.2rem" },

  gold: { color: "#FFD700" },
  silver: { color: "#C0C0C0" },
  bronze: { color: "#CD7F32" },

  focusBar: {
    height: "10px",
    background: "#ddd",
    borderRadius: "5px",
    marginTop: "3px",
    overflow: "hidden",
  },

  focusFill: {
    height: "100%",
    background: "linear-gradient(90deg, #9b51e0, #8ec5fc)",
  },

  chartContainer: {
    width: "90%",
    margin: "40px auto",
    background: "rgba(255,255,255,0.25)",
    backdropFilter: "blur(12px)",
    padding: "20px",
    borderRadius: "20px",
  },

  footer: {
    marginTop: "20px",
    textAlign: "center",
    color: "#555",
  },
};

export default Leaderboard;
