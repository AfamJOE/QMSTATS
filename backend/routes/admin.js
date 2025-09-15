//backend\routes\admin.js
const express = require("express");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const pool = require("../db");
const authenticate = require("../middleware/authenticate");


const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

/* ──────────────────────────────────────────────────────────────
 * Shared helpers
 * ────────────────────────────────────────────────────────────── */

function toISO(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : d;
}

function readTokenFromReq(req) {
  if (req.query?.token) return req.query.token;

  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];

  const cookieStr = req.headers.cookie || "";
  if (cookieStr) {
    const cookie = Object.fromEntries(
      cookieStr.split(";").map((p) => {
        const [k, ...v] = p.trim().split("=");
        return [k, decodeURIComponent(v.join("="))];
      })
    );
    if (cookie.qm_token) return cookie.qm_token;
  }
  return null;
}

function isAdmin(req, res, next) {
  if (!req.user || req.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "Admin only." });
  }
  next();
}

/* ──────────────────────────────────────────────────────────────
 * Real-time (SSE)
 * ────────────────────────────────────────────────────────────── */

const sseClients = new Set();
function broadcast(payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(line);
    } catch {}
  }
}

const streamRouter = express.Router();
streamRouter.get("/", (req, res) => {
  try {
    const token = readTokenFromReq(req);
    if (!token) return res.status(401).json({ error: "Missing token" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || decoded.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: "Admin only" });
    }

    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    res.write("retry: 15000\n\n");

    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
});

/* ──────────────────────────────────────────────────────────────
 * Query builder used by grid + exports
 * ────────────────────────────────────────────────────────────── */

async function queryHiveData(q) {
  const {
    q: search,
    from,
    to,
    clientEmail,
    leaderEmail,
    page = 1,
    pageSize = 50,
    includeDetails = "0",
  } = q || {};

  const params = [];
  let sql = `
    SELECT
      s.id, s.user_id, s.date, s.start_time, s.end_time, s.created_at, s.updated_at,
      u.email AS user_email, u.first_name AS user_first_name, u.surname AS user_surname,
      lu.id AS leader_id, lu.email AS leader_email, lu.first_name AS leader_first_name, lu.surname AS leader_surname,
      mo.total_envelopes,
      mo.file_creation             AS mo_file_creation,
      mo.urgent_file_creation      AS mo_urgent_file_creation,
      mo.attachment                AS mo_attachment,
      mo.urgent_attachment         AS mo_urgent_attachment,
      mo.rejects                   AS mo_rejects,
      mo.wrong_mail, mo.withdraw_letter,

      (SELECT COUNT(*) FROM file_creations fc
         WHERE fc.stat_id=s.id AND fc.category='individual' AND fc.urgency='regular' AND fc.value>0) AS fc_ind_reg,
      (SELECT COUNT(*) FROM file_creations fc
         WHERE fc.stat_id=s.id AND fc.category='individual' AND fc.urgency='urgent'  AND fc.value>0) AS fc_ind_urg,
      (SELECT COUNT(*) FROM file_creations fc
         WHERE fc.stat_id=s.id AND fc.category='family'    AND fc.urgency='regular' AND fc.value>0) AS fc_fam_reg,
      (SELECT COUNT(*) FROM file_creations fc
         WHERE fc.stat_id=s.id AND fc.category='family'    AND fc.urgency='urgent'  AND fc.value>0) AS fc_fam_urg,

      (SELECT COUNT(*) FROM attachments a
         WHERE a.stat_id=s.id AND a.urgency='regular' AND a.value>0) AS att_reg,
      (SELECT COUNT(*) FROM attachments a
         WHERE a.stat_id=s.id AND a.urgency='urgent'  AND a.value>0) AS att_urg,

      (SELECT COUNT(*) FROM rejects rj
         WHERE rj.stat_id=s.id AND rj.value>0) AS rej_total,

      (
        IFNULL((SELECT SUM(natp) FROM file_creations WHERE stat_id=s.id),0) +
        IFNULL((SELECT SUM(natp) FROM attachments    WHERE stat_id=s.id),0) +
        IFNULL((SELECT SUM(natp) FROM rejects        WHERE stat_id=s.id),0)
      ) AS chk_natp,
      (
        IFNULL((SELECT SUM(rtd) FROM file_creations WHERE stat_id=s.id),0) +
        IFNULL((SELECT SUM(rtd) FROM attachments    WHERE stat_id=s.id),0) +
        IFNULL((SELECT SUM(rtd) FROM rejects        WHERE stat_id=s.id),0)
      ) AS chk_rtd,
      (
        IFNULL((SELECT SUM(coi) FROM file_creations WHERE stat_id=s.id),0) +
        IFNULL((SELECT SUM(coi) FROM attachments    WHERE stat_id=s.id),0) +
        IFNULL((SELECT SUM(coi) FROM rejects        WHERE stat_id=s.id),0)
      ) AS chk_coi,
      (
        IFNULL((SELECT SUM(none) FROM file_creations WHERE stat_id=s.id),0) +
        IFNULL((SELECT SUM(none) FROM attachments    WHERE stat_id=s.id),0) +
        IFNULL((SELECT SUM(none) FROM rejects        WHERE stat_id=s.id),0)
      ) AS chk_none

    FROM stats s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN user_team_leader utl ON utl.user_id = s.user_id
    LEFT JOIN users lu ON lu.id = utl.leader_user_id
    LEFT JOIN mail_openings mo ON mo.stat_id = s.id
  `;

  const where = [];
  if (from) {
    where.push("s.date >= ?");
    params.push(from);
  }
  if (to) {
    where.push("s.date <= ?");
    params.push(to);
  }
  if (clientEmail) {
    where.push("LOWER(u.email) LIKE ?");
    params.push(`%${clientEmail.toLowerCase()}%`);
  }
  if (leaderEmail) {
    where.push("LOWER(lu.email) LIKE ?");
    params.push(`%${leaderEmail.toLowerCase()}%`);
  }
  if (search && search.trim()) {
    const L = `%${search.toLowerCase()}%`;
    where.push(
      `(LOWER(u.first_name) LIKE ? OR LOWER(u.surname) LIKE ? OR LOWER(u.email) LIKE ?
        OR LOWER(lu.first_name) LIKE ? OR LOWER(lu.surname) LIKE ? OR LOWER(lu.email) LIKE ?)`
    );
    params.push(L, L, L, L, L, L);
  }
  if (where.length) {
    sql += " WHERE " + where.join(" AND ");
  }
  sql += " ORDER BY s.date DESC, s.start_time DESC, s.id DESC ";

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSz = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
  const offset = (pageNum - 1) * pageSz;

  const countSql = `SELECT COUNT(*) AS c FROM (${sql}) t`;
  const [[{ c }]] = await pool.query(countSql, params);

  const [rows] = await pool.query(sql + " LIMIT ? OFFSET ? ", [
    ...params,
    pageSz,
    offset,
  ]);

  const stats = rows.map((r) => ({
    id: r.id,
    date: toISO(r.date),
    start_time: r.start_time,
    end_time: r.end_time,
    created_at: r.created_at,
    updated_at: r.updated_at,
    user: {
      id: r.user_id,
      name: `${r.user_first_name} ${r.user_surname}`.trim(),
      email: r.user_email,
    },
    teamLeader: r.leader_id
      ? {
          id: r.leader_id,
          name: `${r.leader_first_name} ${r.leader_surname}`.trim(),
          email: r.leader_email,
        }
      : null,
    mailOpening: {
      totalEnvelopes: r.total_envelopes || 0,
      fileCreation: r.mo_file_creation || 0,
      urgentFileCreation: r.mo_urgent_file_creation || 0,
      attachment: r.mo_attachment || 0,
      urgentAttachment: r.mo_urgent_attachment || 0,
      rejects: r.mo_rejects || 0,
      wrongMail: r.wrong_mail || 0,
      withdrawLetter: r.withdraw_letter || 0,
    },
    counts: {
      fileCreation: {
        individual: { regular: r.fc_ind_reg || 0, urgent: r.fc_ind_urg || 0 },
        family: { regular: r.fc_fam_reg || 0, urgent: r.fc_fam_urg || 0 },
      },
      attachments: { regular: r.att_reg || 0, urgent: r.att_urg || 0 },
      rejects: r.rej_total || 0,
      checklist: {
        NATP: r.chk_natp || 0,
        RTD: r.chk_rtd || 0,
        COI: r.chk_coi || 0,
        NONE: r.chk_none || 0,
      },
    },
  }));

  // Optional details
  if (includeDetails === "1" && stats.length) {
    const ids = stats.map((s) => s.id);
    const ph = ids.map(() => "?").join(",");

    const [fcs] = await pool.query(
      `SELECT stat_id, category, urgency, group_index AS groupIndex, row_index AS rowIndex,
              value, natp, rtd, coi, none
         FROM file_creations
        WHERE stat_id IN (${ph})
        ORDER BY stat_id, category, urgency, group_index, row_index`,
      ids
    );
    const [atts] = await pool.query(
      `SELECT stat_id, category, urgency, row_index AS rowIndex,
              value, natp, rtd, coi, none
         FROM attachments
        WHERE stat_id IN (${ph})
        ORDER BY stat_id, urgency, row_index`,
      ids
    );
    const [rjs] = await pool.query(
      `SELECT id AS rejectId, stat_id, row_index AS rowIndex, value, natp, rtd, coi, none
         FROM rejects
        WHERE stat_id IN (${ph})
        ORDER BY stat_id, row_index`,
      ids
    );
    const rejIds = rjs.map((r) => r.rejectId);
    let reasonsMap = new Map();
    if (rejIds.length) {
      const ph2 = rejIds.map(() => "?").join(",");
      const [rrs] = await pool.query(
        `SELECT reject_id, reason FROM reject_reasons WHERE reject_id IN (${ph2}) ORDER BY reject_id, id`,
        rejIds
      );
      for (const rr of rrs) {
        if (!reasonsMap.has(rr.reject_id)) reasonsMap.set(rr.reject_id, []);
        reasonsMap.get(rr.reject_id).push(rr.reason);
      }
    }

    const fcsBy = new Map();
    fcs.forEach((r) => {
      const a = fcsBy.get(r.stat_id) || [];
      a.push({
        category: r.category,
        urgency: r.urgency,
        groupIndex: r.groupIndex,
        rowIndex: r.rowIndex,
        value: r.value,
        natp: !!r.natp,
        rtd: !!r.rtd,
        coi: !!r.coi,
        none: !!r.none,
      });
      fcsBy.set(r.stat_id, a);
    });

    const attsBy = new Map();
    atts.forEach((r) => {
      const a = attsBy.get(r.stat_id) || [];
      a.push({
        category: r.category,
        urgency: r.urgency,
        rowIndex: r.rowIndex,
        value: r.value,
        natp: !!r.natp,
        rtd: !!r.rtd,
        coi: !!r.coi,
        none: !!r.none,
      });
      attsBy.set(r.stat_id, a);
    });

    const rjsBy = new Map();
    rjs.forEach((r) => {
      const a = rjsBy.get(r.stat_id) || [];
      a.push({
        rowIndex: r.rowIndex,
        value: r.value,
        natp: !!r.natp,
        rtd: !!r.rtd,
        coi: !!r.coi,
        none: !!r.none,
        reasons: reasonsMap.get(r.rejectId) || [],
      });
      rjsBy.set(r.stat_id, a);
    });

    stats.forEach((s) => {
      s.fileCreationRows = fcsBy.get(s.id) || [];
      s.attachmentsRows = attsBy.get(s.id) || [];
      s.rejectRows = rjsBy.get(s.id) || [];
    });
  }

  return { page: pageNum, pageSize: pageSz, total: c, stats };
}

/* ──────────────────────────────────────────────────────────────
 * Main router — all secured with JWT + admin email
 * (use with app.use("/api/admin", router))
 * ────────────────────────────────────────────────────────────── */

const router = express.Router();

router.use(authenticate, isAdmin);

/** Grid data */
router.get("/hive-stats", async (req, res) => {
  try {
    const payload = await queryHiveData(req.query);
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load hive data." });
  }
});

// Back-compat alias
router.get("/hive/stats", async (req, res) => {
  try {
    const payload = await queryHiveData(req.query);
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load hive data." });
  }
});

/** Export → Excel */
router.get("/hive-stats/export/excel", async (req, res) => {
  try {
    const view = String(req.query.view || "summary"); // summary | file | attachments | rejects | mail
    const needsDetails = ["file", "attachments", "rejects"].includes(view);

    const q = {
      ...req.query,
      page: 1,
      pageSize: 5000,
      includeDetails: needsDetails ? "1" : req.query.includeDetails || "0",
    };

    const { stats } = await queryHiveData(q);

    const wb = new ExcelJS.Workbook();
    const sheetName =
      view.charAt(0).toUpperCase() + view.slice(1).toLowerCase();
    const ws = wb.addWorksheet(sheetName);

    function setCols(cols) {
      ws.columns = cols.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width,
      }));
    }

    if (view === "summary") {
      setCols([
        { header: "Client", key: "client", width: 28 },
        { header: "Client Email", key: "email", width: 30 },
        { header: "Date", key: "date", width: 12 },
        { header: "Time", key: "time", width: 12 },
        { header: "FC (IndR/IndU/FamR/FamU)", key: "fc", width: 22 },
        { header: "AT (R/U)", key: "att", width: 12 },
        { header: "Rejects", key: "rej", width: 10 },
        { header: "Checklist N/R/C/N", key: "check", width: 22 },
        { header: "Team Leader", key: "leader", width: 28 },
      ]);

      stats.forEach((s) =>
        ws.addRow({
          client: s.user.name,
          email: s.user.email,
          date: s.date,
          time: `${s.start_time || "-"}–${s.end_time || "-"}`,
          fc:
            `${s.counts.fileCreation.individual.regular}/` +
            `${s.counts.fileCreation.individual.urgent}/` +
            `${s.counts.fileCreation.family.regular}/` +
            `${s.counts.fileCreation.family.urgent}`,
          att: `${s.counts.attachments.regular}/${s.counts.attachments.urgent}`,
          rej: s.counts.rejects,
          check:
            `${s.counts.checklist.NATP}/` +
            `${s.counts.checklist.RTD}/` +
            `${s.counts.checklist.COI}/` +
            `${s.counts.checklist.NONE}`,
          leader: s.teamLeader ? s.teamLeader.email : "",
        })
      );
    } else if (view === "file") {
      setCols([
        { header: "Value", key: "value", width: 8 },
        { header: "First", key: "first", width: 16 },
        { header: "Surname", key: "surname", width: 18 },
        { header: "Email", key: "email", width: 30 },
        { header: "NATP", key: "natp", width: 8 },
        { header: "RTD", key: "rtd", width: 8 },
        { header: "COI", key: "coi", width: 8 },
        { header: "Category", key: "category", width: 12 },
        { header: "Urgency", key: "urgency", width: 10 },
        { header: "Date", key: "date", width: 12 },
        { header: "Time", key: "time", width: 12 },
      ]);

      const split = (n) => {
        const p = String(n || "")
          .trim()
          .split(/\s+/);
        return { first: p[0] || "", surname: p.slice(1).join(" ") };
      };

      for (const s of stats) {
        const { first, surname } = split(s.user.name);
        for (const r of s.fileCreationRows || []) {
          ws.addRow({
            value: r.value ?? 0,
            first,
            surname,
            email: s.user.email,
            natp: r.natp ? 1 : 0,
            rtd: r.rtd ? 1 : 0,
            coi: r.coi ? 1 : 0,
            category: r.category,
            urgency: r.urgency,
            date: s.date,
            time: `${s.start_time}–${s.end_time}`,
          });
        }
      }
    } else if (view === "attachments") {
      setCols([
        { header: "Value", key: "value", width: 8 },
        { header: "First", key: "first", width: 16 },
        { header: "Surname", key: "surname", width: 18 },
        { header: "Email", key: "email", width: 30 },
        { header: "NATP", key: "natp", width: 8 },
        { header: "RTD", key: "rtd", width: 8 },
        { header: "COI", key: "coi", width: 8 },
        { header: "Urgency", key: "urgency", width: 10 },
        { header: "Date", key: "date", width: 12 },
        { header: "Time", key: "time", width: 12 },
      ]);

      const split = (n) => {
        const p = String(n || "")
          .trim()
          .split(/\s+/);
        return { first: p[0] || "", surname: p.slice(1).join(" ") };
      };

      for (const s of stats) {
        const { first, surname } = split(s.user.name);
        for (const r of s.attachmentsRows || []) {
          ws.addRow({
            value: r.value ?? 0,
            first,
            surname,
            email: s.user.email,
            natp: r.natp ? 1 : 0,
            rtd: r.rtd ? 1 : 0,
            coi: r.coi ? 1 : 0,
            urgency: r.urgency,
            date: s.date,
            time: `${s.start_time}–${s.end_time}`,
          });
        }
      }
    } else if (view === "rejects") {
      setCols([
        { header: "Value", key: "value", width: 8 },
        { header: "First", key: "first", width: 16 },
        { header: "Surname", key: "surname", width: 18 },
        { header: "Email", key: "email", width: 30 },
        { header: "NATP", key: "natp", width: 8 },
        { header: "RTD", key: "rtd", width: 8 },
        { header: "COI", key: "coi", width: 8 },
        { header: "Reasons", key: "reasons", width: 50 },
        { header: "Date", key: "date", width: 12 },
        { header: "Time", key: "time", width: 12 },
      ]);

      const split = (n) => {
        const p = String(n || "")
          .trim()
          .split(/\s+/);
        return { first: p[0] || "", surname: p.slice(1).join(" ") };
      };

      for (const s of stats) {
        const { first, surname } = split(s.user.name);
        for (const r of s.rejectRows || []) {
          ws.addRow({
            value: r.value ?? 0,
            first,
            surname,
            email: s.user.email,
            natp: r.natp ? 1 : 0,
            rtd: r.rtd ? 1 : 0,
            coi: r.coi ? 1 : 0,
            reasons: Array.isArray(r.reasons) ? r.reasons.join(" | ") : "",
            date: s.date,
            time: `${s.start_time}–${s.end_time}`,
          });
        }
      }
      ws.getColumn("reasons").alignment = { wrapText: true };
    } else if (view === "mail") {
      setCols([
        { header: "Client", key: "client", width: 28 },
        { header: "Email", key: "email", width: 30 },
        { header: "Date", key: "date", width: 12 },
        { header: "Time", key: "time", width: 12 },
        { header: "Total Env", key: "env", width: 12 },
        { header: "File", key: "file", width: 10 },
        { header: "Urg File", key: "ufile", width: 10 },
        { header: "Attach", key: "att", width: 10 },
        { header: "Urg Att", key: "uatt", width: 10 },
        { header: "Rejects", key: "rej", width: 10 },
        { header: "Wrong", key: "wrong", width: 10 },
        { header: "Withdraw", key: "withd", width: 12 },
      ]);

      stats.forEach((s) =>
        ws.addRow({
          client: s.user.name,
          email: s.user.email,
          date: s.date,
          time: `${s.start_time || "-"}–${s.end_time || "-"}`,
          env: s.mailOpening.totalEnvelopes,
          file: s.mailOpening.fileCreation,
          ufile: s.mailOpening.urgentFileCreation,
          att: s.mailOpening.attachment,
          uatt: s.mailOpening.urgentAttachment,
          rej: s.mailOpening.rejects,
          wrong: s.mailOpening.wrongMail,
          withd: s.mailOpening.withdrawLetter,
        })
      );
    } else {
      setCols([{ header: "Message", key: "msg", width: 40 }]);
      ws.addRow({ msg: "Unsupported view." });
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="qmstats-hive-${view}-${Date.now()}.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Excel export failed." });
  }
});

/** Export → PDF (landscape, compact, professional) */
router.get("/hive-stats/export/pdf", async (req, res) => {
  try {
    const view = String(req.query.view || "summary"); // summary | file | attachments | rejects | mail
    const needsDetails = ["file", "attachments", "rejects"].includes(view);
    const q = {
      ...req.query,
      page: 1,
      pageSize: 5000,
      includeDetails: needsDetails ? "1" : req.query.includeDetails || "0",
    };

    const { stats } = await queryHiveData(q);

    // Landscape + buffering for footers
    const doc = new PDFDocument({
      margin: 32,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="qmstats-hive-${view}-${Date.now()}.pdf"`
    );
    doc.pipe(res);

    /* ───────── Design tokens ───────── */
    const COLOR = {
      text: "#141414",
      muted: "#6B7280",
      head: "#0F172A",
      border: "#E5E7EB",
      zebra: "#FAFAFC",
      accent: "#1F6FEB",
      badge: "#EEF4FF",
      chipText: "#334155",
      chipBg: "#F3F6FF",
    };
    const FS = {
      h1: 15,
      small: 8.5,
      body: 8.5,
      th: 9,
    };
    const PAD = { x: 6, headerY: 20, rowY: 16 };

    const titleMap = {
      summary: "Hive — Summary",
      file: "Hive — File Creation (rows)",
      attachments: "Hive — Attachments (rows)",
      rejects: "Hive — Rejects (rows)",
      mail: "Hive — Mail Opening",
    };

    /* ───────── Page geometry ───────── */
    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.width - doc.page.margins.right;
    const tableWidth = pageRight - pageLeft;

    /* ───────── Utilities ───────── */
    const splitName = (full) => {
      const parts = String(full || "")
        .trim()
        .split(/\s+/);
      return { first: parts[0] || "", surname: parts.slice(1).join(" ") };
    };

    const filters = [];
    if (req.query.q) filters.push(`q: "${String(req.query.q).trim()}"`);
    if (req.query.from) filters.push(`from: ${req.query.from}`);
    if (req.query.to) filters.push(`to: ${req.query.to}`);
    if (req.query.clientEmail) filters.push(`client: ${req.query.clientEmail}`);
    if (req.query.leaderEmail) filters.push(`leader: ${req.query.leaderEmail}`);

    function drawFilterChips(items) {
      if (!items.length) {
        doc
          .font("Helvetica")
          .fontSize(FS.small)
          .fillColor(COLOR.muted)
          .text("All records", { align: "center" });
        return;
      }
      let x = pageLeft;
      let y = doc.y + 6;
      const lineH = 16;
      const gap = 6;
      doc.font("Helvetica").fontSize(8);

      items.forEach((txt) => {
        const w = Math.ceil(doc.widthOfString(txt)) + 16;
        if (x + w > pageRight) {
          x = pageLeft;
          y += lineH + 4;
        }
        doc.save().roundedRect(x, y, w, lineH, 8).fill(COLOR.chipBg).restore();
        doc.fillColor(COLOR.chipText).text(txt, x + 8, y + 4, {
          width: w - 16,
          align: "left",
        });
        x += w + gap;
      });
      doc.y = y + lineH + 6;
    }

    function textOpts(width, align) {
      return { width, align, ellipsis: true, characterSpacing: 0.1 };
    }

    // Scale provided column widths to the available table width
    function scaleColumns(cols) {
      const base = cols.reduce((s, c) => s + c.width, 0);
      if (!base || Math.abs(base - tableWidth) < 1) return cols;
      const ratio = tableWidth / base;
      return cols.map((c, i) => {
        const w = Math.max(40, Math.floor(c.width * ratio));
        if (i === cols.length - 1) {
          const current = cols
            .slice(0, i)
            .reduce(
              (s, cc) => s + Math.max(40, Math.floor(cc.width * ratio)),
              0
            );
          return { ...c, width: Math.max(40, tableWidth - current) };
        }
        return { ...c, width: w };
      });
    }

    function drawTableHeader(columns) {
      doc
        .rect(pageLeft, doc.y, tableWidth, PAD.headerY)
        .fill(COLOR.badge)
        .strokeColor(COLOR.border)
        .lineWidth(0.5)
        .stroke();

      let x = pageLeft + PAD.x;
      doc.fillColor(COLOR.head).font("Helvetica-Bold").fontSize(FS.th);
      columns.forEach((c) => {
        doc.text(
          String(c.label),
          x,
          doc.y + 5,
          textOpts(c.width - PAD.x * 2, c.align || "left")
        );
        x += c.width;
      });
      doc.y += PAD.headerY;
    }

    function drawTableRows(columns, rows) {
      const bottomLimit = doc.page.height - doc.page.margins.bottom - 18;
      rows.forEach((row, idx) => {
        if (doc.y + PAD.rowY > bottomLimit) {
          doc.addPage();
          drawTableHeader(columns);
        }

        if (idx % 2 === 0) {
          doc
            .save()
            .rect(pageLeft, doc.y, tableWidth, PAD.rowY)
            .fill(COLOR.zebra)
            .restore();
        }

        let x = pageLeft + PAD.x;
        doc.fillColor(COLOR.text).font("Helvetica").fontSize(FS.body);
        columns.forEach((c) => {
          const val = row[c.key];
          const align = c.align || (c.right ? "right" : "left");
          doc.text(
            val == null ? "" : String(val),
            x,
            doc.y + 3,
            textOpts(c.width - PAD.x * 2, align)
          );
          x += c.width;
        });

        // underline
        doc
          .moveTo(pageLeft, doc.y + PAD.rowY)
          .lineTo(pageLeft + tableWidth, doc.y + PAD.rowY)
          .lineWidth(0.3)
          .strokeColor(COLOR.border)
          .stroke();

        doc.y += PAD.rowY;
      });
    }

    function drawReportHeader() {
      // Title
      doc
        .fillColor(COLOR.head)
        .font("Helvetica-Bold")
        .fontSize(FS.h1)
        .text(`QMStats — ${titleMap[view] || "Hive"}`, { align: "center" });

      // Meta
      doc
        .moveDown(0.15)
        .font("Helvetica")
        .fontSize(FS.small)
        .fillColor(COLOR.muted)
        .text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });

      // Filters as chips
      drawFilterChips(filters);

      // Accent rule
      doc
        .moveTo(pageLeft, doc.y + 8)
        .lineTo(pageRight, doc.y + 8)
        .lineWidth(1)
        .strokeColor(COLOR.accent)
        .stroke();
      doc.moveDown(0.4);
    }

    function drawFooters(note = "") {
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const left = pageLeft;
        const right = pageRight;

        // top & bottom rules
        doc
          .moveTo(left, doc.page.margins.top - 12)
          .lineTo(right, doc.page.margins.top - 12)
          .lineWidth(0.5)
          .strokeColor(COLOR.border)
          .stroke();
        doc
          .moveTo(left, doc.page.height - doc.page.margins.bottom + 10)
          .lineTo(right, doc.page.height - doc.page.margins.bottom + 10)
          .lineWidth(0.5)
          .strokeColor(COLOR.border)
          .stroke();

        // footer text (left) + page numbers (right)
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(COLOR.muted)
          .text(note, left, doc.page.height - doc.page.margins.bottom + 14, {
            width: (right - left) / 2,
            align: "left",
          });
        doc.text(
          `Page ${i - range.start + 1} of ${range.count}`,
          left + (right - left) / 2,
          doc.page.height - doc.page.margins.bottom + 14,
          { width: (right - left) / 2, align: "right" }
        );
      }
    }

    /* ───────── Render header ───────── */
    drawReportHeader();

    /* ───────── Build per-view columns + rows ───────── */
    let columns, rows, footerNote;

    if (view === "summary") {
      columns = scaleColumns([
        { key: "client", label: "Client", width: 170 },
        { key: "email", label: "Email", width: 230 },
        { key: "date", label: "Date", width: 70 },
        { key: "time", label: "Time", width: 90 },
        {
          key: "fc",
          label: "FC  (IndR / IndU / FamR / FamU)",
          width: 210,
          align: "right",
          right: true,
        },
        {
          key: "att",
          label: "AT  (R / U)",
          width: 90,
          align: "right",
          right: true,
        },
        { key: "rej", label: "RJ", width: 60, align: "right", right: true },
        {
          key: "check",
          label: "Checklist  N / R / C / N",
          width: 210,
          align: "right",
          right: true,
        },
        { key: "leader", label: "Team Leader", width: 160 },
      ]);

      rows = stats.map((s) => ({
        client: s.user.name,
        email: s.user.email,
        date: s.date,
        time: `${s.start_time || "-"}–${s.end_time || "-"}`,
        fc:
          `${s.counts.fileCreation.individual.regular}/` +
          `${s.counts.fileCreation.individual.urgent}/` +
          `${s.counts.fileCreation.family.regular}/` +
          `${s.counts.fileCreation.family.urgent}`,
        att: `${s.counts.attachments.regular}/${s.counts.attachments.urgent}`,
        rej: s.counts.rejects,
        check:
          `${s.counts.checklist.NATP}/` +
          `${s.counts.checklist.RTD}/` +
          `${s.counts.checklist.COI}/` +
          `${s.counts.checklist.NONE}`,
        leader: s.teamLeader ? s.teamLeader.email : "",
      }));
      footerNote = `${rows.length} summary records`;
    } else if (view === "file") {
      columns = scaleColumns([
        {
          key: "value",
          label: "Value",
          width: 70,
          align: "right",
          right: true,
        },
        { key: "first", label: "First", width: 110 },
        { key: "surname", label: "Surname", width: 140 },
        { key: "email", label: "Email", width: 240 },
        { key: "natp", label: "NATP", width: 60, align: "right", right: true },
        { key: "rtd", label: "RTD", width: 60, align: "right", right: true },
        { key: "coi", label: "COI", width: 60, align: "right", right: true },
        { key: "category", label: "Category", width: 90 },
        { key: "urgency", label: "Urgency", width: 90 },
        { key: "date", label: "Date", width: 70 },
        { key: "time", label: "Time", width: 90 },
      ]);

      rows = [];
      for (const s of stats) {
        const { first, surname } = splitName(s.user.name);
        for (const r of s.fileCreationRows || []) {
          rows.push({
            value: r.value ?? 0,
            first,
            surname,
            email: s.user.email,
            natp: r.natp ? 1 : 0,
            rtd: r.rtd ? 1 : 0,
            coi: r.coi ? 1 : 0,
            category: r.category,
            urgency: r.urgency,
            date: s.date,
            time: `${s.start_time}–${s.end_time}`,
          });
        }
      }
      footerNote = `${rows.length} file-creation rows`;
    } else if (view === "attachments") {
      columns = scaleColumns([
        {
          key: "value",
          label: "Value",
          width: 70,
          align: "right",
          right: true,
        },
        { key: "first", label: "First", width: 110 },
        { key: "surname", label: "Surname", width: 140 },
        { key: "email", label: "Email", width: 240 },
        { key: "natp", label: "NATP", width: 60, align: "right", right: true },
        { key: "rtd", label: "RTD", width: 60, align: "right", right: true },
        { key: "coi", label: "COI", width: 60, align: "right", right: true },
        { key: "urgency", label: "Urgency", width: 110 },
        { key: "date", label: "Date", width: 70 },
        { key: "time", label: "Time", width: 90 },
      ]);

      rows = [];
      for (const s of stats) {
        const { first, surname } = splitName(s.user.name);
        for (const r of s.attachmentsRows || []) {
          rows.push({
            value: r.value ?? 0,
            first,
            surname,
            email: s.user.email,
            natp: r.natp ? 1 : 0,
            rtd: r.rtd ? 1 : 0,
            coi: r.coi ? 1 : 0,
            urgency: r.urgency,
            date: s.date,
            time: `${s.start_time}–${s.end_time}`,
          });
        }
      }
      footerNote = `${rows.length} attachment rows`;
    } else if (view === "rejects") {
      columns = scaleColumns([
        {
          key: "value",
          label: "Value",
          width: 70,
          align: "right",
          right: true,
        },
        { key: "first", label: "First", width: 110 },
        { key: "surname", label: "Surname", width: 140 },
        { key: "email", label: "Email", width: 240 },
        { key: "natp", label: "NATP", width: 60, align: "right", right: true },
        { key: "rtd", label: "RTD", width: 60, align: "right", right: true },
        { key: "coi", label: "COI", width: 60, align: "right", right: true },
        { key: "reasons", label: "Reasons (first 2)", width: 260 },
        { key: "date", label: "Date", width: 70 },
        { key: "time", label: "Time", width: 90 },
      ]);

      rows = [];
      for (const s of stats) {
        const { first, surname } = splitName(s.user.name);
        for (const r of s.rejectRows || []) {
          rows.push({
            value: r.value ?? 0,
            first,
            surname,
            email: s.user.email,
            natp: r.natp ? 1 : 0,
            rtd: r.rtd ? 1 : 0,
            coi: r.coi ? 1 : 0,
            reasons: Array.isArray(r.reasons)
              ? r.reasons.slice(0, 2).join(" • ")
              : "",
            date: s.date,
            time: `${s.start_time}–${s.end_time}`,
          });
        }
      }
      footerNote = `${rows.length} reject rows`;
    } else if (view === "mail") {
      columns = scaleColumns([
        { key: "client", label: "Client", width: 170 },
        { key: "email", label: "Email", width: 230 },
        { key: "date", label: "Date", width: 70 },
        { key: "time", label: "Time", width: 90 },
        {
          key: "env",
          label: "Total Env",
          width: 80,
          align: "right",
          right: true,
        },
        { key: "file", label: "File", width: 60, align: "right", right: true },
        {
          key: "ufile",
          label: "Urg File",
          width: 70,
          align: "right",
          right: true,
        },
        { key: "att", label: "Attach", width: 60, align: "right", right: true },
        {
          key: "uatt",
          label: "Urg Att",
          width: 70,
          align: "right",
          right: true,
        },
        {
          key: "rej",
          label: "Rejects",
          width: 70,
          align: "right",
          right: true,
        },
        {
          key: "wrong",
          label: "Wrong",
          width: 60,
          align: "right",
          right: true,
        },
        {
          key: "withd",
          label: "Withdraw",
          width: 80,
          align: "right",
          right: true,
        },
      ]);

      rows = stats.map((s) => ({
        client: s.user.name,
        email: s.user.email,
        date: s.date,
        time: `${s.start_time || "-"}–${s.end_time || "-"}`,
        env: s.mailOpening.totalEnvelopes,
        file: s.mailOpening.fileCreation,
        ufile: s.mailOpening.urgentFileCreation,
        att: s.mailOpening.attachment,
        uatt: s.mailOpening.urgentAttachment,
        rej: s.mailOpening.rejects,
        wrong: s.mailOpening.wrongMail,
        withd: s.mailOpening.withdrawLetter,
      }));
      footerNote = `${rows.length} mail-opening rows`;
    } else {
      doc
        .font("Helvetica")
        .fontSize(FS.body)
        .fillColor(COLOR.text)
        .text("Unsupported view.", { align: "center" });
      doc.end();
      return;
    }

    // Render table
    drawTableHeader(columns);
    drawTableRows(columns, rows);

    // Footers (after content)
    drawFooters(footerNote);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PDF export failed." });
  }
});

module.exports = { router, streamRouter, broadcast };
