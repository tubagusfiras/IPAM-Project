import { useState, useRef, useEffect } from "react";
import { setToken } from "../api.js";
import { useI18n } from "../i18n.jsx";

const ACCENT = "var(--accent)";

export default function Login({ onLoginSuccess, dark }) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [shake, setShake] = useState(false);
  const userRef = useRef(null);

  useEffect(() => { userRef.current?.focus(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(t("login.rateLimit"));
        }
        throw new Error(data.detail || t("login.error"));
      }
      setToken(data.token);
      localStorage.setItem("ipam_user", JSON.stringify(data.user));
      onLoginSuccess(data.user);
    } catch (e) {
      setError(e.message || t("login.error"));
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: 20 }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 36, justifyContent: "center" }}>
          <img src="/sdi_logo.png" alt="SDI"
            style={{ width: 48, height: 48, borderRadius: 12, objectFit: "contain", boxShadow: "0 2px 8px rgba(37,99,235,0.15)" }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>IPAM</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>SDI Network Management</div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--surface-1)", border: "1px solid var(--border-medium)", borderRadius: 16,
          padding: "32px 28px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          animation: shake ? "shake 0.4s ease" : undefined,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 24, textAlign: "center" }}>{t("login.title")}</div>

          <form onSubmit={handleSubmit}>
            {/* Username */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("login.username")}</label>
              <input ref={userRef} value={username} onChange={e => setUsername(e.target.value)}
                placeholder={t("login.usernamePlaceholder")}
                autoComplete="username"
                style={{
                  width: "100%", height: 42, padding: "0 14px", fontSize: 14, borderRadius: 10,
                  border: "1px solid var(--border-medium)", background: "var(--surface-2)", color: "var(--text)",
                  outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
                  boxSizing: "border-box",
                }}
                onFocus={e => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = "0 0 0 3px var(--accent-dim)"; }}
                onBlur={e => { e.target.style.borderColor = "var(--border-medium)"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 20, position: "relative" }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("login.password")}</label>
              <div style={{ position: "relative" }}>
                <input value={password} onChange={e => setPassword(e.target.value)}
                  type={showPw ? "text" : "password"}
                  placeholder={t("login.passwordPlaceholder")}
                  autoComplete="current-password"
                  style={{
                    width: "100%", height: 42, padding: "0 40px 0 14px", fontSize: 14, borderRadius: 10,
                    border: "1px solid var(--border-medium)", background: "var(--surface-2)", color: "var(--text)",
                    outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
                    boxSizing: "border-box",
                  }}
                  onFocus={e => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = "0 0 0 3px var(--accent-dim)"; }}
                  onBlur={e => { e.target.style.borderColor = "var(--border-medium)"; e.target.style.boxShadow = "none"; }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4 }}>
                  {showPw ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, fontSize: 12, background: "var(--danger-surface)", color: "var(--danger)", border: "1px solid var(--danger-border)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading || !username.trim() || !password}
              style={{
                width: "100%", height: 42, borderRadius: 10, border: "none", cursor: loading ? "wait" : "pointer",
                background: loading ? "var(--surface-3)" : ACCENT, color: "#fff",
                fontSize: 14, fontWeight: 600, transition: "all 0.15s",
                opacity: !username.trim() || !password ? 0.5 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
              {loading ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16" style={{ animation: "spin 1s linear infinite" }}>
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                  <span>{t("login.processing")}</span>
                </>
                  ) : t("login.submit")}
            </button>
          </form>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "var(--text-dim)" }}>
          &copy; {new Date().getFullYear()} {t("login.footer")} &middot; ASN 56246
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
