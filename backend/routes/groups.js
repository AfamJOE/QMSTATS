// backend\routes\groups.js

const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticate = require("../middleware/authenticate");

router.use(authenticate);

// Create group
router.post("/create", async (req, res) => {
  const { id, firstName, surname } = req.user;
  const group_name = `${firstName} ${surname}`;

  try {
    const [result] = await pool.execute(
      "INSERT INTO user_group (group_name, manager_id) VALUES (?, ?)",
      [group_name, id]
    );
    res.json({
      success: true,
      groupId: result.insertId,
      groupName: group_name,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create group" });
  }
});

// Invite user
router.post("/invite", async (req, res) => {
  const { groupId, userEmail } = req.body;

  try {
    const [users] = await pool.execute("SELECT id FROM users WHERE email=?", [
      userEmail,
    ]);
    if (!users.length)
      return res.status(404).json({ error: "User not found." });

    const userId = users[0].id;

    await pool.execute(
      "INSERT INTO group_invites (group_id, user_id) VALUES (?, ?)",
      [groupId, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not invite user" });
  }
});

// Accept or decline invite
router.post("/invite/respond", async (req, res) => {
  const { inviteId, status } = req.body;
  const userId = req.user.id;

  try {
    await pool.execute(
      "UPDATE group_invites SET status=? WHERE id=? AND user_id=?",
      [status, inviteId, userId]
    );

    if (status === "accepted") {
      const [invite] = await pool.execute(
        "SELECT group_id FROM group_invites WHERE id=?",
        [inviteId]
      );
      await pool.execute(
        "INSERT INTO group_members (group_id, user_id) VALUES (?, ?)",
        [invite[0].group_id, userId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update invitation" });
  }
});

// Remove member (only manager)
router.post("/remove", async (req, res) => {
  const { memberId, groupId } = req.body;
  const managerId = req.user.id;

  try {
    const [group] = await pool.execute(
      "SELECT * FROM user_group WHERE id=? AND manager_id=?",
      [groupId, managerId]
    );
    if (!group.length)
      return res.status(403).json({ error: "Not authorized." });

    await pool.execute(
      "DELETE FROM group_members WHERE group_id=? AND user_id=?",
      [groupId, memberId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove member" });
  }
});

// Get my groups
router.get("/", async (req, res) => {
  const userId = req.user.id;
  try {
    const [groups] = await pool.execute(
      "SELECT * FROM user_group WHERE manager_id=?",
      [userId]
    );
    res.json({ groups });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not retrieve groups" });
  }
});

// GET /api/groups/search-users?query=...
router.get("/search-users", async (req, res) => {
  const { query } = req.query;
  if (!query) return res.json({ users: [] });

  try {
    // Search by first_name or surname, case‐insensitive partial match
    const [users] = await pool.execute(
      `SELECT id, CONCAT(first_name, ' ', surname) AS name, email
         FROM users
        WHERE first_name LIKE ? OR surname LIKE ?
        ORDER BY first_name
        LIMIT 10`,
      [`%${query}%`, `%${query}%`]
    );
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "User search failed" });
  }
});


// Receive Invite

// GET /api/groups/invites
router.get("/invites", async (req, res) => {
  const userId = req.user.id;
  try {
    const [invites] = await pool.execute(
      `SELECT gi.id        AS inviteId,
              ug.id        AS groupId,
              ug.group_name,
              gi.status,
              gi.created_at
         FROM group_invites gi
         JOIN user_group   ug ON ug.id = gi.group_id
        WHERE gi.user_id = ?
          AND gi.status = 'pending'
        ORDER BY gi.created_at DESC`,
      [userId]
    );
    res.json({ invites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch invites" });
  }
});




module.exports = router;
