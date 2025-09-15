// frontend/src/App.jsx
import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  NavLink,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

import Stats from "./components/Stats";
import Group from "./components/Group";
import Profile from "./components/Profile";
import Settings from "./components/Settings";
import Invites from "./components/Invites";
import AdminHive from "./components/AdminHive";
import HiveReport from "./print/HiveReport";

export default function App() {
  const navigate = useNavigate();
  const [statsMenuOpen, setStatsMenuOpen] = useState(false);
  const statsRef = useRef(null);

  // derive isAdmin from JWT email
  const isAdmin = useMemo(() => {
    try {
      const tok = localStorage.getItem("qm_token");
      if (!tok) return false;
      const payload = JSON.parse(atob(tok.split(".")[1] || ""));
      return (payload?.email || "").toLowerCase() === "admin@example.com";
    } catch {
      return false;
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("qm_token");
    navigate("/");
  };

  useEffect(() => {
    const onClickOutside = (e) => {
      if (statsRef.current && !statsRef.current.contains(e.target)) {
        setStatsMenuOpen(false);
      }
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  const openStatsNew = () => {
    navigate("/app/stats/new");
    setStatsMenuOpen(false);
  };
  const openStatsHistory = () => {
    navigate("/app/stats/history");
    setStatsMenuOpen(false);
  };

  return (
    <div className="app-container">
      <nav className="nav-container">
        {/* Stats dropdown */}
        <div className="nav-item dropdown" ref={statsRef}>
          <button
            className={`nav-link${statsMenuOpen ? " active" : ""}`}
            onClick={() => setStatsMenuOpen((o) => !o)}
          >
            Stats ▾
          </button>
          {statsMenuOpen && (
            <ul className="dropdown-menu">
              <li>
                <button className="dropdown-link" onClick={openStatsNew}>
                  New Stats
                </button>
              </li>
              <li>
                <button className="dropdown-link" onClick={openStatsHistory}>
                  History
                </button>
              </li>
            </ul>
          )}
        </div>

        {isAdmin && (
          <NavLink
            to="/app/hive"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Hive
          </NavLink>
        )}

        <NavLink
          to="/app/group"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Group
        </NavLink>
        <NavLink
          to="/app/profile"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Profile
        </NavLink>
        <NavLink
          to="/app/invites"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Invites
        </NavLink>
        <NavLink
          to="/app/settings"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Settings
        </NavLink>

        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </nav>

      <div className="content">
        <Routes>
          <Route index element={<Navigate to="stats" replace />} />

          <Route path="stats">
            <Route index element={<Stats mode="default" />} />
            <Route path="new" element={<Stats mode="new" />} />
            <Route path="history" element={<Stats mode="history" />} />
          </Route>

          {isAdmin && <Route path="hive" element={<AdminHive />} />}

          <Route path="group" element={<Group />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="invites" element={<Invites />} />

          <Route path="*" element={<Navigate to="stats" replace />} />
          <Route path="/print/hive" element={<HiveReport />} />
        </Routes>
      </div>
    </div>
  );
}
