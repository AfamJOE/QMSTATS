// src/components/MailOpening.jsx

import React, {
  useState,
  forwardRef,
  useImperativeHandle,
  useEffect,
} from "react";
import "./MailOpening.css";

export default forwardRef(function MailOpening({ initialData = {} }, ref) {
  // ──────────────── State ────────────────
  const [counts, setCounts] = useState({
    totalEnvelopes: "",
    fileCreation: "",
    urgentFileCreation: "",
    attachment: "",
    urgentAttachment: "",
    rejects: "",
    wrongMail: "",
    withdrawLetter: "",
  });

  // ──────────────── Effects ────────────────
  useEffect(() => {
    setCounts({
      totalEnvelopes: String(initialData.totalEnvelopes || ""),
      fileCreation: String(initialData.fileCreation || ""),
      urgentFileCreation: String(initialData.urgentFileCreation || ""),
      attachment: String(initialData.attachment || ""),
      urgentAttachment: String(initialData.urgentAttachment || ""),
      rejects: String(initialData.rejects || ""),
      wrongMail: String(initialData.wrongMail || ""),
      withdrawLetter: String(initialData.withdrawLetter || ""),
    });
  }, [initialData]);

  // ──────────────── Handlers ────────────────
  const handleChange = (key, val) => {
    if (!/^\d*$/.test(val)) return;
    setCounts((prev) => ({ ...prev, [key]: val }));
  };

  // ──────────────── Expose Methods to Parent ────────────────
  useImperativeHandle(
    ref,
    () => ({
      /** Return numeric counts for saving */
      getCounts: () => ({
        totalEnvelopes: parseInt(counts.totalEnvelopes, 10) || 0,
        fileCreation: parseInt(counts.fileCreation, 10) || 0,
        urgentFileCreation: parseInt(counts.urgentFileCreation, 10) || 0,
        attachment: parseInt(counts.attachment, 10) || 0,
        urgentAttachment: parseInt(counts.urgentAttachment, 10) || 0,
        rejects: parseInt(counts.rejects, 10) || 0,
        wrongMail: parseInt(counts.wrongMail, 10) || 0,
        withdrawLetter: parseInt(counts.withdrawLetter, 10) || 0,
      }),

      /** Clear all inputs */
      reset: () => {
        setCounts({
          totalEnvelopes: "",
          fileCreation: "",
          urgentFileCreation: "",
          attachment: "",
          urgentAttachment: "",
          rejects: "",
          wrongMail: "",
          withdrawLetter: "",
        });
      },
    }),
    [counts]
  );

  // ──────────────── Render ────────────────
  const rows = [
    { label: "01 Total envelopes:", key: "totalEnvelopes" },
    { label: "02 File creation:", key: "fileCreation" },
    { label: "03 Urgent File creation:", key: "urgentFileCreation" },
    { label: "04 Attachment:", key: "attachment" },
    { label: "05 Urgent attachment:", key: "urgentAttachment" },
    { label: "06 Rejects:", key: "rejects" },
    { label: "07 Wrong mail:", key: "wrongMail" },
    { label: "08 Withdraw letter:", key: "withdrawLetter" },
  ];

  const totalApplications = [
    "fileCreation",
    "urgentFileCreation",
    "attachment",
    "urgentAttachment",
    "rejects",
    "wrongMail",
    "withdrawLetter",
  ].reduce((sum, k) => sum + (parseInt(counts[k], 10) || 0), 0);

  return (
    <div className="mail-opening">
      {rows.map((r) => (
        <div key={r.key} className="mail-row">
          <label className="mail-label">{r.label}</label>
          <input
            className="mail-input"
            type="number"
            min="0"
            value={counts[r.key]}
            onChange={(e) => handleChange(r.key, e.target.value)}
          />
        </div>
      ))}

      <div className="mail-row mail-total">
        <label>Total Mail Opening Applications:</label>
        <span className="mail-total-value">{totalApplications}</span>
      </div>
    </div>
  );
});
