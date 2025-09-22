import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, parseISO } from "date-fns";

const ModernDashboard = ({
  coins = 0,
  tabSwitches = 0,
  badges = [],
  watchHistory = [],
  weeklyStats = {},
  popularTags = [],
  assignments = [],
  hackathons = [],
  reminders = []
}) => {

  // Calendar Setup
  const [calendarDays, setCalendarDays] = useState([]);
  useEffect(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    const days = eachDayOfInterval({ start, end });
    setCalendarDays(days);
  }, []);

  // Growth Graph Data (example: combine weekly video + assignment activity)
  const graphData = Object.keys(weeklyStats).map(day => ({
    day,
    Videos: watchHistory.filter(v => format(new Date(v.watchedAt), "EEE") === day).length,
    Assignments: assignments.filter(a => format(new Date(a.deadline), "EEE") === day && a.status === "Completed").length
  }));

  return (
    <div className="min-h-screen relative font-sans text-white bg-gray-900 overflow-hidden p-10">

      {/* Glittery Particle Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {Array.from({ length: 60 }).map((_, i) => (
          <div key={i} className="absolute bg-white rounded-full opacity-20 animate-pulse" style={{
            width: `${Math.random() * 3 + 2}px`,
            height: `${Math.random() * 3 + 2}px`,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            animationDuration: `${Math.random() * 4 + 2}s`
          }} />
        ))}
      </div>

      <h1 className="relative z-10 text-4xl font-extrabold text-indigo-400 mb-10 glow-heading">🏫 Student Dashboard</h1>

      <div className="relative z-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">

        {/* Coins Card */}
        <div className="p-6 rounded-2xl shadow-2xl bg-gradient-to-br from-purple-700 via-indigo-700 to-pink-700 hover:scale-105 transform transition">
          <h2 className="text-xl font-bold mb-2 glow-heading">🪙 Coins</h2>
          <p className="text-3xl font-extrabold">{coins}</p>
        </div>

        {/* Tab Switches Card */}
        <div className="p-6 rounded-2xl shadow-2xl bg-gradient-to-br from-green-600 via-teal-600 to-cyan-500 hover:scale-105 transform transition">
          <h2 className="text-xl font-bold mb-2 glow-heading">🔄 Tab Switches</h2>
          <p className="text-3xl font-extrabold">{tabSwitches}/5</p>
        </div>

        {/* Badges Card */}
        <div className="p-6 rounded-2xl shadow-2xl bg-gradient-to-br from-yellow-400 via-orange-400 to-red-400 hover:scale-105 transform transition">
          <h2 className="text-xl font-bold mb-2 glow-heading">🏅 Badges</h2>
          <p>{badges.length ? badges.join(", ") : "None"}</p>
        </div>

        {/* Assignments Card */}
        <div className="p-6 rounded-2xl shadow-2xl bg-gray-800/80 hover:scale-105 transform transition">
          <h2 className="text-xl font-bold mb-2 glow-heading">📝 Assignments</h2>
          <p>Total: {assignments.length}</p>
          <p>✅ Completed: {assignments.filter(a => a.status==="Completed").length}</p>
          <p>⏳ Pending: {assignments.filter(a => a.status==="Pending").length}</p>
        </div>

        {/* Hackathons Card */}
        <div className="p-6 rounded-2xl shadow-2xl bg-gray-800/80 hover:scale-105 transform transition">
          <h2 className="text-xl font-bold mb-2 glow-heading">🏆 Hackathons</h2>
          <p>Total: {hackathons.length}</p>
          <p>✅ Completed: {hackathons.filter(h => h.status==="Completed").length}</p>
          <p>⏳ Pending: {hackathons.filter(h => h.status==="Pending").length}</p>
        </div>

        {/* Reminders Card */}
        <div className="p-6 rounded-2xl shadow-2xl bg-gray-800/80 hover:scale-105 transform transition">
          <h2 className="text-xl font-bold mb-2 glow-heading">⏰ Reminders</h2>
          <p>Total: {reminders.length}</p>
        </div>
      </div>

      {/* Calendar */}
      <div className="mt-10 p-6 rounded-2xl shadow-2xl bg-gray-800/70">
        <h2 className="text-2xl font-bold mb-4 glow-heading">📅 Calendar (This Month)</h2>
        <div className="grid grid-cols-7 gap-2 text-center">
          {calendarDays.map(day => {
            const dayStr = format(day, "d");
            const hasAssignment = assignments.some(a => isSameDay(parseISO(a.deadline), day));
            const hasVideo = watchHistory.some(v => isSameDay(parseISO(v.watchedAt), day));
            const hasHackathon = hackathons.some(h => isSameDay(parseISO(h.date), day));
            return (
              <div key={dayStr} className={`p-2 rounded-lg border ${hasAssignment || hasVideo || hasHackathon ? "bg-indigo-600 animate-pulse" : "bg-gray-700"}`}>
                {dayStr}
              </div>
            )
          })}
        </div>
      </div>

      {/* Growth Graph */}
      <div className="mt-10 p-6 rounded-2xl shadow-2xl bg-gray-800/70">
        <h2 className="text-2xl font-bold mb-4 glow-heading">📈 Weekly Growth</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={graphData}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="day" stroke="#f0f0f0"/>
            <YAxis stroke="#f0f0f0"/>
            <Tooltip contentStyle={{backgroundColor:'#1f2937', color:'#f0f0f0'}}/>
            <Bar dataKey="Videos" fill="#6366F1" radius={[8,8,0,0]}/>
            <Bar dataKey="Assignments" fill="#FBBF24" radius={[8,8,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <style>{`
        @keyframes pulse {0%,100%{opacity:0.2}50%{opacity:1}}
        .animate-pulse {animation:pulse 3s infinite;}
        .glow-heading {text-shadow:0 0 6px #7c3aed,0 0 12px #a78bfa;}
      `}</style>

    </div>
  )
};

export default ModernDashboard;
