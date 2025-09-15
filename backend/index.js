// backend/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./routes/auth"); // your existing auth routes
const userRoutes = require("./routes/users"); // users, profile, TL, etc.
const groupRoutes = require("./routes/groups"); // groups/invites
const statsRoutes = require("./routes/stats"); // stats CRUD + PDF + send

// IMPORTANT: import admin routes as an object, then use its router fields
const admin = require("./routes/admin"); // { router, streamRouter, broadcast }

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Mount routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/stats", statsRoutes);

// Admin routers — BOTH must be functions:
app.use("/api/admin", admin.router);
app.use("/api/admin/hive/stream", admin.streamRouter);

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(`Admin email: ${admin.ADMIN_EMAIL}`);
});
