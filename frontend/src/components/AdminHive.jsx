import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import api from "../utils/axios";
import "./AdminHive.css";
import ProcessedTab from "./hive/ProcessedTab";

// NEW: tab components
import FileCreationTab from "./hive/FileCreationTab";
import AttachmentsTab from "./hive/AttachmentsTab";
import RejectsTab from "./hive/RejectsTab";
import MailOpeningTab from "./hive/MailOpeningTab";

const ADMIN_EMAIL = "admin@example.com";

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return {};
  }
}
function isAdminUser() {
  const token = localStorage.getItem("qm_token");
  if (!token) return false;
  const payload = parseJwt(token);
  return payload?.email === ADMIN_EMAIL;
}

// helpers for sorting
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

export default function AdminHive() {
  // guard (extra safety client-side)
  if (!isAdminUser()) {
    return <div className="hive-guard">Not authorized.</div>;
  }

  const [list, setList] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatedNow, setUpdatedNow] = useState(true);

  // Filters (server-side)
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [leaderEmail, setLeaderEmail] = useState("");
  const [includeDetails, setIncludeDetails] = useState(false);

  // Sub-nav
  const [activeTab, setActiveTab] = useState("summary"); // summary | file | attachments | rejects | mail

  // Summary sorting state
  const [sumSort, setSumSort] = useState({ key: "date", dir: "desc" });

  // Client-side quick find (filters current page without hitting API)
  const [quickFind, setQuickFind] = useState("");

  // logout handler (nav button)
  const handleLogout = () => {
    localStorage.removeItem("qm_token");
    window.location.replace("/");
  };

  // If user switches to a per-row tab, auto-enable details
  useEffect(() => {
    if (
      ["file", "attachments", "rejects"].includes(activeTab) &&
      !includeDetails
    ) {
      setIncludeDetails(true);
    }
  }, [activeTab, includeDetails]);

  // fetch
  const fetchData = async (opts = {}) => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/hive-stats", {
        params: {
          q,
          from,
          to,
          clientEmail,
          leaderEmail,
          includeDetails: includeDetails ? 1 : 0,
          page: opts.page || page,
          pageSize,
        },
      });
      setList(data.stats);
      setTotal(data.total);
      setPage(data.page);
      setUpdatedNow(true);
      setTimeout(() => setUpdatedNow(false), 2500);
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  // initial + whenever filters change
  useEffect(() => {
    fetchData({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, from, to, clientEmail, leaderEmail, includeDetails]);

  // real-time refresh via SSE
  useEffect(() => {
    const token = localStorage.getItem("qm_token");
    if (!token) return;
    const url = `${api.defaults.baseURL.replace(
      /\/api$/,
      ""
    )}/api/admin/hive/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    es.onmessage = () => fetchData();
    es.onerror = () => es.close();
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  );

  // Exports
  const exportPDF = async () => {
    try {
      const params = new URLSearchParams({
        q,
        from,
        to,
        clientEmail,
        leaderEmail,
        view: activeTab,
        includeDetails: ["file", "attachments", "rejects"].includes(activeTab)
          ? "1"
          : includeDetails
          ? "1"
          : "0",
        pageSize: "5000",
      });
      const url = `/admin/hive-stats/export/pdf?${params.toString()}`;
      const res = await api.get(url, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(
        new Blob([res.data], { type: "application/pdf" })
      );
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `hive-${activeTab}.pdf`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error(e);
      alert("Export PDF failed.");
    }
  };

  const exportXLSX = async () => {
    try {
      const params = new URLSearchParams({
        q,
        from,
        to,
        clientEmail,
        leaderEmail,
        view: activeTab, // "summary" | "file" | "attachments" | "rejects" | "mail"
        includeDetails: ["file", "attachments", "rejects"].includes(activeTab)
          ? "1"
          : includeDetails
          ? "1"
          : "0",
        pageSize: "5000",
      });
      const url = `/admin/hive-stats/export/excel?${params.toString()}`;
      const res = await api.get(url, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(
        new Blob([res.data], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
      );
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `hive-${activeTab}.xlsx`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error(e);
      alert("Export Excel failed.");
    }
  };

  // Right panel chart data (Mail Opening)
  const moChart = useMemo(() => {
    const sum = (fn) => list.reduce((acc, s) => acc + (fn(s) || 0), 0);
    return [
      { name: "File Creation", count: sum((s) => s.mailOpening.fileCreation) },
      {
        name: "Urgent File",
        count: sum((s) => s.mailOpening.urgentFileCreation),
      },
      { name: "Attachments", count: sum((s) => s.mailOpening.attachment) },
      { name: "Urgent Att", count: sum((s) => s.mailOpening.urgentAttachment) },
      { name: "Rejects", count: sum((s) => s.mailOpening.rejects) },
    ];
  }, [list]);

  // SUMMARY rows (flatten for easier sorting)
  const summaryRows = useMemo(() => {
    return (list || []).map((s) => {
      const fc = s.counts.fileCreation;
      const att = s.counts.attachments;
      const fcTotal =
        (fc?.individual?.regular || 0) +
        (fc?.individual?.urgent || 0) +
        (fc?.family?.regular || 0) +
        (fc?.family?.urgent || 0);
      const attTotal = (att?.regular || 0) + (att?.urgent || 0);
      const rej = s.counts?.rejects || 0;
      return {
        id: s.id,
        client: s.user?.name || "",
        email: s.user?.email || "",
        date: s.date || "",
        start_time: s.start_time || "",
        end_time: s.end_time || "",
        timeStr: `${s.start_time || ""} – ${s.end_time || ""}`,
        fcStr: `${fc?.individual?.regular || 0}/${
          fc?.individual?.urgent || 0
        }/${fc?.family?.regular || 0}/${fc?.family?.urgent || 0}`,
        fcTotal,
        attStr: `${att?.regular || 0}/${att?.urgent || 0}`,
        attTotal,
        rej,
        checklistStr: `${s.counts?.checklist?.NATP || 0}/${
          s.counts?.checklist?.RTD || 0
        }/${s.counts?.checklist?.COI || 0}/${s.counts?.checklist?.NONE || 0}`,
        teamLeader: s.teamLeader?.email || "-",
      };
    });
  }, [list]);

  const sortedSummary = useMemo(() => {
    const { key, dir } = sumSort;
    const k = key;
    const rows = [...summaryRows];
    rows.sort((a, b) => {
      let av, bv;
      switch (k) {
        case "client":
        case "email":
        case "date":
        case "teamLeader":
          av = a[k];
          bv = b[k];
          break;
        case "time":
          av = a.start_time;
          bv = b.start_time;
          break;
        case "fc":
          av = a.fcTotal;
          bv = b.fcTotal;
          break;
        case "att":
          av = a.attTotal;
          bv = b.attTotal;
          break;
        case "rej":
          av = a.rej;
          bv = b.rej;
          break;
        case "check":
          av = a.checklistStr;
          bv = b.checklistStr;
          break;
        default:
          av = a.id;
          bv = b.id;
      }
      const c = cmp(av, bv);
      return dir === "asc" ? c : -c;
    });
    return rows;
  }, [summaryRows, sumSort]);

  // Apply quickFind tokens to current page
  const visibleSummary = useMemo(() => {
    const qf = quickFind.trim().toLowerCase();
    if (!qf) return sortedSummary;
    const tokens = qf.split(/\s+/).filter(Boolean);
    return sortedSummary.filter((r) => {
      const hay = [
        r.client,
        r.email,
        r.date,
        r.timeStr,
        r.fcStr,
        r.attStr,
        String(r.rej),
        r.checklistStr,
        r.teamLeader,
      ]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [sortedSummary, quickFind]);

  const quickCount =
    activeTab === "summary"
      ? `${visibleSummary.length}/${sortedSummary.length}`
      : "";

  const SortButtons = ({ activeKey, me, onSort }) => (
    <span className="sorter">
      <button
        className={`sort-btn ${
          activeKey.key === me && activeKey.dir === "asc" ? "active" : ""
        }`}
        onClick={() => onSort({ key: me, dir: "asc" })}
        title="Sort ascending"
        aria-label="Sort ascending"
      >
        ▲
      </button>
      <button
        className={`sort-btn ${
          activeKey.key === me && activeKey.dir === "desc" ? "active" : ""
        }`}
        onClick={() => onSort({ key: me, dir: "desc" })}
        title="Sort descending"
        aria-label="Sort descending"
      >
        ▼
      </button>
    </span>
  );

  return (
    <div className="hive">
      <header className="hive-header">
        <h1 className="hive-title">Hive</h1>

        <div className="hive-status">
          <span className={`dot ${updatedNow ? "on" : ""}`} />
          <span>{updatedNow ? "Updated just now" : "Live"}</span>
        </div>

        <nav className="hive-actions">
          <button onClick={exportPDF}>Save to PDF</button>
          <button onClick={exportXLSX}>Save to Excel</button>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </nav>
      </header>

      {/* Filters (server-side) */}
      <div className="hive-filters">
        <div className="row">
          <input
            className="input"
            placeholder="Search (client, TL email, names)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <input
            type="date"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="From"
          />
          <input
            type="date"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="To"
          />
          <input
            className="input"
            placeholder="Client email…"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
          />
          <input
            className="input"
            placeholder="Team Leader email…"
            value={leaderEmail}
            onChange={(e) => setLeaderEmail(e.target.value)}
          />
          <label className="chk">
            <input
              type="checkbox"
              checked={includeDetails}
              onChange={() => setIncludeDetails((v) => !v)}
            />
            Include details
          </label>

          <button className="apply" onClick={() => fetchData({ page: 1 })}>
            Apply
          </button>
        </div>
      </div>

      {/* Sub-nav */}
      <div className="subnav">
        {[
          ["summary", "Summary"],
          ["file", "File Creation"],
          ["attachments", "Attachments"],
          ["rejects", "Rejects"],
          ["mail", "Mail Opening"],
          ["processed", "Processed"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`subnav-tab ${activeTab === key ? "active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Quick Find toolbar (client-side) */}
      <div className="table-toolbar" role="search">
        <div className="quickfind">
          <input
            type="search"
            className="quickfind-input"
            placeholder='Quick find on this page… e.g. "john", "urgent", "2025-01"'
            value={quickFind}
            onChange={(e) => setQuickFind(e.target.value)}
            aria-label="Quick find on this page"
          />
          {quickFind && (
            <button
              type="button"
              className="quickfind-clear"
              onClick={() => setQuickFind("")}
              title="Clear search"
              aria-label="Clear quick find"
            >
              ×
            </button>
          )}
          {activeTab === "summary" && (
            <span className="quickfind-count">{quickCount}</span>
          )}
        </div>
      </div>

      <div className="hive-body">
        <div className="table-card" data-view={activeTab}>
          {/* SUMMARY table (sortable) */}
          {activeTab === "summary" && (
            <>
              <div className="table-head">
                <div>
                  Client{" "}
                  <SortButtons
                    activeKey={sumSort}
                    me="client"
                    onSort={setSumSort}
                  />
                </div>
                <div>
                  Email{" "}
                  <SortButtons
                    activeKey={sumSort}
                    me="email"
                    onSort={setSumSort}
                  />
                </div>
                <div>
                  Date{" "}
                  <SortButtons
                    activeKey={sumSort}
                    me="date"
                    onSort={setSumSort}
                  />
                </div>
                <div>
                  Time{" "}
                  <SortButtons
                    activeKey={sumSort}
                    me="time"
                    onSort={setSumSort}
                  />
                </div>
                <div>
                  File Creation
                  <br /> (IndR/IndU/FamR/FamU){" "}
                  <SortButtons
                    activeKey={sumSort}
                    me="fc"
                    onSort={setSumSort}
                  />
                </div>
                <div>
                  Attachments (R/U){" "}
                  <SortButtons
                    activeKey={sumSort}
                    me="att"
                    onSort={setSumSort}
                  />
                </div>
                <div>
                  Rejects{" "}
                  <SortButtons
                    activeKey={sumSort}
                    me="rej"
                    onSort={setSumSort}
                  />
                </div>
                <div>
                  Checklist
                  <br />
                  NATP/RTD/COI/NONE{" "}
                  <SortButtons
                    activeKey={sumSort}
                    me="check"
                    onSort={setSumSort}
                  />
                </div>
                <div>
                  Team Leader{" "}
                  <SortButtons
                    activeKey={sumSort}
                    me="teamLeader"
                    onSort={setSumSort}
                  />
                </div>
              </div>

              {loading ? (
                <div className="loading">Loading…</div>
              ) : visibleSummary.length === 0 ? (
                <div className="empty">No results.</div>
              ) : (
                visibleSummary.map((r) => (
                  <div key={r.id} className="table-row">
                    <div>{r.client}</div>
                    <div className="mono">{r.email}</div>
                    <div>{r.date}</div>
                    <div className="mono">{r.timeStr}</div>
                    <div className="mono">{r.fcStr}</div>
                    <div className="mono">{r.attStr}</div>
                    <div className="mono">{r.rej}</div>
                    <div className="mono">{r.checklistStr}</div>
                    <div className="mono">{r.teamLeader}</div>
                  </div>
                ))
              )}

              <div className="pager">
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    const p = Math.max(1, page - 1);
                    setPage(p);
                    fetchData({ page: p });
                  }}
                >
                  ‹
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => {
                    const p = Math.min(totalPages, page + 1);
                    setPage(p);
                    fetchData({ page: p });
                  }}
                >
                  ›
                </button>
              </div>
            </>
          )}

          {activeTab === "file" && (
            <FileCreationTab
              list={list}
              loading={loading}
              details={includeDetails}
              q={quickFind}
            />
          )}
          {activeTab === "attachments" && (
            <AttachmentsTab
              list={list}
              loading={loading}
              details={includeDetails}
              q={quickFind}
            />
          )}
          {activeTab === "rejects" && (
            <RejectsTab
              list={list}
              loading={loading}
              details={includeDetails}
              q={quickFind}
            />
          )}
          {activeTab === "mail" && (
            <MailOpeningTab list={list} loading={loading} q={quickFind} />
          )}
          {activeTab === "processed" && (
            <ProcessedTab list={list} loading={loading} q={quickFind} />
          )}
        </div>

        <aside className="side">
          <h3>Mail Opening</h3>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={moChart}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Quick reasons list */}
          {includeDetails && (
            <>
              <h3>Top Reject Reasons (visible page)</h3>
              <ul className="reasons">
                {Object.entries(
                  list.reduce((acc, s) => {
                    const rej = s.rejectRows || s.details?.rejects || [];
                    rej.forEach((r) =>
                      (r.reasons || []).forEach((reason) => {
                        const key = String(reason || "").trim();
                        if (!key) return;
                        acc[key] = (acc[key] || 0) + 1;
                      })
                    );
                    return acc;
                  }, {})
                )
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([reason, count]) => (
                    <li key={reason}>
                      <span className="reason">{reason}</span>
                      <span className="count">{count}</span>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
