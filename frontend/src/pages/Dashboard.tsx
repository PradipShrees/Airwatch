import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";
import Sidebar from "../components/Sidebar";
import AQIGauge from "../components/AQIGauge";
import SensorCard from "../components/SensorCard";
import OutdoorAQI from "../components/OutdoorAQI";
import Recommendations from "../components/Recommendations";
import Achievements from "../components/Achievements";
import { IconLocation, IconShield, IconAlert, IconActivity, IconWind } from "../components/Icons";
import api from "../api";

interface Device  { device_id: string; nickname: string | null; }
interface Reading {
  timestamp: string; pm1: number; pm25: number; pm4: number; pm10: number;
  temperature: number; humidity: number; voc: number;
}
interface AQIResult { timestamp: string; aqi: number; category: string; }
interface AlertItem { id: number; timestamp: string; type: string; message: string; value: number; }

const TOOLTIP_STYLE = { background: "#111827", border: "1px solid #1e2d45", borderRadius: 8, fontSize: 12, maxWidth: 200 };
const fmt = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function pm25Status(v: number): [string, string] {
  if (v <= 12)  return ["Good",      "#22c55e"];
  if (v <= 35)  return ["Moderate",  "#f59e0b"];
  if (v <= 55)  return ["Unhealthy", "#f97316"];
  return              ["Danger",     "#ef4444"];
}
function vocStatus(v: number): [string, string] {
  if (v <= 100) return ["Normal",   "#22c55e"];
  if (v <= 200) return ["Elevated", "#f59e0b"];
  return              ["High",      "#ef4444"];
}
function tempStatus(v: number): [string, string] {
  if (v < 18)  return ["Cold",        "#818cf8"];
  if (v <= 24) return ["Comfortable", "#22c55e"];
  if (v <= 28) return ["Warm",        "#f59e0b"];
  return             ["Hot",          "#ef4444"];
}
function humStatus(v: number): [string, string] {
  if (v < 30)  return ["Dry",     "#f59e0b"];
  if (v <= 60) return ["Optimal", "#22c55e"];
  return             ["High",     "#818cf8"];
}

const PM10_THRESHOLD = 500;

function playAlertSound() {
  const ctx = new AudioContext();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 1.2);
  ctx.close();
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [devices,    setDevices]    = useState<Device[]>([]);
  const [active,     setActive]     = useState<string | null>(null);
  const [live,       setLive]       = useState<Reading | null>(null);
  const [history,    setHistory]    = useState<Reading[]>([]);
  const [aqiHistory, setAqiHistory] = useState<AQIResult[]>([]);
  const [alerts,     setAlerts]     = useState<AlertItem[]>([]);
  const [aqi,        setAqi]        = useState<AQIResult | null>(null);
  const [userEmail,  setUserEmail]  = useState("");
  const [now,        setNow]        = useState(new Date());
  const [pm10Alert,  setPm10Alert]  = useState(false);
  const wsRef        = useRef<WebSocket | null>(null);
  const pm10AboveRef = useRef(false);

  useEffect(() => {
    api.get("/auth/me").then(({ data }) => setUserEmail(data.email));
    api.get<Device[]>("/devices").then(({ data }) => {
      setDevices(data);
      if (data.length > 0) setActive(data[0].device_id);
    });
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!active) return;
    api.get<Reading[]>(`/readings/${active}/history?limit=60`).then(({ data }) => {
      setHistory([...data].reverse());
      if (data[0]) setLive(data[0]);
    });
    api.get<AQIResult[]>(`/readings/${active}/aqi?limit=60`).then(({ data }) => {
      setAqiHistory([...data].reverse());
      if (data[0]) setAqi(data[0]);
    });
    api.get<AlertItem[]>(`/readings/${active}/alerts?limit=20`).then(({ data }) => setAlerts(data));

    wsRef.current?.close();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws    = new WebSocket(`${proto}://${location.host}/api/ws/${active}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const { topic, data } = JSON.parse(e.data);
      if (topic === "sensor.raw") {
        setLive(data);
        setHistory(p => [...p.slice(-59), data]);
        const isAbove = (data.pm10 ?? 0) >= PM10_THRESHOLD;
        if (isAbove && !pm10AboveRef.current) playAlertSound();
        pm10AboveRef.current = isAbove;
        setPm10Alert(isAbove);
      }
      if (topic === "aqi.computed") {
        setAqi(data);
        setAqiHistory(p => [...p.slice(-59), data]);
      }
    };
    return () => ws.close();
  }, [active]);

  const activeDevice = devices.find(d => d.device_id === active);
  const activeAlerts = alerts.length;

  if (devices.length === 0) {
    return (
      <div className="app-shell">
        <Sidebar devices={[]} activeDevice={null} onSelect={() => {}} onDeviceAdded={() => window.location.reload()} userEmail={userEmail} alertCount={0} />
        <div className="main">
          <div className="empty-state">
            <div className="es-icon"><IconWind size={48} strokeWidth={1.5} /></div>
            <div className="es-title">No devices yet</div>
            <p>Click "+ Add Device" in the sidebar to link your first sensor.</p>
          </div>
        </div>
      </div>
    );
  }

  const [pm25S, pm25C] = pm25Status(live?.pm25 ?? 0);
  const [pm10S, pm10C] = pm25Status(live?.pm10 ?? 0);
  const [vocS,  vocC]  = vocStatus(live?.voc ?? 0);
  const [tmpS,  tmpC]  = tempStatus(live?.temperature ?? 22);
  const [humS,  humC]  = humStatus(live?.humidity ?? 50);

  return (
    <div className="app-shell">
      <Sidebar
        devices={devices}
        activeDevice={active}
        onSelect={setActive}
        onDeviceAdded={() => api.get<Device[]>("/devices").then(({ data }) => setDevices(data))}
        userEmail={userEmail}
        alertCount={activeAlerts}
      />

      <div className="main">
        {/* Top bar */}
        <div className="topbar">
          <div className="topbar-left">
            <div className="device-name">
              {activeDevice?.nickname || active}
              <span className="online-badge">ONLINE</span>
            </div>
            <div className="device-meta">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, verticalAlign: "middle" }}>
                <IconLocation size={13} strokeWidth={2} />
                {activeDevice?.nickname || "Device"} &nbsp;·&nbsp; {active}
              </span>
            </div>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">
              <span className="live-dot" />
              Live · {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            {devices.map(d => (
              <button key={d.device_id} className={`tab-btn ${active === d.device_id ? "active" : ""}`} onClick={() => setActive(d.device_id)}>
                {d.nickname || d.device_id}
              </button>
            ))}
          </div>
        </div>

        <div className="content">
          {/* Row 1: AQI + info cards */}
          <div className="row row-4" style={{ marginBottom: 16 }}>
            {aqi
              ? <AQIGauge aqi={aqi.aqi} category={aqi.category} />
              : <div className="aqi-card"><div className="aqi-value" style={{ color: "var(--muted)" }}>—</div><div className="aqi-desc">Waiting for data</div></div>
            }

            <div className="info-card">
              <div className="ic-label">Device Health</div>
              <div className="ic-status" style={{ color: "var(--good)" }}>
                <IconShield size={18} /> Operational
              </div>
              <div className="ic-sub">ID: {active}</div>
            </div>

            <div className="info-card">
              <div className="ic-label">Active Alerts</div>
              <div className="ic-main" style={{ color: activeAlerts > 0 ? "var(--moderate)" : "var(--text)" }}>
                <IconAlert size={22} /> {activeAlerts}
              </div>
              <div className="ic-sub">{activeAlerts === 0 ? "All parameters normal" : `${activeAlerts} alert${activeAlerts > 1 ? "s" : ""} active`}</div>
            </div>

            <OutdoorAQI indoorAqi={aqi?.aqi ?? null} onConfigure={() => navigate("/settings")} />
          </div>

          {/* Recommendations */}
          <div className="row" style={{ gridTemplateColumns: "1fr", marginBottom: 16 }}>
            <Recommendations reading={live} />
          </div>

          {/* PM10 threshold banner */}
          {pm10Alert && (
            <div style={{
              background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8,
              padding: "10px 16px", marginBottom: 16,
              display: "flex", alignItems: "center", gap: 10,
              fontSize: 13, color: "#fff",
            }}>
              <IconAlert size={16} />
              <strong>PM10 alert:</strong>&nbsp;concentration has exceeded {PM10_THRESHOLD} μg/m³ ({live?.pm10?.toFixed(1)} μg/m³)
            </div>
          )}

          {/* Row 2: Sensor readings */}
          <div className="section-hdr">
            <span className="sh-icon"><IconActivity size={15} /></span>
            <span className="sh-title">Live Sensor Readings</span>
          </div>
          <div className="row" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 20 }}>
            <SensorCard name="PM2.5 Particulates" value={live?.pm25}        unit="μg/m³" iconType="particle" color={pm25C}             status={pm25S}          statusColor={pm25C} />
            <SensorCard name="PM10 Particulates"  value={live?.pm10}        unit="μg/m³" iconType="particle" color={pm10C}             status={pm10S}          statusColor={pm10C} />
            <SensorCard name="PM1 Particulates"   value={live?.pm1}         unit="μg/m³" iconType="particle" color="var(--accent2)"    status="Fine"           statusColor="var(--accent2)" />
            <SensorCard name="PM4 Particulates"   value={live?.pm4}         unit="μg/m³" iconType="particle" color="var(--muted)"      status="Normal"         statusColor="var(--good)" />
            <SensorCard name="VOC Index"           value={live?.voc}         unit=""      iconType="env"      color={vocC}              status={vocS}           statusColor={vocC} />
            <SensorCard name="Temperature"         value={live?.temperature} unit="°C"    iconType="env"      color={tmpC}              status={tmpS}           statusColor={tmpC} />
            <SensorCard name="Relative Humidity"   value={live?.humidity}    unit="%"     iconType="env"      color={humC}              status={humS}           statusColor={humC} />
          </div>

          {/* Row 3: Charts */}
          <div className="row row-2">
            <div className="chart-card">
              <div className="cc-title">Particulate Matter — 24h</div>
              <div className="cc-sub">PM2.5 and PM10 concentrations (μg/m³)</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                  <XAxis dataKey="timestamp" tickFormatter={fmt} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v: any) => fmt(v)} />
                  <ReferenceLine y={35.4} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="pm25" stroke="#00d4b8" dot={false} strokeWidth={2} name="PM2.5" />
                  <Line type="monotone" dataKey="pm10" stroke="#818cf8" dot={false} strokeWidth={2} name="PM10" />
                </LineChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                <div className="leg-item"><div className="leg-line" style={{ background: "#00d4b8" }} /> PM2.5</div>
                <div className="leg-item"><div className="leg-line" style={{ background: "#818cf8" }} /> PM10</div>
                <div className="leg-item"><div className="leg-dash" style={{ borderColor: "#f59e0b" }} /> 35.4 threshold</div>
              </div>
            </div>

            <div className="chart-card">
              <div className="cc-title">VOC Index — 24h</div>
              <div className="cc-sub">Volatile organic compound index</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                  <XAxis dataKey="timestamp" tickFormatter={fmt} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v: any) => fmt(v)} />
                  <ReferenceLine y={150} stroke="#f59e0b" strokeDasharray="4 4" />
                  <ReferenceLine y={250} stroke="#ef4444" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="voc" stroke="#22c55e" dot={false} strokeWidth={2} name="VOC" />
                </LineChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                <div className="leg-item"><div className="leg-line" style={{ background: "#22c55e" }} /> VOC Index</div>
                <div className="leg-item"><div className="leg-dash" style={{ borderColor: "#f59e0b" }} /> 150 caution</div>
                <div className="leg-item"><div className="leg-dash" style={{ borderColor: "#ef4444" }} /> 250 critical</div>
              </div>
            </div>
          </div>

          <div className="row row-2" style={{ marginTop: 16 }}>
            <div className="chart-card">
              <div className="cc-title">Temperature & Humidity — 24h</div>
              <div className="cc-sub">Environmental comfort conditions</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                  <XAxis dataKey="timestamp" tickFormatter={fmt} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v: any) => fmt(v)} />
                  <Line type="monotone" dataKey="temperature" stroke="#38bdf8" dot={false} strokeWidth={2} name="Temp (°C)" />
                  <Line type="monotone" dataKey="humidity"    stroke="#818cf8" dot={false} strokeWidth={2} name="Humidity (%)" />
                </LineChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                <div className="leg-item"><div className="leg-line" style={{ background: "#38bdf8" }} /> Temperature (°C)</div>
                <div className="leg-item"><div className="leg-line" style={{ background: "#818cf8" }} /> Humidity (%)</div>
              </div>
            </div>

            <div className="chart-card">
              <div className="cc-title">AQI History — 24h</div>
              <div className="cc-sub">US EPA Air Quality Index</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={aqiHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                  <XAxis dataKey="timestamp" tickFormatter={fmt} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis domain={[0, 200]} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v: any) => fmt(v)} />
                  <ReferenceLine y={50}  stroke="#22c55e" strokeDasharray="4 4" />
                  <ReferenceLine y={100} stroke="#f59e0b" strokeDasharray="4 4" />
                  <ReferenceLine y={150} stroke="#ef4444" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="aqi" stroke="#00d4b8" dot={false} strokeWidth={2} name="AQI" />
                </LineChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                <div className="leg-item"><div className="leg-line" style={{ background: "#00d4b8" }} /> AQI</div>
                <div className="leg-item"><div className="leg-dash" style={{ borderColor: "#22c55e" }} /> 50 Good</div>
                <div className="leg-item"><div className="leg-dash" style={{ borderColor: "#f59e0b" }} /> 100 Moderate</div>
                <div className="leg-item"><div className="leg-dash" style={{ borderColor: "#ef4444" }} /> 150 Unhealthy</div>
              </div>
            </div>
          </div>

          {/* Achievements */}
          <div style={{ marginTop: 24 }}>
            <Achievements />
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="section-hdr">
                <span className="sh-icon"><IconAlert size={15} /></span>
                <span className="sh-title">Recent Alerts</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {alerts.slice(0, 5).map(a => (
                  <div key={a.id} style={{
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderLeft: "3px solid var(--moderate)", borderRadius: "0 8px 8px 0",
                    padding: "12px 16px",
                  }}>
                    <div style={{ fontSize: 13 }}>{a.message}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{new Date(a.timestamp).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
