// src/components/FileCreation.jsx

import React, {
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import "./FileCreation.css";

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

export default forwardRef(function FileCreation(
  {
    initialData = [],
    onTotalChange = () => {},
    onNatpChange = () => {},
    onRtdChange = () => {},
    onCoiChange = () => {},
  },
  ref
) {
  // ──────────────── State ────────────────
  const [indReg, setIndReg] = useState([
    { value: "", checks: { ...INITIAL_CHECKS } },
  ]);
  const [indUrg, setIndUrg] = useState([
    { value: "", checks: { ...INITIAL_CHECKS } },
  ]);
  const [famRegGroups, setFamRegGroups] = useState([]);
  const [famUrgGroups, setFamUrgGroups] = useState([]);

  // Prefill from initialData when editing
  useEffect(() => {
    if (!initialData.length) return;

    // Temporary containers
    const tmpIndReg = [];
    const tmpIndUrg = [];
    const tmpFamReg = {};
    const tmpFamUrg = {};

    initialData.forEach((r) => {
      const entry = {
        value: String(r.value),
        checks: { ...r.checks },
      };
      if (r.category === "individual") {
        if (r.urgency === "regular") tmpIndReg[r.rowIndex] = entry;
        else tmpIndUrg[r.rowIndex] = entry;
      } else {
        const bucket = r.urgency === "regular" ? tmpFamReg : tmpFamUrg;
        const gi = r.groupIndex;
        bucket[gi] = bucket[gi] || [];
        bucket[gi][r.rowIndex] = entry;
      }
    });

    const blank = { value: "", checks: { ...INITIAL_CHECKS } };

    setIndReg(tmpIndReg.length ? tmpIndReg.map((e) => e || blank) : [blank]);
    setIndUrg(tmpIndUrg.length ? tmpIndUrg.map((e) => e || blank) : [blank]);

    setFamRegGroups(
      Object.entries(tmpFamReg).map(([, entries]) => ({
        entries: entries.map((e) => e || blank),
      }))
    );
    setFamUrgGroups(
      Object.entries(tmpFamUrg).map(([, entries]) => ({
        entries: entries.map((e) => e || blank),
      }))
    );
  }, [initialData]);

  // ──────────────── Helpers for duplicate detection ────────────────
  const norm = (v) => String(v ?? "").trim();
  const isConsidered = (v) => v && v !== "0"; // empty/0 are ignored

  /** Count how many times a value appears across ALL File Creation inputs,
   *  skipping the position indicated by `skip` (to avoid counting itself).
   *  skip: { type: 'indReg'|'indUrg'|'famReg'|'famUrg', idx: number, gi?: number }
   */
  const countOccurrences = (val, skip) => {
    const value = norm(val);
    let count = 0;

    indReg.forEach((it, i) => {
      if (!(skip?.type === "indReg" && skip.idx === i)) {
        if (norm(it.value) === value && isConsidered(value)) count++;
      }
    });

    indUrg.forEach((it, i) => {
      if (!(skip?.type === "indUrg" && skip.idx === i)) {
        if (norm(it.value) === value && isConsidered(value)) count++;
      }
    });

    famRegGroups.forEach((g, gi) => {
      g.entries.forEach((it, i) => {
        if (!(skip?.type === "famReg" && skip.gi === gi && skip.idx === i)) {
          if (norm(it.value) === value && isConsidered(value)) count++;
        }
      });
    });

    famUrgGroups.forEach((g, gi) => {
      g.entries.forEach((it, i) => {
        if (!(skip?.type === "famUrg" && skip.gi === gi && skip.idx === i)) {
          if (norm(it.value) === value && isConsidered(value)) count++;
        }
      });
    });

    return count;
  };

  const validateIndOnBlur = (type, setter, idx) => {
    const list = type === "indReg" ? indReg : indUrg;
    const raw = norm(list[idx]?.value);
    if (!isConsidered(raw)) return;
    const dups = countOccurrences(raw, { type, idx });
    if (dups >= 1) {
      alert(
        `Duplicate application number: ${raw}. Please enter a unique value.`
      );
      setter(list.map((it, i) => (i === idx ? { ...it, value: "" } : it)));
    }
  };

  const validateFamOnBlur = (type, setter, gi, idx) => {
    const groups = type === "famReg" ? famRegGroups : famUrgGroups;
    const raw = norm(groups[gi]?.entries[idx]?.value);
    if (!isConsidered(raw)) return;
    const dups = countOccurrences(raw, { type, gi, idx });
    if (dups >= 1) {
      alert(
        `Duplicate application number: ${raw}. Please enter a unique value.`
      );
      setter(
        groups.map((g, gIndex) =>
          gIndex === gi
            ? {
                ...g,
                entries: g.entries.map((it, i) =>
                  i === idx ? { ...it, value: "" } : it
                ),
              }
            : g
        )
      );
    }
  };

  // ──────────────── List Manipulation ────────────────
  const addRow = (list, setter) =>
    setter([...list, { value: "", checks: { ...INITIAL_CHECKS } }]);
  const removeRow = (list, setter, idx) =>
    setter(list.filter((_, i) => i !== idx));
  const updateValue = (list, setter, idx, val) =>
    setter(list.map((it, i) => (i === idx ? { ...it, value: val } : it)));
  const toggleIndCheck = (list, setter, idx, key) =>
    setter(
      list.map((it, i) =>
        i === idx ? { ...it, checks: updateChecklist(it.checks, key) } : it
      )
    );

  // ──────────────── Family Groups ────────────────
  const addFamilyGroup = (setter) =>
    setter((gs) => [
      ...gs,
      { entries: [{ value: "", checks: { ...INITIAL_CHECKS } }] },
    ]);
  const removeFamilyGroup = (groups, setter, gIdx) =>
    setter(groups.filter((_, i) => i !== gIdx));
  const addFamilySubRow = (groups, setter, gIdx) =>
    setter(
      groups.map((g, i) =>
        i === gIdx
          ? {
              ...g,
              entries: [
                ...g.entries,
                { value: "", checks: { ...INITIAL_CHECKS } },
              ],
            }
          : g
      )
    );
  const removeFamilySubRow = (groups, setter, gIdx, idx) =>
    setter(
      groups.map((g, i) =>
        i === gIdx
          ? { ...g, entries: g.entries.filter((_, j) => j !== idx) }
          : g
      )
    );
  const updateFamilyValue = (groups, setter, gIdx, idx, val) =>
    setter(
      groups.map((g, i) =>
        i === gIdx
          ? {
              ...g,
              entries: g.entries.map((it, j) =>
                j === idx ? { ...it, value: val } : it
              ),
            }
          : g
      )
    );
  const toggleFamilyCheck = (groups, setter, gIdx, idx, key) =>
    setter(
      groups.map((g, i) =>
        i === gIdx
          ? {
              ...g,
              entries: g.entries.map((it, j) =>
                j === idx
                  ? { ...it, checks: updateChecklist(it.checks, key) }
                  : it
              ),
            }
          : g
      )
    );

  // ──────────────── Totals & Side-Effects ────────────────
  const totalApplicants =
    indReg.filter((r) => r.value).length +
    indUrg.filter((r) => r.value).length +
    famRegGroups.reduce(
      (sum, g) => sum + g.entries.filter((e) => e.value).length,
      0
    ) +
    famUrgGroups.reduce(
      (sum, g) => sum + g.entries.filter((e) => e.value).length,
      0
    );

  useEffect(
    () => onTotalChange(totalApplicants),
    [totalApplicants, onTotalChange]
  );

  useEffect(() => {
    const allEntries = [
      ...indReg,
      ...indUrg,
      ...famRegGroups.flatMap((g) => g.entries),
      ...famUrgGroups.flatMap((g) => g.entries),
    ];
    const natp = allEntries.filter((r) => r.checks.natp).length;
    const rtd = allEntries.filter((r) => r.checks.rtd).length;
    const coi = allEntries.filter((r) => r.checks.coi).length;
    onNatpChange(natp);
    onRtdChange(rtd);
    onCoiChange(coi);
  }, [
    indReg,
    indUrg,
    famRegGroups,
    famUrgGroups,
    onNatpChange,
    onRtdChange,
    onCoiChange,
  ]);

  // ──────────────── Expose row-level data for parent via ref ────────────────
  useImperativeHandle(
    ref,
    () => ({
      getRows: () => {
        const rows = [];
        indReg.forEach((it, i) =>
          rows.push({
            category: "individual",
            urgency: "regular",
            groupIndex: null,
            rowIndex: i,
            value: parseInt(it.value, 10) || 0,
            checks: it.checks,
          })
        );
        indUrg.forEach((it, i) =>
          rows.push({
            category: "individual",
            urgency: "urgent",
            groupIndex: null,
            rowIndex: i,
            value: parseInt(it.value, 10) || 0,
            checks: it.checks,
          })
        );
        famRegGroups.forEach((g, gi) =>
          g.entries.forEach((it, i) =>
            rows.push({
              category: "family",
              urgency: "regular",
              groupIndex: gi,
              rowIndex: i,
              value: parseInt(it.value, 10) || 0,
              checks: it.checks,
            })
          )
        );
        famUrgGroups.forEach((g, gi) =>
          g.entries.forEach((it, i) =>
            rows.push({
              category: "family",
              urgency: "urgent",
              groupIndex: gi,
              rowIndex: i,
              value: parseInt(it.value, 10) || 0,
              checks: it.checks,
            })
          )
        );
        return rows.filter((r) => r.value > 0);
      },
    }),
    [indReg, indUrg, famRegGroups, famUrgGroups]
  );

  // ──────────────── Render Helpers ────────────────
  const renderColumn = (title, list, setter, type) => (
    <div className="column individual">
      <div className="column-header">
        <h3>
          {title}{" "}
          <span className="count">
            ({list.filter((it) => it.value).length})
          </span>
        </h3>
        <button onClick={() => addRow(list, setter)} className="add-btn">
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
              onChange={(e) => updateValue(list, setter, i, e.target.value)}
              onBlur={() => validateIndOnBlur(type, setter, i)}
            />
            <div className="checklist">
              {["natp", "rtd", "coi", "none"].map((k) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={item.checks[k]}
                    disabled={!item.value}
                    onChange={() => toggleIndCheck(list, setter, i, k)}
                  />
                  {k.toUpperCase()}
                </label>
              ))}
            </div>
            <button
              onClick={() => removeRow(list, setter, i)}
              className="remove-btn"
            >
              –
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const renderFamilySection = (title, groups, setter, type) => (
    <div className="column family">
      <div className="column-header">
        <h3>
          {title}{" "}
          <span className="count">
            (
            {groups.reduce(
              (s, g) => s + g.entries.filter((it) => it.value).length,
              0
            )}
            )
          </span>
        </h3>
        <button onClick={() => addFamilyGroup(setter)} className="add-btn">
          +
        </button>
      </div>
      {groups.map((g, gi) => (
        <div key={gi} className="family-group">
          <div className="family-group-header">
            <h4>Family {String(gi + 1).padStart(2, "0")}</h4>
            <button
              onClick={() => removeFamilyGroup(groups, setter, gi)}
              className="remove-btn"
            >
              –
            </button>
          </div>
          <ul>
            {g.entries.map((it, i) => (
              <li key={i}>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={it.value}
                  onChange={(e) =>
                    updateFamilyValue(groups, setter, gi, i, e.target.value)
                  }
                  onBlur={() => validateFamOnBlur(type, setter, gi, i)}
                />
                <div className="checklist">
                  {["natp", "rtd", "coi", "none"].map((k) => (
                    <label key={k}>
                      <input
                        type="checkbox"
                        checked={it.checks[k]}
                        disabled={!it.value}
                        onChange={() =>
                          toggleFamilyCheck(groups, setter, gi, i, k)
                        }
                      />
                      {k.toUpperCase()}
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => removeFamilySubRow(groups, setter, gi, i)}
                  className="remove-btn"
                >
                  –
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => addFamilySubRow(groups, setter, gi)}
            className="add-subrow-btn"
          >
            +
          </button>
        </div>
      ))}
    </div>
  );

  // ──────────────── Render ────────────────
  return (
    <div className="file-creation-wrapper">
      <h2 className="file-creation-title">
        File Creation <span className="count">({totalApplicants})</span>
      </h2>
      <div className="file-creation-summary">
        <span>
          NATP:{" "}
          {
            indReg
              .concat(
                indUrg,
                ...famRegGroups.flatMap((g) => g.entries),
                ...famUrgGroups.flatMap((g) => g.entries)
              )
              .filter((r) => r.checks.natp).length
          }
        </span>
        <span>
          RTD:{" "}
          {
            indReg
              .concat(
                indUrg,
                ...famRegGroups.flatMap((g) => g.entries),
                ...famUrgGroups.flatMap((g) => g.entries)
              )
              .filter((r) => r.checks.rtd).length
          }
        </span>
        <span>
          COI:{" "}
          {
            indReg
              .concat(
                indUrg,
                ...famRegGroups.flatMap((g) => g.entries),
                ...famUrgGroups.flatMap((g) => g.entries)
              )
              .filter((r) => r.checks.coi).length
          }
        </span>
      </div>
      <div className="file-creation">
        <div className="section individual-section">
          {renderColumn("Regular File Creation", indReg, setIndReg, "indReg")}
          {renderColumn("Urgent File Creation", indUrg, setIndUrg, "indUrg")}
        </div>
        <div className="section family-section">
          {renderFamilySection(
            "Family File Creation",
            famRegGroups,
            setFamRegGroups,
            "famReg"
          )}
          {renderFamilySection(
            "Urgent Family File Creation",
            famUrgGroups,
            setFamUrgGroups,
            "famUrg"
          )}
        </div>
      </div>
    </div>
  );
});
