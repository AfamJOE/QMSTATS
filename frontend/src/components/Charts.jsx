// frontend/src/components/Charts.jsx
import React, { useState } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "./Charts.css";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28"];

export default function Charts({
  fileCreations = 0,
  attachments = 0,
  rejects = 0,
}) {
  const [showBar, setShowBar] = useState(true);
  const [showPie, setShowPie] = useState(false);
  const [showLine, setShowLine] = useState(false);

  const data = [
    { name: "File Creations", count: fileCreations },
    { name: "Attachments", count: attachments },
    { name: "Rejects", count: rejects },
  ];

  const lineData = [
    { day: "Mon", fileCreations: 5, attachments: 3, rejects: 2 },
    { day: "Tue", fileCreations: 4, attachments: 2, rejects: 1 },
    { day: "Wed", fileCreations: 6, attachments: 5, rejects: 4 },
    { day: "Thu", fileCreations: 7, attachments: 6, rejects: 3 },
    {
      day: "Fri",
      fileCreations: fileCreations,
      attachments: attachments,
      rejects: rejects,
    },
  ];

  return (
    <div className="charts-container">
      <div className="chart-toggles">
        <label>
          <input
            type="checkbox"
            checked={showBar}
            onChange={() => setShowBar(!showBar)}
          />{" "}
          Bar Chart
        </label>
        <label>
          <input
            type="checkbox"
            checked={showPie}
            onChange={() => setShowPie(!showPie)}
          />{" "}
          Pie Chart
        </label>
        <label>
          <input
            type="checkbox"
            checked={showLine}
            onChange={() => setShowLine(!showLine)}
          />{" "}
          Line Chart
        </label>
      </div>

      {showBar && (
        <div className="chart-wrapper">
          <h3>Processed Mail (Bar Chart)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#8884d8">
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {showPie && (
        <div className="chart-wrapper">
          <h3>Processed Mail Distribution (Pie Chart)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {showLine && (
        <div className="chart-wrapper">
          <h3>Weekly Trend (Line Chart)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={lineData}>
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="fileCreations" stroke="#0088FE" />
              <Line type="monotone" dataKey="attachments" stroke="#00C49F" />
              <Line type="monotone" dataKey="rejects" stroke="#FFBB28" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
