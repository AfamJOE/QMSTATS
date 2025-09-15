// frontend/src/components/hive/ProcessedTab.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

// ---- Colors (consistent across charts)
const SERIES_META = {
  fileCreation: { label: "File Creation", color: "#2563EB" },
  attachments: { label: "Attachments", color: "#10B981" },
  mailOpening: { label: "Mail Opening", color: "#F59E0B" },
  rejects: { label: "Rejects", color: "#EF4444" },
  NATP: { label: "NATP", color: "#8B5CF6" },
  RTD: { label: "RTD", color: "#06B6D4" },
  COI: { label: "COI", color: "#94A3B8" },
};

const SERIES_KEYS = Object.keys(SERIES_META);

// ---- Safe getters
const n = (v) => (typeof v === "number" ? v : Number(v) || 0);

// from AdminHive’s shapes
function getFileCreationTotal(s) {
  const fc = s?.counts?.fileCreation || {};
  return (
    n(fc?.individual?.regular) +
    n(fc?.individual?.urgent) +
    n(fc?.family?.regular) +
    n(fc?.family?.urgent)
  );
}
function getAttachmentsTotal(s) {
  const att = s?.counts?.attachments || {};
  return n(att?.regular) + n(att?.urgent);
}
function getRejectsTotal(s) {
  return n(s?.counts?.rejects);
}
function getMailOpeningTotal(s) {
  const mo = s?.mailOpening || {};
  return (
    n(mo.fileCreation) +
    n(mo.urgentFileCreation) +
    n(mo.attachment) +
    n(mo.urgentAttachment) +
    n(mo.rejects)
  );
}
function getChecklistCounts(s) {
  const c = s?.counts?.checklist || {};
  return {
    NATP: n(c.NATP),
    RTD: n(c.RTD),
    COI: n(c.COI),
  };
}

// ---- Date helpers
const parseDate = (ds) => {
  // try YYYY-MM-DD first; fall back to Date parsing
  if (!ds) return null;
  const m = String(ds).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d) ? null : d;
  }
  const d = new Date(ds);
  return isNaN(d) ? null : d;
};

function startOfWeek(d) {
  const out = new Date(d);
  const day = out.getDay(); // 0 Sun - 6 Sat
  const diff = (day + 6) % 7; // Monday as start
  out.setDate(out.getDate() - diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function getISOWeek(d) {
  // ISO week number
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
  return { year: dt.getUTCFullYear(), week: weekNo };
}

function getQuarter(d) {
  return Math.floor(d.getMonth() / 3) + 1; // 1..4
}

// ---- Bucket key & label by grouping
function bucketKey(d, groupBy) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  switch (groupBy) {
    case "day":
      return { key: `${y}-${m}-${day}`, sortDate: new Date(y, d.getMonth(), d.getDate()) };
    case "week": {
      const { year, week } = getISOWeek(d);
      // use Monday of that week for sorting
      const sow = startOfWeek(d);
      return { key: `${year}-W${String(week).padStart(2, "0")}`, sortDate: sow };
    }
    case "biweekly": {
      const { year, week } = getISOWeek(d);
      const bi = Math.ceil(week / 2);
      const sow = startOfWeek(d);
      // normalize sortDate to the first week of the biweek window
      const firstWeek = (bi - 1) * 2 + 1;
      const sowNorm = new Date(sow);
      sowNorm.setDate(sow.getDate() - ((week - firstWeek) * 7));
      return { key: `${year}-BW${String(bi).padStart(2, "0")}`, sortDate: sowNorm };
    }
    case "quarter": {
      const q = getQuarter(d);
      // use first day of quarter for sort
      const sortDate = new Date(y, (q - 1) * 3, 1);
      return { key: `${y}-Q${q}`, sortDate };
    }
    case "month": {
      const sortDate = new Date(y, d.getMonth(), 1);
      return { key: `${y}-${m}`, sortDate };
    }
    case "year":
      return { key: `${y}`, sortDate: new Date(y, 0, 1) };
    default:
      return { key: `${y}-${m}-${day}`, sortDate: new Date(y, d.getMonth(), d.getDate()) };
  }
}

export default function ProcessedTab({
  list = [],
  loading = false,
  q = "",
}) {
  // ----- Controls
  const [groupBy, setGroupBy] = useState("month"); // day|week|biweekly|quarter|month|year
  const [from, setFrom] = useState(""); // YYYY-MM-DD
  const [to, setTo] = useState(""); // YYYY-MM-DD

  const [showBar, setShowBar] = useState(true);
  const [showLine, setShowLine] = useState(true);
  const [showPie, setShowPie] = useState(true);

  const [visibleSeries, setVisibleSeries] = useState(() =>
    SERIES_KEYS.reduce((acc, k) => ({ ...acc, [k]: true }), {})
  );

  // Initialize default date range from data (or last 30 days)
  useEffect(() => {
    const dates = (list || [])
      .map((s) => parseDate(s?.date))
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (dates.length) {
      const min = dates[0];
      const max = dates[dates.length - 1];
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`;
      setFrom(fmt(min));
      setTo(fmt(max));
    } else {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`;
      setFrom(fmt(start));
      setTo(fmt(end));
    }
  }, [list]);

  // ----- Filter rows by date window
  const filtered = useMemo(() => {
    const fromD = parseDate(from);
    const toD = parseDate(to);
    return (list || []).filter((s) => {
      const d = parseDate(s?.date);
      if (!d) return false;
      if (fromD && d < fromD) return false;
      if (toD && d > toD) return false;
      return true;
    });
  }, [list, from, to]);

  // ----- Aggregate per bucket
  const buckets = useMemo(() => {
    const map = new Map(); // key -> { key, sortDate, series... }
    for (const s of filtered) {
      const d = parseDate(s?.date);
      if (!d) continue;
      const { key, sortDate } = bucketKey(d, groupBy);
      if (!map.has(key)) {
        map.set(key, {
          key,
          sortDate,
          fileCreation: 0,
          attachments: 0,
          mailOpening: 0,
          rejects: 0,
          NATP: 0,
          RTD: 0,
          COI: 0,
        });
      }
      const rec = map.get(key);
      rec.fileCreation += getFileCreationTotal(s);
      rec.attachments += getAttachmentsTotal(s);
      rec.rejects += getRejectsTotal(s);
      rec.mailOpening += getMailOpeningTotal(s);
      const chk = getChecklistCounts(s);
      rec.NATP += chk.NATP;
      rec.RTD += chk.RTD;
      rec.COI += chk.COI;
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => a.sortDate - b.sortDate);
    return arr;
  }, [filtered, groupBy]);

  // ----- Grand totals for pie chart and header
  const grandTotals = useMemo(() => {
    return buckets.reduce(
      (acc, r) => {
        acc.fileCreation += r.fileCreation;
        acc.attachments += r.attachments;
        acc.mailOpening += r.mailOpening;
        acc.rejects += r.rejects;
        acc.NATP += r.NATP;
        acc.RTD += r.RTD;
        acc.COI += r.COI;
        return acc;
      },
      {
        fileCreation: 0,
        attachments: 0,
        mailOpening: 0,
        rejects: 0,
        NATP: 0,
        RTD: 0,
        COI: 0,
      }
    );
  }, [buckets]);

  const pieData = useMemo(() => {
    return SERIES_KEYS.filter((k) => visibleSeries[k]).map((k) => ({
      name: SERIES_META[k].label,
      value: grandTotals[k] || 0,
      key: k,
    }));
  }, [grandTotals, visibleSeries]);

  const totalProcessed =
    grandTotals.fileCreation + grandTotals.attachments + grandTotals.rejects;

  // ----- UI helpers
  const toggleSeries = (key) =>
    setVisibleSeries((v) => ({ ...v, [key]: !v[key] }));
  const allOn = SERIES_KEYS.every((k) => visibleSeries[k]);
  const setAll = (value) =>
    setVisibleSeries(SERIES_KEYS.reduce((acc, k) => ({ ...acc, [k]: value }), {}));

  return (
    <div className="processed-tab">
      {/* Controls */}
      <div className="table-toolbar" role="region" aria-label="Processed controls">
        <div className="quickfind" style={{ width: "100%", maxWidth: 980 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: 8, width: "100%" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Group by</span>
              <select
                className="input"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="biweekly">Biweekly</option>
                <option value="quarter">Quarter</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>From</span>
              <input
                type="date"
                className="input"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>To</span>
              <input
                type="date"
                className="input"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ fontSize: 12, color: "#6b7280" }}>Charts:</strong>
                <label><input type="checkbox" checked={showBar} onChange={() => setShowBar((v) => !v)} /> Bar</label>
                <label><input type="checkbox" checked={showLine} onChange={() => setShowLine((v) => !v)} /> Line</label>
                <label><input type="checkbox" checked={showPie} onChange={() => setShowPie((v) => !v)} /> Pie</label>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ fontSize: 12, color: "#6b7280" }}>Series:</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={(e) => setAll(e.target.checked)}
                  />{" "}
                  All
                </label>
                {SERIES_KEYS.map((k) => (
                  <label key={k} title={SERIES_META[k].label}>
                    <input
                      type="checkbox"
                      checked={!!visibleSeries[k]}
                      onChange={() => toggleSeries(k)}
                    />{" "}
                    {SERIES_META[k].label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Header stats */}
      <div className="processed" style={{ marginBottom: 10 }}>
        <div className="processed-row main-totals">
          <div className="item"><label>File Creation:</label><span>{grandTotals.fileCreation}</span></div>
          <div className="item"><label>Attachments:</label><span>{grandTotals.attachments}</span></div>
          <div className="item"><label>Rejects:</label><span>{grandTotals.rejects}</span></div>
        </div>
        <div className="processed-row total-processed">
          <label>Total Applications processed:</label>
          <span>{totalProcessed}</span>
        </div>
        <div className="processed-row details">
          <div className="item"><label>Mail Opening:</label><span>{grandTotals.mailOpening}</span></div>
          <div className="item"><label>NATP:</label><span>{grandTotals.NATP}</span></div>
          <div className="item"><label>RTD:</label><span>{grandTotals.RTD}</span></div>
          <div className="item"><label>COI:</label><span>{grandTotals.COI}</span></div>
        </div>
      </div>

      {/* Charts */}
      <div className="chart-wrap" style={{ height: "auto" }}>
        {showBar && (
          <div className="chart-wrapper" style={{ height: 280, marginBottom: 12 }}>
            <h3 style={{ margin: "6px 0" }}>Totals by {groupBy}</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets}>
                <XAxis dataKey="key" />
                <YAxis />
                <Tooltip />
                <Legend />
                {SERIES_KEYS.map((k) =>
                  visibleSeries[k] ? (
                    <Bar key={k} dataKey={k} name={SERIES_META[k].label} fill={SERIES_META[k].color} />
                  ) : null
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {showLine && (
          <div className="chart-wrapper" style={{ height: 280, marginBottom: 12 }}>
            <h3 style={{ margin: "6px 0" }}>Trend by {groupBy}</h3>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={buckets}>
                <XAxis dataKey="key" />
                <YAxis />
                <Tooltip />
                <Legend />
                {SERIES_KEYS.map((k) =>
                  visibleSeries[k] ? (
                    <Line key={k} type="monotone" dataKey={k} name={SERIES_META[k].label} stroke={SERIES_META[k].color} dot={false} />
                  ) : null
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {showPie && (
          <div className="chart-wrapper" style={{ height: 320, marginBottom: 12 }}>
            <h3 style={{ margin: "6px 0" }}>Distribution (current range)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  label
                >
                  {pieData.map((seg) => (
                    <Cell key={seg.key} fill={SERIES_META[seg.key].color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Table view */}
      <div className="table-card" data-view="processed">
        <div className="table-head">
          <div>Period</div>
          {SERIES_KEYS.map((k) =>
            visibleSeries[k] ? <div key={k} className="mono">{SERIES_META[k].label}</div> : null
          )}
        </div>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : buckets.length === 0 ? (
          <div className="empty">No results.</div>
        ) : (
          buckets.map((r) => (
            <div key={r.key} className="table-row">
              <div className="mono">{r.key}</div>
              {SERIES_KEYS.map((k) =>
                visibleSeries[k] ? <div key={k} className="mono">{r[k]}</div> : null
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
