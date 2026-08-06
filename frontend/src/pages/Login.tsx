import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconWind, IconActivity, IconBell, IconShield } from "../components/Icons";
import api from "../api";

export default function Login() {
  const navigate  = useNavigate();
  const [tab, setTab]       = useState<"login" | "register">("login");
  const [email, setEmail]   = useState("");
  const [pass,  setPass]    = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post(`/auth/${tab}`, { email, password: pass });
      localStorage.setItem("token", data.access_token);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-split">
      {/* ─── Hero (left) ───────────────────────────────────────── */}
      <div className="auth-hero">
        <div className="auth-hero-top">
          <div className="auth-logo">
            <div className="al-icon"><IconWind size={22} strokeWidth={2} /></div>
            <div>
              <div className="al-name">AirWatch</div>
              <div className="al-sub">Real-time air quality monitoring</div>
            </div>
          </div>
        </div>

        <div className="auth-hero-mid">
          <h1 className="auth-tagline">Breathe smarter.<br/>Live better.</h1>
          <p className="auth-blurb">
            Track PM, VOC, temperature and humidity from your home sensors in real time.
            Get alerted before air quality affects your health.
          </p>

          <div className="auth-features">
            <div className="auth-feature">
              <div className="af-ico"><IconActivity size={18} /></div>
              <div>
                <div className="af-t">Live readings</div>
                <div className="af-s">Every 2 seconds, streamed via WebSocket</div>
              </div>
            </div>
            <div className="auth-feature">
              <div className="af-ico"><IconBell size={18} /></div>
              <div>
                <div className="af-t">Smart alerts</div>
                <div className="af-s">Custom thresholds, email notifications, quiet hours</div>
              </div>
            </div>
            <div className="auth-feature">
              <div className="af-ico"><IconShield size={18} /></div>
              <div>
                <div className="af-t">Private &amp; secure</div>
                <div className="af-s">Your data stays on your network, end-to-end via Tailscale</div>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-hero-foot">
          © {new Date().getFullYear()} AirWatch · Built on Kafka + FastAPI + React
        </div>
      </div>

      {/* ─── Form (right) ──────────────────────────────────────── */}
      <div className="auth-form-side">
        <div className="auth-card">
          <div className="auth-card-head">
            <h2 className="auth-card-title">{tab === "login" ? "Welcome back" : "Create your account"}</h2>
            <p className="auth-card-sub">
              {tab === "login"
                ? "Sign in to access your dashboard"
                : "Get started in seconds — no credit card required"}
            </p>
          </div>

          <div className="auth-tabs">
            <button className={`auth-tab ${tab === "login"    ? "active" : ""}`} onClick={() => setTab("login")}>Sign In</button>
            <button className={`auth-tab ${tab === "register" ? "active" : ""}`} onClick={() => setTab("register")}>Register</button>
          </div>

          <form onSubmit={submit}>
            <div className="field">
              <label>Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" required />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button className="btn btn-primary btn-full" style={{ marginTop: 20 }} disabled={loading}>
              {loading ? <span className="spinner" /> : tab === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="auth-fineprint">
            By continuing, you agree to monitor air quality responsibly 🌿
          </div>
        </div>
      </div>
    </div>
  );
}
