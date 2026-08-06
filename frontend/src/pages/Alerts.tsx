import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { IconAlert, IconPlus, IconList, IconCheckCircle, IconClipboard } from "../components/Icons";
import api from "../api";

interface Device { device_id: string; nickname: string | null; }
interface AlertItem { id: number; device_id: string; timestamp: string; type: string; message: string; threshold: number; value: number; resolved: boolean; }
interface AlertRule { id: number; device_id: string; metric: string; operator: string; threshold: number; enabled: boolean; }

const METRICS = ["pm25","pm10","pm1","pm4","voc","temperature","humidity","aqi"];
const METRIC_LABELS: Record<string,string> = {
  pm25:"PM2.5", pm10:"PM10", pm1:"PM1", pm4:"PM4",
  voc:"VOC Index", temperature:"Temperature", humidity:"Humidity", aqi:"AQI",
};
const METRIC_UNITS: Record<string,string> = {
  pm25:"μg/m³", pm10:"μg/m³", pm1:"μg/m³", pm4:"μg/m³",
  voc:"", temperature:"°C", humidity:"%", aqi:"",
};
const TYPE_COLORS: Record<string,string> = {
  hazardous:"#7f1d1d", very_unhealthy:"#a855f7",
  unhealthy:"#ef4444", unhealthy_sensitive:"#f97316", moderate:"#f59e0b",
};

export default function Alerts() {
  const [devices,   setDevices]   = useState<Device[]>([]);
  const [active,    setActive]    = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [history,   setHistory]   = useState<AlertItem[]>([]);
  const [rules,     setRules]     = useState<AlertRule[]>([]);
  const [tab,       setTab]       = useState<"history"|"rules">("history");

  // Rule form
  const [rDevice,    setRDevice]    = useState("");
  const [rMetric,    setRMetric]    = useState("pm25");
  const [rOperator,  setROperator]  = useState("gt");
  const [rThreshold, setRThreshold] = useState("");
  const [rError,     setRError]     = useState("");
  const [rLoading,   setRLoading]   = useState(false);

  useEffect(() => {
    api.get("/auth/me").then(({ data }) => setUserEmail(data.email));
    api.get<Device[]>("/devices").then(({ data }) => {
      setDevices(data);
      if (data.length > 0) { setActive(data[0].device_id); setRDevice(data[0].device_id); }
    });
  }, []);

  useEffect(() => {
    loadHistory();
    loadRules();
  }, [active]);

  async function loadHistory() {
    const params = active ? `?device_id=${active}&limit=50` : "?limit=50";
    const { data } = await api.get<AlertItem[]>(`/alerts/history${params}`);
    setHistory(data);
  }
  async function loadRules() {
    const { data } = await api.get<AlertRule[]>("/alerts/rules");
    setRules(data);
  }

  async function resolveAlert(id: number) {
    await api.put(`/alerts/history/${id}/resolve`);
    setHistory(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
  }

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setRError("");
    setRLoading(true);
    try {
      await api.post("/alerts/rules", {
        device_id: rDevice, metric: rMetric,
        operator: rOperator, threshold: parseFloat(rThreshold),
      });
      setRThreshold("");
      await loadRules();
    } catch (err: any) {
      setRError(err.response?.data?.detail ?? "Failed to create rule");
    } finally {
      setRLoading(false);
    }
  }

  async function toggleRule(rule: AlertRule) {
    await api.put(`/alerts/rules/${rule.id}`, { ...rule, enabled: !rule.enabled });
    await loadRules();
  }
  async function deleteRule(id: number) {
    if (!confirm("Delete this rule?")) return;
    await api.delete(`/alerts/rules/${id}`);
    await loadRules();
  }

  const activeAlerts = history.filter(a => !a.resolved).length;
  const deviceName   = (id: string) => devices.find(d => d.device_id === id)?.nickname || id;

  if (devices.length === 0 && history.length === 0 && rules.length === 0) {
    return (
      <div className="app-shell">
        <Sidebar devices={[]} activeDevice={null} onSelect={() => {}} onDeviceAdded={() => window.location.reload()} userEmail={userEmail} alertCount={0} />
        <div className="main">
          <div className="empty-state">
            <div className="es-icon"><IconAlert size={48} strokeWidth={1.5} /></div>
            <div className="es-title">No devices yet</div>
            <p>Add a device from the sidebar to start tracking alerts.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar devices={devices} activeDevice={active} onSelect={setActive}
        onDeviceAdded={() => api.get<Device[]>("/devices").then(({ data }) => setDevices(data))}
        userEmail={userEmail} alertCount={activeAlerts} />

      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="device-name">
              Alerts
              {activeAlerts > 0 && <span style={{ background:"var(--unhealthy)", color:"#fff", fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, marginLeft:8 }}>{activeAlerts} active</span>}
            </div>
            <div className="device-meta">Alert history and custom threshold rules</div>
          </div>
          <div className="topbar-right">
            <button className={`tab-btn ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>History</button>
            <button className={`tab-btn ${tab === "rules"   ? "active" : ""}`} onClick={() => setTab("rules")}>Rules</button>
          </div>
        </div>

        <div className="content">

          {tab === "history" && (
            <>
              <div className="section-hdr">
                <span className="sh-icon"><IconAlert size={15} /></span>
                <span className="sh-title">Alert History</span>
              </div>
              {history.length === 0
                ? <div className="empty-state"><div className="es-icon"><IconCheckCircle size={48} strokeWidth={1.5} /></div><div className="es-title">No alerts</div><p>All parameters within normal range.</p></div>
                : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {history.map(a => (
                      <div key={a.id} className="card" style={{
                        borderLeft: `3px solid ${TYPE_COLORS[a.type] ?? "var(--moderate)"}`,
                        borderRadius: "0 var(--radius) var(--radius) 0",
                        opacity: a.resolved ? 0.55 : 1,
                        display:"flex", alignItems:"center", justifyContent:"space-between", gap:16,
                      }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                            <span className="status-badge" style={{ background:(TYPE_COLORS[a.type]??"#f59e0b")+"20", color: TYPE_COLORS[a.type]??"var(--moderate)", fontSize:10 }}>
                              {a.type.replace(/_/g," ").toUpperCase()}
                            </span>
                            <span style={{ fontSize:11, color:"var(--muted)" }}>{deviceName(a.device_id)}</span>
                          </div>
                          <div style={{ fontSize:13 }}>{a.message}</div>
                          <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>
                            Value: <strong>{a.value}</strong> · Threshold: {a.threshold} · {new Date(a.timestamp).toLocaleString()}
                          </div>
                        </div>
                        {!a.resolved
                          ? <button className="btn btn-ghost" style={{ fontSize:12, padding:"6px 12px", flexShrink:0 }} onClick={() => resolveAlert(a.id)}>Resolve</button>
                          : <span style={{ fontSize:11, color:"var(--good)", flexShrink:0 }}>✓ Resolved</span>
                        }
                      </div>
                    ))}
                  </div>
                )
              }
            </>
          )}

          {tab === "rules" && (
            <>
              {/* Create rule */}
              <div className="section-hdr">
                <span className="sh-icon"><IconPlus size={15} strokeWidth={2.2} /></span>
                <span className="sh-title">New Threshold Rule</span>
              </div>
              <div className="card" style={{ maxWidth:560, marginBottom:24 }}>
                <form onSubmit={createRule} style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" }}>
                  <div className="field" style={{ flex:"1 1 120px", marginBottom:0 }}>
                    <label>Device</label>
                    <select value={rDevice} onChange={e => setRDevice(e.target.value)} style={{ width:"100%", padding:"10px 14px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:14, outline:"none" }}>
                      {devices.map(d => <option key={d.device_id} value={d.device_id}>{d.nickname || d.device_id}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ flex:"1 1 100px", marginBottom:0 }}>
                    <label>Metric</label>
                    <select value={rMetric} onChange={e => setRMetric(e.target.value)} style={{ width:"100%", padding:"10px 14px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:14, outline:"none" }}>
                      {METRICS.map(m => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ flex:"0 0 80px", marginBottom:0 }}>
                    <label>When</label>
                    <select value={rOperator} onChange={e => setROperator(e.target.value)} style={{ width:"100%", padding:"10px 14px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:14, outline:"none" }}>
                      <option value="gt">Above</option>
                      <option value="lt">Below</option>
                    </select>
                  </div>
                  <div className="field" style={{ flex:"1 1 80px", marginBottom:0 }}>
                    <label>Value {METRIC_UNITS[rMetric] && `(${METRIC_UNITS[rMetric]})`}</label>
                    <input type="number" step="any" value={rThreshold} onChange={e => setRThreshold(e.target.value)} placeholder="35" required />
                  </div>
                  <button className="btn btn-primary" style={{ flexShrink:0 }} disabled={rLoading}>
                    {rLoading ? <span className="spinner" /> : "Add Rule"}
                  </button>
                </form>
                {rError && <div className="error-msg">{rError}</div>}
              </div>

              {/* Rule list */}
              <div className="section-hdr">
                <span className="sh-icon"><IconList size={15} /></span>
                <span className="sh-title">Active Rules ({rules.length})</span>
              </div>
              {rules.length === 0
                ? <div className="empty-state"><div className="es-icon"><IconClipboard size={48} strokeWidth={1.5} /></div><div className="es-title">No rules yet</div><p>Add a rule above to get notified when a threshold is crossed.</p></div>
                : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {rules.map(r => (
                      <div key={r.id} className="card" style={{ display:"flex", alignItems:"center", gap:16, opacity: r.enabled ? 1 : 0.5 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:14 }}>
                            {METRIC_LABELS[r.metric]} {r.operator === "gt" ? "above" : "below"} {r.threshold} {METRIC_UNITS[r.metric]}
                          </div>
                          <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{deviceName(r.device_id)}</div>
                        </div>
                        <button className={`btn ${r.enabled ? "btn-ghost" : "btn-primary"}`} style={{ fontSize:12, padding:"6px 12px" }} onClick={() => toggleRule(r)}>
                          {r.enabled ? "Disable" : "Enable"}
                        </button>
                        <button className="btn btn-danger" style={{ fontSize:12, padding:"6px 12px" }} onClick={() => deleteRule(r.id)}>Delete</button>
                      </div>
                    ))}
                  </div>
                )
              }
            </>
          )}
        </div>
      </div>
    </div>
  );
}
