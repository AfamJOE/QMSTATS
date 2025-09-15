//frontend\src\utils\axios.js
import axios from "axios";

/**
 * Single Axios instance for the whole app.
 *   – Base URL points to your Express backend
 *   – Automatically adds the JWT token (if any) to every request
 */
const api = axios.create({
  baseURL: "http://localhost:4000/api",
});

// Add Authorization header when a token exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("qm_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
