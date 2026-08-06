import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { UIProvider, useUI } from "./UIContext";
import { IconMenu } from "./components/Icons";
import Login     from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Alerts    from "./pages/Alerts";
import Settings  from "./pages/Settings";
import Insights  from "./pages/Insights";
import History   from "./pages/History";
import Forecast  from "./pages/Forecast";

function RequireAuth({ children }: { children: React.ReactNode }) {
  return localStorage.getItem("token") ? children : <Navigate to="/login" replace />;
}

function MobileMenuButton() {
  const { sidebarOpen, setSidebarOpen } = useUI();
  if (sidebarOpen) return null;
  if (!localStorage.getItem("token")) return null;
  return (
    <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
      <IconMenu size={20} />
    </button>
  );
}

export default function App() {
  return (
    <UIProvider>
      <BrowserRouter>
        <MobileMenuButton />
        <Routes>
          <Route path="/"          element={<Navigate to="/login" replace />} />
          <Route path="/login"     element={<Login />} />
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/insights"  element={<RequireAuth><Insights  /></RequireAuth>} />
          <Route path="/history"   element={<RequireAuth><History   /></RequireAuth>} />
          <Route path="/forecast"  element={<RequireAuth><Forecast  /></RequireAuth>} />
          <Route path="/analytics" element={<RequireAuth><Analytics /></RequireAuth>} />
          <Route path="/alerts"    element={<RequireAuth><Alerts    /></RequireAuth>} />
          <Route path="/settings"  element={<RequireAuth><Settings  /></RequireAuth>} />
          <Route path="*"          element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </UIProvider>
  );
}
