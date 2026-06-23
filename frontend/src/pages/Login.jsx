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
      <div style={{width:"100%",maxWidth:380,padding:20}}>

        {/* Logo / Brand */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:32,justifyContent:"center"}}>
          <img src="/sdi_logo.png" alt="SDI"
            style={{width:42,height:42,borderRadius:10,objectFit:"contain"}}/>
          <div>
            <div style={{fontSize:17,fontWeight:700,color:"var(--text)",lineHeight:1.1}}>IPAM SDI</div>
            <div style={{fontSize:11,color:"var(--text-dim)"}}>IP Address Management</div>
          </div>
        </div>

        {/* Login card */}
        <form onSubmit={handleSubmit} className="card" style={{padding:28}}>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:16,fontWeight:700,color:"var(--text)",marginBottom:4}}>Sign in</div>
            <div style={{fontSize:12,color:"var(--text-muted)"}}>Enter your credentials to continue</div>
          </div>

          {error && (
            <div style={{
              marginBottom:16,padding:"10px 14px",borderRadius:"var(--radius-sm)",
              background:"var(--danger-surface)",border:"1px solid var(--danger-border)",
              color:"var(--danger)",fontSize:13,
            }}>{error}</div>
          )}

          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
              letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Username</label>
            <input value={username} onChange={e=>setUsername(e.target.value)}
              placeholder="e.g. firas" className="input" autoFocus
              style={{height:40,fontSize:14}} disabled={loading}/>
          </div>

          <div style={{marginBottom:22}}>
            <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
              letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
              placeholder="••••••••" className="input"
              style={{height:40,fontSize:14}} disabled={loading}/>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{width:"100%",height:42,fontSize:14,fontWeight:600}}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div style={{textAlign:"center",marginTop:20,fontSize:11,color:"var(--text-dim)"}}>
          PT Sumber Data Indonesia &middot; Internal Use Only
        </div>
      </div>
    </div>
  );
}
