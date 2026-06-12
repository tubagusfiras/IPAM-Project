import { useState, useEffect } from "react";
import { getDashboardStats } from "../api.js";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const STATUS_COLORS = {
  active:     "var(--success)",
  available:  "var(--accent2)",
  reserved:   "#a855f7",
  deprecated: "var(--warning)",
};

const STATUS_HEX = {
  active:     "#22c55e",
  available:  "#38e8c6",
  reserved:   "#a855f7",
  deprecated: "#f59e0b",
};

function StatCard({ label, value, sub, icon, color }) {
  return (
    <div className="card" style={{padding:20}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
        <div style={{
          width:40,height:40,borderRadius:10,
          background:`${color}18`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:20,
        }}>{icon}</div>
        <span style={{
          fontSize:10,fontWeight:600,
          color:"var(--success)",
          background:"var(--success-surface)",
          border:"1px solid var(--success-border)",
          padding:"2px 8px",borderRadius:99,
        }}>+2.1%</span>
      </div>
      <div style={{fontSize:26,fontWeight:700,color:"var(--text)",marginBottom:2,fontVariantNumeric:"tabular-nums"}}>
        {value?.toLocaleString() ?? "—"}
      </div>
      <div style={{fontSize:13,fontWeight:500,color:"var(--text-muted)",marginBottom:4}}>{label}</div>
      <div style={{fontSize:11,color:"var(--text-dim)"}}>{sub}</div>
    </div>
  );
}

function UsageBar({ label, value, total, color }) {
  const pct = total ? Math.round(value/total*100) : 0;
  return (
    <div style={{marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:13,fontWeight:500,color:"var(--text)",textTransform:"capitalize"}}>{label}</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13,fontWeight:600,color:"var(--text)",fontVariantNumeric:"tabular-nums"}}>
            {value?.toLocaleString()}
          </span>
          <span style={{fontSize:11,color:"var(--text-muted)",minWidth:32,textAlign:"right"}}>{pct}%</span>
        </div>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{width:`${pct}%`,background:color}}/>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background:"#1e293b",
      border:"1px solid var(--border-soft)",
      borderRadius:"var(--radius-sm)",
      padding:"10px 14px",
      boxShadow:"var(--shadow-lg)",
      fontSize:12,
    }}>
      <div style={{fontWeight:600,color:"var(--text)",fontFamily:"var(--font-mono)",marginBottom:6}}>
        {payload[0]?.payload?.full || label}
      </div>
      {payload.map((p,i) => (
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
          <div style={{width:8,height:8,borderRadius:2,background:p.fill}}/>
          <span style={{color:"var(--text-muted)",textTransform:"capitalize"}}>{p.name}:</span>
          <span style={{color:"var(--text)",fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [err,   setErr]   = useState(null);

  useEffect(() => {
    getDashboardStats().then(setStats).catch(e => setErr(e.message));
  }, []);

  if (err) return (
    <div style={{
      background:"var(--danger-surface)",
      border:"1px solid var(--danger-border)",
      borderRadius:"var(--radius)",
      padding:"16px 20px",
      color:"var(--danger)",fontSize:14,
    }}>
      Cannot reach API: {err}
    </div>
  );

  if (!stats) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:240,gap:12}}>
      <div style={{
        width:32,height:32,borderRadius:"50%",
        border:"2px solid var(--accent-dim)",
        borderTopColor:"var(--accent)",
        animation:"spin 0.8s linear infinite",
      }}/>
      <span style={{fontSize:13,color:"var(--text-muted)"}}>Loading dashboard...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const {
    total_blocks, total_allocations, total_customers, total_vlans, total_sites,
    ipv4_blocks, ipv6_blocks, alloc_by_status, recent_blocks
  } = stats;

  const totalAlloc = Object.values(alloc_by_status||{}).reduce((a,b)=>a+b,0);
  const utilPct    = totalAlloc ? Math.round((alloc_by_status?.active||0)/totalAlloc*100) : 0;

  const pieData = Object.entries(alloc_by_status||{}).map(([k,v])=>({
    name:k, value:v, color:STATUS_HEX[k]||"#94a3b8"
  }));

  const barData = (recent_blocks||[]).map(b=>({
    name:   b.prefix.split("/")[0].split(".").slice(-2).join(".") + "/" + b.prefix.split("/")[1],
    full:   b.prefix,
    active: b.active_allocations,
    total:  b.total_allocations,
  }));

  const STAT_CARDS = [
    { label:"Total Networks",  value:total_blocks,      icon:"🌐", color:"#52a0ff", sub:`IPv4: ${ipv4_blocks} · IPv6: ${ipv6_blocks}` },
    { label:"IP Allocations",  value:total_allocations, icon:"📡", color:"#22c55e", sub:`Active: ${alloc_by_status?.active??0}` },
    { label:"Customers",       value:total_customers,   icon:"👥", color:"#f97316", sub:"Total registered" },
    { label:"VLANs",           value:total_vlans,       icon:"🔗", color:"#a855f7", sub:"Total VLANs" },
    { label:"Sites",           value:total_sites,       icon:"📍", color:"#38e8c6", sub:"Total locations" },
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Stat Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:16}}>
        {STAT_CARDS.map(c=>(
          <StatCard key={c.label} {...c}/>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{display:"grid",gridTemplateColumns:"240px 1fr",gap:16}}>

        {/* Pie chart */}
        <div className="card" style={{padding:20}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:16}}>
            IP Address Status
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div style={{position:"relative",width:140,height:140}}>
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={pieData} cx={65} cy={65}
                    innerRadius={42} outerRadius={62}
                    dataKey="value" strokeWidth={0} paddingAngle={2}>
                    {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                  </Pie>
                  <Tooltip content={<CustomTooltip/>}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{
                position:"absolute",inset:0,
                display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",
                pointerEvents:"none",
              }}>
                <span style={{fontSize:20,fontWeight:700,color:"var(--text)",fontVariantNumeric:"tabular-nums"}}>{utilPct}%</span>
                <span style={{fontSize:10,color:"var(--text-muted)"}}>Utilized</span>
              </div>
            </div>

            <div style={{width:"100%",marginTop:16,display:"flex",flexDirection:"column",gap:8}}>
              {pieData.map(d=>(
                <div key={d.name} style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:d.color,flexShrink:0}}/>
                  <span style={{flex:1,fontSize:12,color:"var(--text-muted)",textTransform:"capitalize"}}>{d.name}</span>
                  <span style={{fontSize:12,fontWeight:600,color:"var(--text)",fontVariantNumeric:"tabular-nums"}}>
                    {d.value?.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bar chart */}
        <div className="card" style={{padding:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Network Utilization</div>
            <button onClick={()=>onNavigate?.("ipv4")}
              style={{fontSize:12,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",fontWeight:500}}>
              View all →
            </button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} barGap={3} barCategoryGap="30%">
              <XAxis dataKey="name"
                tick={{fontSize:10,fill:"#94a3b8",fontFamily:"var(--font-mono)"}}
                axisLine={false} tickLine={false}
                interval={0}/>
              <YAxis
                tick={{fontSize:10,fill:"#64748b"}}
                axisLine={false} tickLine={false}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="total"  name="Total"  fill="#334155" radius={[3,3,0,0]}/>
              <Bar dataKey="active" name="Active" fill="#3b82f6" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
          <div style={{display:"flex",alignItems:"center",gap:16,marginTop:8,justifyContent:"center"}}>
            {[["Total","#334155"],["Active","#3b82f6"]].map(([l,c])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,borderRadius:2,background:c}}/>
                <span style={{fontSize:11,color:"var(--text-muted)"}}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

        {/* Breakdown bars */}
        <div className="card" style={{padding:20}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:16}}>
            Allocation Breakdown
          </div>
          {Object.entries(alloc_by_status||{}).map(([k,v])=>(
            <UsageBar key={k} label={k} value={v} total={totalAlloc} color={STATUS_HEX[k]}/>
          ))}
        </div>

        {/* Recent networks table */}
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{
            display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"14px 18px",
            borderBottom:"1px solid var(--border-subtle)",
          }}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Recent Networks</div>
            <button onClick={()=>onNavigate?.("ipv4")}
              style={{fontSize:12,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",fontWeight:500}}>
              View all →
            </button>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>
                {["Network","Site","Alloc","Util"].map(h=>(
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(recent_blocks||[]).map((b,i)=>{
                const pct = b.total_allocations
                  ? Math.round(b.active_allocations/b.total_allocations*100) : 0;
                const barClr = pct>85?"var(--danger)":pct>60?"var(--warning)":"var(--success)";
                return (
                  <tr key={i} className="table-row" style={{cursor:"pointer"}}
                    onClick={()=>onNavigate?.("ipv4")}>
                    <td className="table-cell">
                      <div style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:500,color:"var(--text)"}}>{b.prefix}</div>
                      <div style={{fontSize:10,color:"var(--text-dim)",marginTop:2}}>{b.ip_version}</div>
                    </td>
                    <td className="table-cell">
                      <span style={{fontSize:12,color:"var(--text-muted)"}}>{b.site_name||"—"}</span>
                    </td>
                    <td className="table-cell">
                      <span style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--text)",fontWeight:500}}>
                        {b.active_allocations}
                      </span>
                      <span style={{fontSize:11,color:"var(--text-dim)"}}>/{b.total_allocations}</span>
                    </td>
                    <td className="table-cell">
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{flex:1,height:4,background:"var(--surface-3)",borderRadius:99,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:barClr,borderRadius:99}}/>
                        </div>
                        <span style={{fontSize:11,fontWeight:600,color:barClr,minWidth:28,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>
                          {pct}%
                        </span>
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
