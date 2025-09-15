// backend/routes/stats.js

const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticate = require("../middleware/authenticate");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");

router.use(authenticate);

/* ───────────────────────── Helpers ───────────────────────── */

/** Prevent overlapping time‐ranges for the same user and date. */
async function hasOverlap(userId, date, startTime, endTime, excludeId = null) {
  const sql = `
    SELECT 1
      FROM stats
     WHERE user_id    = ?
       AND date       = ?
       AND start_time < ?
       AND end_time   > ?
       ${excludeId ? " AND id != ?" : ""}
     LIMIT 1
  `;
  const params = excludeId
    ? [userId, date, endTime, startTime, excludeId]
    : [userId, date, endTime, startTime];
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0;
}

/** Check if the stat can still be edited/deleted (48 hours). */
async function canEditStat(userId, statId) {
  const [rows] = await pool.execute(
    `SELECT created_at FROM stats WHERE id = ? AND user_id = ?`,
    [statId, userId]
  );
  if (!rows.length) return false;
  const createdAt = new Date(rows[0].created_at);
  return Date.now() - createdAt.getTime() < 48 * 3600 * 1000;
}

/** Get full name + email for a user. */
async function getUserIdentity(userId) {
  const [rows] = await pool.execute(
    `SELECT id, email, first_name, surname FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  const u = rows[0];
  return {
    id: u.id,
    email: u.email,
    fullName: `${u.first_name} ${u.surname}`.trim(),
    firstName: u.first_name,
    surname: u.surname,
  };
}

/** Is requester the manager of the owner of this stat via groups membership? */
async function isManagerOfUser(managerId, ownerUserId) {
  // Manager manages a group where owner is a member (accepted).
  const [rows] = await pool.execute(
    `SELECT 1
       FROM user_group ug
       JOIN group_members gm ON gm.group_id = ug.id
      WHERE ug.manager_id = ?
        AND gm.user_id = ?
      LIMIT 1`,
    [managerId, ownerUserId]
  );
  return rows.length > 0;
}

/** Load a stat with owner_id for permissions. */
async function getStatOwner(statId) {
  const [rows] = await pool.execute(
    `SELECT id, user_id AS ownerId FROM stats WHERE id = ? LIMIT 1`,
    [statId]
  );
  return rows.length ? rows[0] : null;
}

/** Only allow access if (a) owner OR (b) manager of owner. */
async function assertCanView(userId, statId) {
  const st = await getStatOwner(statId);
  if (!st) return { ok: false, status: 404, error: "Stat not found." };
  if (st.ownerId === userId) return { ok: true, ownerId: st.ownerId };
  const manager = await isManagerOfUser(userId, st.ownerId);
  if (!manager)
    return { ok: false, status: 403, error: "Not allowed to view this stat." };
  return { ok: true, ownerId: st.ownerId, readOnly: true };
}

/** Get Team Leader email for a user (from user_team_leader). */
async function getTeamLeaderFor(userId) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.email, u.first_name, u.surname
       FROM user_team_leader utl
       JOIN users u ON u.id = utl.leader_user_id
      WHERE utl.user_id = ?
      LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  const u = rows[0];
  return {
    id: u.id,
    email: u.email,
    fullName: `${u.first_name} ${u.surname}`.trim(),
  };
}

/** Fetch the full detail of a stat for PDF/email payloads. */
async function fetchFullStat(statId) {
  // Header + mail_openings
  const [statsRows] = await pool.execute(
    `SELECT
       s.id, s.user_id, s.date, s.start_time, s.end_time,
       s.created_at, s.updated_at,
       mo.total_envelopes,
       mo.file_creation        AS mo_fileCreation,
       mo.urgent_file_creation AS mo_urgent_fileCreation,
       mo.attachment,
       mo.urgent_attachment,
       mo.rejects              AS mo_rejects,
       mo.wrong_mail,
       mo.withdraw_letter
     FROM stats s
     LEFT JOIN mail_openings mo ON mo.stat_id = s.id
     WHERE s.id = ?
     LIMIT 1`,
    [statId]
  );
  if (!statsRows.length) return null;
  const head = statsRows[0];

  const [fcs] = await pool.execute(
    `SELECT category, urgency, group_index AS groupIndex, row_index AS rowIndex,
            value, natp, rtd, coi, none
       FROM file_creations
      WHERE stat_id = ?`,
    [statId]
  );
  const [atts] = await pool.execute(
    `SELECT category, urgency, row_index AS rowIndex,
            value, natp, rtd, coi, none
       FROM attachments
      WHERE stat_id = ?`,
    [statId]
  );
  const [rjs] = await pool.execute(
    `SELECT id AS rejectId, row_index AS rowIndex, value, natp, rtd, coi, none
       FROM rejects
      WHERE stat_id = ?`,
    [statId]
  );
  for (const rej of rjs) {
    const [rrs] = await pool.execute(
      `SELECT reason FROM reject_reasons WHERE reject_id = ?`,
      [rej.rejectId]
    );
    rej.reasons = rrs.map((x) => x.reason);
    delete rej.rejectId;
  }

  return {
    head,
    fileCreationRows: fcs,
    attachmentsRows: atts,
    rejectRows: rjs,
  };
}

/** Compute Processed Mail aggregates from request payload rows */
function computeProcessedTotals({
  fileCreationRows = [],
  attachmentsRows = [],
  rejectRows = [],
  tlCount = 0,
}) {
  const isValid = (r) => Number(r?.value) > 0;

  // section totals (count of valid entries)
  const file_creation_total = fileCreationRows.filter(isValid).length;
  const attachments_total = attachmentsRows.filter(isValid).length;
  const rejects_total = rejectRows.filter(isValid).length;
  const total_processed =
    file_creation_total + attachments_total + rejects_total;

  // checklist totals across all rows
  const all = [...fileCreationRows, ...attachmentsRows, ...rejectRows];
  const tally = (k) =>
    all.reduce((acc, r) => {
      const c = r.checks || r; // rows from DB have flat booleans, payload has checks{}
      return acc + (c?.[k] ? 1 : 0);
    }, 0);

  const natp_total = tally("natp");
  const rtd_total = tally("rtd");
  const coi_total = tally("coi");

  return {
    file_creation_total,
    attachments_total,
    rejects_total,
    total_processed,
    natp_total,
    rtd_total,
    coi_total,
    tl_count: Number(tlCount) || 0,
  };
}

/** Build a clean, table-driven PDF (as a Buffer) — with SUMMARY first,
 *  then DETAILS, and finally the trailing sections:
 *  "Checklist Totals (All Sections)" and "Top Reject Reasons".
 */
function buildStatPDFBuffer(stat, ownerIdentity) {
  const {
    head,
    fileCreationRows = [],
    attachmentsRows = [],
    rejectRows = [],
  } = stat;

  const COLOR = {
    text: "#222222",
    muted: "#666666",
    border: "#DDDDDD",
    heading: "#111111",
    chip: "#F5F7FA",
    zebra: "#FBFBFD",
    brand: "#1F6FEB",
    badge: "#EEF6FF",
  };
  const PAGE_MARGIN = 40;
  const TABLE_ROW_H = 22;

  function drawDivider(doc, y = doc.y + 8) {
    doc
      .moveTo(PAGE_MARGIN, y)
      .lineTo(doc.page.width - PAGE_MARGIN, y)
      .lineWidth(0.5)
      .strokeColor(COLOR.border)
      .stroke();
    doc.moveDown(0.6);
  }
  function h2(doc, text) {
    // normalize left edge + vertical spacing
    const PAGE_WIDTH = doc.page.width;
    const LEFT = PAGE_MARGIN;
    const RIGHT = PAGE_WIDTH - PAGE_MARGIN;

    if (doc.y < PAGE_MARGIN) doc.y = PAGE_MARGIN;
    doc.moveDown(0.4);

    doc
      .fillColor(COLOR.heading)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(text, LEFT, doc.y, {
        align: "left",
        width: RIGHT - LEFT,
        continued: false,
      });

    doc.moveDown(0.2);
    doc
      .moveTo(LEFT, doc.y + 2)
      .lineTo(RIGHT, doc.y + 2)
      .lineWidth(0.5)
      .strokeColor(COLOR.border)
      .stroke();

    doc.moveDown(0.5);
  }

  function boxLabelValueRow(doc, items) {
    const gap = 8;
    let x = PAGE_MARGIN,
      y = doc.y;
    items.forEach(({ label, value }) => {
      const txt = `${label}: ${value ?? "-"}`;
      const w = doc.widthOfString(txt) + 16,
        h = 20;
      if (x + w > doc.page.width - PAGE_MARGIN) {
        x = PAGE_MARGIN;
        y += h + 8;
      }
      doc.roundedRect(x, y, w, h, 6).fillAndStroke(COLOR.chip, COLOR.border);
      doc
        .fillColor(COLOR.text)
        .fontSize(10)
        .font("Helvetica")
        .text(txt, x + 8, y + 5);
      x += w + gap;
    });
    doc.y = y + 24;
  }
  function drawTable(doc, { columns, rows }) {
    const startX = PAGE_MARGIN;
    let y = doc.y;
    const headerH = TABLE_ROW_H;
    let x = startX;

    doc.save();
    doc
      .rect(startX, y, doc.page.width - PAGE_MARGIN * 2, headerH)
      .fill(COLOR.badge);
    doc.restore();

    doc.fillColor(COLOR.heading).font("Helvetica-Bold").fontSize(10);
    columns.forEach((col) => {
      doc.text(col.label, x + 6, y + 6, {
        width: col.width - 12,
        ellipsis: true,
      });
      x += col.width;
    });

    doc
      .moveTo(startX, y + headerH)
      .lineTo(doc.page.width - PAGE_MARGIN, y + headerH)
      .lineWidth(0.5)
      .strokeColor(COLOR.border)
      .stroke();

    y += headerH;
    doc.font("Helvetica").fontSize(10).fillColor(COLOR.text);

    rows.forEach((row, idx) => {
      const rowH = TABLE_ROW_H;
      if (y + rowH > doc.page.height - PAGE_MARGIN) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
      if (idx % 2 === 0) {
        doc.save();
        doc
          .rect(startX, y, doc.page.width - PAGE_MARGIN * 2, rowH)
          .fill(COLOR.zebra);
        doc.restore();
      }
      let cx = startX;
      columns.forEach((col) => {
        const val = row[col.key] ?? "";
        doc.text(String(val), cx + 6, y + 6, {
          width: col.width - 12,
          ellipsis: true,
        });
        cx += col.width;
      });
      doc
        .moveTo(startX, y + rowH)
        .lineTo(doc.page.width - PAGE_MARGIN, y + rowH)
        .lineWidth(0.5)
        .strokeColor(COLOR.border)
        .stroke();
      y += rowH;
    });
    doc.y = y + 10;
  }

  const fmtDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
  const fmtTime = (t) => t ?? "-";
  const parseTime = (t) => {
    if (!t) return null;
    const [H, M] = t.split(":").map(Number);
    return H * 60 + (M || 0);
  };
  const fmtDuration = (sT, eT) => {
    const s = parseTime(sT),
      e = parseTime(eT);
    if (s == null || e == null) return "-";
    let m = e - s;
    if (m < 0) m += 1440;
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  };
  const isValidRow = (r) => Number(r.value) > 0;

  // Subtotals
  const fcIndReg = fileCreationRows.filter(
    (r) =>
      r.category === "individual" && r.urgency === "regular" && isValidRow(r)
  ).length;
  const fcIndUrg = fileCreationRows.filter(
    (r) =>
      r.category === "individual" && r.urgency === "urgent" && isValidRow(r)
  ).length;
  const fcFamReg = fileCreationRows.filter(
    (r) => r.category === "family" && r.urgency === "regular" && isValidRow(r)
  ).length;
  const fcFamUrg = fileCreationRows.filter(
    (r) => r.category === "family" && r.urgency === "urgent" && isValidRow(r)
  ).length;
  const fcTotal = fcIndReg + fcIndUrg + fcFamReg + fcFamUrg;

  const atReg = attachmentsRows.filter(
    (r) => r.urgency === "regular" && isValidRow(r)
  ).length;
  const atUrg = attachmentsRows.filter(
    (r) => r.urgency === "urgent" && isValidRow(r)
  ).length;
  const atTotal = atReg + atUrg;

  const rjTotal = rejectRows.filter(isValidRow).length;

  // Checklist totals (computed now but rendered at the very end)
  const allCheckRows = [...fileCreationRows, ...attachmentsRows, ...rejectRows];
  const tally = (k) =>
    allCheckRows.filter(
      (r) => r[k] === true || (r.checks && r.checks[k] === true)
    ).length;
  const chkNATP = tally("natp"),
    chkRTD = tally("rtd"),
    chkCOI = tally("coi"),
    chkNONE = tally("none");

  // Top reject reasons (computed now, rendered at the very end)
  const reasonMap = new Map();
  for (const r of rejectRows) {
    if (Array.isArray(r.reasons)) {
      for (const reason of r.reasons) {
        const key = String(reason || "").trim();
        if (!key) continue;
        reasonMap.set(key, (reasonMap.get(key) || 0) + 1);
      }
    }
  }
  const reasonRows = Array.from(reasonMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));

  // Mail Opening header numbers
  const mailOpen = {
    totalEnvelopes: head.total_envelopes ?? 0,
    fileCreation: head.mo_fileCreation ?? 0,
    urgentFileCreation: head.urgent_file_creation ?? 0,
    attachment: head.attachment ?? 0,
    urgentAttachment: head.urgent_attachment ?? 0,
    rejects: head.mo_rejects ?? 0,
    wrongMail: head.wrong_mail ?? 0,
    withdrawLetter: head.withdraw_letter ?? 0,
  };
  const totalProcessed =
    mailOpen.fileCreation +
    mailOpen.urgentFileCreation +
    mailOpen.attachment +
    mailOpen.urgentAttachment +
    mailOpen.rejects +
    mailOpen.wrongMail +
    mailOpen.withdrawLetter;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    /* ───────── Header ───────── */
    doc
      .fillColor(COLOR.brand)
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("QMStats — Daily Stat Summary", { align: "center" });
    doc
      .moveDown(0.2)
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLOR.muted)
      .text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
    drawDivider(doc);

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(COLOR.heading)
      .text(`${ownerIdentity.fullName}`, { continued: true })
      .font("Helvetica")
      .fillColor(COLOR.muted)
      .text(`  <${ownerIdentity.email}>`);
    doc.moveDown(0.3);

    boxLabelValueRow(doc, [
      { label: "Stat ID", value: head.id },
      { label: "Date", value: fmtDate(head.date) },
      { label: "Start", value: fmtTime(head.start_time) },
      { label: "End", value: fmtTime(head.end_time) },
      { label: "Duration", value: fmtDuration(head.start_time, head.end_time) },
      {
        label: "Created",
        value: head.created_at
          ? new Date(head.created_at).toLocaleString()
          : "-",
      },
    ]);

    /* ───────── SUMMARY (first) ───────── */
    h2(doc, "Summary — Mail Opening");

    const moCols = [
      { key: "label", width: 220, label: "Item" },
      { key: "count", width: 100, label: "Count" },
    ];
    const moRows = [
      { label: "Total Envelopes", count: mailOpen.totalEnvelopes },
      { label: "File Creation", count: mailOpen.fileCreation },
      { label: "Urgent File Creation", count: mailOpen.urgentFileCreation },
      { label: "Attachments", count: mailOpen.attachment },
      { label: "Urgent Attachments", count: mailOpen.urgentAttachment },
      { label: "Rejects", count: mailOpen.rejects },
      { label: "Wrong Mail", count: mailOpen.wrongMail },
      { label: "Withdraw Letter", count: mailOpen.withdrawLetter },
    ];
    drawTable(doc, { columns: moCols, rows: moRows });

    boxLabelValueRow(doc, [
      { label: "Total Processed", value: totalProcessed },
      { label: "File Creation (Total)", value: fcTotal },
      { label: " • Individual Reg", value: fcIndReg },
      { label: " • Individual Urg", value: fcIndUrg },
      { label: " • Family Reg", value: fcFamReg },
      { label: " • Family Urg", value: fcFamUrg },
      { label: "Attachments (Total)", value: atTotal },
      { label: " • Regular", value: atReg },
      { label: " • Urgent", value: atUrg },
      { label: "Rejects (Total)", value: rjTotal },
    ]);

    /* ───────── DETAILS ───────── */

    /* ───────── File Creations (Details) ───────── */
    h2(doc, "File Creations (Details)");
    const fcCols = [
      { key: "value", label: "Application #", width: 120 },
      { key: "cat", label: "Category / Urgency", width: 180 },
      { key: "group", label: "Family Group", width: 110 },
      { key: "row", label: "Row", width: 70 },
      { key: "checks", label: "Checks", width: 150 },
    ];
    const fcRows = (fileCreationRows || []).map((r) => ({
      value: r.value ?? 0,
      cat: `${r.category}/${r.urgency}`,
      group: r.groupIndex == null ? "-" : `#${Number(r.groupIndex) + 1}`,
      row: (r.rowIndex ?? 0) + 1,
      checks:
        ["natp", "rtd", "coi", "none"]
          .filter((k) => r[k] || (r.checks && r.checks[k]))
          .map((k) => k.toUpperCase())
          .join(", ") || "-",
    }));
    if (fcRows.length) drawTable(doc, { columns: fcCols, rows: fcRows });
    else {
      doc.font("Helvetica-Oblique").fillColor(COLOR.muted).text("None");
      doc.moveDown(0.6);
    }

    /* ───────── Attachments (Details) ───────── */
    h2(doc, "Attachments (Details)");
    const atCols = [
      { key: "value", label: "Application #", width: 120 },
      { key: "urg", label: "Urgency", width: 120 },
      { key: "row", label: "Row", width: 70 },
      { key: "checks", label: "Checks", width: 250 },
    ];
    const atRows = (attachmentsRows || []).map((r) => ({
      value: r.value ?? 0,
      urg: r.urgency,
      row: (r.rowIndex ?? 0) + 1,
      checks:
        ["natp", "rtd", "coi", "none"]
          .filter((k) => r[k] || (r.checks && r.checks[k]))
          .map((k) => k.toUpperCase())
          .join(", ") || "-",
    }));
    if (atRows.length) drawTable(doc, { columns: atCols, rows: atRows });
    else {
      doc.font("Helvetica-Oblique").fillColor(COLOR.muted).text("None");
      doc.moveDown(0.6);
    }

    /* ───────── Rejects (Details) ───────── */
    h2(doc, "Rejects (Details)");

    // helper: draw a variable-row-height table with bullet-stacked reasons
    function drawRejectsDetailsTable(doc, rows) {
      const LEFT = PAGE_MARGIN;
      const RIGHT = doc.page.width - PAGE_MARGIN;
      const TABLE_W = RIGHT - LEFT;

      const colValueW = 120; // "Application #"
      const colRowW = 70; // "Row"
      const colChecksW = 130; // "Checks"
      const colReasonsW = TABLE_W - (colValueW + colRowW + colChecksW);

      const headerH = 24;
      const lineH = 14; // line height for reasons bullets
      const minReasonLines = 2; // ensure at least two lines worth of space

      // header
      doc.save();
      doc.rect(LEFT, doc.y, TABLE_W, headerH).fill(COLOR.badge);
      doc.restore();

      doc.fillColor(COLOR.heading).font("Helvetica-Bold").fontSize(10);
      let x = LEFT;
      doc.text("Application #", x + 6, doc.y + 6, { width: colValueW - 12 });
      x += colValueW;
      doc.text("Row", x + 6, doc.y + 6, { width: colRowW - 12 });
      x += colRowW;
      doc.text("Checks", x + 6, doc.y + 6, { width: colChecksW - 12 });
      x += colChecksW;
      doc.text("Reasons", x + 6, doc.y + 6, { width: colReasonsW - 12 });

      // header bottom rule
      doc
        .moveTo(LEFT, doc.y + headerH)
        .lineTo(RIGHT, doc.y + headerH)
        .lineWidth(0.5)
        .strokeColor(COLOR.border)
        .stroke();

      // start body after header
      let y = doc.y + headerH;

      // body
      doc.font("Helvetica").fontSize(10).fillColor(COLOR.text);

      const ensurePage = (needH) => {
        if (y + needH > doc.page.height - PAGE_MARGIN) {
          doc.addPage();
          y = PAGE_MARGIN;
        }
      };

      rows.forEach((row, idx) => {
        // prepare reasons bullets; ensure at least two visual lines
        const reasons = Array.isArray(row.reasons)
          ? row.reasons.filter(Boolean)
          : String(row.reasons || "").trim()
          ? [String(row.reasons)]
          : [];

        const bulletLines = (reasons.length ? reasons : ["-"]).map(
          (r) => `• ${r}`
        );

        const visibleLines = Math.max(minReasonLines, bulletLines.length);
        const rowH = Math.max(TABLE_ROW_H, 8 + visibleLines * lineH);

        ensurePage(rowH);

        // zebra
        if (idx % 2 === 0) {
          doc.save();
          doc.rect(LEFT, y, TABLE_W, rowH).fill(COLOR.zebra);
          doc.restore();
        }

        // vertical cell boundaries (optional—kept to horizontal rules for cleanliness)
        let cx = LEFT;

        // Application #
        doc.text(String(row.value ?? ""), cx + 6, y + 6, {
          width: colValueW - 12,
          ellipsis: true,
        });
        cx += colValueW;

        // Row
        doc.text(String(row.row ?? ""), cx + 6, y + 6, {
          width: colRowW - 12,
          ellipsis: true,
        });
        cx += colRowW;

        // Checks
        doc.text(String(row.checks ?? "-"), cx + 6, y + 6, {
          width: colChecksW - 12,
          ellipsis: true,
        });
        cx += colChecksW;

        // Reasons (stacked bullets)
        // write each bullet on its own line
        const rx = cx + 6;
        let ry = y + 6;
        const rWidth = colReasonsW - 12;
        bulletLines.forEach((ln, i) => {
          // keep within the allotted row box; if more than visibleLines, truncate with ellipsis
          if (i < visibleLines - 1) {
            doc.text(ln, rx, ry, { width: rWidth });
            ry += lineH;
          } else {
            // last allowed line — show any remaining reasons collapsed
            const remaining =
              i === visibleLines - 1 && bulletLines.length > visibleLines
                ? `… (${bulletLines.length - (visibleLines - 1)} more)`
                : "";
            doc.text(ln + (remaining ? " " + remaining : ""), rx, ry, {
              width: rWidth,
              ellipsis: true,
            });
          }
        });

        // bottom rule
        doc
          .moveTo(LEFT, y + rowH)
          .lineTo(RIGHT, y + rowH)
          .lineWidth(0.5)
          .strokeColor(COLOR.border)
          .stroke();

        y += rowH;
      });

      doc.y = y + 10;
    }

    // build source rows as before, but keep reasons as an array:
    const rjRows = (rejectRows || []).map((r) => ({
      value: r.value ?? 0,
      row: (r.rowIndex ?? 0) + 1,
      checks:
        ["natp", "rtd", "coi", "none"]
          .filter((k) => r[k] || (r.checks && r.checks[k]))
          .map((k) => k.toUpperCase())
          .join(", ") || "-",
      reasons: Array.isArray(r.reasons) && r.reasons.length ? r.reasons : ["-"],
    }));

    if (rjRows.length) {
      drawRejectsDetailsTable(doc, rjRows);
    } else {
      doc.font("Helvetica-Oblique").fillColor(COLOR.muted).text("None");
      doc.moveDown(0.6);
    }

    /* ───────── ALWAYS-LAST SECTIONS ───────── */

    // Checklist Totals at the very end
    h2(doc, "Checklist Totals (All Sections)");
    const chkCols = [
      { key: "type", width: 180, label: "Type" },
      { key: "count", width: 120, label: "Count" },
    ];
    const chkRows = [
      { type: "NATP", count: chkNATP },
      { type: "RTD", count: chkRTD },
      { type: "COI", count: chkCOI },
      { type: "NONE", count: chkNONE },
    ];
    drawTable(doc, { columns: chkCols, rows: chkRows });

    // Top Reject Reasons as the final section (render even if none)
    h2(doc, "Top Reject Reasons");
    if (reasonRows.length) {
      const rrCols = [
        {
          key: "reason",
          width: doc.page.width - PAGE_MARGIN * 2 - 90,
          label: "Reason",
        },
        { key: "count", width: 90, label: "Count" },
      ];
      drawTable(doc, { columns: rrCols, rows: reasonRows });
    } else {
      doc.font("Helvetica-Oblique").fillColor(COLOR.muted).text("None");
      doc.moveDown(0.6);
    }

    /* ───────── Footer ───────── */
    doc.moveDown(1.2);
    drawDivider(doc);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLOR.muted)
      .text("Generated by QMStats", PAGE_MARGIN, doc.y, {
        align: "left",
        width: doc.page.width - PAGE_MARGIN * 2,
      })
      .text(`Report ID: ${head.id}`, PAGE_MARGIN, doc.y, {
        align: "right",
        width: doc.page.width - PAGE_MARGIN * 2,
      });

    doc.end();
  });
}

/** Create a nodemailer transporter from env. */
function makeTransporter() {
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: !!Number(process.env.MAIL_SECURE || 0), // 1/0
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
}

/* ───────────────────────── CRUD ───────────────────────── */

/** CREATE a new stat (and sub-tables) */
router.post("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const firstName = req.user.firstName;
    const surname = req.user.surname;

    const {
      id,
      date,
      startTime,
      endTime,
      mailOpening,
      fileCreationRows = [],
      attachmentsRows = [],
      rejectRows = [],
    } = req.body;

    if (
      !id ||
      !date ||
      !startTime ||
      !endTime ||
      typeof mailOpening !== "object"
    ) {
      return res
        .status(400)
        .json({ error: "Timestamp and mailOpening required." });
    }
    if (await hasOverlap(userId, date, startTime, endTime)) {
      return res.status(409).json({ error: "Time overlaps existing stat." });
    }

    // stats
    await pool.execute(
      `INSERT INTO stats (id, user_id, date, start_time, end_time)
       VALUES (?, ?, ?, ?, ?)`,
      [id, userId, date, startTime, endTime]
    );

    // mail_openings
    const {
      totalEnvelopes = 0,
      fileCreation: moFile = 0,
      urgentFileCreation = 0,
      attachment = 0,
      urgentAttachment = 0,
      rejects = 0,
      wrongMail = 0,
      withdrawLetter = 0,
    } = mailOpening;

    await pool.execute(
      `INSERT INTO mail_openings
         (stat_id, user_id, first_name, surname,
          total_envelopes, file_creation, urgent_file_creation,
          attachment, urgent_attachment, rejects,
          wrong_mail, withdraw_letter)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        userId,
        firstName,
        surname,
        totalEnvelopes,
        moFile,
        urgentFileCreation,
        attachment,
        urgentAttachment,
        rejects,
        wrongMail,
        withdrawLetter,
      ]
    );

    // file_creations
    for (const r of fileCreationRows) {
      const {
        category,
        urgency,
        groupIndex = null,
        rowIndex,
        value,
        checks: { natp = false, rtd = false, coi = false, none = false },
      } = r;

      await pool.execute(
        `INSERT INTO file_creations
           (stat_id, user_id, first_name, surname,
            category, urgency, group_index, row_index,
            value, natp, rtd, coi, none)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          userId,
          firstName,
          surname,
          category,
          urgency,
          groupIndex,
          rowIndex,
          value,
          natp,
          rtd,
          coi,
          none,
        ]
      );
    }

    // attachments
    for (const r of attachmentsRows) {
      const {
        category,
        urgency,
        rowIndex,
        value,
        checks: { natp = false, rtd = false, coi = false, none = false },
      } = r;

      await pool.execute(
        `INSERT INTO attachments
           (stat_id, user_id, first_name, surname,
            category, urgency, row_index,
            value, natp, rtd, coi, none)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          userId,
          firstName,
          surname,
          category,
          urgency,
          rowIndex,
          value,
          natp,
          rtd,
          coi,
          none,
        ]
      );
    }

    // rejects + reasons
    for (const r of rejectRows) {
      const {
        rowIndex,
        value,
        checks: { natp = false, rtd = false, coi = false, none = false },
        reasons = [],
      } = r;

      const [insertRes] = await pool.execute(
        `INSERT INTO rejects
           (stat_id, user_id, first_name, surname,
            row_index, value, natp, rtd, coi, none)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, userId, firstName, surname, rowIndex, value, natp, rtd, coi, none]
      );
      const rejectId = insertRes.insertId;

      for (const reason of reasons) {
        await pool.execute(
          `INSERT INTO reject_reasons
             (reject_id, value, first_name, surname, reason)
           VALUES (?,?,?,?,?)`,
          [rejectId, value, firstName, surname, reason]
        );
      }
    }

    // ---- Processed Mail aggregate (optional tlCount comes from req.body.processed?.tlCount) ----
    const {
      file_creation_total,
      attachments_total,
      rejects_total,
      total_processed,
      natp_total,
      rtd_total,
      coi_total,
      tl_count,
    } = computeProcessedTotals({
      fileCreationRows,
      attachmentsRows,
      rejectRows,
      tlCount: req.body.processed?.tlCount,
    });

    await pool.execute(
      `INSERT INTO processed_mail
         (stat_id, file_creation_total, attachments_total, rejects_total,
          total_processed, natp_total, rtd_total, coi_total, tl_count,
          date, start_time, end_time)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         file_creation_total = VALUES(file_creation_total),
         attachments_total   = VALUES(attachments_total),
         rejects_total       = VALUES(rejects_total),
         total_processed     = VALUES(total_processed),
         natp_total          = VALUES(natp_total),
         rtd_total           = VALUES(rtd_total),
         coi_total           = VALUES(coi_total),
         tl_count            = VALUES(tl_count),
         date                = VALUES(date),
         start_time          = VALUES(start_time),
         end_time            = VALUES(end_time),
         updated_at          = CURRENT_TIMESTAMP`,
      [
        id,
        file_creation_total,
        attachments_total,
        rejects_total,
        total_processed,
        natp_total,
        rtd_total,
        coi_total,
        tl_count,
        date,
        startTime,
        endTime,
      ]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Duplicate stat." });
    }
    return res.status(500).json({ error: "Could not create stat." });
  }
});

/** UPDATE an existing stat */
router.put("/:id", async (req, res) => {
  try {
    const userId = req.user.id;
    const firstName = req.user.firstName;
    const surname = req.user.surname;
    const { id } = req.params;

    if (!(await canEditStat(userId, id))) {
      return res
        .status(403)
        .json({ error: "Editing window has passed (48 hours)." });
    }

    const {
      date,
      startTime,
      endTime,
      mailOpening,
      fileCreationRows = [],
      attachmentsRows = [],
      rejectRows = [],
    } = req.body;

    if (!date || !startTime || !endTime || typeof mailOpening !== "object") {
      return res
        .status(400)
        .json({ error: "Timestamp and mailOpening required." });
    }

    const [existsRows] = await pool.execute(
      `SELECT 1 FROM stats WHERE id=? AND user_id=?`,
      [id, userId]
    );
    if (!existsRows.length) {
      return res.status(404).json({ error: "Stat not found." });
    }

    if (await hasOverlap(userId, date, startTime, endTime, id)) {
      return res.status(409).json({ error: "Time overlaps another stat." });
    }

    await pool.execute(
      `UPDATE stats SET date=?, start_time=?, end_time=? WHERE id=? AND user_id=?`,
      [date, startTime, endTime, id, userId]
    );

    const {
      totalEnvelopes = 0,
      fileCreation: moFile = 0,
      urgentFileCreation = 0,
      attachment = 0,
      urgentAttachment = 0,
      rejects = 0,
      wrongMail = 0,
      withdrawLetter = 0,
    } = mailOpening;

    await pool.execute(
      `UPDATE mail_openings
         SET user_id=?, first_name=?, surname=?,
             total_envelopes=?, file_creation=?, urgent_file_creation=?,
             attachment=?, urgent_attachment=?, rejects=?,
             wrong_mail=?, withdraw_letter=?
       WHERE stat_id=?`,
      [
        userId,
        firstName,
        surname,
        totalEnvelopes,
        moFile,
        urgentFileCreation,
        attachment,
        urgentAttachment,
        rejects,
        wrongMail,
        withdrawLetter,
        id,
      ]
    );

    await pool.execute(`DELETE FROM file_creations WHERE stat_id=?`, [id]);
    for (const r of fileCreationRows) {
      const {
        category,
        urgency,
        groupIndex = null,
        rowIndex,
        value,
        checks: { natp = false, rtd = false, coi = false, none = false },
      } = r;
      await pool.execute(
        `INSERT INTO file_creations
           (stat_id, user_id, first_name, surname,
            category, urgency, group_index, row_index,
            value, natp, rtd, coi, none)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          userId,
          firstName,
          surname,
          category,
          urgency,
          groupIndex,
          rowIndex,
          value,
          natp,
          rtd,
          coi,
          none,
        ]
      );
    }

    await pool.execute(`DELETE FROM attachments WHERE stat_id=?`, [id]);
    for (const r of attachmentsRows) {
      const {
        category,
        urgency,
        rowIndex,
        value,
        checks: { natp = false, rtd = false, coi = false, none = false },
      } = r;
      await pool.execute(
        `INSERT INTO attachments
           (stat_id, user_id, first_name, surname,
            category, urgency, row_index,
            value, natp, rtd, coi, none)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          userId,
          firstName,
          surname,
          category,
          urgency,
          rowIndex,
          value,
          natp,
          rtd,
          coi,
          none,
        ]
      );
    }

    await pool.execute(
      `DELETE rr
         FROM reject_reasons rr
         JOIN rejects r ON rr.reject_id = r.id
        WHERE r.stat_id = ?`,
      [id]
    );
    await pool.execute(`DELETE FROM rejects WHERE stat_id=?`, [id]);

    for (const r of rejectRows) {
      const {
        rowIndex,
        value,
        checks: { natp = false, rtd = false, coi = false, none = false },
        reasons = [],
      } = r;

      const [insertRes] = await pool.execute(
        `INSERT INTO rejects
           (stat_id, user_id, first_name, surname,
            row_index, value, natp, rtd, coi, none)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, userId, firstName, surname, rowIndex, value, natp, rtd, coi, none]
      );
      const rejectId = insertRes.insertId;

      for (const reason of reasons) {
        await pool.execute(
          `INSERT INTO reject_reasons
             (reject_id, value, first_name, surname, reason)
           VALUES (?,?,?,?,?)`,
          [rejectId, value, firstName, surname, reason]
        );
      }
    }

    // ---- Processed Mail aggregate (recompute on update) ----
    const {
      file_creation_total,
      attachments_total,
      rejects_total,
      total_processed,
      natp_total,
      rtd_total,
      coi_total,
      tl_count,
    } = computeProcessedTotals({
      fileCreationRows,
      attachmentsRows,
      rejectRows,
      tlCount: req.body.processed?.tlCount,
    });

    await pool.execute(
      `INSERT INTO processed_mail
         (stat_id, file_creation_total, attachments_total, rejects_total,
          total_processed, natp_total, rtd_total, coi_total, tl_count,
          date, start_time, end_time)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         file_creation_total = VALUES(file_creation_total),
         attachments_total   = VALUES(attachments_total),
         rejects_total       = VALUES(rejects_total),
         total_processed     = VALUES(total_processed),
         natp_total          = VALUES(natp_total),
         rtd_total           = VALUES(rtd_total),
         coi_total           = VALUES(coi_total),
         tl_count            = VALUES(tl_count),
         date                = VALUES(date),
         start_time          = VALUES(start_time),
         end_time            = VALUES(end_time),
         updated_at          = CURRENT_TIMESTAMP`,
      [
        id,
        file_creation_total,
        attachments_total,
        rejects_total,
        total_processed,
        natp_total,
        rtd_total,
        coi_total,
        tl_count,
        date,
        startTime,
        endTime,
      ]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not update stat." });
  }
});

/** DELETE an existing stat */
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!(await canEditStat(userId, id))) {
      return res
        .status(403)
        .json({ error: "Deletion window has passed (48 hours)." });
    }

    await pool.execute("DELETE FROM stats WHERE id = ? AND user_id = ?", [
      id,
      userId,
    ]);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not delete stat." });
  }
});

/* ───────────────────────── Read (Owner + Manager) ───────────────────────── */

/** GET ALL (owner’s own stats only — list page) */
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.execute(
      `SELECT
         s.id,
         s.date,
         s.start_time,
         s.end_time,
         mo.total_envelopes,
         mo.file_creation        AS mo_fileCreation,
         mo.urgent_file_creation,
         mo.attachment,
         mo.urgent_attachment,
         mo.rejects              AS mo_rejects,
         mo.wrong_mail,
         mo.withdraw_letter,
         s.created_at,
         s.updated_at
       FROM stats AS s
       LEFT JOIN mail_openings AS mo
         ON mo.stat_id = s.id
       WHERE s.user_id = ?
       ORDER BY s.date DESC, s.start_time DESC`,
      [userId]
    );

    const stats = rows.map((r) => ({
      id: r.id,
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      mailOpening: {
        totalEnvelopes: r.total_envelopes,
        fileCreation: r.mo_fileCreation,
        urgentFileCreation: r.urgent_file_creation,
        attachment: r.attachment,
        urgentAttachment: r.urgent_attachment,
        rejects: r.mo_rejects,
        wrongMail: r.wrong_mail,
        withdrawLetter: r.withdraw_letter,
      },
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return res.json({ stats });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not fetch stats." });
  }
});

/** GET one stat (Owner or Manager) */
router.get("/:id", async (req, res) => {
  try {
    const requesterId = req.user.id;
    const { id } = req.params;

    const perm = await assertCanView(requesterId, id);
    if (!perm.ok) return res.status(perm.status).json({ error: perm.error });

    // 1) stats + mail_openings
    const [statsRows] = await pool.execute(
      `SELECT
         s.id,
         s.date,
         s.start_time,
         s.end_time,
         mo.total_envelopes,
         mo.file_creation        AS mo_fileCreation,
         mo.urgent_file_creation,
         mo.attachment,
         mo.urgent_attachment,
         mo.rejects              AS mo_rejects,
         mo.wrong_mail,
         mo.withdraw_letter,
         s.created_at,
         s.updated_at
       FROM stats AS s
       LEFT JOIN mail_openings AS mo
         ON mo.stat_id = s.id
       WHERE s.id = ?
       LIMIT 1`,
      [id]
    );
    if (!statsRows.length) {
      return res.status(404).json({ error: "Stat not found." });
    }
    const r = statsRows[0];
    const isoDate =
      r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date;

    // 2) file_creations
    const [fcs] = await pool.execute(
      `SELECT
         category,
         urgency,
         group_index   AS groupIndex,
         row_index     AS rowIndex,
         value,
         natp, rtd, coi, none
       FROM file_creations
       WHERE stat_id = ?`,
      [id]
    );

    // 3) attachments
    const [atts] = await pool.execute(
      `SELECT
         category,
         urgency,
         row_index     AS rowIndex,
         value,
         natp, rtd, coi, none
       FROM attachments
       WHERE stat_id = ?`,
      [id]
    );

    // 4) rejects + reasons
    const [rjs] = await pool.execute(
      `SELECT
         id            AS rejectId,
         row_index     AS rowIndex,
         value,
         natp, rtd, coi, none
       FROM rejects
       WHERE stat_id = ?`,
      [id]
    );
    for (const rej of rjs) {
      const [rrs] = await pool.execute(
        `SELECT reason
           FROM reject_reasons
           WHERE reject_id = ?`,
        [rej.rejectId]
      );
      rej.reasons = rrs.map((x) => x.reason);
      delete rej.rejectId;
    }

    // readOnly flag (if fetched by a manager OR >48h for owner)
    const readOnly =
      perm.readOnly || !(await canEditStat(req.user.id, Number(id))); // if owner & expired

    return res.json({
      stat: {
        id: r.id,
        date: isoDate,
        start_time: r.start_time,
        end_time: r.end_time,
        mailOpening: {
          totalEnvelopes: r.total_envelopes,
          fileCreation: r.mo_fileCreation,
          urgentFileCreation: r.urgent_file_creation,
          attachment: r.attachment,
          urgentAttachment: r.urgent_attachment,
          rejects: r.mo_rejects,
          wrongMail: r.wrong_mail,
          withdrawLetter: r.withdraw_letter,
        },
        fileCreationRows: fcs,
        attachmentsRows: atts,
        rejectRows: rjs,
        created_at: r.created_at,
        updated_at: r.updated_at,
        readOnly,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not fetch stat." });
  }
});

/* ───────────────────────── PDF ───────────────────────── */

/** GET /api/stats/:id/pdf — Owner or Manager; streams PDF. */
router.get("/:id/pdf", async (req, res) => {
  try {
    const requesterId = req.user.id;
    const { id } = req.params;

    const perm = await assertCanView(requesterId, id);
    if (!perm.ok) return res.status(perm.status).json({ error: perm.error });

    const full = await fetchFullStat(id);
    if (!full) return res.status(404).json({ error: "Stat not found." });

    const ownerIdentity = await getUserIdentity(full.head.user_id);
    if (!ownerIdentity)
      return res.status(500).json({ error: "Owner identity missing." });

    const buffer = await buildStatPDFBuffer(full, ownerIdentity);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="qmstats-${id}.pdf"`
    );
    return res.send(buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not generate PDF." });
  }
});

/* ───────────────────────── Send to Team Leader ───────────────────────── */

/** POST /api/stats/:id/send — Owner only; emails Team Leader with PDF. */
router.post("/:id/send", async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Must be the owner
    const st = await getStatOwner(id);
    if (!st) return res.status(404).json({ error: "Stat not found." });
    if (st.ownerId !== userId)
      return res.status(403).json({ error: "Only the owner can send." });

    // Build PDF
    const full = await fetchFullStat(id);
    if (!full) return res.status(404).json({ error: "Stat not found." });

    const ownerIdentity = await getUserIdentity(userId);
    if (!ownerIdentity)
      return res.status(500).json({ error: "Owner identity missing." });

    const buffer = await buildStatPDFBuffer(full, ownerIdentity);

    // Who to send to?
    const leader = await getTeamLeaderFor(userId);
    if (!leader)
      return res
        .status(404)
        .json({ error: "No Team Leader configured for this user." });

    // Send email
    const transporter = makeTransporter();
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: leader.email,
      subject: `QMStats — New stat from ${ownerIdentity.fullName}`,
      text: `Hello ${leader.fullName},

${ownerIdentity.fullName} <${ownerIdentity.email}> has sent a new stat (ID: ${id}).

Date: ${full.head.date}
Start: ${full.head.start_time}
End: ${full.head.end_time}

A PDF summary is attached.

— QMStats`,
      attachments: [
        {
          filename: `qmstats-${id}.pdf`,
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not send to Team Leader." });
  }
});

module.exports = router;
