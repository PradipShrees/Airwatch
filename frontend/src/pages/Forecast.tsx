import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell, LineChart, Line } from "recharts";
import Sidebar from "../components/Sidebar";
import { IconCloud, IconMapPin, IconArrowRight, IconDroplet, IconWind } from "../components/Icons";
import api from "../api";

interface Device { device_id: string; nickname: string | null; }
interface Hour {
  time: string;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  temperature: number | null;
  humidity: number | null;
  wind_speed: number | null;
  precipitation: number | null;
  weather_code: number | null;
}
interface Forecast { location_name: string | null; hours: Hour[]; }

const TOOLTIP_STYLE = { background: "#111827", border: "1px solid #1e2d45", borderRadius: 8, fontSize: 12 };

function aqiColor(aqi: number | null): string {
  if (aqi == null) return "#1e2d45";
  if (aqi <= 50)  return "#22c55e";
  if (aqi <= 100) return "#f59e0b";
  if (aqi <= 150) return "#f97316";
  if (aqi <= 200) return "#ef4444";
  if (aqi <= 300) return "#a855f7";
  return "#7f1d1d";
}

function weatherEmoji(code: number | null): string {
  if (code == null) return "•";
  if (code === 0) return "☀";
  if (code <= 3) return "⛅";
  if (code <= 49) return "🌫";
  if (code <= 67) return "🌧";
  if (code <= 77) return "🌨";
  if (code <= 82) return "🌧";
  if (code <= 99) return "⛈";
  return "•";
}

function formatHour(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:00`;
}
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function ForecastPage() {
  const navigate = useNavigate();
  const [devices,    setDevices]    = useState<Device[]>([]);
  const [active,     setActive]     = useState<string | null>(null);
  const [userEmail,  setUserEmail]  = useState("");
  const [forecast,   setForecast]   = useState<Forecast | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    api.get("/auth/me").then(({ data }) => setUserEmail(data.email));
    api.get<Device[]>("/devices").then(({ data }) => {
      setDevices(data);
      if (data.length > 0) setActive(data[0].device_id);
    });
    api.get<Forecast>("/weather/forecast")
      .then(({ data }) => { setForecast(data); setError(null); })
      .catch(e => setError(e.response?.data?.detail ?? "Failed to load forecast"))
      .finally(() => setLoading(false));
  }, []);

  // Group hours by day for the daily-summary strip
  const dailySummary = forecast ? (() => {
    const buckets: Record<string, Hour[]> = {};
    forecast.hours.forEach(h => {
      const day = h.time.slice(0, 10);
      (buckets[day] ||= []).push(h);
    });
    return Object.entries(buckets).map(([day, hours]) => {
      const aqis = hours.map(h => h.aqi).filter((v): v is number => v != null);
      const temps = hours.map(h => h.temperature).filter((v): v is number => v != null);
      const codes = hours.map(h => h.weather_code).filter((v): v is number => v != null);
      return {
        day,
        max_aqi: aqis.length ? Math.max(...aqis) : null,
        avg_aqi: aqis.length ? aqis.reduce((s, v) => s + v, 0) / aqis.length : null,
        max_temp: temps.length ? Math.max(...temps) : null,
        min_temp: temps.length ? Math.min(...temps) : null,
        weather_code: codes.length ? Math.round(codes.reduce((s, v) => s + v, 0) / codes.length) : null,
      };
    });
  })() : [];

  // Bar chart data
  const chartData = forecast ? forecast.hours.map(h => ({
    time: h.time,
    aqi: h.aqi ?? 0,
    pm25: h.pm25 ?? 0,
    temperature: h.temperature,
    humidity: h.humidity,
  })) : [];

  return (
    <div className="app-shell">
      <Sidebar devices={devices} activeDevice={active} onSelect={setActive}
        onDeviceAdded={() => api.get<Device[]>("/devices").then(({ data }) => setDevices(data))}
        userEmail={userEmail} alertCount={0} />

      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="device-name">Forecast</div>
            <div className="device-meta">
              {forecast?.location_name
                ? <>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, verticalAlign: "middle" }}>
                      <IconMapPin size={12} /> {forecast.location_name} · next 48 hours outdoors
                    </span>
                  </>
                : "Outdoor air quality for the next 48 hours"}
            </div>
          </div>
        </div>

        <div className="content">
          {loading ? (
            <div className="empty-state"><span className="spinner" style={{ borderColor: "rgba(255,255,255,0.2)", borderTopColor: "var(--accent)" }} /></div>
          ) : error ? (
            <div className="empty-state">
              <div className="es-icon"><IconCloud size={48} strokeWidth={1.5} /></div>
              <div className="es-title">{error}</div>
              <p>Set your location in Settings to enable forecasts.</p>
              <button className="btn btn-primary" style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8 }} onClick={() => navigate("/settings")}>
                <IconMapPin size={14} /> Set location <IconArrowRight size={12} />
              </button>
            </div>
          ) : forecast && (
            <>
              {/* Daily strip */}
              <div className="section-hdr">
                <span className="sh-icon"><IconCloud size={15} /></span>
                <span className="sh-title">Daily Outlook</span>
              </div>
              <div className="row" style={{ gridTemplateColumns: `repeat(${Math.min(dailySummary.length, 3)}, 1fr)`, marginBottom: 20 }}>
                {dailySummary.slice(0, 3).map(d => (
                  <div key={d.day} className="info-card">
                    <div className="ic-label">{formatDay(d.day)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
                      <div style={{ fontSize: 32 }}>{weatherEmoji(d.weather_code)}</div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: aqiColor(d.max_aqi) }}>
                          AQI {d.max_aqi != null ? Math.round(d.max_aqi) : "—"}
                        </div>
                        <div className="ic-sub">
                          {d.min_temp != null && d.max_temp != null
                            ? `${Math.round(d.min_temp)}° – ${Math.round(d.max_temp)}°C`
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Hourly AQI */}
              <div className="row row-2">
                <div className="chart-card">
                  <div className="cc-title">Hourly AQI</div>
                  <div className="cc-sub">Color-coded by US EPA bands · next 48 hours</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                      <XAxis dataKey="time" tickFormatter={formatHour} tick={{ fontSize: 10, fill: "#64748b" }} interval={5} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v: any) => formatHour(v as string)} />
                      <ReferenceLine y={50}  stroke="#22c55e" strokeDasharray="4 4" />
                      <ReferenceLine y={100} stroke="#f59e0b" strokeDasharray="4 4" />
                      <ReferenceLine y={150} stroke="#ef4444" strokeDasharray="4 4" />
                      <Bar dataKey="aqi" radius={[3,3,0,0]}>
                        {chartData.map((p, i) => <Cell key={i} fill={aqiColor(p.aqi)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-card">
                  <div className="cc-title">Temperature & Humidity</div>
                  <div className="cc-sub">Outdoor conditions</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                      <XAxis dataKey="time" tickFormatter={formatHour} tick={{ fontSize: 10, fill: "#64748b" }} interval={5} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v: any) => formatHour(v as string)} />
                      <Line type="monotone" dataKey="temperature" stroke="#38bdf8" dot={false} strokeWidth={2} name="Temp (°C)" />
                      <Line type="monotone" dataKey="humidity"    stroke="#818cf8" dot={false} strokeWidth={2} name="Humidity (%)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Hourly table summary */}
              <div className="section-hdr" style={{ marginTop: 20 }}>
                <span className="sh-icon"><IconWind size={15} /></span>
                <span className="sh-title">Hour-by-Hour</span>
              </div>
              <div className="card scroll-x-hint" style={{ padding: 0 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
                      {["Time", "AQI", "PM2.5", "Temp", "Humidity", "Wind", "Rain"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.hours.slice(0, 24).map((h, i) => (
                      <tr key={i} style={{ borderBottom: i < 23 ? "1px solid var(--border)" : "none" }}>
                        <td style={{ padding: "8px 14px", fontWeight: 600 }}>{formatHour(h.time)}</td>
                        <td style={{ padding: "8px 14px", color: aqiColor(h.aqi), fontWeight: 700 }}>{h.aqi != null ? Math.round(h.aqi) : "—"}</td>
                        <td style={{ padding: "8px 14px" }}>{h.pm25?.toFixed(1) ?? "—"}</td>
                        <td style={{ padding: "8px 14px" }}>{h.temperature?.toFixed(0) ?? "—"}°</td>
                        <td style={{ padding: "8px 14px" }}>{h.humidity?.toFixed(0) ?? "—"}%</td>
                        <td style={{ padding: "8px 14px" }}>{h.wind_speed?.toFixed(0) ?? "—"} km/h</td>
                        <td style={{ padding: "8px 14px" }}>{h.precipitation != null && h.precipitation > 0 ? <span><IconDroplet size={11}/> {h.precipitation.toFixed(1)}mm</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
