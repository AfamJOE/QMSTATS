// frontend/src/components/Profile.jsx
import React, { useEffect, useRef, useState } from "react";
import api from "../utils/axios";
import "./Profile.css";

export default function Profile() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  // leader search state
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedLeader, setSelectedLeader] = useState(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

  // load my biodata + current team leader
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/users/me");
        setMe(data);
        setSelectedLeader(data.teamLeader); // may be null
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // search by name/email with debounce
  useEffect(() => {
    if (!query) {
      setSuggestions([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get("/users/search", { params: { query } });
        setSuggestions(data.users);
      } catch (e) {
        console.error(e);
      }
    }, 300);
  }, [query]);

  const pick = (u) => {
    setSelectedLeader(u);
    setQuery(`${u.name}`);
    setSuggestions([]);
  };

  const saveLeader = async () => {
    if (!selectedLeader?.id) return;
    setSaving(true);
    try {
      await api.put("/users/team-leader", { leaderUserId: selectedLeader.id });
      alert("Team Leader saved.");
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="profile-container">Loading…</div>;
  if (!me) return <div className="profile-container">Could not load profile.</div>;

  return (
    <div className="profile-container">
      <h1>Profile</h1>

      {/* Read-only biodata */}
      <div className="profile-card">
        <div className="row">
          <label>First name</label>
          <span>{me.firstName}</span>
        </div>
        <div className="row">
          <label>Surname</label>
          <span>{me.surname}</span>
        </div>
        <div className="row">
          <label>Email</label>
          <span>{me.email}</span>
        </div>
      </div>

      {/* Team Leader */}
      <h2>Team Leader</h2>
      <div className="leader-card">
        <p className="help">
          Pick a Team Leader (by name or email). They’ll automatically receive
          a PDF copy whenever you click <strong>Send</strong> on a stat.
        </p>

        <div className="leader-picker">
          <input
            type="text"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map((u) => (
                <li key={u.id} onClick={() => pick(u)}>
                  <div className="name">{u.name}</div>
                  <div className="email">{u.email}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="current-leader">
          <label>Current Team Leader</label>
          <div className="value">
            {selectedLeader ? (
              <>
                <strong>{selectedLeader.name}</strong> — {selectedLeader.email}
              </>
            ) : (
              <em>None selected</em>
            )}
          </div>
        </div>

        <button
          className="btn-save"
          onClick={saveLeader}
          disabled={!selectedLeader?.id || saving}
        >
          {saving ? "Saving…" : "Save Team Leader"}
        </button>
      </div>
    </div>
  );
}
