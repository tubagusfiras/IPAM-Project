import { useState, useEffect } from "react";
import { getDashboardStats } from "../api.js";
import { StatCard, Alert, C } from "../components/ui.jsx";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [err, setErr]     = useState(null);

  useEffect(() => {
    getDashboardStats().then(setStats).catch(e => setErr(e.message));
  }, []);

  if (err) return <Alert type="error" message={`Cannot reach API: ${err}`} />;
  if (!stats) return <div style={{ color:C.text2, padding:40, textAlign:"center" }}>Loading…</div>;

  const { total_blocks, total_allocations, total_customers, total_vlans, total_sites,
          ipv4_blocks, ipv6_blocks, alloc_by_status, recent_blocks } = stats;

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:24 }}>
        <StatCard label="IP Blocks"    value={total_blocks}      accent={C.blue}   sub={`IPv4: ${ipv4_blocks} · IPv6: ${ipv6_blocks}`} icon="⬡" />
        <StatCard label="Allocations"  value={total_allocations} accent={C.green}  sub={`Active: ${alloc_by_status?.active??0}`} icon="◈" />
        <StatCard label="Customers"    value={total_customers}   accent={C.amber}  icon="⬤" />
        <StatCard label="VLANs"        value={total_vlans}       accent={C.purple} icon="⊟" />
        <StatCard label="Sites"        value={total_sites}       accent={C.cyan}   icon="◎" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {/* Allocation status */}
        <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:18 }}>
          <div style={{ color:C.text2, fontSize:10, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:14 }}>Allocation Status</div>
          {Object.entries(alloc_by_status||{}).map(([k,v]) => {
            const colors = { active:C.green, available:C.cyan, reserved:C.purple, deprecated:C.amber };
            const color  = colors[k]||C.text2;
            const total  = Object.values(alloc_by_status).reduce((a,b)=>a+b,0);
            const pct    = total ? (v/total*100).toFixed(1) : 0;
            return (
              <div key={k} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ color:C.text1, fontSize:12, textTransform:"capitalize" }}>{k}</span>
                  <span style={{ color, fontFamily:C.mono, fontSize:11 }}>{v.toLocaleString()} ({pct}%)</span>
                </div>
                <div style={{ height:3, background:C.bg1, borderRadius:2 }}>
                  <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:2 }}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent blocks */}
        <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:18 }}>
          <div style={{ color:C.text2, fontSize:10, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:14 }}>Recent IP Blocks</div>
          {recent_blocks?.length === 0 && (
            <div style={{ color:C.text2, fontSize:12, textAlign:"center", padding:"20px 0" }}>No blocks yet — import a CSV to get started</div>
          )}
          {(recent_blocks||[]).map((b,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
              <div>
                <div style={{ fontFamily:C.mono, color:C.blue, fontSize:13 }}>{b.prefix}</div>
                <div style={{ color:C.text2, fontSize:11, marginTop:2 }}>{b.name||"—"} · {b.site_name||"—"}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <span style={{ color: b.ip_version==="IPv4"?C.green:C.purple, fontFamily:C.mono, fontSize:11 }}>{b.ip_version}</span>
                <div style={{ color:C.text2, fontSize:10, marginTop:2 }}>{b.active_allocations}/{b.total_allocations} alloc</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
