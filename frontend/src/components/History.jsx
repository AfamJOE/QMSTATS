import React, { useMemo, useState } from "react";
import PropTypes from "prop-types";
import Timestamp from "./Timestamp";
import api from "../utils/axios";
import "./History.css";

export default function History({ items, canEdit, onEdit, onDelete }) {
  const baseURL = api.defaults.baseURL;
  const [query, setQuery] = useState("");

  function formatTime(t) {
    if (!t) return "";
    const [hh, mm] = t.split(":").map(Number);
    const ampm = hh >= 12 ? "PM" : "AM";
    const h = ((hh + 11) % 12) + 1;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(
      2,
      "0"
    )} ${ampm}`;
  }

  // Build a searchable string for each stat
  const searchableText = (st) => {
    const created = st.created_at
      ? new Date(st.created_at).toLocaleString()
      : "";
    const timestr = `${formatTime(st.start_time)} ${formatTime(st.end_time)}`;
    return `${st.id} ${st.date} ${timestr} ${created}`.toLowerCase();
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // Allow multi-token matching: all tokens must be present
    const tokens = q.split(/\s+/).filter(Boolean);
    return items.filter((st) => {
      const hay = searchableText(st);
      return tokens.every((t) => hay.includes(t));
    });
  }, [items, query]);

  // Always-available PDF view
  const handleViewPdf = (st) => {
    const url = `${baseURL}/stats/${st.id}/pdf`;
    const token = localStorage.getItem("qm_token");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
      })
      .catch((err) => {
        console.error("Failed to load PDF:", err);
        alert("Could not load PDF: " + err.message);
      });
  };

  const handleDelete = async (st) => {
    const confirm = window.confirm(
      "Are you sure you want to delete this Stat? This action cannot be undone."
    );
    if (!confirm) return;

    try {
      await api.delete(`/stats/${st.id}`);
      if (onDelete) onDelete(st.id); // update parent state
    } catch (e) {
      console.error("Failed to delete stat:", e);
      alert(e.response?.data?.error || e.message);
    }
  };

  return (
    <section className="history-list">
      <div className="history-header">
        <h2>History</h2>

        <div className="history-search" role="search">
          <input
            aria-label="Search stats by ID, date, or time"
            className="history-search-input"
            type="search"
            placeholder='Search… e.g. "2025-03-14", "2:30 PM", or "1234"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="history-search-clear"
              onClick={() => setQuery("")}
              title="Clear search"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
          <span className="history-search-count">
            {visible.length}/{items.length}
          </span>
        </div>
      </div>

      {items.length === 0 && !query && <p>No stats saved yet.</p>}
      {items.length > 0 && visible.length === 0 && query && (
        <p className="history-empty">No matching stats.</p>
      )}

      {visible.map((st) => (
        <div key={st.id} className="history-item">
          <div className="timestamp-container">
            <Timestamp
              date={st.date}
              startTime={formatTime(st.start_time)}
              endTime={formatTime(st.end_time)}
            />
          </div>

          <div className="history-actions">
            <button className="btn-view" onClick={() => handleViewPdf(st)}>
              View
            </button>

            {canEdit(st) && (
              <>
                <button className="btn-edit" onClick={() => onEdit(st)}>
                  Edit
                </button>
                <button className="btn-delete" onClick={() => handleDelete(st)}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

History.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      date: PropTypes.string.isRequired,
      start_time: PropTypes.string.isRequired,
      end_time: PropTypes.string.isRequired,
      created_at: PropTypes.string,
    })
  ).isRequired,
  canEdit: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func, // new callback
};
