import { useState } from "react";
import { Icons } from "./ui.jsx";

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
      { id:"import", label:"Import CSV",   icon:"import" },
      { id:"subnet", label:"Subnet Calc",  icon:"calc" },
      { id:"global-ping", label:"Global Ping", icon:"ping" },
    ]
  },
  {
    label: "ADMIN",
    items: [
      { id:"audit",    label:"Audit Logs", icon:"audit" },
      { id:"settings", label:"Settings",   icon:"settings" },
    ]
  }
];

const ICON_MAP = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  network: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4M12 11l-5.5 6M12 11l5.5 6"/></svg>,
  network6: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 3a15 15 0 010 18M3 12h18"/></svg>,
  customers: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  vlan: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></svg>,
  sites: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>,
  import: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  export: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  scan: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>,
  ping: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 6l4 6 4-4 4 8 4-6 2 3"/></svg>,
  audit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  calc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="16" y2="18"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>,
  sun: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  moon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  bell: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  chevleft: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="15 18 9 12 15 6"/></svg>,
  collapse: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>,
};

function Icon({ id, size=16 }) {
  return <span style={{width:size,height:size,display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{ICON_MAP[id]}</span>;
}

export function Sidebar({ active, onNavigate, collapsed, onToggle, user }) {
  return (
    <aside style={{
      position:"fixed", left:0, top:0, height:"100%", zIndex:30,
      width: collapsed ? "60px" : "220px",
      background:"var(--bg-secondary, var(--bg))",
      borderRight:"1px solid var(--border-soft)",
      display:"flex", flexDirection:"column",
      transition:"width var(--transition)",
      overflow:"hidden",
    }}>
      {/* Logo */}
      <div style={{
        display:"flex", alignItems:"center", gap:10,
        padding:"0 14px", height:"var(--topbar-h, 52px)",
        borderBottom:"1px solid var(--border-subtle)",
        flexShrink:0,
      }}>
        <div onClick={(e)=>{e.stopPropagation(); onNavigate("dashboard");}} style={{
          width:28, height:28, borderRadius:7, flexShrink:0,
          cursor:"pointer", overflow:"hidden",
        }}>
          <img src="/sdi_logo.png" alt="SDI" style={{width:28,height:28,objectFit:"contain"}}/>
        </div>
        {!collapsed && (
          <div style={{overflow:"hidden"}}>
            <div style={{fontWeight:700,color:"var(--text)",fontSize:14,whiteSpace:"nowrap"}}>IPAM</div>
            <div style={{fontSize:10,color:"var(--text-muted)",whiteSpace:"nowrap"}}>IP Address Manager</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"8px"}}>
        {NAV_GROUPS.map(group => (
          <div key={group.label} style={{marginBottom:4}}>
            {!collapsed && (
              <div style={{padding:"10px 8px 4px",fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--text-dim)"}}>{group.label}</div>
            )}
            {group.items.map(item => (
              <button key={item.id} onClick={() => !item.soon && onNavigate(item.id)}
                style={{
                  width:"100%", marginBottom:2, opacity: item.soon ? 0.45 : 1, cursor: item.soon ? "not-allowed" : "pointer",
                  display:"flex", alignItems:"center", gap:10, padding: collapsed ? "8px" : "8px 12px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  background: active===item.id ? "var(--accent-dim)" : "transparent",
                  border:"none", borderRadius:"var(--radius-sm)",
                  color: active===item.id ? "var(--accent)" : "var(--text-muted)",
                  transition:"all 0.15s",
                }}
                onMouseEnter={e=>{if (active!==item.id) e.currentTarget.style.background="var(--surface-3)"}}
                onMouseLeave={e=>{if (active!==item.id) e.currentTarget.style.background="transparent"}}
              >
                <Icon id={item.icon} size={16}/>
                {!collapsed && <span style={{flex:1,textAlign:"left",fontSize:13,fontWeight:500}}>{item.label}</span>}
                {!collapsed && item.soon && (
                  <span style={{fontSize:9,fontWeight:600,background:"var(--surface-4)",color:"var(--text-muted)",padding:"1px 6px",borderRadius:99}}>SOON</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{padding:8,borderTop:"1px solid var(--border-subtle)",flexShrink:0}}>
        {!collapsed && (
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:8,marginBottom:4}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:"var(--accent-dim)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{color:"var(--accent)",fontSize:11,fontWeight:700}}>{(user?.username||"??").slice(0,2).toUpperCase()}</span>
            </div>
            <div style={{overflow:"hidden"}}>
              <div style={{fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap"}}>{user?.username||"—"}</div>
              <div style={{fontSize:10,color:"var(--text-muted)",whiteSpace:"nowrap"}}>{user?.role==="admin"?"Administrator":"User"}</div>
            </div>
          </div>
        )}
        <button onClick={onToggle} style={{
          width:"100%", display:"flex", alignItems:"center", justifyContent:"center",
          padding:"8px", background:"none", border:"none", color:"var(--text-dim)",
          cursor:"pointer", borderRadius:"var(--radius-sm)",
          transform: collapsed ? "rotate(180deg)" : "none",
          transition:"transform var(--transition)",
        }}>
          <Icon id="collapse" size={15}/>
        </button>
      </div>
    </aside>
  );
}

export function NavIcons() {
  return ICON_MAP;
}
