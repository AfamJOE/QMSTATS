// src/components/Timestamp.jsx
import React from 'react';
import PropTypes from 'prop-types';
import './Timestamp.css';

export default function Timestamp({ date, startTime, endTime }) {
  return (
    <div className="timestamp-container">
      <span className="timestamp-date">{date}</span>
      <span className="timestamp-separator">|</span>
      <span className="timestamp-time">{startTime} – {endTime}</span>
    </div>
  );
}

Timestamp.propTypes = {
  /** yyyy‑mm‑dd */
  date:       PropTypes.string.isRequired,
  /** e.g. "08:00 AM" */
  startTime:  PropTypes.string.isRequired,
  /** e.g. "04:00 PM" */
  endTime:    PropTypes.string.isRequired,
};
