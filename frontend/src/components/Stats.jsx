// frontend/src/components/Stats.jsx

import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import NewStatModal from "./NewStatModal";
import Timestamp from "./Timestamp";
import MailOpening from "./MailOpening";
import FileCreation from "./FileCreation";
import Attachments from "./Attachments";
import Rejects from "./Rejects";
import Processed from "./Processed";
import History from "./History";
import Charts from "./Charts";

import { StatsNumbersProvider } from "../context/StatsNumbersContext";
import api from "../utils/axios";
import "./Stats.css";
import "./Charts.css";

export default function Stats({ mode = "default" }) {
  const location = useLocation();
  const navigate = useNavigate();

  // ─── View mode: "history" vs. "sheet" ─────────────────────────
  const [viewMode, setViewMode] = useState(
    mode === "history" ? "history" : "sheet"
  );

  // keep viewMode in sync when mode prop changes
  useEffect(() => {
    setViewMode(mode === "history" ? "history" : "sheet");
  }, [mode]);

  // ─── State ────────────────────────────────────────────────────
  const [stats, setStats] = useState([]);
  const [currentId, setCurrent] = useState(null);
  const [modalMode, setModalMode] = useState("new");
  const [modalData, setModalData] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  // subtotals & checklist counts
  const [fileTotal, setFileTotal] = useState(0);
  const [attachTotal, setAttachTotal] = useState(0);
  const [rejectTotal, setRejectTotal] = useState(0);

  const [fileNatp, setFileNatp] = useState(0);
  const [fileRtd, setFileRtd] = useState(0);
  const [fileCoi, setFileCoi] = useState(0);

  const [attachNatp, setAttachNatp] = useState(0);
  const [attachRtd, setAttachRtd] = useState(0);
  const [attachCoi, setAttachCoi] = useState(0);

  const [rejNatp, setRejNatp] = useState(0);
  const [rejRtd, setRejRtd] = useState(0);
  const [rejCoi, setRejCoi] = useState(0);

  // panel refs
  const mailOpeningRef = useRef(null);
  const fileCreationRef = useRef(null);
  const attachmentsRef = useRef(null);
  const rejectsRef = useRef(null);

  // save state
  const [isSaved, setIsSaved] = useState(false);

  // auth
  const token = localStorage.getItem("qm_token");

  // ─── Open “New” modal on /new ───────────────────────────────────
  useEffect(() => {
    if (location.pathname.endsWith("/new")) {
      setViewMode("sheet");
      setModalMode("new");
      setModalData(null);
      setModalOpen(true);
      setIsSaved(false);
    }
  }, [location.pathname]);

  // ─── Fetch stats on token change ────────────────────────────────
  useEffect(() => {
    setStats([]);
    setCurrent(null);
    setIsSaved(false);

    (async () => {
      if (!token) return;
      try {
        const { data } = await api.get("/stats");
        setStats(data.stats);
        // Do NOT auto-select a stat on initial load.
        // This keeps LIVE = null, so the landing page shows the guidance message.
        setCurrent(null);
        setIsSaved(false);
      } catch (err) {
        console.error("Failed to load stats:", err);
      }
    })();
  }, [token]);

  const now = Date.now();
  const LIVE = stats.find((s) => s.id === currentId) || null;
  const HISTORY = stats.filter((s) => s.id !== currentId);
  const canEdit = (stat) =>
    Date.now() - new Date(stat.created_at).getTime() < 48 * 3600 * 1000;

  // ─── Handlers for modal ────────────────────────────────────────
  const handleSaveMetadata = async () => {
    setModalOpen(false);
    navigate("/app/stats");
    const { data } = await api.get("/stats");
    setStats(data.stats);
    if (modalMode === "new") {
      setCurrent(data.stats[0]?.id ?? null);
      setModalMode("edit");
    }
  };
  const handleCloseModal = () => {
    setModalOpen(false);
    navigate("/app/stats");
  };

  // ─── Save sheet ────────────────────────────────────────────────
  const handleSaveSheet = async () => {
    if (!LIVE) return;

    const payload = {
      id: LIVE.id,
      date: LIVE.date,
      startTime: LIVE.start_time,
      endTime: LIVE.end_time,
      mailOpening: mailOpeningRef.current?.getCounts() || {},
      fileCreationRows: fileCreationRef.current?.getRows() || [],
      attachmentsRows: attachmentsRef.current?.getRows() || [],
      rejectRows: rejectsRef.current?.getRows() || [],
    };

    try {
      if (LIVE.created_at) {
        await api.put(`/stats/${LIVE.id}`, payload);
      } else {
        await api.post("/stats", payload);
      }
      alert("Saved successfully!");
      const { data } = await api.get("/stats");
      setStats(data.stats);
      setIsSaved(true);
    } catch (err) {
      alert("Failed to save: " + (err.response?.data?.error || err.message));
      console.error(err);
    }
  };

  // ─── Reset sheet ───────────────────────────────────────────────
  const handleResetSheet = () => {
    setCurrent(null);
    setFileTotal(0);
    setAttachTotal(0);
    setRejectTotal(0);
    setFileNatp(0);
    setFileRtd(0);
    setFileCoi(0);
    setAttachNatp(0);
    setAttachRtd(0);
    setAttachCoi(0);
    setRejNatp(0);
    setRejRtd(0);
    setRejCoi(0);
    setIsSaved(false);
    setModalMode("new");
    setModalData(null);
    setModalOpen(true);
  };

  // ─── Cancel sheet ──────────────────────────────────────────────
  const handleCancelSheet = () => {
    if (window.confirm("Discard current stat?")) {
      setCurrent(null);
      setIsSaved(false);
    }
  };
  // ─── Close sheet (prompt to save, then go back to landing) ───────────────
  const handleCloseSheet = async () => {
    const wantsSave = window.confirm(
      "Do you want to save your changes before closing?"
    );

    if (wantsSave) {
      try {
        await handleSaveSheet(); // will alert on success/failure internally
      } catch (e) {
        // handleSaveSheet already reports errors; still proceed to landing view
        console.error(e);
      }
    }

    // Return to landing message
    setCurrent(null);
    setIsSaved(false);
    setModalData(null);
    setModalMode("new");
    navigate("/app/stats");
  };

  // ─── Send & go home ────────────────────────────────────────────
  const handleSend = async () => {
    if (!LIVE?.id) {
      navigate("/app");
      return;
    }
    try {
      await api.post(`/stats/${LIVE.id}/send`); // triggers email to Team Leader
    } catch (e) {
      console.error("Send failed", e);
      // Optional: alert user
      // alert("Could not send to Team Leader: " + (e.response?.data?.error || e.message));
    }
    setStats([]);
    setCurrent(null);
    setIsSaved(false);
    navigate("/app");
  };

  // helper: format "HH:mm" → "hh:mm AM/PM"
  function formatTime(t) {
    if (!t) return "";
    const [hh, mm] = t.split(":").map(Number);
    const ampm = hh >= 12 ? "PM" : "AM";
    const h = ((hh + 11) % 12) + 1;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(
      2,
      "0"
    )} ${ampm}`;
  }

  return (
    <div className="statsQ">
      {/* New/Edit Modal */}
      <NewStatModal
        isOpen={modalOpen}
        mode={modalMode}
        initialData={modalData}
        existingStats={stats}
        onSave={handleSaveMetadata}
        onClose={handleCloseModal}
      />

      {viewMode === "history" ? (
        <History
          items={HISTORY}
          canEdit={canEdit}
          onEdit={async (st) => {
            setViewMode("sheet");
            const { data } = await api.get(`/stats/${st.id}`);
            setModalData(data.stat);
            setCurrent(st.id);
            setModalMode("edit");
            setIsSaved(true);
          }}
        />
      ) : !LIVE ? (
        <p className="stats-empty">
          Click <strong>Stats ▾ → New Stats</strong> to begin.
        </p>
      ) : (
        <>
          {/* Controls */}
          <div className="stats-controls">
            {canEdit(LIVE) && (
              <>
                <button onClick={handleSaveSheet}>Save</button>
                <button onClick={handleCloseSheet}>Close</button>
                <button onClick={handleResetSheet}>Reset</button>
                {/* <button onClick={handleCancelSheet}>Cancel</button> */}
              </>
            )}
            <button
              onClick={handleSend}
              disabled={!isSaved || !canEdit(LIVE)}
              style={{
                backgroundColor: isSaved && canEdit(LIVE) ? "green" : "grey",
              }}
            >
              Send
            </button>
          </div>

          {/* A. Timestamp */}
          <section className="stats-section stats-timestamp">
            <h2>Timestamp</h2>
            <Timestamp
              date={LIVE.date}
              startTime={formatTime(LIVE.start_time)}
              endTime={formatTime(LIVE.end_time)}
            />
          </section>

          {/* B. Mail Opening */}
          <section className="stats-section stats-mail-opening">
            <h2>Mail Opening</h2>
            <MailOpening
              key={LIVE.id}
              ref={mailOpeningRef}
              initialData={LIVE.mailOpening || {}}
            />
          </section>

          {/* C–F. Processed Mail & Details */}
          <StatsNumbersProvider>
            <section className="stats-section stats-processed-mail">
              <h2>Processed Mail</h2>
              <Processed
                fileCreationTotal={fileTotal}
                attachmentsTotal={attachTotal}
                rejectsTotal={rejectTotal}
                natpFile={fileNatp}
                rtdFile={fileRtd}
                coiFile={fileCoi}
                natpAttach={attachNatp}
                rtdAttach={attachRtd}
                coiAttach={attachCoi}
                natpReject={rejNatp}
                rtdReject={rejRtd}
                coiReject={rejCoi}
              />
            </section>

            <section className="stats-section stats-file-creation">
              <FileCreation
                ref={fileCreationRef}
                initialData={modalData?.fileCreationRows || []}
                onTotalChange={setFileTotal}
                onNatpChange={setFileNatp}
                onRtdChange={setFileRtd}
                onCoiChange={setFileCoi}
              />
            </section>

            <section className="stats-section stats-attachments">
              <Attachments
                ref={attachmentsRef}
                initialData={modalData?.attachmentsRows || []}
                onTotalChange={setAttachTotal}
                onNatpChange={setAttachNatp}
                onRtdChange={setAttachRtd}
                onCoiChange={setAttachCoi}
              />
            </section>

            <section className="stats-section stats-rejects">
              <Rejects
                ref={rejectsRef}
                initialData={modalData?.rejectRows || []}
                onTotalChange={setRejectTotal}
                onNatpChange={setRejNatp}
                onRtdChange={setRejRtd}
                onCoiChange={setRejCoi}
              />
            </section>
          </StatsNumbersProvider>

          {/* G. Visual Charts */}
          <section className="stats-section stats-charts">
            <h2>Visual Charts</h2>
            <Charts
              fileCreations={fileTotal}
              attachments={attachTotal}
              rejects={rejectTotal}
            />
          </section>
        </>
      )}
    </div>
  );
}
