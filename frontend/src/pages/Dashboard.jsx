import { useState, useEffect, useRef } from "react";
import { getDashboardStats } from "../api.js";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const STATUS_HEX = { active:"#22c55e", available:"#38e8c6", reserved:"#a855f7", deprecated:"#f59e0b" };
const ICONS = { networks:"🌐", allocations:"📡", customers:"👥", vlans:"🔗", sites:"📍" };

function CountUp({ to, suffix="" }) {
  const [n, setN] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) {
      let start = 0, dur = Math.min(1200, 20 + to * 3), step = Math.ceil(to / 60);
      const iv = setInterval(() => { start += step; if (start >= to) { setN(to); clearInterval(iv); } else setN(start); }, dur / 60);
      obs.disconnect();
    }});
    obs.observe(el);
    return () => obs.disconnect();
  }, [to]);
  return <span ref={ref}>{n.toLocaleString()}{suffix}</span>;
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
          { k:"database", l:"Database", ok:h?.services?.database?.status==="ok", d:`pool ${h?.services?.database?.pool_free}/${h?.services?.database?.pool_size}` },
          { k:"redis", l:"Redis", ok:h?.services?.redis?.status==="ok", d:h?.services?.redis?.used_memory_human },
        ]);
      } catch {}
    };
    check(); const iv = setInterval(check, 30000); return () => clearInterval(iv);
  }, []);

  if (err) return <div className="card" style={{padding:20,color:"var(--danger)",fontSize:14,background:"var(--danger-surface)",border:"1px solid var(--danger-border)"}}>⛔ {err}</div>;
  if (!stats) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:300,gap:16}}>
      <div style={{width:40,height:40,borderRadius:"50%",border:"3px solid var(--accent-dim)",borderTopColor:"var(--accent)",animation:"sp1n 0.8s linear infinite"}}/>
      <span style={{color:"var(--text-muted)",fontSize:13}}>Loading dashboard...</span>
      <style>{`@keyframes sp1n{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const { total_blocks, total_allocations, total_customers, total_vlans, total_sites, ipv4_blocks, ipv6_blocks, alloc_by_status, recent_blocks } = stats;
  const totalAlloc = Object.values(alloc_by_status||{}).reduce((a,b)=>a+b,0);
  const utilPct = totalAlloc ? Math.round((alloc_by_status?.active||0)/totalAlloc*100) : 0;
  const pieData = Object.entries(alloc_by_status||{}).map(([k,v])=>({ name:k, value:v, color:STATUS_HEX[k]||"#94a3b8" }));
  const barData = (recent_blocks||[]).map(b => ({ name: b.prefix.split("/")[0].split(".").slice(-2).join(".")+"/"+b.prefix.split("/")[1], full: b.prefix, active: b.active_allocations, total: b.total_allocations }));

  const cards = [
    { k:"networks", label:"Total Networks", value:total_blocks, sub:`IPv4: ${ipv4_blocks} · IPv6: ${ipv6_blocks}` },
    { k:"allocations", label:"IP Allocations", value:total_allocations, sub:`Active: ${alloc_by_status?.active||0}` },
    { k:"customers", label:"Customers", value:total_customers, sub:"Active clients" },
    { k:"vlans", label:"VLANs", value:total_vlans, sub:"Configured VLANs" },
    { k:"sites", label:"Sites", value:total_sites, sub:"Physical locations" },
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* ── System Health Bar ── */}
      {health && (
        <div className="card" style={{padding:"10px 18px",display:"flex",alignItems:"center",gap:14,borderLeft:"3px solid var(--accent)"}}>
          <span style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-dim)",whiteSpace:"nowrap"}}>System</span>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {health.map(h => (
              <div key={h.k} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:6,background:h.ok?"#052e16":"#450a0a",fontSize:11}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:h.ok?"#22c55e":"#ef4444",flexShrink:0,animation:h.ok?"pls 2s infinite":"none"}}/>
                <span style={{fontWeight:600,color:h.ok?"#22c55e":"#ef4444"}}>{h.l}</span>
                <span style={{color:"#94a3b8"}}>{h.d}</span>
              </div>
            ))}
          </div>
          <div style={{flex:1}}/>
          <a href="http://103.10.120.11:3100" target="_blank" rel="noreferrer"
            style={{fontSize:10,color:"var(--accent)",textDecoration:"none",borderBottom:"1px dashed var(--accent)"}}>Grafana →</a>
        </div>
      )}

      <style>{`@keyframes pls{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* ── Stat Cards with clean dark theme ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:14,animation:"fadeUp 0.5s ease"}}>
        {cards.map((c,i) => (
          <div key={c.k} className="card" style={{
            padding:0,overflow:"hidden",cursor:"pointer",
            animation:`fadeUp 0.4s ease ${i*0.08}s both`,
            transition:"transform 0.15s,box-shadow 0.15s",
            border:"1px solid var(--border-soft)",
          }}
            onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.25)";}}
            onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}
            onClick={()=>onNavigate?.(c.k==="networks"?"ipv4":c.k==="allocations"?"ipv4":c.k==="customers"?"customers":c.k==="vlans"?"vlans":"sites")}>
            <div style={{padding:"14px 16px 10px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid var(--border-subtle)"}}>
              <div style={{width:32,height:32,borderRadius:8,background:"var(--surface-3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                {ICONS[c.k]}
              </div>
              <span style={{fontSize:11,fontWeight:500,color:"var(--text-muted)"}}>{c.label}</span>
            </div>
            <div style={{padding:"8px 16px 6px"}}>
              <div style={{fontSize:24,fontWeight:700,color:"var(--text)",fontVariantNumeric:"tabular-nums",lineHeight:1.2}}>
                <CountUp to={c.value}/>
              </div>
              <div style={{fontSize:10,color:"var(--text-dim)",marginTop:2}}>{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts Row ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:16,animation:"fadeUp 0.6s ease 0.3s both"}}>
        <div className="card" style={{padding:20}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <div style={{width:3,height:14,background:"var(--accent)",borderRadius:99}}/>
            <span style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>IP Status Distribution</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div style={{position:"relative",width:150,height:150}}>
              <ResponsiveContainer width={150} height={150}>
                <PieChart>
                  <Pie data={pieData} cx={75} cy={75} innerRadius={46} outerRadius={68} dataKey="value" strokeWidth={0} paddingAngle={3}>
                    {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                  </Pie>
                  <Tooltip/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
                <span style={{fontSize:22,fontWeight:700,color:"var(--text)"}}>{utilPct}%</span>
                <span style={{fontSize:9,color:"var(--text-muted)"}}>utilized</span>
              </div>
            </div>
            <div style={{width:"100%",marginTop:16,display:"flex",flexDirection:"column",gap:6}}>
              {pieData.map(d => (
                <div key={d.name} style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:d.color,flexShrink:0}}/>
                  <span style={{flex:1,fontSize:11,color:"var(--text-muted)",textTransform:"capitalize"}}>{d.name}</span>
                  <span style={{fontSize:11,fontWeight:600,color:"var(--text)"}}>{d.value?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{padding:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:3,height:14,background:"#3b82f6",borderRadius:99}}/>
              <span style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>Network Utilization</span>
            </div>
            <button onClick={()=>onNavigate?.("ipv4")} style={{fontSize:11,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",fontWeight:500}}>View all →</button>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} barGap={3} barCategoryGap="20%">
              <XAxis dataKey="name" tick={{fontSize:9,fill:"#94a3b8",fontFamily:"var(--font-mono)"}} axisLine={false} tickLine={false} interval={0}/>
              <YAxis tick={{fontSize:9,fill:"#64748b"}} axisLine={false} tickLine={false}/>
              <Tooltip/>
              <Bar dataKey="total" name="Total" fill="#334155" radius={[3,3,0,0]}/>
              <Bar dataKey="active" name="Active" fill="#3b82f6" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="card" style={{padding:"12px 18px",display:"flex",alignItems:"center",gap:14,borderLeft:"3px solid #f59e0b",animation:"fadeUp 0.5s ease 0.5s both"}}>
        <span style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-dim)",whiteSpace:"nowrap"}}>Quick Actions</span>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[
            {id:"ipv4", icon:"🌐", label:"Add Network"},
            {id:"customers", icon:"👥", label:"Add Customer"},
            {id:"sites", icon:"📍", label:"Add Site"},
            {id:"scan", icon:"🔍", label:"IP Scan"},
            {id:"ping", icon:"📡", label:"Ping & Trace"},
          ].map(a => (
            <button key={a.id} onClick={()=>onNavigate?.(a.id)}
              className="btn btn-sm"
              style={{display:"flex",alignItems:"center",gap:5,fontSize:11,padding:"5px 12px",borderRadius:6,
                transition:"all 0.15s",background:"var(--surface-3,transparent)"}}
              onMouseEnter={e=>{e.currentTarget.style.background="var(--accent-dim)";e.currentTarget.style.color="var(--accent)"}}
              onMouseLeave={e=>{e.currentTarget.style.background="";e.currentTarget.style.color=""}}>
              <span>{a.icon}</span> {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,animation:"fadeUp 0.5s ease 0.6s both"}}>
        <div className="card" style={{padding:20}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <div style={{width:3,height:14,background:"#22c55e",borderRadius:99}}/>
            <span style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>Allocation Breakdown</span>
          </div>
          {Object.entries(alloc_by_status||{}).map(([k,v])=>(
            <div key={k} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:12,fontWeight:500,color:"var(--text)",textTransform:"capitalize"}}>{k}</span>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>{v?.toLocaleString()}</span>
                  <span style={{fontSize:10,color:"var(--text-muted)"}}>{totalAlloc ? Math.round(v/totalAlloc*100) : 0}%</span>
                </div>
              </div>
              <div style={{height:6,background:"var(--surface-3)",borderRadius:99,overflow:"hidden"}}>
                <div style={{width:`${totalAlloc ? (v/totalAlloc*100) : 0}%`,height:"100%",background:STATUS_HEX[k]||"#94a3b8",borderRadius:99,transition:"width 0.8s ease"}}/>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:"1px solid var(--border-subtle)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:3,height:14,background:"#a855f7",borderRadius:99}}/>
              <span style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>Recent Networks</span>
            </div>
            <button onClick={()=>onNavigate?.("ipv4")} style={{fontSize:11,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",fontWeight:500}}>View all →</button>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["Network","Site","Alloc","Util"].map(h=><th key={h} className="table-header" style={{fontSize:10}}>{h}</th>)}</tr></thead>
            <tbody>
              {(recent_blocks||[]).map((b,i)=>{
                const pct = b.total_allocations ? Math.round(b.active_allocations/b.total_allocations*100) : 0;
                const barClr = pct>85?"#ef4444":pct>60?"#f59e0b":"#22c55e";
                return (
                  <tr key={i} className="table-row" style={{cursor:"pointer"}} onClick={()=>onNavigate?.("ipv4")}>
                    <td className="table-cell">
                      <div style={{fontFamily:"var(--font-mono)",fontSize:11,fontWeight:500,color:"var(--text)"}}>{b.prefix}</div>
                      <div style={{fontSize:9,color:"var(--text-dim)",marginTop:1}}>{b.ip_version}</div>
                    </td>
                    <td className="table-cell"><span style={{fontSize:11,color:"var(--text-muted)"}}>{b.site_name||"—"}</span></td>
                    <td className="table-cell"><span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text)",fontWeight:500}}>{b.active_allocations}</span><span style={{fontSize:10,color:"var(--text-dim)"}}>/{b.total_allocations}</span></td>
                    <td className="table-cell">
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{flex:1,height:4,background:"var(--surface-3)",borderRadius:99,overflow:"hidden",minWidth:40}}>
                          <div style={{width:`${pct}%`,height:"100%",background:barClr,borderRadius:99}}/>
                        </div>
                        <span style={{fontSize:10,fontWeight:600,color:barClr,minWidth:24,textAlign:"right"}}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
