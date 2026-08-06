import type { ReactElement } from "react";
import { IconLightbulb, IconCheck, IconAlert, IconDroplet, IconThermometer, IconWind, IconRefresh } from "./Icons";

interface Reading {
  pm25: number; pm10: number; voc: number;
  temperature: number; humidity: number;
}

interface Rec {
  severity: "good" | "info" | "warn" | "bad";
  icon: ReactElement;
  title: string;
  action: string;
}

function build(r: Reading | null): Rec[] {
  if (!r) return [];
  const recs: Rec[] = [];

  // PM2.5
  if (r.pm25 > 55) {
    recs.push({ severity: "bad", icon: <IconAlert size={16} />, title: "PM2.5 unhealthy",
      action: "Turn on air purifier on high. Avoid burning candles, cooking with high heat. Keep windows closed if outdoor AQI is worse." });
  } else if (r.pm25 > 35) {
    recs.push({ severity: "warn", icon: <IconWind size={16} />, title: "PM2.5 elevated",
      action: "Run an air purifier and reduce indoor sources (incense, frying, dust)." });
  } else if (r.pm25 > 12) {
    recs.push({ severity: "info", icon: <IconWind size={16} />, title: "PM2.5 moderate",
      action: "Acceptable, but consider a purifier if anyone in the household is sensitive." });
  }

  // VOC
  if (r.voc > 300) {
    recs.push({ severity: "bad", icon: <IconAlert size={16} />, title: "VOC very high",
      action: "Open windows immediately. Check for off-gassing furniture, paint, cleaning products, or solvents." });
  } else if (r.voc > 200) {
    recs.push({ severity: "warn", icon: <IconRefresh size={16} />, title: "VOC elevated",
      action: "Ventilate the room — open a window for 10–15 minutes." });
  }

  // Humidity
  if (r.humidity < 30) {
    recs.push({ severity: "info", icon: <IconDroplet size={16} />, title: "Air is dry",
      action: `Humidity ${r.humidity.toFixed(0)}% is below the comfort zone. A humidifier or houseplants will help.` });
  } else if (r.humidity > 65) {
    recs.push({ severity: "warn", icon: <IconDroplet size={16} />, title: "Humidity high",
      action: `Humidity ${r.humidity.toFixed(0)}% — risk of mold and dust mites. Run AC or a dehumidifier.` });
  }

  // Temperature
  if (r.temperature < 18) {
    recs.push({ severity: "info", icon: <IconThermometer size={16} />, title: "Room is cool",
      action: `${r.temperature.toFixed(1)}°C is below comfort range. Consider warming up.` });
  } else if (r.temperature > 28) {
    recs.push({ severity: "warn", icon: <IconThermometer size={16} />, title: "Room is hot",
      action: `${r.temperature.toFixed(1)}°C — turn on AC or fan to cool down.` });
  }

  if (recs.length === 0) {
    recs.push({ severity: "good", icon: <IconCheck size={16} />, title: "Everything looks great",
      action: "Air quality is healthy across all metrics. Keep doing what you're doing!" });
  }

  return recs;
}

const colorFor = (s: Rec["severity"]) => ({
  good: "var(--good)", info: "var(--accent2)", warn: "var(--moderate)", bad: "var(--unhealthy)",
}[s]);

export default function Recommendations({ reading }: { reading: Reading | null }) {
  const recs = build(reading);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ color: "var(--accent)", display: "inline-flex" }}><IconLightbulb size={16} /></span>
        <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)" }}>
          Smart Recommendations
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {recs.map((r, i) => {
          const c = colorFor(r.severity);
          return (
            <div key={i} style={{
              display: "flex", gap: 12, padding: "14px 18px",
              borderTop: i > 0 ? "1px solid var(--border)" : "none",
              borderLeft: `3px solid ${c}`,
            }}>
              <div style={{ color: c, flexShrink: 0, marginTop: 2 }}>{r.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: c, marginBottom: 3 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: "var(--text)", opacity: 0.85, lineHeight: 1.55 }}>{r.action}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
