// ./backend/routes/auth.js

const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");

// Register a new user
router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, surname } = req.body;

    // Basic validation
    if (!email || !password || !firstName || !surname) {
      return res.status(400).json({ error: "All fields are required." });
    }

    // Check if user already exists
    const [users] = await pool.execute("SELECT id FROM users WHERE email = ?", [
      email,
    ]);
    if (users.length > 0) {
      return res.status(409).json({ error: "Email already registered." });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    await pool.execute(
      `INSERT INTO users (email, password, first_name, surname)
       VALUES (?, ?, ?, ?)`,
      [email, hashedPassword, firstName, surname]
    );

    res.json({ success: true, message: "User registered successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed." });
  }
});

// Login a user
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required." });
    }

    // Retrieve user by email
    const [users] = await pool.execute(
      `SELECT id, email, password, first_name, surname
       FROM users WHERE email = ?`,
      [email]
    );
    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const user = users[0];

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        surname: user.surname,
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        surname: user.surname,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed." });
  }
});

module.exports = router;
