// src/components/NewStatModal.jsx

import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import api from "../utils/axios"; // shared Axios instance
import "./NewStatModal.css";

/**
 * Universal modal for creating or editing a Stat.
 *
 * Props
 * ───────────────────────────────────────────────
 * isOpen        : Boolean  – show / hide modal
 * mode          : "new" | "edit"
 * initialData   : Stat object when editing
 * existingStats : array<Stat> for overlap check
 * onSave(stat)  : callback after successful DB save
 * onClose()     : close the modal
 */
export default function NewStatModal({
  isOpen,
  mode = "new",
  initialData = null,
  existingStats,
  onSave,
  onClose,
}) {
  /* ───────────────────────── state ───────────────────────── */
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  /* ─────────── reset form every time the modal is opened ─────────── */
  useEffect(() => {
    if (!isOpen) return;
    if (mode === "edit" && initialData) {
      // prefill date/time
      setDate(initialData.date);
      setStartTime(initialData.startTime);
      setEndTime(initialData.endTime);
    } else {
      // new stat: default to today, blank times
      const today = new Date().toISOString().slice(0, 10);
      setDate(today);
      setStartTime("");
      setEndTime("");
    }
    setError("");
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, initialData]);

  /* ───────────────────────── helpers ───────────────────────── */
  // Always lock date/time fields in edit mode
  const readOnly = mode === "edit";

  const validate = () => {
    if (!date || !startTime || !endTime) {
      return "Please fill in Date, Start Time and End Time.";
    }
    if (startTime >= endTime) {
      return "Start Time must be before End Time.";
    }
    // overlap check against existingStats
    const overlap = existingStats.some((s) => {
      if (mode === "edit" && s.id === initialData.id) return false;
      return s.date === date && startTime < s.endTime && endTime > s.startTime;
    });
    if (overlap) {
      return "Timeline overlaps an existing stat for that date.";
    }
    return "";
  };

  /* ───────────────────────── save handler ───────────────────────── */
  const handleSave = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    setError("");
    setSaving(true);

    // Base timestamp metadata
    const base = {
      id: mode === "edit" ? initialData.id : Date.now(),
      date,
      startTime,
      endTime,
      createdAt: mode === "edit" ? initialData.createdAt : Date.now(),
    };

    // Prepare full payload; other sections will be filled by parent sheet
    const fullPayload = {
      ...base,
      mailOpening: mode === "edit" ? initialData.mailOpening : {},
      fileCreation: mode === "edit" ? initialData.fileCreation : {},
      attachments: mode === "edit" ? initialData.attachments : {},
      rejects: mode === "edit" ? initialData.rejects : {},
    };

    try {
      const endpoint = mode === "new" ? "/stats" : `/stats/${base.id}`;
      await api({
        url: endpoint,
        method: mode === "new" ? "POST" : "PUT",
        data: fullPayload,
      });
      onSave(fullPayload);
    } catch (e) {
      console.error(e);
      setError(e.response?.data?.error || e.message || "Could not save.");
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>{mode === "new" ? "New Stat" : "Edit Stat"}</h2>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-field">
          <label>Date</label>
          <input
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="modal-field">
          <label>Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="modal-field">
          <label>End Time</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="modal-buttons">
          {!readOnly && (
            <>
              <button
                className="btn btn-save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                className="btn btn-reset"
                type="button"
                onClick={() => {
                  if (mode === "edit" && initialData) {
                    setDate(initialData.date);
                    setStartTime(initialData.startTime);
                    setEndTime(initialData.endTime);
                  } else {
                    const today = new Date().toISOString().slice(0, 10);
                    setDate(today);
                    setStartTime("");
                    setEndTime("");
                  }
                }}
                disabled={saving}
              >
                Reset
              </button>
            </>
          )}
          <button className="btn btn-cancel" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

const statShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  date: PropTypes.string.isRequired, // 'yyyy-mm-dd'
  startTime: PropTypes.string.isRequired, // 'HH:mm'
  endTime: PropTypes.string.isRequired, // 'HH:mm'
  createdAt: PropTypes.number.isRequired,
  mailOpening: PropTypes.object,
  fileCreation: PropTypes.array,
  attachments: PropTypes.array,
  rejects: PropTypes.array,
});

NewStatModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  mode: PropTypes.oneOf(["new", "edit"]),
  initialData: PropTypes.oneOfType([statShape, PropTypes.oneOf([null])]),
  existingStats: PropTypes.arrayOf(statShape).isRequired,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
