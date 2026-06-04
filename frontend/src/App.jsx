import { useState, Suspense, lazy } from "react";
import { C } from "./components/ui.jsx";

const Dashboard = lazy(()=>import("./pages/Dashboard.jsx"));
const Blocks    = lazy(()=>import("./pages/Blocks.jsx"));
const BlockDetail = lazy(()=>import("./pages/BlockDetail.jsx"));
const Customers = lazy(()=>import("./pages/Customers.jsx"));
const Vlans     = lazy(()=>import("./pages/Vlans.jsx"));
const Sites     = lazy(()=>import("./pages/Sites.jsx"));
const Import    = lazy(()=>import("./pages/Import.jsx"));

const NAV = [
  { id:"dashboard", label:"Dashboard",   icon:"◈", group:"main" },
  { id:"ipv4",      label:"IPv4 Blocks", icon:"⬡", group:"ip" },
  { id:"ipv6",      label:"IPv6 Blocks", icon:"⬡", group:"ip" },
  { id:"customers", label:"Customers",   icon:"⬤", group:"manage" },
  { id:"vlans",     label:"VLANs",       icon:"⊟", group:"manage" },
  { id:"sites",     label:"Sites",       icon:"◎", group:"manage" },
  { id:"import",    label:"Import CSV",  icon:"⇪", group:"tools" },
];

const GROUPS = [
  { id:"main",   label:null },
  { id:"ip",     label:"IP Management" },
  { id:"manage", label:"Management" },
  { id:"tools",  label:"Tools" },
];

function NavItem({ item, active, onClick }) {
  const isV4 = item.id === "ipv4";
  const isV6 = item.id === "ipv6";
  return (
    <button onClick={onClick} style={{
      display:"flex", alignItems:"center", gap:9, width:"100%",
      padding:"7px 12px", borderRadius:5, border:"none", cursor:"pointer",
      background: active ? C.bg3 : "transparent",
      color:      active ? C.blue : C.text2,
      fontSize:13, fontWeight: active ? 600 : 400,
      borderLeft: `2px solid ${active ? C.blue : "transparent"}`,
      marginBottom:1, textAlign:"left", transition:"all 0.12s",
    }}
    onMouseEnter={e=>{ if(!active){ e.currentTarget.style.background=C.bg2; e.currentTarget.style.color=C.text1; }}}
    onMouseLeave={e=>{ if(!active){ e.currentTarget.style.background="transparent"; e.currentTarget.style.color=C.text2; }}}
    >
      <span style={{fontSize:12,opacity:active?1:0.7,color:isV4?C.green:isV6?C.purple:undefined}}>{item.icon}</span>
      <span>{item.label}</span>
      {isV4 && <span style={{marginLeft:"auto",fontSize:9,color:C.green,fontFamily:C.mono,background:C.green+"15",padding:"1px 5px",borderRadius:3}}>v4</span>}
      {isV6 && <span style={{marginLeft:"auto",fontSize:9,color:C.purple,fontFamily:C.mono,background:C.purple+"15",padding:"1px 5px",borderRadius:3}}>v6</span>}
    </button>
  );
}

export default function App() {
  const [active, setActive]   = useState("dashboard");
  const [route, setRoute]     = useState(null); // { page:"block-detail", id, from }

  const navigate = (page, params={}) => {
    if (page === "block-detail") {
      setRoute({ page, ...params });
    } else {
      setRoute(null);
      setActive(page);
    }
  };

  const goBack = () => {
    if (route?.from) { setActive(route.from); }
    setRoute(null);
  };

  const nav = NAV.find(n=>n.id===active);

  const renderPage = () => {
    if (route?.page === "block-detail") {
      return <BlockDetail blockId={route.id} onBack={goBack} onNavigate={navigate}/>;
    }
    switch(active) {
      case "dashboard": return <Dashboard onNavigate={navigate}/>;
      case "ipv4":      return <Blocks ipVersion="IPv4" key="ipv4" onNavigate={navigate}/>;
      case "ipv6":      return <Blocks ipVersion="IPv6" key="ipv6" onNavigate={navigate}/>;
      case "customers": return <Customers onNavigate={navigate}/>;
      case "vlans":     return <Vlans/>;
      case "sites":     return <Sites/>;
      case "import":    return <Import onImported={()=>navigate("ipv4")}/>;
      default:          return <Dashboard onNavigate={navigate}/>;
    }
  };

  const pageTitle = route?.page === "block-detail"
    ? "Block Detail"
    : nav?.label || "";

  const pageIcon = route?.page === "block-detail"
    ? "⬡"
    : nav?.icon || "";

  return (
    <>
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:${C.bg0}; font-family:'Segoe UI',system-ui,sans-serif; color:${C.text1}; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:${C.bg1}; }
        ::-webkit-scrollbar-thumb { background:${C.border2}; border-radius:3px; }
        ::-webkit-scrollbar-thumb:hover { background:#2d5a8a; }
        button { font-family:inherit; }
        select option { background:${C.bg2}; }
      `}</style>

      <div style={{display:"flex",height:"100vh",background:C.bg0}}>
        {/* SIDEBAR */}
        <div style={{width:210,background:C.bg1,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"18px 16px 14px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:30,height:30,borderRadius:6,background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:800}}>IP</div>
              <div>
                <div style={{color:C.text0,fontWeight:700,fontSize:14}}>IPAM</div>
                <div style={{color:C.text2,fontSize:9,fontFamily:C.mono}}>IP Core Manager</div>
              </div>
            </div>
          </div>

          <nav style={{padding:"8px 8px",flex:1,overflowY:"auto"}}>
            {GROUPS.map(g=>{
              const items = NAV.filter(n=>n.group===g.id);
              return (
                <div key={g.id} style={{marginBottom:8}}>
                  {g.label && <div style={{color:C.text2,fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",padding:"6px 12px 3px",opacity:0.7}}>{g.label}</div>}
                  {items.map(n=>(
                    <NavItem key={n.id} item={n} active={active===n.id && !route} onClick={()=>navigate(n.id)}/>
                  ))}
                </div>
              );
            })}
          </nav>

          <div style={{padding:"10px 16px",borderTop:`1px solid ${C.border}`}}>
            <div style={{fontFamily:C.mono,fontSize:9,lineHeight:2,color:C.text2}}>
              <div><span style={{color:C.green}}>●</span> Connected</div>
              <div>PostgreSQL 16 · v2.0.0</div>
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* Topbar */}
          <div style={{height:46,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",background:C.bg1,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {route && (
                <button onClick={goBack} style={{background:"none",border:`1px solid ${C.border}`,color:C.text2,padding:"3px 10px",borderRadius:4,fontSize:11,cursor:"pointer",marginRight:4}}>
                  ← Back
                </button>
              )}
              <span style={{color:C.blue,fontSize:13}}>{pageIcon}</span>
              <span style={{color:C.text0,fontWeight:600,fontSize:13}}>{pageTitle}</span>
            </div>
            <div style={{fontFamily:C.mono,fontSize:10,color:C.text2}}>
              {new Date().toLocaleDateString("id-ID",{weekday:"short",year:"numeric",month:"short",day:"numeric"})}
            </div>
          </div>

          {/* Content */}
          <div style={{flex:1,overflow:"auto",padding:20}}>
            <Suspense fallback={<div style={{color:C.text2,padding:40,textAlign:"center"}}>Loading…</div>}>
              {renderPage()}
            </Suspense>
          </div>
        </div>
      </div>
    </>
  );
}
