//frontend\src\components\hive\FileCreationTab.jsx
import React, { useMemo, useState } from "react";

// local helpers
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

export default function FileCreationTab({ list, loading, details, q = "" }) {
  const [sort, setSort] = useState({ key: "date", dir: "desc" });

  const rowsRaw = useMemo(() => {
    if (!details) return [];
    const out = [];
    (list || []).forEach((s) => {
      const email = s.user?.email || "";
      const items = s.fileCreationRows || s.details?.fileCreations || [];
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
          category: r.category,
          urgency: r.urgency,
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
      const av = key === "time" ? a.start_time : a[key];
      const bv = key === "time" ? b.start_time : b[key];
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
        r.category,
        r.urgency,
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
        Turn on <strong>Include details</strong> to see File Creation rows.
      </div>
    );
  }
  if (loading) return <div className="loading">Loading…</div>;
  if (!rows.length) return <div className="empty">No file creation rows.</div>;

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
        <div className="mono w-90">
          <HeadSort id="category" label="Category" />
        </div>
        <div className="mono w-90">
          <HeadSort id="urgency" label="Urgency" />
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
          <div className="mono">{r.value}</div>
          <div>{r.first_name}</div>
          <div>{r.surname}</div>
          <div className="mono">{r.email}</div>
          <div className="mono">{r.natp ? "1" : "0"}</div>
          <div className="mono">{r.rtd ? "1" : "0"}</div>
          <div className="mono">{r.coi ? "1" : "0"}</div>
          <div className="mono">{r.category}</div>
          <div className="mono">{r.urgency}</div>
          <div className="mono">{r.date}</div>
          <div className="mono">{r.time}</div>
        </div>
      ))}
    </>
  );
}
