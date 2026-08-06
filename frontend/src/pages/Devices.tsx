import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import api from "../api";

interface Device { device_id: string; nickname: string | null; }

export default function Devices() {
  const [devices, setDevices]   = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function load() {
    const { data } = await api.get<Device[]>("/devices");
    setDevices(data);
  }

  useEffect(() => { load(); }, []);

  async function addDevice(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/devices", { device_id: deviceId, auth_code: authCode, nickname });
      setDeviceId(""); setAuthCode(""); setNickname("");
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Failed to add device");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(`Remove device ${id}?`)) return;
    await api.delete(`/devices/${id}`);
    await load();
  }

  return (
    <div className="page">
      <Navbar />
      <div className="main-content">
        <div className="container">
          <p className="section-title">My Devices</p>

          {devices.length === 0 && <div className="empty">No devices yet. Add one below.</div>}

          <div className="devices-list">
            {devices.map(d => (
              <div key={d.device_id} className="device-row">
                <div>
                  <div className="name">{d.nickname || d.device_id}</div>
                  <div className="id">{d.device_id}</div>
                </div>
                <button className="btn btn-danger" onClick={() => remove(d.device_id)}>Remove</button>
              </div>
            ))}
          </div>

          <p className="section-title">Add a Device</p>
          <div className="card" style={{ maxWidth: 480 }}>
            <form onSubmit={addDevice}>
              <div className="field">
                <label>Device ID</label>
                <input value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="pi-001" required />
              </div>
              <div className="field">
                <label>Auth Code</label>
                <input value={authCode} onChange={e => setAuthCode(e.target.value)} placeholder="From your device sticker" required />
              </div>
              <div className="field">
                <label>Nickname (optional)</label>
                <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Living Room" />
              </div>
              {error && <div className="error-msg">{error}</div>}
              <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={loading}>
                {loading ? <span className="spinner" /> : "Add Device"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
