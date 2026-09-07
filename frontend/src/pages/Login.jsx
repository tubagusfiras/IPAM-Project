import { useState, useRef, useEffect, useCallback } from "react";
import { setToken } from "../api.js";
import { useI18n } from "../i18n.jsx";

const TAU = Math.PI * 2;

export default function Login({ onLoginSuccess, dark }) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef(null);
  const userRef = useRef(null);
  const scanRef = useRef({ scanning: false, burst: 0, packets: [], ripples: [] });

  useEffect(() => {
    userRef.current?.focus();
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // ── Network mesh + ping ripples + traceroute hops (canvas) ────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let nodes = [];
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = canvas.offsetWidth * DPR;
      canvas.height = canvas.offsetHeight * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const count = Math.min(70, Math.max(36, Math.floor(canvas.offsetWidth / 28)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        r: 1.2 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        phase: Math.random() * TAU,
        glow: 0,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    const isDark = dark;
    const nodeFill = isDark ? "rgba(99,132,255,0.45)" : "rgba(50,100,220,0.35)";
    const nodeGlow = isDark ? "rgba(99,132,255,0.85)" : "rgba(50,100,220,0.7)";
    const lineC = isDark ? "rgba(99,132,255,0.12)" : "rgba(50,100,220,0.10)";
    const rippleC = isDark ? "rgba(120,180,255,0.55)" : "rgba(50,120,220,0.45)";

    const pickNeighbor = (n, exclude) => {
      let best = null, bestD = 170;
      for (const o of nodes) {
        if (o === exclude) continue;
        const d = Math.hypot(n.x - o.x, n.y - o.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      return best;
    };

    const spawnRipple = (n, opts = {}) => {
      const S = scanRef.current;
      S.ripples.push({
        n, x: n.x, y: n.y, r: 0,
        maxR: opts.maxR || 30, speed: opts.speed || 0.8,
        alpha: opts.alpha || 0.3, hit: new Set([n]),
      });
    };

    const spawnPacket = () => {
      const S = scanRef.current;
      const src = nodes[Math.random() * nodes.length | 0];
      const dst = pickNeighbor(src, null);
      if (!dst) return;
      S.packets.push({ from: src, to: dst, t: 0, speed: 0.028 + Math.random() * 0.012, hops: 0, path: [{ x: src.x, y: src.y }] });
    };

    const triggerBurst = () => {
      scanRef.current.burst = 12;
    };

    const triggerScan = (scanning) => {
      scanRef.current.scanning = scanning;
      scanRef.current.packets = [];
      scanRef.current.ripples = [];
      if (scanning) nodes.forEach(n => n.glow = 0.6);
    };

    window._loginScan = triggerScan;
    window._loginBurst = triggerBurst;

    let frame = 0;
    const draw = () => {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      ctx.clearRect(0, 0, W, H);
      frame++;
      const S = scanRef.current;
      const scanning = S.scanning;

      // move
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -10) n.x = W + 10;
        if (n.x > W + 10) n.x = -10;
        if (n.y < -10) n.y = H + 10;
        if (n.y > H + 10) n.y = -10;
        n.phase += 0.012;
        n.glow *= 0.94;
      }

      // lines
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (d < 125) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = lineC;
            ctx.globalAlpha = Math.max(0.08, 1 - d / 125) * 0.5;
            ctx.lineWidth = 0.6;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      // nodes
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, TAU);
        ctx.fillStyle = n.glow > 0.08 ? nodeGlow : nodeFill;
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(n.phase);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // idle ripples
      if (!scanning && S.burst <= 0 && frame % 220 === 0) {
        spawnRipple(nodes[Math.random() * nodes.length | 0], { alpha: 0.22, maxR: 26, speed: 1.1 });
      }

      // ripples
      S.ripples = S.ripples.filter(rp => {
        rp.x = rp.n.x; rp.y = rp.n.y;
        rp.r += rp.speed;
        if (rp.r >= rp.maxR) return false;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, TAU);
        ctx.strokeStyle = rippleC;
        ctx.globalAlpha = rp.alpha * (1 - rp.r / rp.maxR);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.globalAlpha = 1;
        for (const n of nodes) {
          const d = Math.hypot(n.x - rp.x, n.y - rp.y);
          if (d < rp.r + 2 && d > rp.r - 8 && !rp.hit.has(n)) {
            rp.hit.add(n);
            n.glow = Math.max(n.glow, rp.alpha);
          }
        }
        return true;
      });

      // traceroute packets
      if (scanning && S.packets.length < 11 && frame % 22 === 0) spawnPacket();
      if (!scanning) S.packets = [];
      S.packets = S.packets.filter(p => {
        if (!p.to) return false;
        if (p.t >= 1) {
          p.to.glow = Math.max(p.to.glow, 0.9);
          p.path.push({ x: p.to.x, y: p.to.y });
          if (p.path.length > 9) return false;
          const next = pickNeighbor(p.to, p.from);
          if (!next) return false;
          p.from = p.to; p.to = next; p.t = 0;
          p.speed = 0.024 + Math.random() * 0.014;
          p.hops++;
          return true;
        }
        p.t += p.speed;
        const x = p.from.x + (p.to.x - p.from.x) * p.t;
        const y = p.from.y + (p.to.y - p.from.y) * p.t;

        if (p.path.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.path[0].x, p.path[0].y);
          for (let i = 1; i < p.path.length; i++) ctx.lineTo(p.path[i].x, p.path[i].y);
          ctx.lineTo(x, y);
          ctx.strokeStyle = rippleC;
          ctx.globalAlpha = 0.25;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, TAU);
        ctx.fillStyle = rippleC;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });

      // burst
      if (S.burst > 0) {
        S.burst--;
        const center = nodes[Math.random() * nodes.length | 0];
        spawnRipple(center, { alpha: 0.5, maxR: 55, speed: 1.8 });
        spawnRipple(center, { alpha: 0.3, maxR: 35, speed: 1.0 });
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [dark]);

  const triggerBurst = () => window._loginBurst?.();
  const triggerScan = (v) => window._loginScan?.(v);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError(t("login.fillAll")); return; }
    setLoading(true); setError(null);
    triggerScan(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) throw new Error(t("login.rateLimit"));
        throw new Error(data.detail || t("login.error"));
      }
      setSuccess(true);
      triggerBurst();
      setToken(data.token);
      localStorage.setItem("ipam_user", JSON.stringify(data.user));
      setTimeout(() => onLoginSuccess(data.user), 1200);
    } catch (e) {
      setError(e.message || t("login.error"));
      triggerScan(false);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
    setLoading(false);
  };

  // stagger delay helper
  const delay = (i) => `${0.1 + i * 0.08}s`;

  const cardStyle = {
    opacity: mounted ? 1 : 0,
    transform: mounted
      ? (success ? "scale(1.05) translateY(-20px)" : "scale(1) translateY(0)")
      : "scale(0.92) translateY(30px)",
    transition: success
      ? "opacity 0.5s ease, transform 0.6s cubic-bezier(0.34,1.56,0.64,1)"
      : "opacity 0.7s ease, transform 0.7s cubic-bezier(0.34,1.56,0.64,1)",
  };

  const fieldStyle = (idx) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(16px)",
    transition: `opacity 0.5s ease ${delay(idx)}, transform 0.5s ease ${delay(idx)}`,
  });

  const focusGlow = (focused) => ({
    boxShadow: focused
      ? "0 0 0 2px var(--accent), 0 0 20px rgba(37,99,235,0.15)"
      : "var(--shadow)",
    borderColor: focused ? "var(--accent)" : "var(--input-border)",
    transition: "box-shadow 0.3s ease, border-color 0.3s ease",
  });

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)", position: "relative", overflow: "hidden",
    }}>
      <canvas ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, transparent 55%, var(--bg) 100%)",
      }} />

      <div style={{ width: "100%", maxWidth: 380, padding: 20, position: "relative" }}>
        {/* Brand */}
        <div style={{
          ...fieldStyle(0), display: "flex", alignItems: "center", gap: 14,
          marginBottom: 36, justifyContent: "center",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, overflow: "hidden",
            boxShadow: "0 2px 8px rgba(37,99,235,0.15)",
            background: "var(--surface-1)",
          }}>
            <img src="/sdi_logo.png" alt="SDI"
              style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
              SDI IPAM
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              IP Address Manager
            </div>
          </div>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit}>
          <div style={{
            ...cardStyle,
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: "32px 28px 28px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)",
          }}>
            <div style={{ marginBottom: 28, textAlign: "center" }}>
              <div style={{
                fontSize: 17, fontWeight: 700, color: "var(--text)",
                opacity: mounted ? 1 : 0,
                transition: "opacity 0.5s ease 0.15s",
              }}>
                {t("login.welcome")}
              </div>
              <div style={{
                fontSize: 13, color: "var(--text-dim)", marginTop: 6,
                opacity: mounted ? 1 : 0,
                transition: "opacity 0.5s ease 0.25s",
              }}>
                {t("login.subtitle")}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                marginBottom: 16, padding: "10px 14px", borderRadius: 8,
                background: "var(--danger-surface)", border: "1px solid var(--danger-border)",
                color: "var(--danger)", fontSize: 13,
                animation: "shakeX 0.4s ease",
              }}>
                {error}
              </div>
            )}

            {/* Username */}
            <div style={fieldStyle(1)}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {t("login.username")}
              </label>
              <input
                ref={userRef}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={t("login.usernamePlaceholder")}
                disabled={loading}
                onFocus={() => setFocusedField("user")}
                onBlur={() => setFocusedField(null)}
                style={{
                  width: "100%", padding: "11px 14px", borderRadius: 8,
                  border: "1px solid var(--input-border)",
                  background: "var(--input-bg)", color: "var(--text)", fontSize: 14,
                  outline: "none", boxSizing: "border-box",
                  animation: shake ? "shakeX 0.4s ease" : "none",
                  ...focusGlow(focusedField === "user"),
                }}
              />
            </div>

            {/* Password */}
            <div style={{ ...fieldStyle(2), marginTop: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {t("login.password")}
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t("login.passwordPlaceholder")}
                  disabled={loading}
                  onFocus={() => setFocusedField("pw")}
                  onBlur={() => setFocusedField(null)}
                  style={{
                    width: "100%", padding: "11px 40px 11px 14px", borderRadius: 8,
                    border: "1px solid var(--input-border)",
                    background: "var(--input-bg)", color: "var(--text)", fontSize: 14,
                    outline: "none", boxSizing: "border-box",
                    animation: shake ? "shakeX 0.4s ease" : "none",
                    ...focusGlow(focusedField === "pw"),
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", padding: 4,
                    color: "var(--text-dim)", fontSize: 16, lineHeight: 1,
                  }}
                >
                  {showPw ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {/* Submit */}
            <div style={fieldStyle(3)}>
              <button
                type="submit"
                disabled={loading || success}
                style={{
                  width: "100%", marginTop: 24, padding: "12px 0", borderRadius: 8,
                  border: "none", cursor: loading ? "wait" : "pointer",
                  background: success
                    ? "linear-gradient(135deg, #059669, #10b981)"
                    : "linear-gradient(135deg, var(--accent), #2563eb)",
                  color: "#fff", fontSize: 14, fontWeight: 600,
                  transition: "all 0.4s cubic-bezier(0.34,1.56,0.64,1)",
                  transform: loading ? "scale(0.97)" : "scale(1)",
                  boxShadow: success
                    ? "0 4px 16px rgba(5,150,105,0.3)"
                    : "0 4px 16px rgba(37,99,235,0.25)",
                  opacity: success ? 0.9 : 1,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {success ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span style={{ animation: "checkPop 0.4s ease" }}>✓</span>
                    {t("login.success")}
                  </span>
                ) : loading ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span style={{
                      width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff", borderRadius: "50%",
                      animation: "spin 0.6s linear infinite", display: "inline-block",
                    }} />
                    {t("login.scanning")}
                  </span>
                ) : t("login.login")}
              </button>
            </div>
          </div>
        </form>

        {/* Network status indicator */}
        <div style={{
          marginTop: 20, textAlign: "center",
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.5s ease 0.6s",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: loading ? "#f59e0b" : success ? "#10b981" : "#64748b",
              transition: "background 0.3s ease",
              animation: loading ? "pulse 1.5s ease infinite" : "none",
            }} />
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {loading ? "Authenticating..." : success ? "Access granted" : "Ready to connect"}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shakeX {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes checkPop {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
}
