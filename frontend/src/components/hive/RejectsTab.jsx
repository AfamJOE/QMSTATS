//frontend\src\components\hive\RejectsTab.jsx
import React, { useMemo, useState, useEffect } from "react";

function toNum(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}
function cmp(a, b) {
  const an = typeof a === "number" || /^[\d .-]+$/.test(String(a));
  const bn = typeof b === "number" || /^[\d .-]+$/.test(String(b));
  if (an || bn) return toNum(a) - toNum(b);
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

export default function RejectsTab({ list, loading, details, q = "" }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRow, setModalRow] = useState({
    value: null,
    first_name: "",
    surname: "",
    email: "",
    date: "",
    time: "",
    reasons: [],
  });
  const [sort, setSort] = useState({ key: "date", dir: "desc" });

  // Close on ESC
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setModalOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rowsRaw = useMemo(() => {
    if (!details) return [];
    const out = [];
    (list || []).forEach((s) => {
      const email = s.user?.email || "";
      const items = s.rejectRows || s.details?.rejects || [];
      items.forEach((r) => {
        out.push({
          value: r.value ?? 0,
          first_name:
            r.first_name ||
            s.user?.first_name ||
            (s.user?.name || "").split(" ")[0] ||
            "",
          surname:
            r.surname ||
            s.user?.surname ||
            (s.user?.name || "").split(" ").slice(1).join(" "),
          email,
          natp: !!(r.natp || r?.checks?.natp),
          rtd: !!(r.rtd || r?.checks?.rtd),
          coi: !!(r.coi || r?.checks?.coi),
          reasons: Array.isArray(r.reasons) ? r.reasons : [],
          reasonsLen: Array.isArray(r.reasons) ? r.reasons.length : 0,
          date: s.date,
          time: `${s.start_time} – ${s.end_time}`,
          start_time: s.start_time,
        });
      });
    });
    return out;
  }, [list, details]);

  const rows = useMemo(() => {
    const r = [...rowsRaw];
    const { key, dir } = sort;
    r.sort((a, b) => {
      const av =
        key === "time"
          ? a.start_time
          : key === "reasons"
          ? a.reasonsLen
          : a[key];
      const bv =
        key === "time"
          ? b.start_time
          : key === "reasons"
          ? b.reasonsLen
          : b[key];
      const c = cmp(av, bv);
      return dir === "asc" ? c : -c;
    });
    return r;
  }, [rowsRaw, sort]);

  // client-side quick find
  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rows;
    const tokens = query.split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      const hay = [
        r.value,
        r.first_name,
        r.surname,
        r.email,
        ...(r.reasons || []),
        r.date,
        r.time,
        r.natp ? "1" : "0",
        r.rtd ? "1" : "0",
        r.coi ? "1" : "0",
      ]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [rows, q]);

  const openReasons = (row) => {
    setModalRow(row);
    setModalOpen(true);
  };

  const HeadSort = ({ id, label }) => (
    <>
      {label}{" "}
      <span className="sorter">
        <button
          className={`sort-btn ${
            sort.key === id && sort.dir === "asc" ? "active" : ""
          }`}
          onClick={() => setSort({ key: id, dir: "asc" })}
          title="Sort ascending"
          aria-label={`Sort ${label} ascending`}
        >
          ▲
        </button>
        <button
          className={`sort-btn ${
            sort.key === id && sort.dir === "desc" ? "active" : ""
          }`}
          onClick={() => setSort({ key: id, dir: "desc" })}
          title="Sort descending"
          aria-label={`Sort ${label} descending`}
        >
          ▼
        </button>
      </span>
    </>
  );

  if (!details) {
    return (
      <div className="empty">
        Turn on <strong>Include details</strong> to see Rejects rows.
      </div>
    );
  }
  if (loading) return <div className="loading">Loading…</div>;
  if (!rows.length) return <div className="empty">No reject rows.</div>;

  return (
    <>
      <div className="table-head">
        <div className="mono w-80">
          <HeadSort id="value" label="Value" />
        </div>
        <div>
          <HeadSort id="first_name" label="First name" />
        </div>
        <div>
          <HeadSort id="surname" label="Surname" />
        </div>
        <div className="mono">
          <HeadSort id="email" label="Email" />
        </div>
        <div className="mono w-70">
          <HeadSort id="natp" label="NATP" />
        </div>
        <div className="mono w-70">
          <HeadSort id="rtd" label="RTD" />
        </div>
        <div className="mono w-70">
          <HeadSort id="coi" label="COI" />
        </div>
        <div className="w-240">
          <HeadSort id="reasons" label="Reasons (first 2)" />
        </div>
        <div className="mono w-110">
          <HeadSort id="date" label="Date" />
        </div>
        <div className="mono w-140">
          <HeadSort id="time" label="Time" />
        </div>
      </div>

      {visible.map((r, i) => (
        <div key={i} className="table-row">
          <div className="mono">
            <button className="link-cell" onClick={() => openReasons(r)}>
              {r.value}
            </button>
          </div>
          <div>{r.first_name}</div>
          <div>{r.surname}</div>
          <div className="mono">{r.email}</div>
          <div className="mono">{r.natp ? "1" : "0"}</div>
          <div className="mono">{r.rtd ? "1" : "0"}</div>
          <div className="mono">{r.coi ? "1" : "0"}</div>
          <div className="ellipsis">
            {(r.reasons || []).slice(0, 2).join(" • ") || "-"}
          </div>
          <div className="mono">{r.date}</div>
          <div className="mono">{r.time}</div>
        </div>
      ))}

      {/* Reasons modal */}
      {modalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reject Reasons</h3>
              <button
                className="modal-close"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="modal-meta">
              <div>
                <strong>Application #:</strong> {modalRow.value}
              </div>
              <div>
                <strong>Client:</strong> {modalRow.first_name}{" "}
                {modalRow.surname}
              </div>
              <div className="mono">
                <strong>Email:</strong> {modalRow.email}
              </div>
              <div className="mono">
                <strong>Date/Time:</strong> {modalRow.date} · {modalRow.time}
              </div>
            </div>

            <div className="modal-body">
              {modalRow.reasons?.length ? (
                <ul className="reasons-list">
                  {modalRow.reasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <div className="empty">No reasons provided.</div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn" onClick={() => setModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
