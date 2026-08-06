import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../api";
import { useUI } from "../UIContext";
import { IconDashboard, IconAnalytics, IconBell, IconSettings, IconLogout, IconPlus, IconClose, IconWind, IconSun, IconMoon, IconLightbulb, IconCalendar, IconCloud } from "./Icons";

interface Device { device_id: string; nickname: string | null; }

interface Props {
  devices: Device[];
  activeDevice: string | null;
  onSelect: (id: string) => void;
  onDeviceAdded: () => void;
  userEmail: string;
  alertCount: number;
}

export default function Sidebar({ devices, activeDevice, onSelect, onDeviceAdded, userEmail, alertCount }: Props) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { theme, toggleTheme, sidebarOpen, setSidebarOpen } = useUI();
  const [showModal, setShowModal] = useState(false);

  function go(path: string) { navigate(path); setSidebarOpen(false); }
  const [deviceId,  setDeviceId]  = useState("");
  const [authCode,  setAuthCode]  = useState("");
  const [nickname,  setNickname]  = useState("");
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);

  function logout() {
    localStorage.removeItem("token");
    window.location.href = "/login";
  }

  async function addDevice(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/devices", { device_id: deviceId, auth_code: authCode, nickname });
      setDeviceId(""); setAuthCode(""); setNickname("");
      setShowModal(false);
      onDeviceAdded();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Failed to add device");
    } finally {
      setLoading(false);
    }
  }

  const initials = userEmail ? userEmail[0].toUpperCase() : "U";
  const name     = userEmail ? userEmail.split("@")[0] : "User";

  return (
    <>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <div className="brand">
            <div className="brand-icon"><IconWind size={18} strokeWidth={2.2} /></div>
            <div>
              <div className="brand-name">AirWatch</div>
              <div className="brand-sub">Monitoring System</div>
            </div>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">{initials}</div>
          <div>
            <div className="user-name">{name}</div>
            <div className="user-email">{userEmail}</div>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">My Devices ({devices.length})</div>
        </div>

        {devices.map(d => (
          <div key={d.device_id}
            className={`device-item ${activeDevice === d.device_id ? "active" : ""}`}
            onClick={() => onSelect(d.device_id)}
          >
            <span className="dot on" />
            <div>
              <div className="d-name">{d.nickname || d.device_id}</div>
            </div>
          </div>
        ))}

        <button className="add-device-btn" onClick={() => setShowModal(true)}>
          <IconPlus size={16} /> Add Device
        </button>

        <div className="sidebar-nav">
          <div className="sidebar-section-label" style={{ padding: "4px 0 8px" }}>Navigation</div>
          <button className={`nav-item ${location.pathname === "/dashboard" ? "active" : ""}`} aria-current={location.pathname === "/dashboard" ? "page" : undefined} onClick={() => go("/dashboard")}>
            <IconDashboard /> Dashboard
          </button>
          <button className={`nav-item ${location.pathname === "/insights"  ? "active" : ""}`} aria-current={location.pathname === "/insights"  ? "page" : undefined} onClick={() => go("/insights")}>
            <IconLightbulb /> Insights
          </button>
          <button className={`nav-item ${location.pathname === "/history"   ? "active" : ""}`} aria-current={location.pathname === "/history"   ? "page" : undefined} onClick={() => go("/history")}>
            <IconCalendar /> History
          </button>
          <button className={`nav-item ${location.pathname === "/forecast"  ? "active" : ""}`} aria-current={location.pathname === "/forecast"  ? "page" : undefined} onClick={() => go("/forecast")}>
            <IconCloud /> Forecast
          </button>
          <button className={`nav-item ${location.pathname === "/analytics" ? "active" : ""}`} aria-current={location.pathname === "/analytics" ? "page" : undefined} onClick={() => go("/analytics")}>
            <IconAnalytics /> Analytics
          </button>
          <button className={`nav-item ${location.pathname === "/alerts"    ? "active" : ""}`} aria-current={location.pathname === "/alerts"    ? "page" : undefined} onClick={() => go("/alerts")}>
            <IconBell /> Alerts
            {alertCount > 0 && <span className="nav-badge">{alertCount}</span>}
          </button>
          <button className={`nav-item ${location.pathname === "/settings"  ? "active" : ""}`} aria-current={location.pathname === "/settings"  ? "page" : undefined} onClick={() => go("/settings")}>
            <IconSettings /> Settings
          </button>
        </div>

        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <button className="signout-btn" onClick={logout}>
            <IconLogout /> Sign Out
          </button>
        </div>
      </aside>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon"><IconPlus size={18} strokeWidth={2.2} /></div>
              <div>
                <div className="modal-title">Register New Device</div>
                <div className="modal-sub">Enter the claim code from your sensor unit</div>
              </div>
            </div>
            <button className="modal-close" onClick={() => setShowModal(false)}><IconClose size={16} /></button>

            <form onSubmit={addDevice}>
              <div className="field">
                <label>Device Name</label>
                <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="e.g. Kitchen Monitor" />
              </div>
              <div className="field">
                <label>Device ID</label>
                <input value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="pi-001" required />
              </div>
              <div className="field">
                <label>Claim Code</label>
                <input value={authCode} onChange={e => setAuthCode(e.target.value)} placeholder="XXXX-XXXXXXXXXXXXXXXX" required />
              </div>
              <div className="hint-box">💡 Find your claim code on the device sticker or from the admin provision command.</div>
              {error && <div className="error-msg">{error}</div>}
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? <span className="spinner" /> : "Register Device"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
