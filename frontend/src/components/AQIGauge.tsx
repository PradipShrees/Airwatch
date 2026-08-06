interface Props { aqi: number; category: string; }

const AQI_ZONES = [
  { from: 0,   to: 50,  color: "#22c55e", desc: "Air quality is satisfactory." },
  { from: 50,  to: 100, color: "#f59e0b", desc: "Acceptable air quality." },
  { from: 100, to: 150, color: "#f97316", desc: "Sensitive groups may experience effects." },
  { from: 150, to: 200, color: "#ef4444", desc: "Everyone may experience effects." },
  { from: 200, to: 300, color: "#a855f7", desc: "Health alert for everyone." },
  { from: 300, to: 500, color: "#7f1d1d", desc: "Emergency health conditions." },
];

function getColor(aqi: number) {
  return AQI_ZONES.find(z => aqi <= z.to)?.color ?? "#7f1d1d";
}
function getDesc(aqi: number) {
  return AQI_ZONES.find(z => aqi <= z.to)?.desc ?? "";
}

// Geometry: 240° arc from lower-left (210°) over top to right (450°=90°)
// CY=76 and R=68 chosen so the arc bottom at 210° lands at y≈134.9 — fits in H=140
const CX = 100, CY = 76, R = 68;
const START = 210, SWEEP = 240;

function deg2xy(deg: number, r: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function arc(a: number, b: number, r: number) {
  const s = deg2xy(a, r), e = deg2xy(b, r);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

function aqiAngle(v: number) {
  return START + (Math.min(Math.max(v, 0), 500) / 500) * SWEEP;
}

export default function AQIGauge({ aqi, category }: Props) {
  const color   = getColor(aqi);
  const desc    = getDesc(aqi);
  const angle   = aqiAngle(aqi);

  // Needle tip: slightly inside arc so the round cap aligns with the track
  const tip     = deg2xy(angle, R - 2);
  // Needle base wings for a tapered look
  const base    = deg2xy(angle + 90, 5);
  const baseOpp = deg2xy(angle - 90, 5);

  return (
    <div className="aqi-card">
      <div className="aqi-gauge-wrap">
        <svg width="200" height="140" viewBox="0 0 200 140" style={{ display: "block", overflow: "visible" }}>
          {/* Zone segments on the track (dim background) */}
          {AQI_ZONES.map(z => (
            <path
              key={z.from}
              d={arc(aqiAngle(z.from), aqiAngle(z.to), R)}
              fill="none"
              stroke={z.color}
              strokeWidth="11"
              strokeLinecap="butt"
              opacity="0.18"
            />
          ))}

          {/* Active fill arc */}
          {aqi > 0 && (
            <path
              d={arc(START, angle, R)}
              fill="none"
              stroke={color}
              strokeWidth="11"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${color}90)` }}
            />
          )}

          {/* Needle */}
          <polygon
            points={`${tip.x},${tip.y} ${base.x},${base.y} ${baseOpp.x},${baseOpp.y}`}
            fill={color}
            opacity="0.95"
          />
          {/* Pivot */}
          <circle cx={CX} cy={CY} r="6" fill={color} />
          <circle cx={CX} cy={CY} r="3" style={{ fill: "var(--surface)" }} />
        </svg>

        {/* AQI number — anchored at the bottom of the gauge, in the open gap */}
        <div style={{
          position: "absolute",
          bottom: 0, left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
          pointerEvents: "none",
          lineHeight: 1,
        }}>
          <div className="aqi-value" style={{ color }}>{aqi}</div>
        </div>
      </div>

      <div className="aqi-category" style={{ color }}>{category}</div>
      <div className="aqi-desc">{desc}</div>
    </div>
  );
}
