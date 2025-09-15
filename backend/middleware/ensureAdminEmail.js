// backend/middleware/ensureAdminEmail.js
/**
 * Only allow the hard-coded admin user.
 * Requires authenticate middleware to have populated req.user.email.
 */
module.exports = function ensureAdminEmail(req, res, next) {
  const email = (req.user?.email || "").toLowerCase();
  if (email !== "admin@example.com") {
    return res.status(403).json({ error: "Admin only." });
  }
  next();
};
