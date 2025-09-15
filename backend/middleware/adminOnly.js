// ./backend/middleware/adminOnly.js
module.exports = function adminOnly(req, res, next) {
  try {
    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    const userEmail  = (req.user?.email || "").toLowerCase().trim();
    if (!adminEmail || userEmail !== adminEmail) {
      return res.status(403).json({ error: "Admin access only." });
    }
    next();
  } catch (e) {
    console.error(e);
    res.status(403).json({ error: "Admin access only." });
  }
};
