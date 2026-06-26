import { useState, useEffect, Suspense, lazy } from "react";
import { getToken, getStoredUser, clearToken } from "./api.js";
import { ToastProvider, useToast } from "./components/Toast.jsx";
import Login from "./pages/Login.jsx";

const Dashboard  = lazy(()=>import("./pages/Dashboard.jsx"));
const Blocks     = lazy(()=>import("./pages/Blocks.jsx"));
const BlockDetail= lazy(()=>import("./pages/BlockDetail.jsx"));
const Customers  = lazy(()=>import("./pages/Customers.jsx"));
const Vlans      = lazy(()=>import("./pages/Vlans.jsx"));
const Sites      = lazy(()=>import("./pages/Sites.jsx"));
const Export     = lazy(()=>import("./pages/Export.jsx"));
const IPScan     = lazy(()=>import("./pages/IPScan.jsx"));
const AuditLogs  = lazy(()=>import("./pages/AuditLogs.jsx"));
const ImportPage = lazy(()=>import("./pages/Import.jsx"));
const PingTrace  = lazy(()=>import("./pages/PingTrace.jsx"));
const SettingsPage = lazy(()=>import("./pages/Settings.jsx"));

const NAV_GROUPS = [
  {
    label: "IPAM",
    items: [
      { id:"dashboard", label:"Dashboard",     icon:"dashboard" },
      { id:"ipv4",      label:"IP Networks",   icon:"network"   },
      { id:"ipv6",      label:"IPv6 Networks", icon:"network6"  },
      { id:"customers", label:"Customers",     icon:"customers" },
      { id:"vlans",     label:"VLANs",         icon:"vlan"      },
      { id:"sites",     label:"Sites",         icon:"sites"     },
    ]
  },
  {
    label: "TOOLS",
    items: [
      { id:"export", label:"Export",       icon:"export" },
      { id:"scan",   label:"IP Scan",      icon:"scan" },
      { id:"ping",   label:"Ping & Trace", icon:"ping" },
    ]
  },
  {
    label: "ADMIN",
    items: [
      { id:"audit",    label:"Audit Logs", icon:"audit" },
      { id:"import",   label:"Import CSV", icon:"import" },
      { id:"settings", label:"Settings",   icon:"settings" },
    ]
  }
];

const IC = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  network:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4M12 11l-5.5 6M12 11l5.5 6"/></svg>,
  network6:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a15 15 0 010 18M3 12h18"/></svg>,
  customers: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  vlan:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></svg>,
  sites:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>,
  import:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  export:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  scan:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>,
  ping:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6l4 6 4-4 4 8 4-6 2 3"/></svg>,
  audit:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  settings:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>,
  sun:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  moon:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  bell:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,
  search:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  chevleft:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  collapse:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>,
};

function Icon({ id, size=16 }) {
  return <span style={{width:size,height:size,display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{IC[id]}</span>;
}

function Sidebar({ active, onNavigate, collapsed, onToggle, user }) {
  return (
    <aside style={{
      position:"fixed", left:0, top:0, height:"100%", zIndex:30,
      width: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-w)",
      background:"var(--bg-secondary, var(--bg))",
      borderRight:"1px solid var(--border-soft)",
      display:"flex", flexDirection:"column",
      transition:"width var(--transition)",
      overflow:"hidden",
    }}>
      {/* Logo */}
      <div style={{
        display:"flex", alignItems:"center", gap:10,
        padding:"0 14px", height:"var(--topbar-h)",
        borderBottom:"1px solid var(--border-subtle)",
        flexShrink:0,
      }}>
        <div onClick={(e)=>{e.stopPropagation(); onNavigate("dashboard");}} style={{
          width:28, height:28, borderRadius:7, flexShrink:0,
          background:"transparent", display:"flex",
          alignItems:"center", justifyContent:"center",
          cursor:"pointer", overflow:"hidden",
        }}>
          <img src="/sdi_logo.png" alt="SDI" style={{width:28,height:28,objectFit:"contain"}}/>
        </div>
        {!collapsed && (
          <div style={{overflow:"hidden"}}>
            <div style={{fontWeight:700,color:"var(--text)",fontSize:14,whiteSpace:"nowrap"}}>IPAM</div>
            <div style={{fontSize:10,color:"var(--text-muted)",whiteSpace:"nowrap"}}>IP Address Management</div>
          </div>
        )}
      </div>

      {/* Nav groups */}
      <nav style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"8px 8px"}}>
        {NAV_GROUPS.map(group => (
          <div key={group.label} style={{marginBottom:4}}>
            {!collapsed && (
              <div style={{
                padding:"10px 8px 4px",
                fontSize:10, fontWeight:600,
                textTransform:"uppercase", letterSpacing:"0.1em",
                color:"var(--text-dim)",
              }}>{group.label}</div>
            )}
            {group.items.map(item => (
              <button
                key={item.id}
                onClick={() => !item.soon && onNavigate(item.id)}
                title={collapsed ? item.label : ""}
                className={`sidebar-item ${active===item.id ? "sidebar-item-active" : ""}`}
                style={{
                  width:"100%", marginBottom:2,
                  opacity: item.soon ? 0.45 : 1,
                  cursor: item.soon ? "not-allowed" : "pointer",
                  justifyContent: collapsed ? "center" : "flex-start",
                }}
              >
                <Icon id={item.icon} size={16}/>
                {!collapsed && <span style={{flex:1,textAlign:"left"}}>{item.label}</span>}
                {!collapsed && item.soon && (
                  <span style={{
                    fontSize:9,fontWeight:600,
                    background:"var(--surface-4)",
                    color:"var(--text-muted)",
                    padding:"1px 6px",borderRadius:99,
                  }}>SOON</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{padding:8,borderTop:"1px solid var(--border-subtle)",flexShrink:0}}>
        {!collapsed && (
          <div style={{
            display:"flex",alignItems:"center",gap:8,
            padding:"6px 8px",borderRadius:8,
            marginBottom:4,
          }}>
            <div style={{
              width:28,height:28,borderRadius:"50%",flexShrink:0,
              background:"var(--accent-dim)",
              display:"flex",alignItems:"center",justifyContent:"center",
            }}>
              <span style={{color:"var(--accent)",fontSize:11,fontWeight:700}}>{(user?.username||"??").slice(0,2).toUpperCase()}</span>
            </div>
            <div style={{overflow:"hidden"}}>
              <div style={{fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap"}}>{user?.username||"—"}</div>
              <div style={{fontSize:10,color:"var(--text-muted)",whiteSpace:"nowrap"}}>{user?.role==="admin"?"Administrator":"User"}</div>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="btn-ghost btn-icon"
          style={{
            width:"100%",
            transform: collapsed ? "rotate(180deg)" : "none",
            transition:"transform var(--transition)",
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon id="collapse" size={15}/>
        </button>
      </div>
    </aside>
  );
}

function Header({ title, subtitle, onBack, dark, onToggleDark, collapsed, user, onLogout, onNavigate }) {
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

  const handleSelect = (type, item) => {
    setSearch(""); setSearchResults(null);
    const go = onNavigate;
    if (type === "blocks" && item?.id) go("block-detail", { id: item.id, prefix: item.label || item.name });
    else if (type === "customers") go("customers");
    else if (type === "allocations") go("ipv4");
  };

  const CAT_COLORS = { blocks:"#3b82f6", allocations:"#22c55e", customers:"#f97316" };

  return (
    <header style={{
      position:"fixed", top:0, right:0, zIndex:20,
      left: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-w)",
      height:"var(--topbar-h)",
      background:"var(--bg-secondary, var(--bg))",
      borderBottom:"1px solid var(--border-subtle)",
      display:"flex", alignItems:"center", gap:12,
      padding:"0 20px",
      transition:"left var(--transition)",
    }}>
      {onBack && (
        <button onClick={onBack} className="btn-ghost btn-sm"
          style={{display:"flex",alignItems:"center",gap:4}}>
          <Icon id="chevleft" size={14}/>
          <span>Back</span>
        </button>
      )}

      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:600,fontSize:14,color:"var(--text)",
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {title}
        </div>
        {subtitle && <div style={{fontSize:11,color:"var(--text-muted)"}}>{subtitle}</div>}
      </div>

      {/* Search with Autocomplete */}
      <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
        <div style={{position:"relative",display:"flex",alignItems:"center"}}>
          <span style={{position:"absolute",left:10,color:"var(--text-dim)",pointerEvents:"none",zIndex:1}}>
            {searching ? <span style={{fontSize:12}}>⟳</span> : <Icon id="search" size={14}/>}
          </span>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search IP, Network, Customer..."
            className="input"
            style={{paddingLeft:32,width:280,height:34,fontSize:13}}
          />
          {search && (
            <button onClick={()=>{setSearch("");setSearchResults(null);}}
              style={{position:"absolute",right:8,background:"none",border:"none",color:"var(--text-dim)",cursor:"pointer",fontSize:14,padding:"2px 4px",zIndex:1}}>✕</button>
          )}
        </div>

        {/* Dropdown Results */}
        {searchResults && (searchResults.blocks?.length||searchResults.allocations?.length||searchResults.customers?.length) && (
          <div style={{
            position:"absolute",top:"calc(100% + 6px)",left:0,right:0,zIndex:200,
            background:"var(--modal-bg)",border:"1px solid var(--modal-border)",
            borderRadius:"var(--radius)",boxShadow:"var(--shadow-lg)",
            maxHeight:360,overflowY:"auto",fontSize:13,
          }}>
            {Object.entries(searchResults).map(([cat, items]) =>
              items?.length > 0 && (
                <div key={cat}>
                  <div style={{padding:"6px 10px",fontSize:9,fontWeight:700,textTransform:"uppercase",
                    letterSpacing:"0.08em",color:CAT_COLORS[cat]||"var(--text-dim)",
                    background:"var(--surface-2,transparent)",borderBottom:"1px solid var(--border-subtle)"}}>
                    {cat}
                  </div>
                  {items.slice(0,5).map((item,i) => (
                    <div key={i} onClick={()=>handleSelect(cat,item)}
                      style={{padding:"7px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,
                        borderBottom:i<items.slice(0,5).length-1?"1px solid var(--border-subtle)":"none",
                        transition:"background 0.1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:CAT_COLORS[cat]||"var(--text-dim)",flexShrink:0}}/>
                      <div>
                        <div style={{fontWeight:500,color:"var(--text)",fontFamily:cat==="blocks"||cat==="allocations"?"monospace":"inherit"}}>
                          {item.label || item.name}
                        </div>
                        <div style={{fontSize:10,color:"var(--text-dim)",marginTop:1}}>{cat==="customers"?item.code||"":item.ip_version||""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Dark mode */}
      <button onClick={onToggleDark} className="btn-ghost btn-icon" title="Toggle theme">
        <Icon id={dark?"sun":"moon"} size={16}/>
      </button>

      {/* Notifications */}
      <div style={{position:"relative"}}>
        <button className="btn-ghost btn-icon" style={{position:"relative"}}
          onClick={async () => {
            setShowNotif(v => !v);
            if (!showNotif) {
              setNotifLoading(true);
              try {
                const token = localStorage.getItem("ipam_token");
                const res = await fetch("/api/v1/audit-logs?limit=15", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
                const d = await res.json();
                setNotifs(d.items || []);
                setNotifUnread(0);
              } catch {}
              setNotifLoading(false);
            }
          }}>
          <Icon id="bell" size={16}/>
          {notifUnread > 0 && (
            <span style={{position:"absolute",top:2,right:2,width:8,height:8,borderRadius:"50%",
              background:"var(--danger)",border:"2px solid var(--bg)"}}/>
          )}
        </button>
        {showNotif && (
          <>
            <div onClick={() => setShowNotif(false)} style={{position:"fixed",inset:0,zIndex:99}}/>
            <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,zIndex:100,
              width:340,background:"var(--bg-secondary,var(--bg))",
              border:"1px solid var(--border-medium)",borderRadius:"var(--radius)",
              boxShadow:"var(--shadow-lg)",overflow:"hidden"}}>
              <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border-soft)",
                display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>Recent Activity</span>
                <span style={{fontSize:10,color:"var(--text-dim)"}}>Last 15 events</span>
              </div>
              {notifLoading ? (
                <div style={{padding:"24px 0",textAlign:"center",color:"var(--text-dim)",fontSize:12}}>Loading...</div>
              ) : notifs.length === 0 ? (
                <div style={{padding:"24px 0",textAlign:"center",color:"var(--text-dim)",fontSize:12}}>No activity yet</div>
              ) : (
                <div style={{maxHeight:360,overflowY:"auto"}}>
                  {notifs.map((n, i) => {
                    const actionColor = n.action === "create" ? "var(--success)" : n.action === "delete" ? "var(--danger)" : "var(--accent)";
                    const actionBg = n.action === "create" ? "var(--success-surface)" : n.action === "delete" ? "var(--danger-surface)" : "var(--accent-dim)";
                    const ts = new Date(n.created_at);
                    const timeStr = ts.toLocaleString("id-ID", {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
                    return (
                      <div key={i} style={{padding:"10px 14px",borderBottom:i<notifs.length-1?"1px solid var(--border-subtle)":"none",
                        transition:"background 0.1s"}}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                          <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:99,
                            background:actionBg,color:actionColor,textTransform:"uppercase"}}>{n.action}</span>
                          <span style={{fontSize:10,color:"var(--text-dim)",marginLeft:"auto"}}>{timeStr}</span>
                        </div>
                        <div style={{fontSize:12,color:"var(--text)",fontFamily:n.entity_type==="allocation"||n.entity_type==="block"?"var(--font-mono)":"inherit"}}>
                          {n.entity_prefix || n.description || "—"}
                        </div>
                        <div style={{fontSize:10,color:"var(--text-dim)",marginTop:2,display:"flex",gap:8}}>
                          <span style={{textTransform:"capitalize"}}>{n.entity_type}</span>
                          {n.changed_by && <span>by {n.changed_by}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{padding:"8px 14px",borderTop:"1px solid var(--border-soft)",textAlign:"center"}}>
                <button onClick={()=>{setShowNotif(false); if(typeof onNavigate==="function") onNavigate("audit");}}
                  style={{fontSize:11,color:"var(--accent)",background:"none",border:"none",cursor:"pointer"}}>
                  View all audit logs →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* User */}
      <div style={{position:"relative"}}>
        <div onClick={()=>setShowUserMenu(v=>!v)} style={{
          display:"flex",alignItems:"center",gap:8,
          paddingLeft:12,cursor:"pointer",
          borderLeft:"1px solid var(--border-soft)",
        }}>
          <div style={{
            width:30,height:30,borderRadius:"50%",
            background:"var(--accent-dim)",
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
          }}>
            <span style={{color:"var(--accent)",fontSize:11,fontWeight:700}}>{initials}</span>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>{user?.username || "—"}</div>
            <div style={{fontSize:10,color:"var(--text-muted)"}}>{roleLabel}</div>
          </div>
        </div>

        {showUserMenu && (
          <>
            <div onClick={()=>setShowUserMenu(false)} style={{
              position:"fixed",inset:0,zIndex:90,
            }}/>
            <div style={{
              position:"absolute",top:"calc(100% + 8px)",right:0,zIndex:100,
              background:"var(--modal-bg)",border:"1px solid var(--modal-border)",
              borderRadius:"var(--radius)",boxShadow:"var(--shadow-lg)",
              minWidth:180,padding:6,
            }}>
              <div style={{padding:"8px 10px",borderBottom:"1px solid var(--border-soft)",marginBottom:4}}>
                <div style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>{user?.email}</div>
              </div>
              <button onClick={onLogout} style={{
                width:"100%",textAlign:"left",padding:"8px 10px",
                background:"none",border:"none",cursor:"pointer",
                fontSize:13,color:"var(--danger)",borderRadius:"var(--radius-sm)",
              }} onMouseEnter={e=>e.currentTarget.style.background="var(--danger-surface)"}
                 onMouseLeave={e=>e.currentTarget.style.background="none"}>
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

function Loading() {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:240,gap:12}}>
      <div style={{
        width:32,height:32,borderRadius:"50%",
        border:"2px solid var(--accent-dim)",
        borderTopColor:"var(--accent)",
        animation:"spin 0.8s linear infinite",
      }}/>
      <span style={{fontSize:13,color:"var(--text-muted)"}}>Loading...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function App() {
  const parseHash = () => {
    const h = window.location.hash.replace("#","");
    if (h.startsWith("block-detail/")) return { page:"block-detail", id:h.split("/")[1] };
    if (h) return { active: h };
    return null;
  };
  const [active,    setActive]    = useState(()=>{ const p=parseHash(); return p?.active||"dashboard"; });
  const [route,     setRoute]     = useState(()=>{ const p=parseHash(); return p?.page==="block-detail"?p:null; });
  const [dark,      setDark]      = useState(()=>document.documentElement.classList.contains("dark"));
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState(() => getStoredUser());
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = getToken();
    const storedUser = getStoredUser();
    if (token && storedUser) {
      // Verify token masih valid via /auth/me
      fetch("/api/v1/auth/me", { headers: { "Authorization": `Bearer ${token}` } })
        .then(res => {
          if (res.ok) { setUser(storedUser); }
          else { clearToken(); setUser(null); }
        })
        .catch(() => { clearToken(); setUser(null); })
        .finally(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  // ── GLOBAL TOAST via custom event ──
  const addToast = useToast();
  useEffect(() => {
    const h = (e) => addToast(e.detail.msg, e.detail.type);
    window.addEventListener("app-toast", h);
    return () => window.removeEventListener("app-toast", h);
  }, [addToast]);

  const handleLogout = () => {
    clearToken();
    setUser(null);
  };

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.classList.add("dark");
    else      document.documentElement.classList.remove("dark");
    localStorage.setItem("sdi-theme", next ? "dark" : "light");
  };

  const navigate = (page, params={}) => {
    if (page === "block-detail") {
      window.location.hash = "block-detail/" + params.id;
      setRoute({ page, ...params });
    } else {
      window.location.hash = page;
      setRoute(null); setActive(page);
    }
  };

  const goBack = () => {
    const from = route?.from || "ipv4";
    window.location.hash = from;
    setActive(from); setRoute(null);
  };

  useEffect(()=>{
    const onHash = () => {
      const p = parseHash();
      if (p?.page==="block-detail") setRoute(p);
      else if (p?.active) { setRoute(null); setActive(p.active); }
    };
    window.addEventListener("hashchange", onHash);
    return ()=>window.removeEventListener("hashchange", onHash);
  }, []);

  const allItems = NAV_GROUPS.flatMap(g=>g.items);
  const pageTitle = route?.page === "block-detail"
    ? (route.prefix || "Block Detail")
    : allItems.find(n=>n.id===active)?.label || "IPAM";
  const pageSubtitle = null;

  const renderPage = () => {
    if (route?.page === "block-detail")
      return <BlockDetail blockId={route.id} onBack={goBack} dark={dark}/>;
    switch(active) {
      case "dashboard": return <Dashboard onNavigate={navigate}/>;
      case "ipv4":      return <Blocks ipVersion="IPv4" onSelectBlock={id=>navigate("block-detail",{id,from:"ipv4"})} dark={dark}/>;
      case "ipv6":      return <Blocks ipVersion="IPv6" onSelectBlock={id=>navigate("block-detail",{id,from:"ipv6"})} dark={dark}/>;
      case "customers": return <Customers/>;
      case "vlans":     return <Vlans/>;
      case "sites":     return <Sites/>;
      case "export":    return <Export dark={dark}/>;
      case "scan":      return <IPScan/>;
      case "audit":     return <AuditLogs/>;
      case "ping":      return <PingTrace/>;
      case "import":    return <ImportPage/>;
      case "settings":  return <SettingsPage dark={dark} onToggleDark={toggleDark}/>;
      default:          return <Dashboard onNavigate={navigate}/>;
    }
  };

  // Loading state saat verify token
  if (!authChecked) {
    return (
      <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",
        alignItems:"center",justifyContent:"center"}}>
        <div style={{
          width:32,height:32,borderRadius:"50%",
          border:"2px solid var(--accent-dim)",borderTopColor:"var(--accent)",
          animation:"spin 0.8s linear infinite",
        }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Belum login -> tampilkan Login page
  if (!user) {
    return <Login dark={dark} onLoginSuccess={(u)=>setUser(u)}/>;
  }

  return (
    <ToastProvider>
      <div style={{minHeight:"100vh",background:"var(--bg)"}}>
        <Sidebar
          active={route ? "" : active}
          onNavigate={navigate}
          collapsed={collapsed}
          onToggle={()=>setCollapsed(v=>!v)}
          user={user}
        />
        <Header
          title={pageTitle}
          subtitle={pageSubtitle}
          onBack={route ? goBack : null}
          dark={dark}
          onToggleDark={toggleDark}
          collapsed={collapsed}
          user={user}
          onLogout={handleLogout}
          onNavigate={navigate}
        />
        <main style={{
          paddingTop:"var(--topbar-h)",
          marginLeft: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-w)",
          transition:"margin-left var(--transition)",
          minHeight:"100vh",
        }}>
          <div style={{padding:24}}>
            <Suspense fallback={<Loading/>}>
              {renderPage()}
            </Suspense>
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
