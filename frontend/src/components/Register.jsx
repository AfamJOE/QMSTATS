// // src/components/Register.jsx

// import { useState } from "react";
// import { useNavigate, Link } from "react-router-dom";
// import axios from "axios";

// export default function Register() {
//   const [firstName, setFirstName] = useState("");
//   const [surname, setSurname] = useState("");
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [confirm, setConfirm] = useState("");
//   const [error, setError] = useState("");
//   const [success, setSuccess] = useState("");
//   const navigate = useNavigate();

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setError("");

//     // Password match check
//     if (password !== confirm) {
//       return setError("Passwords do not match");
//     }
//     // Name fields check
//     if (!firstName || !surname) {
//       return setError("First name and surname are required");
//     }

//     try {
//       await axios.post("http://localhost:4000/api/auth/register", {
//         email,
//         password,
//         firstName,
//         surname,
//       });
//       setSuccess("Registration successful! Redirecting to login…");
//       setTimeout(() => navigate("/"), 1500);
//     } catch (err) {
//       setError(err.response?.data?.error || "Registration failed");
//     }
//   };

//   return (
//     <div className="auth-container">
//       <h2>QMStats Register</h2>
//       <form className="auth-form" onSubmit={handleSubmit}>
//         <label htmlFor="firstName">First Name</label>
//         <input
//           id="firstName"
//           type="text"
//           value={firstName}
//           onChange={(e) => setFirstName(e.target.value)}
//           required
//         />

//         <label htmlFor="surname">Surname</label>
//         <input
//           id="surname"
//           type="text"
//           value={surname}
//           onChange={(e) => setSurname(e.target.value)}
//           required
//         />

//         <label htmlFor="email">Email</label>
//         <input
//           id="email"
//           type="email"
//           value={email}
//           onChange={(e) => setEmail(e.target.value)}
//           required
//         />

//         <label htmlFor="password">Password</label>
//         <input
//           id="password"
//           type="password"
//           value={password}
//           onChange={(e) => setPassword(e.target.value)}
//           required
//         />

//         <label htmlFor="confirm">Confirm Password</label>
//         <input
//           id="confirm"
//           type="password"
//           value={confirm}
//           onChange={(e) => setConfirm(e.target.value)}
//           required
//         />

//         <button type="submit">Register</button>

//         {error && <p className="auth-error">{error}</p>}
//         {success && <p className="auth-success">{success}</p>}
//       </form>

//       <div className="auth-link">
//         Already have an account? <Link to="/">Log in here</Link>.
//       </div>
//     </div>
//   );
// }

// src/components/Register.jsx

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../utils/axios";
import { useTranslation } from "react-i18next";

export default function Register() {
  const { t } = useTranslation();

  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      return setError(t("auth.passwordMismatch"));
    }

    if (!firstName || !surname) {
      return setError(t("auth.nameRequired"));
    }

    try {
      await api.post("/auth/register", {
        email,
        password,
        firstName,
        surname,
      });

      setSuccess(t("auth.registrationSuccess"));
      setTimeout(() => navigate("/"), 1500);
    } catch (err) {
      setError(err.response?.data?.error || t("auth.registrationFailed"));
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <h2>{t("auth.registerTitle")}</h2>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="firstName">{t("auth.firstName")}</label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />

          <label htmlFor="surname">{t("auth.surname")}</label>
          <input
            id="surname"
            type="text"
            value={surname}
            onChange={(e) => setSurname(e.target.value)}
            required
          />

          <label htmlFor="email">{t("auth.email")}</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="password">{t("auth.password")}</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <label htmlFor="confirm">{t("auth.confirmPassword")}</label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />

          <button type="submit">{t("auth.register")}</button>

          {error && <p className="auth-error">{error}</p>}
          {success && <p className="auth-success">{success}</p>}
        </form>

        <div className="auth-link">
          {t("auth.alreadyAccount")} <Link to="/">{t("auth.loginHere")}</Link>.
        </div>
      </div>
    </div>
  );
}
