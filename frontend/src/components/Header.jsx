import { useState, useEffect } from "react";
import { getToken } from "../api.js";
import { Icons } from "./ui.jsx";

export function Header({ title, subtitle, onBack, dark, onToggleDark, collapsed, user, onLogout, onNavigate, onToggle }) {
  const [search, setSearch] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const initials = (user?.username || "??").slice(0,2).toUpperCase();
  const roleLabel = user?.role === "admin" ? "Administrator" : "User";

  // Debounced search
  useEffect(() => {
    if (search.length < 2) { setSearchResults(null); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const token = getToken();
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(search)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) setSearchResults(await res.json());
      } catch {} finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Close on outside click
  useEffect(() => {
    const close = () => { setSearchResults(null); setSearching(false); };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  // Fetch notifications
  useEffect(() => {
    if (!showNotif) return;
    setNotifLoading(true);
    fetch("/api/v1/ping/summary")
      .then(r => r.json())
      .then(d => {
        if (d.offline > 0) {
          setNotifs([{ type:"ping", text:`${d.offline} IPs offline from global`, ts:new Date() }]);
          setNotifUnread(1);
        }
      })
      .catch(() => {})
      .finally(() => setNotifLoading(false));
  }, [showNotif]);

  const handleSelect = (type, item) => {
    setSearch(""); setSearchResults(null);
    if (type === "blocks" && item?.id) onNavigate("block-detail", { id: item.id, prefix: item.label || item.name });
    else if (type === "customers") onNavigate("customers");
    else if (type === "allocations") onNavigate("ipv4");
  };

  const CAT_COLORS = { blocks:"#3b82f6", allocations:"#22c55e", customers:"#f97316" };

  return (
    <header style={{
      position:"fixed", top:0, right:0, zIndex:20,
      left: collapsed ? "var(--sidebar-collapsed, 60px)" : "var(--sidebar-w, 220px)",
      height:"var(--topbar-h, 52px)",
      background:"var(--bg-secondary, var(--bg))",
      borderBottom:"1px solid var(--border-subtle)",
      display:"flex", alignItems:"center", gap:12,
      padding:"0 20px",
      transition:"left var(--transition)",
    }}>
      {/* Hamburger menu for mobile */}
      {!onBack && (
        <button onClick={onToggle}
          style={{display:"none",alignItems:"center",justifyContent:"center",padding:6,background:"none",border:"none",color:"var(--text-muted)",cursor:"pointer",borderRadius:6}}
          className="mobile-menu-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      )}
      {onBack && (
        <button onClick={onBack}
          style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:"var(--text-muted)",cursor:"pointer",padding:"6px 10px",borderRadius:6,fontSize:13,fontWeight:500}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
      )}

      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:600,fontSize:14,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
        {subtitle && <div style={{fontSize:11,color:"var(--text-muted)"}}>{subtitle}</div>}
      </div>

      {/* Search */}
      <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
        <div style={{position:"relative",display:"flex",alignItems:"center"}}>
          <span style={{position:"absolute",left:10,color:"var(--text-dim)",pointerEvents:"none",zIndex:1}}>
            {searching ? <span style={{fontSize:12}}>⟳</span> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>}
          </span>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search IP, Network, Customer..."
            style={{
              width:220,height:34,paddingLeft:32,paddingRight:10,fontSize:13,outline:"none",
              background:"var(--input-bg)",border:"1px solid var(--input-border)",borderRadius:"var(--radius-sm)",
              color:"var(--text)",fontFamily:"var(--font-main)",
              transition:"width 0.2s, border-color 0.15s",
            }}
            onFocus={e=>{e.target.style.width="280px";e.target.style.borderColor="var(--accent)"}}
            onBlur={e=>{e.target.style.width="220px";e.target.style.borderColor="var(--input-border)"}}/>
        </div>
        {searchResults && (
          <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,width:380,background:"var(--surface-1)",border:"1px solid var(--border-soft)",borderRadius:"var(--radius)",boxShadow:"var(--shadow-lg)",overflow:"hidden",zIndex:100}}>
            {["blocks","allocations","customers"].map(cat=>{
              const items = searchResults[cat]||[];
              return items.length > 0 ? (
                <div key={cat}>
                  <div style={{padding:"6px 12px",fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em",color:CAT_COLORS[cat]||"var(--text-dim)",background:"var(--surface-2)"}}>{cat}</div>
                  {items.slice(0,4).map((item,i)=>(
                    <div key={i} onClick={()=>handleSelect(cat,item)} style={{padding:"7px 12px",display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,transition:"background 0.1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontFamily:"var(--font-mono)",color:"var(--accent)",fontWeight:600}}>{item.label||item.name}</span>
                      {item.name && <span style={{color:"var(--text-dim)",marginLeft:"auto",fontSize:10}}>{item.name}</span>}
                    </div>
                  ))}
                </div>
              ) : null;
            })}
            {Object.values(searchResults).flat().length === 0 && (
              <div style={{padding:"12px",textAlign:"center",fontSize:12,color:"var(--text-dim)"}}>No results</div>
            )}
          </div>
        )}
      </div>

      {/* Notifications */}
      <div style={{position:"relative"}}>
        <button onClick={()=>setShowNotif(v=>!v)}
          style={{position:"relative",width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",background:"var(--surface-2)",border:"none",color:"var(--text-muted)",transition:"background 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
          onMouseLeave={e=>e.currentTarget.style.background="var(--surface-2)"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
          {notifUnread > 0 && <span style={{position:"absolute",top:4,right:4,width:7,height:7,borderRadius:"50%",background:"var(--danger)"}}/>}
        </button>
        {showNotif && (
          <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,width:280,background:"var(--surface-1)",border:"1px solid var(--border-soft)",borderRadius:"var(--radius)",boxShadow:"var(--shadow-lg)",zIndex:100,overflow:"hidden"}}>
            <div style={{padding:"8px 12px",fontSize:11,fontWeight:600,color:"var(--text)",borderBottom:"1px solid var(--border-soft)"}}>Notifications</div>
            {notifs.length === 0 ? (
              <div style={{padding:"16px",textAlign:"center",fontSize:11,color:"var(--text-dim)"}}>
                {notifLoading ? "Loading..." : "No notifications"}
              </div>
            ) : notifs.map((n,i)=>(
              <div key={i} style={{padding:"10px 12px",fontSize:12,color:"var(--text)",display:"flex",gap:8,cursor:"pointer",borderBottom:"1px solid var(--border-subtle)"}}
                onClick={()=>{setShowNotif(false); onNavigate("global-ping");}}>
                <span style={{fontSize:14}}>{n.type==="ping"?"🌐":""}</span>
                <div><div>{n.text}</div><div style={{fontSize:10,color:"var(--text-dim)",marginTop:2}}>{n.ts?.toLocaleTimeString()}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Theme toggle */}
      <button onClick={onToggleDark}
        style={{width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",background:"var(--surface-2)",border:"none",color:"var(--text-muted)",transition:"background 0.15s",fontSize:16}}
        onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
        onMouseLeave={e=>e.currentTarget.style.background="var(--surface-2)"}>
        {dark ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>}
      </button>

      {/* User menu */}
      <div style={{position:"relative"}}>
        <button onClick={()=>setShowUserMenu(v=>!v)}
          style={{width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",background:"var(--accent-dim)",border:"none",color:"var(--accent)",fontSize:12,fontWeight:700,transition:"background 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.background="var(--surface-5)"}
          onMouseLeave={e=>e.currentTarget.style.background="var(--accent-dim)"}>
          {initials}
        </button>
        {showUserMenu && (
          <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,width:200,background:"var(--surface-1)",border:"1px solid var(--border-soft)",borderRadius:"var(--radius)",boxShadow:"var(--shadow-lg)",zIndex:100,overflow:"hidden"}}
            onClick={()=>setShowUserMenu(false)}>
            <div style={{padding:"10px 12px",borderBottom:"1px solid var(--border-soft)"}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{user?.username}</div>
              <div style={{fontSize:11,color:"var(--text-muted)"}}>{user?.email||roleLabel}</div>
            </div>
            <div onClick={()=>onNavigate("settings")} style={{padding:"8px 12px",fontSize:12,color:"var(--text-muted)",cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Settings</div>
            <div onClick={onLogout} style={{padding:"8px 12px",fontSize:12,color:"var(--danger)",cursor:"pointer",borderTop:"1px solid var(--border-subtle)"}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Sign Out</div>
          </div>
        )}
      </div>
    </header>
  );
}
