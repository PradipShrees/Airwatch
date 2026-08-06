import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from "recharts";
import Sidebar from "../components/Sidebar";
import { IconLightbulb, IconClock, IconCalendar, IconTrending, IconCheckCircle, IconAlert, IconSparkles } from "../components/Icons";
import api from "../api";

interface Device { device_id: string; nickname: string | null; }

interface HourPt { hour: number; pm25: number; n: number; }
interface DowPt  { dow: number; day: string; pm25: number; }
interface Insights {
  hourly:          HourPt[];
  dow:             DowPt[];
  healthy_pct_7d:  number;
  healthy_pct_30d: number;
  this_wk_avg:     number | null;
  last_wk_avg:     number | null;
  delta_pct:       number | null;
  peak_hour:       HourPt | null;
  best_hour:       HourPt | null;
  worst_dow:       DowPt | null;
  best_dow:        DowPt | null;
  avg_voc_7d:      number | null;
  avg_hum_7d:      number | null;
  avg_temp_7d:     number | null;
  samples_30d:     number;
}

const TOOLTIP_STYLE = { background: "#111827", border: "1px solid #1e2d45", borderRadius: 8, fontSize: 12 };
const fmtHour = (h: number) => `${String(h).padStart(2,"0")}:00`;

function aqiColor(pm: number): string {
  if (pm <= 12)  return "#22c55e";
  if (pm <= 35)  return "#f59e0b";
  if (pm <= 55)  return "#f97316";
  if (pm <= 150) return "#ef4444";
  return "#a855f7";
}

export default function InsightsPage() {
  const [devices,    setDevices]    = useState<Device[]>([]);
  const [active,     setActive]     = useState<string | null>(null);
  const [userEmail,  setUserEmail]  = useState("");
  const [data,       setData]       = useState<Insights | null>(null);
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    api.get("/auth/me").then(({ data }) => setUserEmail(data.email));
    api.get<Device[]>("/devices").then(({ data }) => {
      setDevices(data);
      if (data.length > 0) setActive(data[0].device_id);
    });
  }, []);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    api.get<Insights>(`/insights/${active}`).then(({ data }) => setData(data)).finally(() => setLoading(false));
  }, [active]);

  // Build narrative insight cards from data
  function buildCards(d: Insights): { icon: any; title: string; body: string; color: string }[] {
    const cards = [];

    cards.push({
      icon: <IconCheckCircle size={18} />,
      title: `Healthy ${d.healthy_pct_7d}% of the last 7 days`,
      body: d.healthy_pct_30d !== d.healthy_pct_7d
            ? `30-day average: ${d.healthy_pct_30d}% — ${d.healthy_pct_7d > d.healthy_pct_30d ? "this week is better" : "this week is worse"} than your norm.`
            : `Steady performance over the last month.`,
      color: d.healthy_pct_7d >= 80 ? "var(--good)" : d.healthy_pct_7d >= 60 ? "var(--moderate)" : "var(--unhealthy)",
    });

    if (d.delta_pct != null && d.this_wk_avg != null && d.last_wk_avg != null) {
      const improving = d.delta_pct < 0;
      cards.push({
        icon: <IconTrending size={18} />,
        title: improving ? `PM2.5 down ${Math.abs(d.delta_pct)}% vs. last week` : `PM2.5 up ${d.delta_pct}% vs. last week`,
        body: `This week: ${d.this_wk_avg} µg/m³ avg · Last week: ${d.last_wk_avg} µg/m³.`,
        color: improving ? "var(--good)" : "var(--moderate)",
      });
    }

    if (d.peak_hour && d.best_hour && d.peak_hour.pm25 - d.best_hour.pm25 > 2) {
      cards.push({
        icon: <IconClock size={18} />,
        title: `Worst air around ${fmtHour(d.peak_hour.hour)}`,
        body: `Average PM2.5 peaks at ${d.peak_hour.pm25} µg/m³ at ${fmtHour(d.peak_hour.hour)} and is cleanest (${d.best_hour.pm25}) around ${fmtHour(d.best_hour.hour)}. Cooking or evening activity may be a trigger.`,
        color: "var(--accent2)",
      });
    }

    if (d.worst_dow && d.best_dow && d.worst_dow.pm25 - d.best_dow.pm25 > 2) {
      cards.push({
        icon: <IconCalendar size={18} />,
        title: `${d.worst_dow.day}s are your worst day`,
        body: `${d.worst_dow.day} avg ${d.worst_dow.pm25} µg/m³ vs. ${d.best_dow.day} at ${d.best_dow.pm25}.`,
        color: "var(--accent2)",
      });
    }

    if (d.avg_voc_7d != null && d.avg_voc_7d > 200) {
      cards.push({
        icon: <IconAlert size={18} />,
        title: `VOC trending high (${d.avg_voc_7d} avg)`,
        body: `7-day average VOC index is above the comfortable threshold. Check for off-gassing materials or ventilate more.`,
        color: "var(--unhealthy)",
      });
    }

    if (d.avg_hum_7d != null && (d.avg_hum_7d < 30 || d.avg_hum_7d > 65)) {
      cards.push({
        icon: <IconAlert size={18} />,
        title: d.avg_hum_7d < 30 ? `Air is consistently dry (${d.avg_hum_7d}%)` : `Humidity is consistently high (${d.avg_hum_7d}%)`,
        body: d.avg_hum_7d < 30
          ? `Below 30% for the last week — consider a humidifier for comfort.`
          : `Above 65% for the last week — risk of mold; consider a dehumidifier.`,
        color: "var(--moderate)",
      });
    }

    cards.push({
      icon: <IconSparkles size={18} />,
      title: `${d.samples_30d.toLocaleString()} readings analyzed`,
      body: `Insights are based on the last 30 days of sensor data from this device.`,
      color: "var(--accent)",
    });

    return cards;
  }

  return (
    <div className="app-shell">
      <Sidebar devices={devices} activeDevice={active} onSelect={setActive}
        onDeviceAdded={() => api.get<Device[]>("/devices").then(({ data }) => setDevices(data))}
        userEmail={userEmail} alertCount={0} />

      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="device-name">Insights</div>
            <div className="device-meta">Patterns and findings from your sensor data</div>
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
          {loading || !data ? (
            <div className="empty-state"><span className="spinner" style={{ borderColor: "rgba(255,255,255,0.2)", borderTopColor: "var(--accent)" }} /></div>
          ) : data.samples_30d < 24 ? (
            <div className="empty-state">
              <div className="es-icon"><IconLightbulb size={48} strokeWidth={1.5} /></div>
              <div className="es-title">Not enough data yet</div>
              <p>Keep your sensor running for at least a day to unlock insights.</p>
            </div>
          ) : (
            <>
              {/* Narrative cards */}
              <div className="section-hdr">
                <span className="sh-icon"><IconLightbulb size={15} /></span>
                <span className="sh-title">Findings</span>
              </div>
              <div className="row row-2" style={{ marginBottom: 24 }}>
                {buildCards(data).map((c, i) => (
                  <div key={i} className="card" style={{ borderLeft: `3px solid ${c.color}` }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ color: c.color, marginTop: 2 }}>{c.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: c.color, marginBottom: 4 }}>{c.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text)", opacity: 0.85, lineHeight: 1.55 }}>{c.body}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Hourly + DOW patterns */}
              <div className="row row-2">
                <div className="chart-card">
                  <div className="cc-title">PM2.5 by Hour of Day</div>
                  <div className="cc-sub">Average across the last 30 days · color shows AQI band</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.hourly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                      <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(h) => `${h}:00`} />
                      <ReferenceLine y={12} stroke="#22c55e" strokeDasharray="4 4" />
                      <ReferenceLine y={35} stroke="#f59e0b" strokeDasharray="4 4" />
                      <Bar dataKey="pm25" radius={[3,3,0,0]}>
                        {data.hourly.map((p, i) => <Cell key={i} fill={aqiColor(p.pm25)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-card">
                  <div className="cc-title">PM2.5 by Day of Week</div>
                  <div className="cc-sub">Which days does the air struggle?</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.dow}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(d) => d.slice(0,3)} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <ReferenceLine y={12} stroke="#22c55e" strokeDasharray="4 4" />
                      <Bar dataKey="pm25" radius={[3,3,0,0]}>
                        {data.dow.map((p, i) => <Cell key={i} fill={aqiColor(p.pm25)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
