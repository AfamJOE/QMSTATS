// ./backend/routes/users.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticate = require("../middleware/authenticate");

router.use(authenticate);

// GET /api/users/me  → biodata + current team leader (if any)
router.get("/me", async (req, res) => {
  const userId = req.user.id;
  try {
    const [[me]] = await pool.execute(
      `SELECT u.id,
              u.email,
              u.first_name,
              u.surname,
              u.team_leader_user_id,
              tl.first_name AS tl_first_name,
              tl.surname    AS tl_surname,
              tl.email      AS tl_email
         FROM users u
         LEFT JOIN users tl ON tl.id = u.team_leader_user_id
        WHERE u.id = ?`,
      [userId]
    );
    if (!me) return res.status(404).json({ error: "User not found" });

    res.json({
      id: me.id,
      email: me.email,
      firstName: me.first_name,
      surname: me.surname,
      teamLeader: me.team_leader_user_id
        ? {
            id: me.team_leader_user_id,
            name: `${me.tl_first_name} ${me.tl_surname}`,
            email: me.tl_email,
          }
        : null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load profile" });
  }
});

// GET /api/users/search?query=...  → up to 10 matches by name/email
router.get("/search", async (req, res) => {
  const { query } = req.query;
  if (!query) return res.json({ users: [] });

  try {
    const [rows] = await pool.execute(
      `SELECT id,
              CONCAT(first_name, ' ', surname) AS name,
              email
         FROM users
        WHERE first_name LIKE ? OR surname LIKE ? OR email LIKE ?
        ORDER BY first_name
        LIMIT 10`,
      [`%${query}%`, `%${query}%`, `%${query}%`]
    );
    res.json({ users: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Search failed" });
  }
});

// PUT /api/users/team-leader  { leaderUserId }
router.put("/team-leader", async (req, res) => {
  const userId = req.user.id;
  const { leaderUserId } = req.body;
  if (!leaderUserId) {
    return res.status(400).json({ error: "leaderUserId is required" });
  }
  if (Number(leaderUserId) === Number(userId)) {
    return res.status(400).json({ error: "You cannot select yourself." });
  }

  try {
    const [[exists]] = await pool.execute(
      `SELECT id FROM users WHERE id=?`,
      [leaderUserId]
    );
    if (!exists) return res.status(404).json({ error: "Leader not found" });

    await pool.execute(
      `UPDATE users SET team_leader_user_id=? WHERE id=?`,
      [leaderUserId, userId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not set team leader" });
  }
});

module.exports = router;
