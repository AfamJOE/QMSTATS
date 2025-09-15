// frontend/src/components/Group.jsx

import React, { useEffect, useState, useRef } from "react";
import api from "../utils/axios";
import "./Group.css";

export default function Group() {
  const [group, setGroup] = useState(null);

  // invite state
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [email, setEmail] = useState("");

  // debounce timer
  const debounceRef = useRef(null);

  // 1) Load existing group
  useEffect(() => {
    api.get("/groups").then(({ data }) => {
      const g = data.groups[0] || null;
      if (g) {
        // Normalize to { id, groupName }
        setGroup({
          id: g.id,
          groupName: g.group_name, // from DB
        });
      }
    });
  }, []);

  // 2) Autocomplete search
  useEffect(() => {
    if (!query) return setSuggestions([]);

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get("/groups/search-users", {
          params: { query },
        });
        setSuggestions(data.users);
      } catch (err) {
        console.error("Search failed", err);
      }
    }, 300);
  }, [query]);

  // 3) Create group
  const createGroup = () => {
    api.post("/groups/create").then(({ data }) => {
      setGroup({
        id: data.groupId,
        groupName: data.groupName, // from create response
      });
    });
  };

  // 4) Invite user
  const inviteUser = () => {
    api
      .post("/groups/invite", { groupId: group.id, userEmail: email })
      .then(() => {
        alert("Invite sent!");
        setQuery("");
        setSuggestions([]);
        setEmail("");
      })
      .catch((err) => alert(err.response?.data?.error || err.message));
  };

  // 5) Pick from suggestions
  const pickSuggestion = (u) => {
    setQuery(u.name);
    setEmail(u.email);
    setSuggestions([]);
  };

  return (
    <div className="group-container">
      {!group ? (
        <button onClick={createGroup}>Create Group</button>
      ) : (
        <>
          {/* Show creator’s name as the group name */}
          <h1>{group.groupName} (Manager)</h1>

          <div className="invite-wrapper">
            <input
              type="text"
              placeholder="Type a member’s name..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setEmail("");
              }}
            />

            {suggestions.length > 0 && (
              <ul className="suggestions-list">
                {suggestions.map((u) => (
                  <li key={u.id} onClick={() => pickSuggestion(u)}>
                    <strong>{u.name}</strong> — {u.email}
                  </li>
                ))}
              </ul>
            )}

            <button
              className="invite-btn"
              onClick={inviteUser}
              disabled={!email}
            >
              Invite
            </button>
          </div>
        </>
      )}
    </div>
  );
}
