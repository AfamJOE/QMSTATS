//frontend\src\main.jsx

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";

import Login from "./components/Login";
import Register from "./components/Register";
import App from "./App";
import AdminHive from "./components/AdminHive";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/app/*" element={<App />} />
     
      <Route path="/app/hive" element={<AdminHive />} />
    </Routes>
  </BrowserRouter>
);
