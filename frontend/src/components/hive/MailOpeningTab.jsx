//frontend\src\components\hive\MailOpeningTab.jsx
import React, { useMemo, useState } from "react";

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

export default function MailOpeningTab({ list, loading }) {
  const [sort, setSort] = useState({ key: "date", dir: "desc" });

  const rows = useMemo(() => {
    const rows = (list || []).map((s) => ({
      id: s.id,
      client: s.user.name,
      email: s.user.email,
      date: s.date,
      start_time: s.start_time,
      time: `${s.start_time} – ${s.end_time}`,
      env: s.mailOpening.totalEnvelopes,
      file: s.mailOpening.fileCreation,
      ufile: s.mailOpening.urgentFileCreation,
      att: s.mailOpening.attachment,
      uatt: s.mailOpening.urgentAttachment,
      rej: s.mailOpening.rejects,
      wrong: s.mailOpening.wrongMail,
      withdraw: s.mailOpening.withdrawLetter,
    }));
    rows.sort((a, b) => {
      const { key, dir } = sort;
      const av = key === "time" ? a.start_time : a[key];
      const bv = key === "time" ? b.start_time : b[key];
      const c = cmp(av, bv);
      return dir === "asc" ? c : -c;
    });
    return rows;
  }, [list, sort]);

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

  if (loading) return <div className="loading">Loading…</div>;
  if (!list?.length) return <div className="empty">No results.</div>;

  return (
    <>
      <div className="table-head">
        <div>
          <HeadSort id="client" label="Client" />
        </div>
        <div className="mono">
          <HeadSort id="email" label="Email" />
        </div>
        <div className="mono w-110">
          <HeadSort id="date" label="Date" />
        </div>
        <div className="mono w-140">
          <HeadSort id="time" label="Time" />
        </div>
        <div className="mono w-90">
          <HeadSort id="env" label="Total Env" />
        </div>
        <div className="mono w-90">
          <HeadSort id="file" label="File" />
        </div>
        <div className="mono w-90">
          <HeadSort id="ufile" label="Urg File" />
        </div>
        <div className="mono w-90">
          <HeadSort id="att" label="Attach" />
        </div>
        <div className="mono w-90">
          <HeadSort id="uatt" label="Urg Att" />
        </div>
        <div className="mono w-90">
          <HeadSort id="rej" label="Rejects" />
        </div>
        <div className="mono w-90">
          <HeadSort id="wrong" label="Wrong" />
        </div>
        <div className="mono w-110">
          <HeadSort id="withdraw" label="Withdraw" />
        </div>
      </div>

      {rows.map((s) => (
        <div key={s.id} className="table-row">
          <div>{s.client}</div>
          <div className="mono">{s.email}</div>
          <div className="mono">{s.date}</div>
          <div className="mono">{s.time}</div>
          <div className="mono">{s.env}</div>
          <div className="mono">{s.file}</div>
          <div className="mono">{s.ufile}</div>
          <div className="mono">{s.att}</div>
          <div className="mono">{s.uatt}</div>
          <div className="mono">{s.rej}</div>
          <div className="mono">{s.wrong}</div>
          <div className="mono">{s.withdraw}</div>
        </div>
      ))}
    </>
  );
}
