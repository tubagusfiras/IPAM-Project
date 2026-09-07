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

  // Ctrl+K focus search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
      if (e.key === "Escape") { setSearch(""); document.getElementById("global-search")?.blur(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

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

  // Periodic notification check (every 30s)
  useEffect(() => {
    const checkOffline = async () => {
      try {
        const res = await fetch("/api/v1/ping/summary");
        const d = await res.json();
        if (d.offline > 0) {
          const existing = notifs.find(n => n.type === "ping" && n.offline === d.offline);
          if (!existing) {
            setNotifs(prev => [{ type:"ping", text:`${d.offline} IPs offline from global`, ts:new Date(), offline:d.offline }, ...prev].slice(0,10));
            setNotifUnread(prev => prev + 1);
          }
        }
      } catch {}
    };
    checkOffline();
    const iv = setInterval(checkOffline, 30000);
    return () => clearInterval(iv);
  }, []);

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
    else if (type === "allocations" && item?.block_id) onNavigate("block-detail", { id: item.block_id, prefix: item.label || item.name });
    else if (type === "customers") onNavigate("customers");
    else if (type === "vlans") onNavigate("vlans");
    else if (type === "allocations") onNavigate("ipv4");
  };

  const CAT_COLORS = { blocks:"#3b82f6", allocations:"#22c55e", customers:"#f97316", vlans:"#a855f7" };

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
          <input id="global-search" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search IP, Network, Customer..."
            style={{
              width:220,height:34,paddingLeft:32,paddingRight:search ? 10 : 50,fontSize:13,outline:"none",
              background:"var(--input-bg)",border:"1px solid var(--input-border)",borderRadius:"var(--radius-sm)",
              color:"var(--text)",fontFamily:"var(--font-main)",
              transition:"width 0.2s, border-color 0.15s",
            }}
            onFocus={e=>{e.target.style.width="280px";e.target.style.borderColor="var(--accent)"}}
            onBlur={e=>{e.target.style.width="220px";e.target.style.borderColor="var(--input-border)"}}/>
          {!search && (
            <span style={{position:"absolute",right:8,pointerEvents:"none",fontSize:10,color:"var(--text-dim)",border:"1px solid var(--border-medium)",borderRadius:3,padding:"1px 5px",fontFamily:"monospace",letterSpacing:"0.03em"}}>⌘K</span>
          )}
        </div>
        {searchResults && (
          <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,width:420,maxHeight:480,overflowY:"auto",background:"var(--surface-1)",border:"1px solid var(--border-soft)",borderRadius:"var(--radius)",boxShadow:"var(--shadow-lg)",overflow:"hidden",zIndex:100}}>
            {["blocks","allocations","customers","vlans"].map(cat=>{
              const items = searchResults[cat]||[];
              return items.length > 0 ? (
                <div key={cat}>
                  <div style={{padding:"6px 12px",fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em",color:CAT_COLORS[cat]||"var(--text-dim)",background:"var(--surface-2)"}}>{cat}</div>
                  {items.slice(0,4).map((item,i)=>(
                    <div key={i} onClick={()=>handleSelect(cat,item)} style={{padding:"7px 12px",display:"flex",flexDirection:"column",gap:2,cursor:"pointer",fontSize:12,transition:"background 0.1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontFamily:"var(--font-mono)",color:"var(--accent)",fontWeight:600}}>{cat==="vlans" ? `VLAN ${item.label}` : (item.label||item.name)}</span>
                        {cat==="allocations" && item.block_prefix && <span style={{color:"var(--text-dim)",fontSize:10}}>in {item.block_prefix}</span>}
                        {cat==="allocations" && item.status && <span style={{marginLeft:"auto",fontSize:9,padding:"1px 6px",borderRadius:99,background:"var(--surface-3)",color:"var(--text-muted)"}}>{item.status}</span>}
                        {cat==="customers" && item.code && <span style={{color:"var(--text-dim)",marginLeft:"auto",fontSize:10}}>{item.code}</span>}
                        {cat==="vlans" && <span style={{marginLeft:"auto",fontSize:9,padding:"1px 6px",borderRadius:99,background:"var(--surface-3)",color:"var(--text-muted)"}}>{item.status}</span>}
                      </div>
                      {cat==="allocations" && (item.customer_name || item.vlan_vid || item.description) && (
                        <div style={{fontSize:10,color:"var(--text-dim)",display:"flex",gap:6,flexWrap:"wrap"}}>
                          {item.customer_name && <span>{item.customer_name}</span>}
                          {item.vlan_vid && <span>VLAN {item.vlan_vid}{item.vlan_name?` (${item.vlan_name})`:""}</span>}
                          {item.description && <span style={{fontStyle:"italic"}}>{item.description}</span>}
                        </div>
                      )}
                      {cat==="blocks" && (item.name || item.description) && (
                        <div style={{fontSize:10,color:"var(--text-dim)"}}>
                          {item.name}{item.name && item.description ? " — " : ""}{item.description}
                        </div>
                      )}
                      {cat==="vlans" && item.name && (
                        <div style={{fontSize:10,color:"var(--text-dim)"}}>{item.name}</div>
                      )}
                      {cat==="customers" && (item.contact_email || item.alloc_count!=null) && (
                        <div style={{fontSize:10,color:"var(--text-dim)"}}>
                          {item.contact_email}{item.contact_email && item.alloc_count!=null ? " · " : ""}
                          {item.alloc_count!=null && `${item.alloc_count} allocations`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null;
            })}
            {Object.values(searchResults).flat().length === 0 && (
              <div style={{padding:"20px 12px",textAlign:"center",fontSize:12,color:"var(--text-dim)",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20" style={{opacity:0.4}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                No results for "{search}"
              </div>
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
          {notifUnread > 0 && <span className="notif-badge">{notifUnread > 9 ? '9+' : notifUnread}</span>}
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
