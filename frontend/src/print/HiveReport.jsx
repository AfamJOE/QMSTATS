// frontend/src/print/HiveReport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import api from "../utils/axios";
import "./HivePrint.css";

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function HiveReport() {
  const [sp] = useSearchParams();
  // accept token via ?token=… so the PDF export can auth
  useEffect(() => {
    const t = sp.get("token");
    if (t) localStorage.setItem("qm_token", t);
  }, [sp]);

  // same filters AdminHive uses, pulled from URL
  const q = sp.get("q") || "";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const clientEmail = sp.get("clientEmail") || "";
  const leaderEmail = sp.get("leaderEmail") || "";
  const includeDetails = sp.get("includeDetails") === "1";
  const view = sp.get("view") || "summary"; // summary | file | attachments | rejects | mail

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/hive-stats", {
        params: {
          q, from, to, clientEmail, leaderEmail,
          includeDetails: includeDetails ? 1 : 0,
          page: 1,
          pageSize: 5000, // pull big page for a single snapshot
        },
      });
      setList(data.stats || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, []);

  // Mail-opening chart (vector SVG in PDF)
  const moChart = useMemo(() => {
    const sum = (fn) => list.reduce((acc, s) => acc + (fn(s) || 0), 0);
    return [
      { name: "File Creation", count: sum((s) => s.mailOpening.fileCreation) },
      { name: "Urgent File",  count: sum((s) => s.mailOpening.urgentFileCreation) },
      { name: "Attachments",  count: sum((s) => s.mailOpening.attachment) },
      { name: "Urgent Att",   count: sum((s) => s.mailOpening.urgentAttachment) },
      { name: "Rejects",      count: sum((s) => s.mailOpening.rejects) },
    ];
  }, [list]);

  // Summary rows (same idea as AdminHive)
  const summaryRows = useMemo(() => {
    return (list || []).map((s) => {
      const fc = s.counts?.fileCreation || {};
      const att = s.counts?.attachments || {};
      const fcTotal =
        (fc.individual?.regular || 0) +
        (fc.individual?.urgent || 0) +
        (fc.family?.regular || 0) +
        (fc.family?.urgent || 0);
      const attTotal = (att.regular || 0) + (att.urgent || 0);
      return {
        id: s.id,
        client: s.user?.name || "",
        email: s.user?.email || "",
        date: s.date || "",
        time: `${s.start_time || ""} – ${s.end_time || ""}`,
        fcStr: `${fc.individual?.regular || 0}/${fc.individual?.urgent || 0}/${fc.family?.regular || 0}/${fc.family?.urgent || 0}`,
        attStr: `${att.regular || 0}/${att.urgent || 0}`,
        rej: s.counts?.rejects || 0,
        checklistStr: `${s.counts?.checklist?.NATP || 0}/${s.counts?.checklist?.RTD || 0}/${s.counts?.checklist?.COI || 0}/${s.counts?.checklist?.NONE || 0}`,
        teamLeader: s.teamLeader?.email || "-",
      };
    });
  }, [list]);

  // Section pick
  const showSummary = view === "summary";
  const showFile  = view === "file";
  const showAtt   = view === "attachments";
  const showRej   = view === "rejects";
  const showMail  = view === "mail";

  // Small pie from checklist totals (if available)
  const checklistPie = useMemo(() => {
    const totals = list.reduce((acc, s) => {
      const c = s.counts?.checklist || {};
      acc.NATP += c.NATP || 0;
      acc.RTD  += c.RTD  || 0;
      acc.COI  += c.COI  || 0;
      return acc;
    }, { NATP:0, RTD:0, COI:0 });
    return [
      { name: "NATP", value: totals.NATP },
      { name: "RTD",  value: totals.RTD },
      { name: "COI",  value: totals.COI },
    ];
  }, [list]);

  return (
    <div className="print-wrap">
      {/* Header with context */}
      <header className="print-header">
        <div className="title">Hive — {view.toUpperCase()} Report</div>
        <div className="meta">
          <span>Filters:</span>
          {q && <span>Query: <b>{q}</b></span>}
          {from && <span>From: <b>{from}</b></span>}
          {to && <span>To: <b>{to}</b></span>}
          {clientEmail && <span>Client: <b>{clientEmail}</b></span>}
          {leaderEmail && <span>Team Lead: <b>{leaderEmail}</b></span>}
          <span>Details: <b>{includeDetails ? "Yes" : "No"}</b></span>
          <span>Generated: <b>{new Date().toISOString()}</b></span>
        </div>
      </header>

      {/* Charts (SVG → sharp in PDF) */}
      <section className="print-charts">
        <div className="chart">
          <h3>Mail Opening Totals</h3>
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

        <div className="chart">
          <h3>Checklist Breakdown</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={checklistPie} dataKey="value" nameKey="name" outerRadius={90} label>
                {checklistPie.map((_, i) => (
                  <Cell key={i} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Tables */}
      {loading ? (
        <div className="loading">Loading…</div>
      ) : (
        <>
          {showSummary && (
            <section className="print-table">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Email</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>File Creation (IndR/IndU/FamR/FamU)</th>
                    <th>Attachments (R/U)</th>
                    <th>Rejects</th>
                    <th>Checklist (NATP/RTD/COI/NONE)</th>
                    <th>Team Leader</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.client}</td>
                      <td className="mono">{r.email}</td>
                      <td>{r.date}</td>
                      <td className="mono">{r.time}</td>
                      <td className="mono">{r.fcStr}</td>
                      <td className="mono">{r.attStr}</td>
                      <td className="mono">{r.rej}</td>
                      <td className="mono">{r.checklistStr}</td>
                      <td className="mono">{r.teamLeader}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* You can add slimmed tables for specific views if you like.
              The summary table is usually the one that needs pagination. */}
        </>
      )}

      <footer className="print-footer">
        <span>Hive — {view} • Generated by system</span>
        <span className="page-counter">Page <span className="pageNumber"></span> of <span className="totalPages"></span></span>
      </footer>
    </div>
  );
}
