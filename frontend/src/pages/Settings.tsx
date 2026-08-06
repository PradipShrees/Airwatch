import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { IconUser, IconLock, IconWifi, IconBell, IconMapPin } from "../components/Icons";
import api from "../api";

interface Device { device_id: string; nickname: string | null; }
interface DeviceDetail { device_id: string; nickname: string | null; auth_code: string; added_at: string; }
interface NotifPrefs { email_alerts: boolean; quiet_hours_start: number | null; quiet_hours_end: number | null; min_interval_minutes: number; }
interface Location { latitude: number | null; longitude: number | null; location_name: string | null; }
interface GeocodeHit { label: string; latitude: number; longitude: number; country?: string; country_code?: string; population?: number; admin?: string; name?: string; }

function flagEmoji(cc?: string): string {
  if (!cc || cc.length !== 2) return "🌍";
  const A = 0x1F1E6 - 65;
  return String.fromCodePoint(...cc.toUpperCase().split("").map(c => c.charCodeAt(0) + A));
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const fmtHour = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default function Settings() {
  const [devices,    setDevices]    = useState<Device[]>([]);
  const [active,     setActive]     = useState<string | null>(null);
  const [userEmail,  setUserEmail]  = useState("");
  const [tab,        setTab]        = useState<"profile"|"location"|"devices"|"notifications">("profile");

  // Profile
  const [email,     setEmail]     = useState("");
  const [curPass,   setCurPass]   = useState("");
  const [newPass,   setNewPass]   = useState("");
  const [confPass,  setConfPass]  = useState("");
  const [profMsg,   setProfMsg]   = useState<{ok:boolean,text:string}|null>(null);
  const [passMsg,   setPassMsg]   = useState<{ok:boolean,text:string}|null>(null);
  const [profLoad,  setProfLoad]  = useState(false);
  const [passLoad,  setPassLoad]  = useState(false);

  // Devices
  const [myDevices,  setMyDevices]  = useState<DeviceDetail[]>([]);
  const [editId,     setEditId]     = useState<string|null>(null);
  const [editName,   setEditName]   = useState("");

  // Notifications
  const [prefs,     setPrefs]     = useState<NotifPrefs>({ email_alerts:true, quiet_hours_start:null, quiet_hours_end:null, min_interval_minutes:60 });
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [prefsLoad,  setPrefsLoad]  = useState(false);

  // Location
  const [loc,        setLoc]        = useState<Location>({ latitude:null, longitude:null, location_name:null });
  const [locQuery,   setLocQuery]   = useState("");
  const [locHits,    setLocHits]    = useState<GeocodeHit[]>([]);
  const [locSaved,   setLocSaved]   = useState(false);
  const [locLoad,    setLocLoad]    = useState(false);
  const [locError,   setLocError]   = useState("");
  const [locSearchLoad, setLocSearchLoad] = useState(false);
  const [locSearched,   setLocSearched]   = useState(false);

  useEffect(() => {
    api.get("/auth/me").then(({ data }) => { setUserEmail(data.email); setEmail(data.email); });
    api.get<Device[]>("/devices").then(({ data }) => { setDevices(data); if (data[0]) setActive(data[0].device_id); });
    api.get<DeviceDetail[]>("/settings/devices").then(({ data }) => setMyDevices(data));
    api.get<NotifPrefs>("/settings/notifications").then(({ data }) => setPrefs(data));
    api.get<Location>("/settings/location").then(({ data }) => setLoc(data));
  }, []);

  async function searchLocation() {
    if (!locQuery.trim()) return;
    setLocSearchLoad(true);
    setLocSearched(true);
    try {
      const { data } = await api.get<GeocodeHit[]>(`/weather/geocode?q=${encodeURIComponent(locQuery)}`);
      setLocHits(data);
    } finally { setLocSearchLoad(false); }
  }

  async function pickLocation(hit: GeocodeHit) {
    setLocLoad(true);
    try {
      const next: Location = { latitude: hit.latitude, longitude: hit.longitude, location_name: hit.label };
      await api.put("/settings/location", next);
      setLoc(next);
      setLocHits([]); setLocQuery("");
      setLocSaved(true);
      setTimeout(() => setLocSaved(false), 3000);
    } finally { setLocLoad(false); }
  }

  async function useBrowserLocation() {
    if (!navigator.geolocation) return;
    setLocLoad(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const next: Location = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        location_name: "Detected location",
      };
      await api.put("/settings/location", next);
      setLoc(next);
      setLocSaved(true);
      setLocLoad(false);
      setTimeout(() => setLocSaved(false), 3000);
    }, () => {
      setLocLoad(false);
      setLocError("Location access denied. Allow access in your browser or search manually.");
      setTimeout(() => setLocError(""), 4000);
    });
  }

  async function clearLocation() {
    await api.put("/settings/location", { latitude: null, longitude: null, location_name: null });
    setLoc({ latitude: null, longitude: null, location_name: null });
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfLoad(true); setProfMsg(null);
    try {
      await api.put("/settings/profile", { email });
      setUserEmail(email);
      setProfMsg({ ok:true, text:"Email updated successfully." });
    } catch (err: any) {
      setProfMsg({ ok:false, text: err.response?.data?.detail ?? "Failed to update" });
    } finally { setProfLoad(false); }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPass !== confPass) { setPassMsg({ ok:false, text:"New passwords do not match" }); return; }
    setPassLoad(true); setPassMsg(null);
    try {
      await api.put("/settings/password", { current_password: curPass, new_password: newPass });
      setCurPass(""); setNewPass(""); setConfPass("");
      setPassMsg({ ok:true, text:"Password updated successfully." });
      setTimeout(() => setPassMsg(null), 3000);
    } catch (err: any) {
      setPassMsg({ ok:false, text: err.response?.data?.detail ?? "Failed to update" });
    } finally { setPassLoad(false); }
  }

  async function saveRename(device_id: string) {
    await api.put(`/settings/devices/${device_id}`, { nickname: editName });
    setMyDevices(prev => prev.map(d => d.device_id === device_id ? { ...d, nickname: editName } : d));
    setEditId(null);
  }

  async function removeDevice(device_id: string) {
    if (!confirm(`Remove ${device_id} from your account?`)) return;
    await api.delete(`/devices/${device_id}`);
    setMyDevices(prev => prev.filter(d => d.device_id !== device_id));
    setDevices(prev => prev.filter(d => d.device_id !== device_id));
  }

  async function savePrefs() {
    setPrefsLoad(true);
    try {
      await api.put("/settings/notifications", prefs);
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 3000);
    } finally { setPrefsLoad(false); }
  }

  return (
    <div className="app-shell">
      <Sidebar devices={devices} activeDevice={active} onSelect={setActive}
        onDeviceAdded={() => api.get<Device[]>("/devices").then(({ data }) => setDevices(data))}
        userEmail={userEmail} alertCount={0} />

      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="device-name">Settings</div>
            <div className="device-meta">Manage your account, devices and notification preferences</div>
          </div>
          <div className="topbar-right">
            <button className={`tab-btn ${tab==="profile"       ? "active":""}`} onClick={() => setTab("profile")}>Profile</button>
            <button className={`tab-btn ${tab==="location"      ? "active":""}`} onClick={() => setTab("location")}>Location</button>
            <button className={`tab-btn ${tab==="devices"       ? "active":""}`} onClick={() => setTab("devices")}>Devices</button>
            <button className={`tab-btn ${tab==="notifications" ? "active":""}`} onClick={() => setTab("notifications")}>Notifications</button>
          </div>
        </div>

        <div className="content" style={{ maxWidth:680 }}>

          {/* ── Profile ──────────────────────────────────────────── */}
          {tab === "profile" && (
            <>
              <div className="section-hdr"><span className="sh-icon"><IconUser size={15} /></span><span className="sh-title">Email Address</span></div>
              <div className="card" style={{ marginBottom:20 }}>
                <form onSubmit={saveProfile}>
                  <div className="field">
                    <label>Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                  {profMsg && <div style={{ fontSize:12, marginBottom:10, color: profMsg.ok ? "var(--good)" : "var(--unhealthy)" }}>{profMsg.text}</div>}
                  <button className="btn btn-primary" disabled={profLoad}>{profLoad ? <span className="spinner"/> : "Save Email"}</button>
                </form>
              </div>

              <div className="section-hdr"><span className="sh-icon"><IconLock size={15} /></span><span className="sh-title">Change Password</span></div>
              <div className="card">
                <form onSubmit={savePassword}>
                  <div className="field"><label>Current Password</label><input type="password" value={curPass} onChange={e => setCurPass(e.target.value)} required /></div>
                  <div className="field"><label>New Password</label><input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} required /></div>
                  <div className="field"><label>Confirm New Password</label><input type="password" value={confPass} onChange={e => setConfPass(e.target.value)} required /></div>
                  {passMsg && <div style={{ fontSize:12, marginBottom:10, color: passMsg.ok ? "var(--good)" : "var(--unhealthy)" }}>{passMsg.text}</div>}
                  <button className="btn btn-primary" disabled={passLoad}>{passLoad ? <span className="spinner"/> : "Update Password"}</button>
                </form>
              </div>
            </>
          )}

          {/* ── Location ──────────────────────────────────────────── */}
          {tab === "location" && (
            <>
              <div className="section-hdr"><span className="sh-icon"><IconMapPin size={15} /></span><span className="sh-title">Your Location</span></div>
              <div className="card" style={{ marginBottom: 20 }}>
                {loc.latitude != null && loc.longitude != null ? (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{loc.location_name || "Set"}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>
                      {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                    </div>
                    <button className="btn btn-ghost" style={{ marginTop: 12, fontSize: 12, padding: "6px 12px" }} onClick={clearLocation}>
                      Clear location
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
                    Set your location to see outdoor AQI on the dashboard.
                  </div>
                )}

                <div className="field">
                  <label>Search a city (any country)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={locQuery}
                      onChange={e => setLocQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); searchLocation(); } }}
                      placeholder="e.g. Sydney, Melbourne, Cairns…"
                    />
                    <button type="button" className="btn btn-primary" onClick={searchLocation} disabled={locSearchLoad}>
                      {locSearchLoad ? <span className="spinner" /> : "Search"}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                    Tip: try the city name. If your town is small, try a nearby larger city — outdoor AQI is regional.
                  </div>
                </div>

                {locHits.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, maxHeight: 360, overflowY: "auto" }}>
                    {locHits.map((h, i) => (
                      <button key={i} type="button" onClick={() => pickLocation(h)} disabled={locLoad}
                        style={{ textAlign: "left", padding: "10px 14px", background: "var(--surface2)", border: "1px solid var(--border)",
                                 borderRadius: 8, color: "var(--text)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>{flagEmoji(h.country_code)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>
                            {h.name}
                            {h.admin && <span style={{ color: "var(--muted)", fontWeight: 400 }}>, {h.admin}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                            {h.country}
                            {h.population ? ` · ${h.population.toLocaleString()} people` : ""}
                            {" · "}{h.latitude.toFixed(2)}, {h.longitude.toFixed(2)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {locSearched && !locSearchLoad && locHits.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "12px 14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 12 }}>
                    No matches for "{locQuery}". Try a different spelling, the city's English name, or a nearby larger city.
                  </div>
                )}

                <button type="button" className="btn btn-ghost" onClick={useBrowserLocation} disabled={locLoad}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <IconMapPin size={14} /> Use my current location
                </button>

                {locSaved  && <div style={{ fontSize: 12, color: "var(--good)",      marginTop: 12 }}>✓ Location saved</div>}
                {locError  && <div style={{ fontSize: 12, color: "var(--unhealthy)", marginTop: 12 }}>{locError}</div>}
              </div>
            </>
          )}

          {/* ── Devices ──────────────────────────────────────────── */}
          {tab === "devices" && (
            <>
              <div className="section-hdr"><span className="sh-icon"><IconWifi size={15} /></span><span className="sh-title">My Devices ({myDevices.length})</span></div>
              {myDevices.length === 0
                ? <div className="empty-state"><div className="es-icon"><IconWifi size={48} strokeWidth={1.5} /></div><div className="es-title">No devices</div><p>Add a device from the dashboard sidebar.</p></div>
                : (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {myDevices.map(d => (
                      <div key={d.device_id} className="card">
                        {editId === d.device_id
                          ? (
                            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                              <input value={editName} onChange={e => setEditName(e.target.value)}
                                style={{ flex:1, padding:"8px 12px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:14, outline:"none" }} />
                              <button className="btn btn-primary" style={{ padding:"8px 14px" }} onClick={() => saveRename(d.device_id)}>Save</button>
                              <button className="btn btn-ghost"   style={{ padding:"8px 14px" }} onClick={() => setEditId(null)}>Cancel</button>
                            </div>
                          ) : (
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                              <div>
                                <div style={{ fontWeight:600, fontSize:14 }}>{d.nickname || d.device_id}</div>
                                <div style={{ fontSize:11, color:"var(--muted)", marginTop:3, fontFamily:"monospace" }}>
                                  ID: {d.device_id} · Code: {d.auth_code} · Added {new Date(d.added_at).toLocaleDateString()}
                                </div>
                              </div>
                              <div style={{ display:"flex", gap:8 }}>
                                <button className="btn btn-ghost" style={{ fontSize:12, padding:"6px 12px" }}
                                  onClick={() => { setEditId(d.device_id); setEditName(d.nickname || d.device_id); }}>Rename</button>
                                <button className="btn btn-danger" style={{ fontSize:12, padding:"6px 12px" }} onClick={() => removeDevice(d.device_id)}>Remove</button>
                              </div>
                            </div>
                          )
                        }
                      </div>
                    ))}
                  </div>
                )
              }
            </>
          )}

          {/* ── Notifications ─────────────────────────────────────── */}
          {tab === "notifications" && (
            <>
              <div className="section-hdr"><span className="sh-icon"><IconBell size={15} /></span><span className="sh-title">Email Notifications</span></div>
              <div className="card" style={{ marginBottom:20 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                  <div>
                    <div style={{ fontWeight:600 }}>Email Alerts</div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Receive email when AQI thresholds are breached</div>
                  </div>
                  <div onClick={() => setPrefs(p => ({ ...p, email_alerts: !p.email_alerts }))}
                    style={{ width:44, height:24, borderRadius:12, background: prefs.email_alerts ? "var(--accent)" : "var(--border)", position:"relative", cursor:"pointer", transition:"background 0.2s", flexShrink:0 }}>
                    <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff", position:"absolute", top:3, left: prefs.email_alerts ? 23 : 3, transition:"left 0.2s" }} />
                  </div>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
                  <div className="field" style={{ marginBottom:0 }}>
                    <label>Quiet Hours Start</label>
                    <select value={prefs.quiet_hours_start ?? ""} onChange={e => setPrefs(p => ({ ...p, quiet_hours_start: e.target.value ? +e.target.value : null }))}
                      style={{ width:"100%", padding:"10px 14px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:14, outline:"none" }}>
                      <option value="">Disabled</option>
                      {HOURS.map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom:0 }}>
                    <label>Quiet Hours End</label>
                    <select value={prefs.quiet_hours_end ?? ""} onChange={e => setPrefs(p => ({ ...p, quiet_hours_end: e.target.value ? +e.target.value : null }))}
                      style={{ width:"100%", padding:"10px 14px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:14, outline:"none" }}>
                      <option value="">Disabled</option>
                      {HOURS.map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
                    </select>
                  </div>
                </div>

                <div className="field" style={{ marginBottom:20 }}>
                  <label>Minimum time between alerts (minutes)</label>
                  <input type="number" min={5} max={1440} value={prefs.min_interval_minutes}
                    onChange={e => setPrefs(p => ({ ...p, min_interval_minutes: +e.target.value }))} />
                </div>

                <button className="btn btn-primary" onClick={savePrefs} disabled={prefsLoad}>
                  {prefsLoad ? <span className="spinner"/> : prefsSaved ? "✓ Saved!" : "Save Preferences"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
