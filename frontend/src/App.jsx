import { useState, useEffect, Suspense, lazy } from "react";
import { getToken, getStoredUser, clearToken } from "./api.js";
import { ToastProvider, useToast } from "./components/Toast.jsx";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.jsx";
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
const SubnetCalc = lazy(()=>import("./pages/SubnetCalc.jsx"));
const GlobalPing = lazy(()=>import("./pages/GlobalPing.jsx"));
const GlobalPingDetail = lazy(()=>import("./pages/GlobalPingDetail.jsx"));

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
  calc:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="16" y2="18"/></svg>,
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

export { Sidebar } from "./components/Sidebar.jsx";

export { Header } from "./components/Header.jsx";
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
    if (h.startsWith("global-ping-detail/")) return { active:"global-ping-detail", page:"global-ping-detail", id:h.split("/")[1] };
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

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handleKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Ctrl+K → Search focus
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = document.querySelector("header input[type=text]");
        searchInput?.focus();
      }
      // Ctrl+N → Add Network (if on ipv4/ipv6 page)
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        const addBtn = document.querySelector('[class*="btn-primary"]');
        addBtn?.click();
      }
      // Escape → close modals
      if (e.key === "Escape") {
        const closeBtns = document.querySelectorAll('.modal-overlay');
        closeBtns.forEach(b => b.click());
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
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
      case "subnet":    return <SubnetCalc/>;
      case "global-ping": return <GlobalPing/>;
      case "global-ping-detail": return <GlobalPingDetail/>;
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
        {/* Mobile overlay when sidebar open */}
        {!collapsed && (
          <div onClick={()=>setCollapsed(true)} className="mobile-overlay" />
        )}
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
          onToggle={()=>setCollapsed(v=>!v)}
        />
        <main style={{
          paddingTop:"var(--topbar-h)",
          marginLeft: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-w)",
          transition:"margin-left var(--transition)",
          minHeight:"100vh",
        }}>
          <div style={{padding:24}} className="main-content">
            <ErrorBoundary>
              <Suspense fallback={<Loading/>}>
                {renderPage()}
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
