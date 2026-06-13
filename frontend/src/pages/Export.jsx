import { useState, useEffect } from "react";
import { getBlocks } from "../api.js";

function ipToInt(ip) {
  const p = ip.split(".").map(Number);
  return ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0;
}
function intToIp(n) {
  return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".");
}
function calcUsable(prefix) {
  try {
    const [addr, plen] = prefix.split("/");
    const p = parseInt(plen);
    const base = ipToInt(addr);
    const size = Math.pow(2, 32-p);
    if (size <= 2) return `${intToIp(base)} — ${intToIp((base+size-1)>>>0)}`;
    return `${intToIp((base+1)>>>0)} — ${intToIp((base+size-2)>>>0)}`;
  } catch { return ""; }
}

const OWNER_COLOR = {
  customer:"#3b82f6", internal:"#22c55e", ptp:"#f59e0b",
  peering:"#a855f7", management:"#0ea5e9", reserved:"#71717a",
};
const OWNER_LABEL = {
  customer:"Customer", internal:"Internal", ptp:"PTP",
  peering:"Peering", management:"Mgmt", reserved:"Reserved",
};
const STATUS_COLOR = {
  active:"var(--success)", reserved:"#71717a",
  available:"var(--accent)", deprecated:"var(--danger)",
};

function GaugeChart({ pct }) {
  const r = 50, cx = 60, cy = 58;
  const circumference = Math.PI * r;
  const dashOffset = circumference * (1 - Math.min(pct,100)/100);
  const color = pct>85?"#ef4444":pct>60?"#f59e0b":"#22c55e";
  return (
    <svg width={120} height={72} viewBox="0 0 120 72" style={{display:"block",margin:"0 auto"}}>
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
        fill="none" stroke="var(--border-soft)" strokeWidth="9" strokeLinecap="round"/>
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
        fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={dashOffset}
        style={{transition:"stroke-dashoffset 0.6s ease"}}/>
      <text x={cx} y={cy-10} textAnchor="middle" fontSize="20" fontWeight="700"
        fill={color} fontFamily="monospace">{pct}%</text>
      <text x={cx} y={cy+6} textAnchor="middle" fontSize="8"
        fill="#64748b" fontFamily="Arial">UTILIZATION</text>
    </svg>
  );
}

function DonutChart({ data, size=120 }) {
  const cx = size/2, cy = size/2, r = size/2 - 14;
  const total = data.reduce((s,d)=>s+d.value, 0);
  if (!total) return null;
  let angle = -Math.PI/2;
  const slices = data.filter(d=>d.value>0).map(d=>{
    const a = (d.value/total)*2*Math.PI;
    const x1 = cx + r*Math.cos(angle);
    const y1 = cy + r*Math.sin(angle);
    angle += a;
    const x2 = cx + r*Math.cos(angle);
    const y2 = cy + r*Math.sin(angle);
    const large = a > Math.PI ? 1 : 0;
    return { ...d, path:`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z` };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s,i)=><path key={i} d={s.path} fill={s.color} opacity={0.85}/>)}
      <circle cx={cx} cy={cy} r={r*0.55} fill="var(--surface-1)"/>
      <text x={cx} y={cy+4} textAnchor="middle" fontSize="11" fontWeight="700"
        fill="var(--text)" fontFamily="var(--font-mono)">{data.reduce((s,d)=>s+d.value,0)}</text>
    </svg>
  );
}

export default function Export({ dark }) {
  const [blocks,    setBlocks]    = useState([]);
  const [selected,  setSelected]  = useState({});
  const [preview,   setPreview]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(()=>{
    getBlocks({limit:100,offset:0}).then(d=>setBlocks(d.items||[]));
  },[]);

  const allSelected  = blocks.length>0 && blocks.every(b=>selected[b.id]);
  const someSelected = blocks.some(b=>selected[b.id]);
  const selectedIds  = blocks.filter(b=>selected[b.id]).map(b=>b.id);

  const toggleAll = () => {
    if (allSelected) setSelected({});
    else setSelected(Object.fromEntries(blocks.map(b=>[b.id,true])));
  };

  const loadPreview = async (block) => {
    setLoading(true); setPreview(null);
    try {
      const res = await fetch(`/api/v1/blocks/${block.id}`);
      setPreview(await res.json());
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const theme = dark ? "dark" : "light";

  const doExport = async (type) => {
    setExporting(true);
    try {
      if (type==="single-pdf" && preview) {
        window.location.href = `/api/v1/export/block/${preview.id}/pdf?theme=${theme}`;
      } else if (type==="multi-pdf") {
        // Multi block PDF — generate per block, download satu per satu
        for (const id of selectedIds) {
          window.open(`/api/v1/export/block/${id}/pdf?theme=${theme}`, "_blank");
          await new Promise(r=>setTimeout(r,300));
        }
      } else if (type==="summary-pdf") {
        window.location.href = `/api/v1/export/summary/pdf?theme=${theme}`;
      }
    } catch(e) { console.error(e); }
    setExporting(false);
  };

  const pctOf = (b) => {
    const u=parseFloat(b.used_ips||0), t=parseFloat(b.total_ips||1);
    return t ? Math.round(u/t*100) : 0;
  };

  // Compute preview stats
  const allocs      = preview?.allocations || [];
  const usedIps     = parseFloat(preview?.used_ips||0);
  const totalIps    = parseFloat(preview?.total_ips||1);
  const utilizPct   = totalIps ? Math.round(usedIps/totalIps*100) : 0;
  const freeIps     = Math.max(0, totalIps - usedIps);
  const activeCount = allocs.filter(a=>a.status==="active").length;
  const resvCount   = allocs.filter(a=>a.status==="reserved").length;

  // Owner breakdown
  const ownerBreakdown = Object.entries(
    allocs.reduce((acc,a)=>{ acc[a.owner_type]=(acc[a.owner_type]||0)+1; return acc; }, {})
  ).map(([k,v])=>({ label:OWNER_LABEL[k]||k, value:v, color:OWNER_COLOR[k]||"#94a3b8" }));

  // IP usage breakdown for donut
  const ipBreakdown = [
    { label:"Used", value:Math.round(usedIps), color:"#3b82f6" },
    { label:"Free", value:Math.round(freeIps), color:"#1e3a2e" },
  ];

  return (
    <div style={{padding:24, maxWidth:1200, margin:"0 auto"}}>
      {/* Page header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700,color:"var(--text)",margin:0}}>Export</h1>
          <p style={{fontSize:12,color:"var(--text-muted)",margin:"3px 0 0"}}>
            Pilih block, preview detail, lalu export ke PDF
          </p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>doExport("summary-pdf")} disabled={exporting}
            className="btn btn-secondary btn-sm">📋 Summary PDF</button>
          <button onClick={()=>doExport("multi-pdf")} disabled={!someSelected||exporting}
            className="btn btn-primary btn-sm">
            📄 Export Selected PDF ({selectedIds.length})
          </button>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:16,alignItems:"start"}}>

        {/* Block list */}
        <div style={{background:"var(--surface-1)",border:"1px solid var(--border-soft)",borderRadius:"var(--radius)"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border-subtle)",display:"flex",alignItems:"center",gap:8}}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{cursor:"pointer"}}/>
            <span style={{fontSize:11,fontWeight:600,color:"var(--text)",textTransform:"uppercase",letterSpacing:"0.07em"}}>IP Blocks</span>
            <span style={{fontSize:10,color:"var(--text-dim)",marginLeft:"auto"}}>{blocks.length} total</span>
          </div>
          {blocks.map(b=>{
            const p = pctOf(b);
            const pColor = p>85?"var(--danger)":p>60?"var(--warning)":"var(--success)";
            const isActive = preview?.id===b.id;
            return (
              <div key={b.id} onClick={()=>loadPreview(b)} style={{
                padding:"10px 14px", borderBottom:"1px solid var(--border-subtle)",
                cursor:"pointer", transition:"background 0.12s",
                background: isActive?"var(--surface-3)":"transparent",
              }}
              onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background="var(--surface-2)"; }}
              onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background="transparent"; }}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <input type="checkbox" checked={!!selected[b.id]}
                    onClick={e=>e.stopPropagation()}
                    onChange={e=>setSelected(s=>({...s,[b.id]:e.target.checked}))}
                    style={{cursor:"pointer",flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:700,color:"var(--accent)"}}>
                        {b.prefix}
                      </span>
                      <span style={{
                        fontSize:9,padding:"1px 5px",borderRadius:99,fontWeight:600,textTransform:"uppercase",
                        background:b.status==="active"?"rgba(34,197,94,0.12)":"var(--surface-2)",
                        color:b.status==="active"?"var(--success)":"var(--text-dim)",
                        border:`1px solid ${b.status==="active"?"rgba(34,197,94,0.3)":"var(--border-soft)"}`,
                      }}>{b.status}</span>
                    </div>
                    <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:4}}>
                      {b.site_name||"—"} · {b.asn||"—"}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{flex:1,height:3,background:"var(--border-soft)",borderRadius:99}}>
                        <div style={{width:`${p}%`,height:"100%",background:pColor,borderRadius:99}}/>
                      </div>
                      <span style={{fontSize:10,color:pColor,fontWeight:600,minWidth:28,textAlign:"right"}}>{p}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Preview panel */}
        <div>
          {!preview && !loading && (
            <div style={{
              background:"var(--surface-1)",border:"1px solid var(--border-soft)",
              borderRadius:"var(--radius)",padding:60,textAlign:"center",
            }}>
              <div style={{fontSize:32,marginBottom:8}}>📋</div>
              <div style={{fontSize:13,color:"var(--text-dim)"}}>Klik block di kiri untuk preview detail</div>
            </div>
          )}
          {loading && (
            <div style={{
              background:"var(--surface-1)",border:"1px solid var(--border-soft)",
              borderRadius:"var(--radius)",padding:60,textAlign:"center",
            }}>
              <div style={{fontSize:13,color:"var(--text-dim)"}}>Loading...</div>
            </div>
          )}
          {preview && !loading && (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>

              {/* Block info + export button */}
              <div className="card" style={{padding:16,display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                    <span style={{fontFamily:"var(--font-mono)",fontSize:18,fontWeight:700,color:"var(--accent)"}}>
                      {preview.prefix}
                    </span>
                    <span style={{
                      fontSize:10,padding:"3px 9px",borderRadius:99,fontWeight:600,textTransform:"uppercase",
                      background:preview.status==="active"?"var(--success-surface)":"var(--surface-2)",
                      color:preview.status==="active"?"var(--success)":"var(--text-dim)",
                      border:`1px solid ${preview.status==="active"?"var(--success-border)":"var(--border-soft)"}`,
                    }}>{preview.status}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                    {[["Name",preview.name],["ASN",preview.asn],["Router",preview.router],["Operator",preview.operator],["Site",preview.site_name]].map(([k,v])=>(
                      <div key={k} style={{
                        background:"var(--surface-2)",borderRadius:"var(--radius-sm)",
                        padding:"8px 10px",border:"1px solid var(--border-soft)",
                      }}>
                        <div style={{fontSize:9,fontWeight:700,color:"var(--text-dim)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{k}</div>
                        <div style={{fontSize:11,color:"var(--text)",fontFamily:k==="ASN"||k==="Router"?"var(--font-mono)":"inherit",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v||"—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={()=>doExport("single-pdf")} disabled={exporting}
                  className="btn btn-primary" style={{whiteSpace:"nowrap",flexShrink:0}}>
                  📄 Export PDF
                </button>
              </div>

              {/* Stats row */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>

                {/* Gauge */}
                <div style={{
                  padding:16,textAlign:"center",
                }} className="card">
                  <div style={{fontSize:10,fontWeight:600,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Utilization</div>
                  <GaugeChart pct={utilizPct}/>
                  <div style={{fontSize:11,color:"var(--text-dim)",marginTop:4}}>
                    {Math.round(usedIps).toLocaleString()} / {Math.round(totalIps).toLocaleString()} IPs
                  </div>
                </div>

                {/* IP breakdown donut */}
                <div style={{
                  padding:16,
                  display:"flex",flexDirection:"column",alignItems:"center",
                }} className="card">
                  <div style={{fontSize:10,fontWeight:600,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>IP Usage</div>
                  <DonutChart data={ipBreakdown} size={100}/>
                  <div style={{display:"flex",gap:12,marginTop:8}}>
                    {ipBreakdown.map(d=>(
                      <div key={d.label} style={{textAlign:"center"}}>
                        <div style={{fontSize:12,fontWeight:700,color:d.color,fontFamily:"var(--font-mono)"}}>{d.value.toLocaleString()}</div>
                        <div style={{fontSize:9,color:"var(--text-dim)"}}>{d.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Owner breakdown donut */}
                <div style={{
                  padding:16,
                  display:"flex",flexDirection:"column",alignItems:"center",
                }} className="card">
                  <div style={{fontSize:10,fontWeight:600,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>By Type</div>
                  <DonutChart data={ownerBreakdown} size={100}/>
                  <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap",justifyContent:"center"}}>
                    {ownerBreakdown.map(d=>(
                      <div key={d.label} style={{display:"flex",alignItems:"center",gap:3}}>
                        <div style={{width:6,height:6,borderRadius:2,background:d.color,flexShrink:0}}/>
                        <span style={{fontSize:9,color:"var(--text-dim)"}}>{d.label} ({d.value})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats cards */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                {[
                  ["Total Allocations", allocs.length, "var(--text)"],
                  ["Active",            activeCount,   "var(--success)"],
                  ["Reserved",          resvCount,     "var(--text-dim)"],
                  ["Free IPs",          Math.round(freeIps).toLocaleString(), "var(--accent)"],
                ].map(([label,val,color])=>(
                  <div key={label} className="card" style={{padding:"12px 16px"}}>
                    <div style={{fontSize:9,fontWeight:600,color:"var(--text-dim)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>{label}</div>
                    <div style={{fontSize:20,fontWeight:700,color,fontFamily:"var(--font-mono)"}}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Allocation table */}
              <div className="card" style={{overflow:"hidden"}}>
                <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border-medium)"}}>
                  <span style={{fontSize:11,fontWeight:600,color:"var(--text)"}}>Allocation Detail</span>
                  <span style={{fontSize:10,color:"var(--text-dim)",marginLeft:8}}>{allocs.length} rows</span>
                </div>
                <div style={{overflowX:"auto",maxHeight:"40vh",overflowY:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                    <thead style={{position:"sticky",top:0,zIndex:5}}>
                      <tr style={{background:"var(--surface-2)",borderBottom:"2px solid var(--border-medium)"}}>
                        {["#","Prefix","Usable Range","Type","Customer / Desc","VLAN","Status"].map(h=>(
                          <th key={h} style={{
                            padding:"7px 10px",textAlign:"left",
                            fontSize:10,fontWeight:600,textTransform:"uppercase",
                            letterSpacing:"0.07em",color:"var(--text-muted)",whiteSpace:"nowrap",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allocs.map((a,i)=>(
                        <tr key={a.id} style={{
                          borderBottom:"1px solid var(--border-soft)",
                          background:i%2===0?"var(--surface-1)":"transparent",
                        }}>
                          <td style={{padding:"5px 10px",color:"var(--text-dim)",fontSize:10}}>{i+1}</td>
                          <td style={{padding:"5px 10px",fontFamily:"var(--font-mono)",fontWeight:600,color:"var(--accent)",whiteSpace:"nowrap"}}>{a.prefix}</td>
                          <td style={{padding:"5px 10px",fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-dim)",whiteSpace:"nowrap"}}>{calcUsable(a.prefix)}</td>
                          <td style={{padding:"5px 10px"}}>
                            <span style={{fontSize:10,fontWeight:600,color:OWNER_COLOR[a.owner_type]||"var(--text-muted)"}}>
                              {OWNER_LABEL[a.owner_type]||a.owner_type}
                            </span>
                          </td>
                          <td style={{padding:"5px 10px",color:"var(--text-muted)",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {a.customer_name||a.description||"—"}
                          </td>
                          <td style={{padding:"5px 10px",fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-dim)",textAlign:"center"}}>{a.vlan_vid||"—"}</td>
                          <td style={{padding:"5px 10px"}}>
                            <span style={{fontSize:10,fontWeight:600,textTransform:"uppercase",color:STATUS_COLOR[a.status]||"var(--text-dim)"}}>
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {allocs.length===0&&(
                        <tr><td colSpan={7} style={{padding:20,textAlign:"center",color:"var(--text-dim)"}}>No allocations</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
