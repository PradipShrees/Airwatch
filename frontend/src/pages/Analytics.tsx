import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import Sidebar from "../components/Sidebar";
import { IconList, IconDownload } from "../components/Icons";
import api from "../api";

interface Device { device_id: string; nickname: string | null; }
interface StatRow { metric: string; min: number; max: number; mean: number; count: number; }
interface DailyPoint { date: string; pm25_avg: number; pm10_avg: number; aqi_avg: number; temperature_avg: number; humidity_avg: number; }
interface HourlyPoint { hour: number; pm25: number; temperature: number; humidity: number; voc: number; }

const METRIC_LABELS: Record<string, string> = {
  pm1: "PM1", pm25: "PM2.5", pm4: "PM4", pm10: "PM10",
  temperature: "Temperature", humidity: "Humidity", voc: "VOC Index",
};
const METRIC_UNITS: Record<string, string> = {
  pm1: "μg/m³", pm25: "μg/m³", pm4: "μg/m³", pm10: "μg/m³",
  temperature: "°C", humidity: "%", voc: "",
};
const TOOLTIP_STYLE = { background: "#111827", border: "1px solid #1e2d45", borderRadius: 8, fontSize: 12 };
const RANGE_OPTIONS = [
  { label: "24 h",   hours: 24 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
];

export default function Analytics() {
  const [devices,    setDevices]    = useState<Device[]>([]);
  const [active,     setActive]     = useState<string | null>(null);
  const [userEmail,  setUserEmail]  = useState("");
  const [rangeIdx,   setRangeIdx]   = useState(0);
  const [stats,      setStats]      = useState<StatRow[]>([]);
  const [daily,      setDaily]      = useState<DailyPoint[]>([]);
  const [hourly,     setHourly]     = useState<HourlyPoint[]>([]);
  const [exporting,  setExporting]  = useState(false);

  useEffect(() => {
    api.get("/auth/me").then(({ data }) => setUserEmail(data.email));
    api.get<Device[]>("/devices").then(({ data }) => {
      setDevices(data);
      if (data.length > 0) setActive(data[0].device_id);
    });
  }, []);

  useEffect(() => {
    if (!active) return;
    const hours = RANGE_OPTIONS[rangeIdx].hours;
    const days  = Math.ceil(hours / 24);
    Promise.all([
      api.get<StatRow[]>(`/analytics/${active}/stats?hours=${hours}`),
      api.get<DailyPoint[]>(`/analytics/${active}/daily?days=${days}`),
      api.get<HourlyPoint[]>(`/analytics/${active}/hourly?days=${days}`),
    ]).then(([s, d, h]) => {
      setStats(s.data);
      setDaily(d.data);
      setHourly(h.data);
    });
  }, [active, rangeIdx]);

  async function downloadCSV() {
    if (!active) return;
    setExporting(true);
    try {
      const hours = RANGE_OPTIONS[rangeIdx].hours;
      const token = localStorage.getItem("token");
      const res   = await fetch(`/api/analytics/${active}/export?hours=${hours}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `airwatch_${active}_${hours}h.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar devices={devices} activeDevice={active} onSelect={setActive}
        onDeviceAdded={() => api.get<Device[]>("/devices").then(({ data }) => setDevices(data))}
        userEmail={userEmail} alertCount={0} />

      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="device-name">Analytics</div>
            <div className="device-meta">Historical trends and data export</div>
          </div>
          <div className="topbar-right">
            {RANGE_OPTIONS.map((r, i) => (
              <button key={r.label} className={`tab-btn ${rangeIdx === i ? "active" : ""}`} onClick={() => setRangeIdx(i)}>
                {r.label}
              </button>
            ))}
            <button className="btn btn-primary" style={{ padding: "7px 16px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={downloadCSV} disabled={exporting}>
              {exporting ? <span className="spinner" /> : <><IconDownload size={14} strokeWidth={2.2} /> Export CSV</>}
            </button>
          </div>
        </div>

        <div className="content">
          {/* Stats table */}
          <div className="section-hdr">
            <span className="sh-icon"><IconList size={15} /></span>
            <span className="sh-title">Summary Statistics — {RANGE_OPTIONS[rangeIdx].label}</span>
          </div>
          <div className="card" style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
                  {["Metric", "Min", "Max", "Mean", "Readings"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map((s, i) => (
                  <tr key={s.metric} style={{ borderBottom: i < stats.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600 }}>{METRIC_LABELS[s.metric] ?? s.metric}</td>
                    <td style={{ padding: "12px 16px", color: "var(--accent2)" }}>{s.min ?? "—"} <span style={{ color: "var(--muted)", fontSize: 11 }}>{METRIC_UNITS[s.metric]}</span></td>
                    <td style={{ padding: "12px 16px", color: "var(--unhealthy)" }}>{s.max ?? "—"} <span style={{ color: "var(--muted)", fontSize: 11 }}>{METRIC_UNITS[s.metric]}</span></td>
                    <td style={{ padding: "12px 16px", color: "var(--accent)" }}>{s.mean ?? "—"} <span style={{ color: "var(--muted)", fontSize: 11 }}>{METRIC_UNITS[s.metric]}</span></td>
                    <td style={{ padding: "12px 16px", color: "var(--muted)" }}>{s.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Daily trends */}
          <div className="row row-2" style={{ marginBottom: 16 }}>
            <div className="chart-card">
              <div className="cc-title">PM2.5 Daily Average</div>
              <div className="cc-sub">μg/m³ per day</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <ReferenceLine y={35.4} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Bar dataKey="pm25_avg" fill="#00d4b8" name="PM2.5 avg" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <div className="cc-title">AQI Daily Average</div>
              <div className="cc-sub">US EPA index per day</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <ReferenceLine y={50}  stroke="#22c55e" strokeDasharray="4 4" />
                  <ReferenceLine y={100} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Bar dataKey="aqi_avg" fill="#818cf8" name="AQI avg" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Hourly heatmap (avg by hour of day) */}
          <div className="row row-2">
            <div className="chart-card">
              <div className="cc-title">PM2.5 by Hour of Day</div>
              <div className="cc-sub">Average concentration at each hour — spots your worst times</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                  <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={h => `${h}:00`} />
                  <Bar dataKey="pm25" fill="#f97316" name="PM2.5 avg" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <div className="cc-title">Temperature & Humidity Trend</div>
              <div className="cc-sub">Daily averages over selected period</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="temperature_avg" stroke="#38bdf8" dot={false} strokeWidth={2} name="Temp (°C)" />
                  <Line type="monotone" dataKey="humidity_avg"    stroke="#818cf8" dot={false} strokeWidth={2} name="Humidity (%)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
