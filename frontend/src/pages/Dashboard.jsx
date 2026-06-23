import { useState, useEffect } from "react";
import { getDashboardStats } from "../api.js";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ── Tokens (CSS variables = auto dark/light) ────────────
const ACCENT = "var(--accent)";
const BG = "var(--bg)";
const CARD = "var(--surface-1)";
const BORDER = "var(--border-medium)";
const TEXT = "var(--text)";
const MUTED = "var(--text-muted)";
const DIM = "var(--text-dim)";
const SUCCESS = "var(--success)";
const DANGER = "var(--danger)";
const WARN = "var(--warning)";

const STATUS_HEX = { active:SUCCESS, available:"#38e8c6", reserved:"#818cf8", deprecated:WARN };
const SVG_PATH = {
  networks:"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  allocations:"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4h18zM7 10l5 5 5-5M12 15V3",
  customers:"M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  vlans:"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-1.95.7-3.74 1.87-5.13L9 10v1c0 1.1.9 2 2 2v1.93c-3.94.49-7-3.85-7-7.93z",
  sites:"M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
  globe:"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  arrow_up:"M7 10l5-5 5 5M12 15V3",
};

function SvgIcon({ name, size=18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}>
      <path d={SVG_PATH[name] || SVG_PATH.globe}/>
    </svg>
  );
}

function MiniSpark({ used, total }) {
  const pct = total > 0 ? Math.min(100, Math.round(used/total*100)) : 0;
  const color = pct > 85 ? DANGER : pct > 60 ? WARN : SUCCESS;
  return (
    <div style={{width:"100%",height:3,background:BORDER,borderRadius:99,overflow:"hidden",marginTop:6}}>
      <div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:99,transition:"width 0.8s ease"}}/>
    </div>
  );
}

function StatCard({ icon, label, value, sub, pct, color }) {
  return (
    <div style={{
      background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:"14px 16px",
      transition:"all 0.15s",cursor:"pointer",
    }}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=color;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 4px 20px rgba(0,0,0,0.3)`}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=BORDER;e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=""}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        <div style={{width:32,height:32,borderRadius:8,background:`${color}15`,display:"flex",alignItems:"center",justifyContent:"center",color,flexShrink:0}}>
          <SvgIcon name={icon} size={16}/>
        </div>
        <span style={{fontSize:"11px",fontWeight:500,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</span>
        {pct !== undefined && (
          <span style={{marginLeft:"auto",fontSize:"18px",fontWeight:700,color,fontVariantNumeric:"tabular-nums"}}>{pct}%</span>
        )}
      </div>
      <div style={{fontSize:"26px",fontWeight:700,color:TEXT,fontVariantNumeric:"tabular-nums",lineHeight:1.1}}>{value?.toLocaleString() ?? "—"}</div>
      <div style={{fontSize:"11px",color:DIM,marginTop:4}}>{sub}</div>
      {pct !== undefined && <MiniSpark used={value} total={1}/>}
    </div>
  );
}

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => { getDashboardStats().then(setStats).catch(e => setErr(e.message)); }, []);
  useEffect(() => {
    const check = async () => {
      try {
        const h = await fetch("/api/v1/health/detailed").then(r=>r.json());
        setHealth([
          { k:"database", l:"Database", ok:h?.services?.database?.status==="ok", d:`${h?.services?.database?.pool_free}/${h?.services?.database?.pool_size} conn` },
          { k:"redis", l:"Redis", ok:h?.services?.redis?.status==="ok", d:h?.services?.redis?.used_memory_human },
        ]);
      } catch {}
    };
    check(); const iv = setInterval(check, 30000); return () => clearInterval(iv);
  }, []);

  if (err) return <div style={{padding:20,color:DANGER,background:"var(--danger-surface)",border:"1px solid #7f1d1d",borderRadius:10,fontSize:14}}>Cannot reach API: {err}</div>;
  if (!stats) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:300}}>
      <div style={{width:32,height:32,borderRadius:"50%",border:"2px solid transparent",borderTopColor:ACCENT,animation:"sp1n 0.8s linear infinite"}}/>
      <style>{`@keyframes sp1n{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const { total_blocks, total_allocations, total_customers, total_vlans, total_sites, ipv4_blocks, ipv6_blocks, alloc_by_status, recent_blocks } = stats;
  const totalAlloc = Object.values(alloc_by_status||{}).reduce((a,b)=>a+b,0);
  const utilPct = totalAlloc ? Math.round((alloc_by_status?.active||0)/totalAlloc*100) : 0;
  const pieData = Object.entries(alloc_by_status||{}).map(([k,v])=>({ name:k, value:v, color:STATUS_HEX[k]||"#94a3b8" }));
  const barData = (recent_blocks||[]).map(b => ({ name: b.prefix.split("/")[0].split(".").slice(-2).join(".")+"/"+b.prefix.split("/")[1], full: b.prefix, active: b.active_allocations, total: b.total_allocations }));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16,fontFamily:"Inter,system-ui,sans-serif"}}>

      {/* ── HEADER ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
        <div>
          <div style={{fontSize:"18px",fontWeight:600,color:TEXT}}>Dashboard</div>
          <div style={{fontSize:"12px",color:MUTED,marginTop:2}}>IP Address Management — {total_blocks} networks, {total_allocations} allocations</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {health?.map(h => (
            <div key={h.k} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:6,fontSize:"11px"}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:h.ok?SUCCESS:DANGER,animation:h.ok?"pulse 2s infinite":"none",flexShrink:0}}/>
              <span style={{fontWeight:500,color:h.ok?SUCCESS:DANGER}}>{h.l}</span>
              <span style={{color:MUTED}}>{h.d}</span>
            </div>
          ))}
          <a href="http://103.10.120.11:3100" target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",background:CARD,border:`1px solid ${BORDER}`,borderRadius:6,fontSize:"11px",color:ACCENT,textDecoration:"none"}}>Grafana ↗</a>
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>

      {/* ── UTILIZATION GAUGE + STATS ── */}
      <div style={{display:"grid",gridTemplateColumns:"200px 1fr",gap:16}}>
        {/* Gauge */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:"16px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <div style={{position:"relative",width:130,height:130}}>
            <svg width="130" height="130" viewBox="0 0 130 130">
              <circle cx="65" cy="65" r="52" fill="none" stroke={BORDER} strokeWidth="8"/>
              <circle cx="65" cy="65" r="52" fill="none" stroke={utilPct>85?DANGER:utilPct>60?WARN:SUCCESS} strokeWidth="8"
                strokeDasharray={`${utilPct*3.27} 327`} strokeLinecap="round" transform="rotate(-90 65 65)" style={{transition:"stroke-dasharray 1s ease"}}/>
            </svg>
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
              <span style={{fontSize:"28px",fontWeight:700,color:TEXT,fontVariantNumeric:"tabular-nums"}}>{utilPct}%</span>
              <span style={{fontSize:"11px",color:MUTED,marginTop:-2}}>Utilized</span>
            </div>
          </div>
          <div style={{fontSize:"11px",color:MUTED,marginTop:8,textAlign:"center"}}>
            {alloc_by_status?.active||0} active · {totalAlloc} total
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {[
            { k:"networks", icon:"networks", label:"Networks", value:total_blocks, sub:`${ipv4_blocks} IPv4 · ${ipv6_blocks} IPv6`, color:A },
            { k:"allocations", icon:"allocations", label:"Allocations", value:total_allocations, sub:`Active: ${alloc_by_status?.active||0}`, color:SUCCESS },
            { k:"customers", icon:"customers", label:"Customers", value:total_customers, sub:"Active clients", color:"#f97316" },
            { k:"vlans", icon:"vlans", label:"VLANs", value:total_vlans, sub:"Configured", color:"#a855f7" },
            { k:"sites", icon:"sites", label:"Sites", value:total_sites, sub:"Locations", color:"#06b6d4" },
            { label:"Utilization", icon:"allocations", value:`${utilPct}%`, sub:`${alloc_by_status?.active||0} active of ${totalAlloc}`, color:utilPct>85?DANGER:SUCCESS, pct:utilPct },
          ].map((c,i)=>(
            <StatCard key={i} {...c} onClick={()=>onNavigate?.(c.k==="networks"?"ipv4":c.k==="allocations"?"ipv4":c.k==="customers"?"customers":c.k==="vlans"?"vlans":"sites")}/>
          ))}
        </div>
      </div>

      {/* ── CHARTS ROW ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:16}}>
        {/* Pie */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:"16px"}}>
          <div style={{fontSize:"12px",fontWeight:600,color:TEXT,marginBottom:12}}>Allocation Status</div>
          {pieData.length > 0 ? (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{width:140,height:140}}>
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={pieData} cx={70} cy={70} innerRadius={44} outerRadius={64} dataKey="value" strokeWidth={0} paddingAngle={3}>
                      {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                    </Pie>
                    <Tooltip/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{width:"100%",marginTop:12,display:"flex",flexDirection:"column",gap:6}}>
                {pieData.map(d=>(
                  <div key={d.name} style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:d.color,flexShrink:0}}/>
                    <span style={{flex:1,fontSize:"11px",color:MUTED,textTransform:"capitalize"}}>{d.name}</span>
                    <span style={{fontSize:"11px",fontWeight:600,color:TEXT,fontVariantNumeric:"tabular-nums"}}>{d.value?.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{textAlign:"center",padding:40,color:MUTED,fontSize:13}}>No data</div>
          )}
        </div>

        {/* Bar Chart */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:"16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:"12px",fontWeight:600,color:TEXT}}>Network Utilization</div>
            <button onClick={()=>onNavigate?.("ipv4")} style={{fontSize:"11px",color:ACCENT,background:"none",border:"none",cursor:"pointer",fontWeight:500}}>View all →</button>
          </div>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} barGap={3} barCategoryGap="20%">
                <XAxis dataKey="name" tick={{fontSize:9,fill:MUTED}} axisLine={false} tickLine={false} interval={0}/>
                <YAxis tick={{fontSize:9,fill:DIM}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:6,fontSize:12}}/>
                <Bar dataKey="total" name="Total" fill={BORDER} radius={[3,3,0,0]}/>
                <Bar dataKey="active" name="Active" fill={A} radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{textAlign:"center",padding:40,color:MUTED,fontSize:13}}>No data</div>
          )}
        </div>
      </div>

      {/* ── BOTTOM ROW ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.5fr",gap:16}}>
        {/* Breakdown */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:"16px"}}>
          <div style={{fontSize:"12px",fontWeight:600,color:TEXT,marginBottom:12}}>Allocation Breakdown</div>
          {Object.entries(alloc_by_status||{}).map(([k,v])=>{
            const pct = totalAlloc ? Math.round(v/totalAlloc*100) : 0;
            return (
              <div key={k} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:"11px",fontWeight:500,color:MUTED,textTransform:"capitalize"}}>{k}</span>
                  <span style={{fontSize:"11px",fontWeight:600,color:TEXT}}>{v} ({pct}%)</span>
                </div>
                <div style={{height:5,background:BORDER,borderRadius:99,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",background:STATUS_HEX[k]||"#94a3b8",borderRadius:99,transition:"width 0.6s ease"}}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent Networks */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:`1px solid ${BORDER}`}}>
            <div style={{fontSize:"12px",fontWeight:600,color:TEXT}}>Recent Networks</div>
            <button onClick={()=>onNavigate?.("ipv4")} style={{fontSize:"11px",color:ACCENT,background:"none",border:"none",cursor:"pointer",fontWeight:500}}>View all →</button>
          </div>
          {(recent_blocks||[]).length > 0 ? (
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:"11px"}}>
              <thead><tr>
                {["Network","Site","Allocs","Util"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",color:DIM,fontWeight:500,fontSize:"10px",textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {(recent_blocks||[]).slice(0,6).map((b,i)=>{
                  const used = parseFloat(b.used_ips||0);
                  const total = parseFloat(b.total_ips||1);
                  const pct = total > 0 ? Math.min(100, Math.round(used/total*100)) : 0;
                  const barClr = pct>85?DANGER:pct>60?WARN:SUCCESS;
                  return (
                    <tr key={i} style={{cursor:"pointer",borderTop:i===0?"none":`1px solid ${BORDER}`}}
                      onClick={()=>onNavigate?.("ipv4")}
                      onMouseEnter={e=>e.currentTarget.style.background="#1a2744"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"8px 12px"}}>
                        <div style={{fontWeight:600,color:TEXT,fontFamily:"ui-monospace,monospace"}}>{b.prefix}</div>
                        <div style={{fontSize:"10px",color:DIM,marginTop:1}}>{b.ip_version}</div>
                      </td>
                      <td style={{padding:"8px 12px",color:MUTED}}>{b.site_name||"—"}</td>
                      <td style={{padding:"8px 12px",fontWeight:500,color:TEXT}}>{b.active_allocations}<span style={{color:DIM,fontWeight:400}}>/{b.total_allocations}</span></td>
                      <td style={{padding:"8px 12px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,minWidth:60}}>
                          <div style={{flex:1,height:4,background:BORDER,borderRadius:99,overflow:"hidden"}}>
                            <div style={{width:`${pct}%`,height:"100%",background:barClr,borderRadius:99}}/>
                          </div>
                          <span style={{fontWeight:600,color:barClr,minWidth:24,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{textAlign:"center",padding:40,color:MUTED,fontSize:13}}>No networks yet</div>
          )}
        </div>
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
        {[
          { id:"ipv4", label:"Add Network" },
          { id:"customers", label:"Add Customer" },
          { id:"sites", label:"Add Site" },
          { id:"scan", label:"IP Scan" },
          { id:"ping", label:"Ping & Trace" },
        ].map(a => (
          <button key={a.id} onClick={()=>onNavigate?.(a.id)}
            style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${BORDER}`,background:CARD,color:MUTED,fontSize:"11px",fontWeight:500,cursor:"pointer",transition:"all 0.12s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=ACCENT;e.currentTarget.style.color=ACCENT}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=BORDER;e.currentTarget.style.color=MUTED}}>
            + {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
