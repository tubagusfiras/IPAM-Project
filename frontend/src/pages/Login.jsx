import { useState } from "react";
import { setToken } from "../api.js";

export default function Login({ onLoginSuccess, dark }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(()=>({}));
        throw new Error(d.detail || "Login failed");
      }
      const data = await res.json();
      setToken(data.token);
      localStorage.setItem("ipam_user", JSON.stringify(data.user));
      onLoginSuccess(data.user);
    } catch (e) {
      setError(e.message || "Login failed");
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"var(--bg)",
    }}>
      <div style={{width:"100%",maxWidth:400,padding:20}}>

        {/* Logo / Brand */}
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:36,justifyContent:"center"}}>
          <img src="/sdi_logo.png" alt="SDI"
            style={{width:48,height:48,borderRadius:12,objectFit:"contain",
              boxShadow:"0 2px 8px rgba(37,99,235,0.15)"}}/>
          <div>
            <div style={{fontSize:20,fontWeight:700,color:"var(--text)",lineHeight:1.2}}>IPAM SDI</div>
            <div style={{fontSize:11,color:"var(--text-dim)"}}>IP Address Manager</div>
          </div>
        </div>

        {/* Login card */}
        <form onSubmit={handleSubmit} className="card" style={{padding:32}}>
          <div style={{marginBottom:24}}>
            <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:2}}>Welcome back</div>
            <div style={{fontSize:12,color:"var(--text-muted)"}}>Sign in to manage your IP network</div>
          </div>

          {error && (
            <div style={{
              marginBottom:16,padding:"10px 14px",borderRadius:"var(--radius-sm)",
              background:"var(--danger-surface)",border:"1px solid var(--danger-border)",
              color:"var(--danger)",fontSize:13,display:"flex",alignItems:"center",gap:8,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
              letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Username</label>
            <input value={username} onChange={e=>setUsername(e.target.value)}
              placeholder="admin" className="input" autoFocus
              style={{height:42,fontSize:14}} disabled={loading}/>
          </div>

          <div style={{marginBottom:24}}>
            <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
              letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
              placeholder="Enter your password" className="input"
              style={{height:42,fontSize:14}} disabled={loading}/>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{width:"100%",height:44,fontSize:14,fontWeight:600,borderRadius:"var(--radius-sm)"}}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div style={{textAlign:"center",marginTop:20,fontSize:11,color:"var(--text-dim)",lineHeight:1.6}}>
          PT Sumber Data Indonesia<br/>
          <span style={{fontSize:10}}>Internal Use Only</span>
        </div>
      </div>
    </div>
  );
}
