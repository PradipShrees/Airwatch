import { useEffect, useState } from "react";
import { IconCloud, IconMapPin, IconArrowRight } from "./Icons";
import api from "../api";

interface Outdoor {
  location_name: string | null;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  temperature: number | null;
  humidity: number | null;
  wind_speed: number | null;
}

function aqiCategory(aqi: number): { label: string; color: string } {
  if (aqi <= 50)  return { label: "Good",                  color: "#22c55e" };
  if (aqi <= 100) return { label: "Moderate",              color: "#f59e0b" };
  if (aqi <= 150) return { label: "Unhealthy (sensitive)", color: "#f97316" };
  if (aqi <= 200) return { label: "Unhealthy",             color: "#ef4444" };
  if (aqi <= 300) return { label: "Very unhealthy",        color: "#a855f7" };
  return                 { label: "Hazardous",             color: "#7f1d1d" };
}

interface Props { indoorAqi: number | null; onConfigure: () => void; }

export default function OutdoorAQI({ indoorAqi, onConfigure }: Props) {
  const [data,    setData]    = useState<Outdoor | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get<Outdoor>("/weather/outdoor")
      .then(({ data }) => { if (alive) { setData(data); setError(null); } })
      .catch((e) => { if (alive) setError(e.response?.data?.detail ?? "Failed to load"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="info-card" style={{ minHeight: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="spinner" style={{ borderColor: "rgba(255,255,255,0.2)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  if (error || !data || data.aqi == null) {
    return (
      <div className="info-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 140 }}>
        <div>
          <div className="ic-label">Outdoor Air Quality</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, color: "var(--muted)" }}>
            <IconCloud size={18} />
            <span style={{ fontSize: 13 }}>{error || "No location set"}</span>
          </div>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: "8px 12px", display: "inline-flex", alignItems: "center", gap: 6 }} onClick={onConfigure}>
          <IconMapPin size={14} /> Set location <IconArrowRight size={12} />
        </button>
      </div>
    );
  }

  const aqi = Math.round(data.aqi);
  const cat = aqiCategory(aqi);
  const delta = (indoorAqi != null && indoorAqi > 0) ? aqi - indoorAqi : null;

  return (
    <div className="info-card" style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 140 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="ic-label">Outdoor AQI</div>
        <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <IconMapPin size={11} /> {data.location_name || "Your location"}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: cat.color, lineHeight: 1 }}>{aqi}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: cat.color }}>{cat.label}</div>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
        {data.pm25 != null && <span>PM2.5 {data.pm25.toFixed(1)} µg/m³</span>}
        {data.temperature != null && <span>{data.temperature.toFixed(0)}°C</span>}
        {data.wind_speed != null && <span>Wind {data.wind_speed.toFixed(0)} km/h</span>}
      </div>
      {delta != null && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: "auto", paddingTop: 4 }}>
          {delta > 5 ? `Indoor is ${delta} pts better — keep windows closed` :
           delta < -5 ? `Outdoor is ${-delta} pts better — consider airing out` :
                       "Indoor and outdoor are about the same"}
        </div>
      )}
    </div>
  );
}
