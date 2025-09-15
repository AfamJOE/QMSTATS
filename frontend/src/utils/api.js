// src/utils/api.js
export function apiFetch(url, options = {}) {
  const token = localStorage.getItem("qm_token");
  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };
  return fetch(url, { ...options, headers });
}
