import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconAward, IconFire, IconSparkles, IconActivity, IconCheckCircle, IconTarget } from "./Icons";
import api from "../api";

interface Achievements {
  total_readings:  number;
  days_monitoring: number;
  current_streak:  number;
  longest_streak:  number;
  alerts_resolved: number;
  devices:         number;
  healthy_days:    number;
}

interface Badge {
  icon:   ReactElement;
  label:  string;
  value:  string;
  sub:    string;
  color:  string;
}

const fmt = (n: number) => n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();

function buildBadges(a: Achievements): Badge[] {
  return [
    {
      icon: <IconFire size={18} />, label: "Current Streak",
      value: `${a.current_streak}`, sub: a.current_streak === 1 ? "day of clean air" : "days of clean air",
      color: "#f97316",
    },
    {
      icon: <IconCheckCircle size={18} />, label: "Healthy Days",
      value: fmt(a.healthy_days), sub: "total days PM2.5 below 12",
      color: "#22c55e",
    },
    {
      icon: <IconActivity size={18} />, label: "Readings Collected",
      value: fmt(a.total_readings), sub: `over ${a.days_monitoring} day${a.days_monitoring === 1 ? "" : "s"}`,
      color: "#00d4b8",
    },
    {
      icon: <IconAward size={18} />, label: "Longest Streak",
      value: `${a.longest_streak}`, sub: "your best run",
      color: "#a855f7",
    },
    {
      icon: <IconTarget size={18} />, label: "Alerts Resolved",
      value: fmt(a.alerts_resolved), sub: "issues handled",
      color: "#0099ff",
    },
    {
      icon: <IconSparkles size={18} />, label: "Devices Linked",
      value: `${a.devices}`, sub: "monitoring spots",
      color: "#f59e0b",
    },
  ];
}

export default function Achievements() {
  const [data, setData] = useState<Achievements | null>(null);

  useEffect(() => {
    api.get<Achievements>("/achievements/me").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data) return null;

  const badges = buildBadges(data);

  return (
    <>
      <div className="section-hdr">
        <span className="sh-icon"><IconAward size={15} /></span>
        <span className="sh-title">Your Achievements</span>
      </div>
      <div className="row achievements-grid" style={{ marginBottom: 16 }}>
        {badges.map((b) => (
          <div key={b.label} className="card achievement-card">
            <div className="ach-ico" style={{ background: b.color + "22", color: b.color }}>{b.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ach-label">{b.label}</div>
              <div className="ach-value" style={{ color: b.color }}>{b.value}</div>
              <div className="ach-sub">{b.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
