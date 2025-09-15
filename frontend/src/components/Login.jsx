// src/components/Login.jsx

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const { data } = await axios.post(
        "http://localhost:4000/api/auth/login",
        { email, password }
      );

      // CLEAR any old token before saving the new one:
      localStorage.removeItem("qm_token");
      localStorage.setItem("qm_token", data.token);

      navigate("/app/stats");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    }
  };

  return (
    <div className="auth-container">
      <h2>QMStats Login</h2>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit">Log In</button>
        {error && <p className="auth-error">{error}</p>}
      </form>

      <div className="auth-link">
        Don’t have an account? <Link to="/register">Register here</Link>.
      </div>
    </div>
  );
}
