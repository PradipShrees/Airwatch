interface Props {
  name: string;
  value: number | null | undefined;
  unit: string;
  iconType: "particle" | "env";
  color: string;
  status: string;
  statusColor: string;
}

function ParticleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <circle cx="5"  cy="5"  r="2.2" opacity="0.45" />
      <circle cx="13" cy="4"  r="1.5" opacity="0.65" />
      <circle cx="10" cy="12" r="3"   opacity="1"    />
      <circle cx="4"  cy="13" r="1.5" opacity="0.55" />
    </svg>
  );
}

function EnvIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="9" r="2.2" fill="currentColor" />
    </svg>
  );
}

export default function SensorCard({ name, value, unit, iconType, color, status, statusColor }: Props) {
  return (
    <div className="reading-card">
      <div className="rc-header">
        <span className="rc-icon">
          {iconType === "particle" ? <ParticleIcon /> : <EnvIcon />}
        </span>
        <span className="status-badge" style={{ background: statusColor + "20", color: statusColor }}>
          {status}
        </span>
      </div>
      <div className="rc-name">{name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span className="rc-value" style={{ color }}>{value != null ? value.toFixed(1) : "—"}</span>
        <span className="rc-unit">{unit}</span>
      </div>
    </div>
  );
}
