// src/components/Rejects.jsx

import React, {
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import "./Rejects.css";

/* ─── predefined reason options ────────────────────── */
const REASON_GROUPS = [
  {
    label: "1. A copy of the valid immigration status document is required:",
    options: [
      "No valid or acceptable immigration status document was submitted",
      "Permanent Resident IDs - Front and Back Copies required",
      "Permanent Resident IDs - Expired",
    ],
  },
  {
    label:
      "2. The “Declaration of Guarantor” (section 2) on your application form:",
    options: [
      "Is incomplete",
      "Is not signed",
      "Date omitted",
      "The guarantor is not admissible",
    ],
  },
  {
    label: "3. References:",
    options: [
      "Two (2) persons who are neither your relatives nor your Guarantor.",
      "The Relationship between Applicants and References needs to be stated",
    ],
  },
  {
    label:
      "4. Additional Supplementary documents required to support your identity:",
    options: [
      "No valid or acceptable supplementary identification documents were submitted",
      "Supplementary IDs – Expired",
      "The copies … not certified",
    ],
  },
  {
    label:
      "5. Your statutory Declaration in Lieu of Guarantor (Form PPTC 326) submitted:",
    options: [
      "Is not signed by the applicant",
      "It is not signed by the official authorized by law",
      "Is incomplete",
      "The PPTC 132 form is not accepted",
    ],
  },
  {
    label:
      "6. The Travel Document application is incomplete, or the wrong application form was submitted:",
    options: [
      "No signature and date on the form",
      "The wrong application form was completed",
    ],
  },
  {
    label: "7. The Photographs:",
    options: [
      "Have not been submitted",
      "Only 1 photo submitted",
      "Do not meet Passport Canada Photo Specification",
      "Not certified",
      "Older than 6 months",
      "No date",
      "Name of photo provider – not provided",
    ],
  },
  {
    label: "8. Fees:",
    options: [
      "Adult fee – $120",
      "Child fee – $57",
      "Family Pay",
      "Wrong pay/Receipt",
    ],
  },
];

/* ─── initial row ─────────────────────────────────── */
const INITIAL_ROW = {
  value: "",
  reasons: [""],
  checks: { natp: false, rtd: false, coi: false, none: false },
};

function updateChecklist(checks, key) {
  const c = { ...checks };
  if (key === "none") {
    c.none = !c.none;
    if (c.none) c.natp = c.rtd = c.coi = false;
  } else {
    c[key] = !c[key];
    if (c[key]) c.none = false;
  }
  return c;
}

export default forwardRef(function Rejects(
  {
    initialData = [],
    onTotalChange = () => {},
    onNatpChange = () => {},
    onRtdChange = () => {},
    onCoiChange = () => {},
  },
  ref
) {
  const [rows, setRows] = useState([{ ...INITIAL_ROW }]);
  const [natpCount, setNatpCount] = useState(0);
  const [rtdCount, setRtdCount] = useState(0);
  const [coiCount, setCoiCount] = useState(0);

  // ── Prefill when editing ─────────────────────────────
  useEffect(() => {
    if (!initialData.length) return;
    const prefills = initialData.map((r) => ({
      value: String(r.value),
      checks: { ...r.checks },
      reasons:
        Array.isArray(r.reasons) && r.reasons.length ? [...r.reasons] : [""],
    }));
    setRows(prefills.length ? prefills : [{ ...INITIAL_ROW }]);
  }, [initialData]);

  // ── Duplicate detection (Rejects-only) ───────────────
  const norm = (v) => String(v ?? "").trim();
  const isConsidered = (v) => v && v !== "0"; // ignore empty/0 like elsewhere

  const countOccurrences = (val, skipIdx) => {
    const v = norm(val);
    let count = 0;
    rows.forEach((r, i) => {
      if (i !== skipIdx && isConsidered(norm(r.value)) && norm(r.value) === v) {
        count++;
      }
    });
    return count;
  };

  const validateOnBlur = (idx) => {
    const raw = norm(rows[idx]?.value);
    if (!isConsidered(raw)) return;
    const dups = countOccurrences(raw, idx);
    if (dups >= 1) {
      alert(
        `Duplicate rejected application number: ${raw}. Please enter a unique value.`
      );
      setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, value: "" } : r)));
    }
  };

  // ── Row operations ───────────────────────────────────
  const addApplication = () => setRows((rs) => [...rs, { ...INITIAL_ROW }]);
  const removeApplication = (idx) =>
    setRows((rs) => rs.filter((_, i) => i !== idx));
  const updateValue = (idx, val) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, value: val } : r)));
  const toggleCheck = (idx, key) =>
    setRows((rs) =>
      rs.map((r, i) =>
        i === idx ? { ...r, checks: updateChecklist(r.checks, key) } : r
      )
    );
  const addReason = (idx) =>
    setRows((rs) =>
      rs.map((r, i) => (i === idx ? { ...r, reasons: [...r.reasons, ""] } : r))
    );
  const removeReason = (idx, jdx) =>
    setRows((rs) =>
      rs.map((r, i) =>
        i === idx ? { ...r, reasons: r.reasons.filter((_, j) => j !== jdx) } : r
      )
    );
  const updateReason = (idx, jdx, val) =>
    setRows((rs) =>
      rs.map((r, i) =>
        i === idx
          ? {
              ...r,
              reasons: r.reasons.map((x, j) => (j === jdx ? val : x)),
            }
          : r
      )
    );

  // ── Expose getRows to parent ──────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      getRows: () =>
        rows.map((r, idx) => ({
          rowIndex: idx,
          value: parseInt(r.value, 10) || 0,
          checks: r.checks,
          reasons: r.reasons.filter((x) => x),
        })),
    }),
    [rows]
  );

  // ── Totals & summary counts ──────────────────────────
  const validRowCount = rows.filter((r) => r.value).length;
  useEffect(() => onTotalChange(validRowCount), [validRowCount, onTotalChange]);

  useEffect(() => {
    const natp = rows.filter((r) => r.checks.natp).length;
    const rtd = rows.filter((r) => r.checks.rtd).length;
    const coi = rows.filter((r) => r.checks.coi).length;
    setNatpCount(natp);
    setRtdCount(rtd);
    setCoiCount(coi);
    onNatpChange(natp);
    onRtdChange(rtd);
    onCoiChange(coi);
  }, [rows, onNatpChange, onRtdChange, onCoiChange]);

  return (
    <div className="rejects-wrapper">
      <h2 className="rejects-title">
        Rejects <span className="count">({validRowCount})</span>
      </h2>

      <div className="rejects-summary">
        <span>NATP: {natpCount}</span>
        <span>RTD: {rtdCount}</span>
        <span>COI: {coiCount}</span>
      </div>

      <div className="rejects">
        <div className="rejects-header">
          <div className="reject-col">
            <h3>Rejected Application:</h3>
            <button onClick={addApplication} className="add-application-btn">
              +
            </button>
          </div>
          <div className="reason-col">
            <h3>Reason(s):</h3>
          </div>
        </div>

        <ul className="rejects-list">
          {rows.map((row, idx) => (
            <li key={idx} className="reject-row">
              {/* application number + remove */}
              <div className="row-header">
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={row.value}
                  onChange={(e) => updateValue(idx, e.target.value)}
                  onBlur={() => validateOnBlur(idx)}
                />
                <button
                  onClick={() => removeApplication(idx)}
                  className="remove-application-btn"
                >
                  –
                </button>
              </div>

              {/* 4-item checklist */}
              <div className="row-checklist">
                {["natp", "rtd", "coi", "none"].map((k) => (
                  <label key={k}>
                    <input
                      type="checkbox"
                      checked={row.checks[k]}
                      disabled={!row.value}
                      onChange={() => toggleCheck(idx, k)}
                    />
                    {k.toUpperCase()}
                  </label>
                ))}
              </div>

              {/* reasons list */}
              <div className="reasons-container">
                {row.reasons.map((reason, jdx) => (
                  <div key={jdx} className="reason-item">
                    <select
                      value={reason}
                      onChange={(e) => updateReason(idx, jdx, e.target.value)}
                      required
                    >
                      <option value="">(Select)</option>
                      {REASON_GROUPS.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      onClick={() => removeReason(idx, jdx)}
                      className="remove-reason-btn"
                      disabled={row.reasons.length === 1}
                    >
                      –
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addReason(idx)}
                  className="add-reason-btn"
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
});
