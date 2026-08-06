import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import { IconCalendar } from "../components/Icons";
import api from "../api";

interface Device { device_id: string; nickname: string | null; }
interface DailyPoint { date: string; pm25_avg: number; pm10_avg: number; aqi_avg: number; temperature_avg: number; humidity_avg: number; }

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEKDAYS    = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const COLOR_SCALE = [
  { max: 0,   color: "var(--surface2)",     label: "No data" },
  { max: 50,  color: "#22c55e", label: "Good" },
  { max: 100, color: "#f59e0b", label: "Moderate" },
  { max: 150, color: "#f97316", label: "Unhealthy (sensitive)" },
  { max: 200, color: "#ef4444", label: "Unhealthy" },
  { max: 500, color: "#a855f7", label: "Very unhealthy" },
];

function aqiColor(aqi: number | null | undefined): string {
  if (aqi == null || aqi === 0) return "var(--surface2)";
  for (const s of COLOR_SCALE) if (s.max && aqi <= s.max) return s.color;
  return "#7f1d1d";
}

interface Cell { date: Date; aqi: number | null; pm25: number | null; }

export default function HistoryPage() {
  const [devices,    setDevices]    = useState<Device[]>([]);
  const [active,     setActive]     = useState<string | null>(null);
  const [userEmail,  setUserEmail]  = useState("");
  const [daily,      setDaily]      = useState<DailyPoint[]>([]);
  const [hover,      setHover]      = useState<Cell | null>(null);

  useEffect(() => {
    api.get("/auth/me").then(({ data }) => setUserEmail(data.email));
    api.get<Device[]>("/devices").then(({ data }) => {
      setDevices(data);
      if (data.length > 0) setActive(data[0].device_id);
    });
  }, []);

  useEffect(() => {
    if (!active) return;
    api.get<DailyPoint[]>(`/analytics/${active}/daily?days=365`).then(({ data }) => setDaily(data));
  }, [active]);

  // Build 365-day grid (sun-start columns).
  const grid = useMemo(() => {
    const dataByDate = new Map<string, DailyPoint>();
    daily.forEach(d => dataByDate.set(d.date, d));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 364);
    // Roll back to the previous Sunday so columns are full weeks
    start.setDate(start.getDate() - start.getDay());

    const cells: Cell[] = [];
    const cursor = new Date(start);
    while (cursor <= today) {
      const key = cursor.toISOString().slice(0, 10);
      const p   = dataByDate.get(key);
      cells.push({
        date: new Date(cursor),
        aqi:  p?.aqi_avg ?? null,
        pm25: p?.pm25_avg ?? null,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return cells;
  }, [daily]);

  // Group into 7-row columns (week columns)
  const weeks: Cell[][] = useMemo(() => {
    const out: Cell[][] = [];
    for (let i = 0; i < grid.length; i += 7) out.push(grid.slice(i, i + 7));
    return out;
  }, [grid]);

  // Compute month labels positions
  const monthLabels: { col: number; label: string }[] = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    weeks.forEach((wk, ci) => {
      const firstOfMonth = wk.find(c => c.date.getDate() <= 7);
      if (firstOfMonth) {
        const m = firstOfMonth.date.getMonth();
        if (!labels.length || labels[labels.length - 1].label !== MONTH_NAMES[m]) {
          labels.push({ col: ci, label: MONTH_NAMES[m] });
        }
      }
    });
    return labels;
  }, [weeks]);

  // Stats summary
  const stats = useMemo(() => {
    const valid = grid.filter(c => c.aqi != null && c.aqi > 0);
    if (valid.length === 0) return { tracked: 0, healthy: 0, moderate: 0, unhealthy: 0, avgAqi: null as number | null };
    const tracked   = valid.length;
    const healthy   = valid.filter(c => (c.aqi ?? 0) <= 50).length;
    const moderate  = valid.filter(c => (c.aqi ?? 0) > 50 && (c.aqi ?? 0) <= 100).length;
    const unhealthy = valid.filter(c => (c.aqi ?? 0) > 100).length;
    const avgAqi    = valid.reduce((s, c) => s + (c.aqi ?? 0), 0) / valid.length;
    return { tracked, healthy, moderate, unhealthy, avgAqi };
  }, [grid]);

  return (
    <div className="app-shell">
      <Sidebar devices={devices} activeDevice={active} onSelect={setActive}
        onDeviceAdded={() => api.get<Device[]>("/devices").then(({ data }) => setDevices(data))}
        userEmail={userEmail} alertCount={0} />

      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="device-name">History</div>
            <div className="device-meta">365-day air quality at a glance</div>
          </div>
          <div className="topbar-right">
            {devices.map(d => (
              <button key={d.device_id} className={`tab-btn ${active === d.device_id ? "active":""}`} onClick={() => setActive(d.device_id)}>
                {d.nickname || d.device_id}
              </button>
            ))}
          </div>
        </div>

        <div className="content">
          {/* Summary chips */}
          <div className="row row-4" style={{ marginBottom: 16 }}>
            <div className="info-card">
              <div className="ic-label">Days Tracked</div>
              <div className="ic-main" style={{ color: "var(--accent)" }}>{stats.tracked}</div>
              <div className="ic-sub">of last 365</div>
            </div>
            <div className="info-card">
              <div className="ic-label">Good Days</div>
              <div className="ic-main" style={{ color: "var(--good)" }}>{stats.healthy}</div>
              <div className="ic-sub">AQI ≤ 50</div>
            </div>
            <div className="info-card">
              <div className="ic-label">Moderate Days</div>
              <div className="ic-main" style={{ color: "var(--moderate)" }}>{stats.moderate}</div>
              <div className="ic-sub">AQI 51–100</div>
            </div>
            <div className="info-card">
              <div className="ic-label">Unhealthy Days</div>
              <div className="ic-main" style={{ color: "var(--unhealthy)" }}>{stats.unhealthy}</div>
              <div className="ic-sub">AQI &gt; 100</div>
            </div>
          </div>

          <div className="section-hdr">
            <span className="sh-icon"><IconCalendar size={15} /></span>
            <span className="sh-title">Calendar Heatmap{stats.avgAqi != null && ` · Avg AQI ${stats.avgAqi.toFixed(0)}`}</span>
          </div>

          <div className="card scroll-x-hint" style={{ padding: 20 }}>
            <div className="heatmap-wrap">
              {/* Month labels row */}
              <div className="heatmap-months">
                {monthLabels.map((m, i) => (
                  <div key={i} className="heatmap-month" style={{ gridColumnStart: m.col + 2 }}>{m.label}</div>
                ))}
              </div>

              {/* Weekday + cells */}
              <div className="heatmap-grid">
                <div className="heatmap-weekdays">
                  {WEEKDAYS.map((d, i) => (
                    <div key={i} className="heatmap-weekday" style={{ visibility: i % 2 === 1 ? "visible" : "hidden" }}>{d}</div>
                  ))}
                </div>

                <div className="heatmap-cells">
                  {weeks.map((wk, ci) => (
                    <div key={ci} className="heatmap-col">
                      {wk.map((cell, ri) => (
                        <div
                          key={ri}
                          className="heatmap-cell"
                          style={{ background: aqiColor(cell.aqi) }}
                          onMouseEnter={() => setHover(cell)}
                          onMouseLeave={() => setHover(null)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", minHeight: 18 }}>
                {hover ? (
                  hover.aqi != null && hover.aqi > 0
                    ? <>{hover.date.toDateString()} · AQI <strong style={{ color: aqiColor(hover.aqi) }}>{hover.aqi.toFixed(0)}</strong> · PM2.5 {hover.pm25?.toFixed(1)} µg/m³</>
                    : <>{hover.date.toDateString()} · no data</>
                ) : (
                  "Hover a square for details"
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--muted)" }}>
                <span>Less</span>
                {COLOR_SCALE.slice(1).map((s, i) => <div key={i} className="heatmap-cell" style={{ background: s.color, width: 14, height: 14 }} />)}
                <span>More</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
