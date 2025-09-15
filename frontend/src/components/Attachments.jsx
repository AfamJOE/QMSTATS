// frontend/src/components/Attachments.jsx

import React, {
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import "./Attachments.css";

const INITIAL_CHECKS = { natp: false, rtd: false, coi: false, none: false };

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

export default forwardRef(function Attachments(
  {
    initialData = [],
    onTotalChange = () => {},
    onNatpChange = () => {},
    onRtdChange = () => {},
    onCoiChange = () => {},
  },
  ref
) {
  const [regular, setRegular] = useState([
    { value: "", checks: { ...INITIAL_CHECKS } },
  ]);
  const [urgent, setUrgent] = useState([
    { value: "", checks: { ...INITIAL_CHECKS } },
  ]);
  const [natpCount, setNatpCount] = useState(0);
  const [rtdCount, setRtdCount] = useState(0);
  const [coiCount, setCoiCount] = useState(0);

  // Prefill when editing
  useEffect(() => {
    if (!initialData.length) return;
    const reg = [];
    const urg = [];
    initialData.forEach((r) => {
      const entry = {
        value: String(r.value),
        checks: { ...r.checks },
      };
      if (r.urgency === "regular") {
        reg[r.rowIndex] = entry;
      } else {
        urg[r.rowIndex] = entry;
      }
    });
    const blank = { value: "", checks: { ...INITIAL_CHECKS } };
    setRegular(reg.length ? reg.map((e) => e || blank) : [blank]);
    setUrgent(urg.length ? urg.map((e) => e || blank) : [blank]);
  }, [initialData]);

  // Row operations
  const addRow = (list, setter) =>
    setter([...list, { value: "", checks: { ...INITIAL_CHECKS } }]);
  const removeRow = (list, setter, idx) =>
    setter(list.filter((_, i) => i !== idx));
  const updateVal = (list, setter, idx, val) =>
    setter(list.map((it, i) => (i === idx ? { ...it, value: val } : it)));
  const toggleCheck = (list, setter, idx, key) =>
    setter(
      list.map((it, i) =>
        i === idx ? { ...it, checks: updateChecklist(it.checks, key) } : it
      )
    );

  // Duplicate detection (Attachments-only)
  const norm = (v) => String(v ?? "").trim();
  const isConsidered = (v) => v && v !== "0";

  const countOccurrences = (val, skip) => {
    const v = norm(val);
    let count = 0;
    regular.forEach((it, i) => {
      if (!(skip?.list === "regular" && skip?.idx === i)) {
        if (norm(it.value) === v && isConsidered(v)) count++;
      }
    });
    urgent.forEach((it, i) => {
      if (!(skip?.list === "urgent" && skip?.idx === i)) {
        if (norm(it.value) === v && isConsidered(v)) count++;
      }
    });
    return count;
  };

  const validateOnBlur = (listName, setter, idx) => {
    const list = listName === "regular" ? regular : urgent;
    const raw = norm(list[idx]?.value);
    if (!isConsidered(raw)) return; // ignore empty/0
    const dups = countOccurrences(raw, { list: listName, idx });
    if (dups >= 1) {
      alert(
        `Duplicate attachment number: ${raw}. Please enter a unique value.`
      );
      setter(list.map((it, i) => (i === idx ? { ...it, value: "" } : it)));
    }
  };

  // Count valid rows
  const countValid = (list) =>
    list.filter((it) => isConsidered(norm(it.value))).length;
  const totalCount = countValid(regular) + countValid(urgent);

  // Propagate totals & subtotals upward
  useEffect(() => onTotalChange(totalCount), [totalCount, onTotalChange]);
  useEffect(() => {
    const all = [...regular, ...urgent];
    const n = all.filter((r) => r.checks.natp).length;
    const r = all.filter((r) => r.checks.rtd).length;
    const c = all.filter((r) => r.checks.coi).length;
    setNatpCount(n);
    onNatpChange(n);
    setRtdCount(r);
    onRtdChange(r);
    setCoiCount(c);
    onCoiChange(c);
  }, [regular, urgent, onNatpChange, onRtdChange, onCoiChange]);

  // Expose getRows() to parent
  useImperativeHandle(
    ref,
    () => ({
      getRows: () => {
        const rows = [];
        regular.forEach((item, i) => {
          if (isConsidered(norm(item.value))) {
            rows.push({
              category: "attachment",
              urgency: "regular",
              rowIndex: i,
              value: parseInt(item.value, 10) || 0,
              checks: item.checks,
            });
          }
        });
        urgent.forEach((item, i) => {
          if (isConsidered(norm(item.value))) {
            rows.push({
              category: "attachment",
              urgency: "urgent",
              rowIndex: i,
              value: parseInt(item.value, 10) || 0,
              checks: item.checks,
            });
          }
        });
        return rows;
      },
    }),
    [regular, urgent]
  );

  // Render one column
  const renderCol = (title, list, setter, listName) => (
    <div className="attach-column">
      <div className="attach-header">
        <h3>
          {title} <span className="count">({countValid(list)})</span>
        </h3>
        <button className="attach-add" onClick={() => addRow(list, setter)}>
          +
        </button>
      </div>
      <ul>
        {list.map((item, i) => (
          <li key={i}>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={item.value}
              onChange={(e) => updateVal(list, setter, i, e.target.value)}
              onBlur={() => validateOnBlur(listName, setter, i)}
            />
            <div className="checklist">
              {["natp", "rtd", "coi", "none"].map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={item.checks[key]}
                    disabled={!isConsidered(norm(item.value))}
                    onChange={() => toggleCheck(list, setter, i, key)}
                  />
                  {key.toUpperCase()}
                </label>
              ))}
            </div>
            <button
              className="attach-remove"
              onClick={() => removeRow(list, setter, i)}
            >
              –
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="attachments-wrapper">
      <h2 className="attachments-title">
        Attachments <span className="count">({totalCount})</span>
      </h2>
      <div className="attachments-summary">
        <span>NATP: {natpCount}</span>
        <span>RTD: {rtdCount}</span>
        <span>COI: {coiCount}</span>
      </div>
      <div className="attachments">
        {renderCol("Regular Attachment", regular, setRegular, "regular")}
        {renderCol("Urgent Attachment", urgent, setUrgent, "urgent")}
      </div>
    </div>
  );
});
