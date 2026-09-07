import { useState, useEffect } from "react";
import { getVlan } from "../api.js";
import { Btn, Loading, EmptyState, PageHeader, Icons, Card, Tag, StatusBadge } from "../components/ui.jsx";

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_STYLE = {
  active:     { color:"var(--success)",  bg:"rgba(34,197,94,0.08)",  border:"rgba(34,197,94,0.25)"  },
  reserved:   { color:"var(--warning)",  bg:"rgba(234,179,8,0.08)",  border:"rgba(234,179,8,0.25)"  },
  deprecated: { color:"var(--text-dim)", bg:"rgba(100,116,139,0.08)",border:"rgba(100,116,139,0.25)"},
};

const OWNER_COLOR = {
  customer:"var(--accent)", internal:"var(--success)", ptp:"var(--warning)",
  peering:"#a78bfa", management:"#f472b6", reserved:"var(--text-muted)",
};

export default function VlanDetail({ vlanId, onBack, onNavigate }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getVlan(vlanId)
      .then(d => { if (mounted) { setData(d); setLoading(false); } })
      .catch(e => { if (mounted) { setErr(e.message); setLoading(false); } });
    return () => { mounted = false; };
  }, [vlanId]);

  if (loading) return <Loading message="Loading VLAN..." />;
  if (err)     return (
    <div style={{padding:24,background:"var(--danger-surface)",border:"1px solid var(--danger-border)",borderRadius:"var(--radius)",color:"var(--danger)"}}>
      Error: {err}
    </div>
  );
  if (!data)   return null;

  const allocs     = data.allocations || [];
  const ss         = STATUS_STYLE[data.status] || STATUS_STYLE.active;
  // Unique customers from allocations
  const customers  = [...new Map(allocs.filter(a=>a.customer_id).map(a=>[a.customer_id,{id:a.customer_id,name:a.customer_name}])).values()];
  // Unique sites from allocations
  const sites      = [...new Set(allocs.map(a=>a.site_name).filter(Boolean))];

  return (
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Header */}
      <PageHeader title={`VLAN ${data.vid}${data.name ? ` — ${data.name}` : ""}`} icon={Icons.network}>
        <Btn variant="ghost" size="sm" icon={Icons.arrowLeft} onClick={onBack}>Back to VLANs</Btn>
      </PageHeader>

      {/* Info cards row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

        {/* Identity card */}
        <Card title="VLAN Info" accent="var(--accent)">
          <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:"8px 12px",fontSize:13}}>
            <span style={{color:"var(--text-muted)"}}>VID</span>
            <span style={{fontFamily:"var(--font-mono)",fontWeight:700,fontSize:18,color:"var(--accent)"}}>
              {data.vid}
            </span>

            <span style={{color:"var(--text-muted)"}}>Name</span>
            <span>{data.name || <em style={{color:"var(--text-dim)"}}>unnamed</em>}</span>

            <span style={{color:"var(--text-muted)"}}>Status</span>
            <span>
              <span style={{display:"inline-flex",alignItems:"center",gap:5,
                background:ss.bg,border:`1px solid ${ss.border}`,color:ss.color,
                padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>
                {data.status}
              </span>
            </span>

            <span style={{color:"var(--text-muted)"}}>Source</span>
            <span>
              <span style={{display:"inline-flex",alignItems:"center",gap:4,
                background:"var(--surface-1)",border:"1px solid var(--border-soft)",
                padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600}}>
                {data.source === "static" ? "S" : "D"} {data.source || "dynamic"}
              </span>
            </span>

            {data.site_name && <>
              <span style={{color:"var(--text-muted)"}}>Site</span>
              <Tag>{data.site_name}</Tag>
            </>}

            {data.description && <>
              <span style={{color:"var(--text-muted)"}}>Description</span>
              <span style={{fontSize:12,lineHeight:1.5}}>{data.description}</span>
            </>}

            <span style={{color:"var(--text-muted)"}}>Created</span>
            <span style={{fontSize:11}}>{formatTime(data.created_at)}</span>

            <span style={{color:"var(--text-muted)"}}>Updated</span>
            <span style={{fontSize:11}}>{formatTime(data.updated_at)}</span>
          </div>
        </Card>

        {/* Relationships card */}
        <Card title="Relationships" accent="var(--accent2)">
          <div style={{display:"flex",flexDirection:"column",gap:12,fontSize:13}}>
            {/* Customers */}
            <div>
              <div style={{color:"var(--text-muted)",fontSize:11,fontWeight:600,
                textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>
                Customers ({customers.length})
              </div>
              {customers.length === 0
                ? <span style={{color:"var(--text-dim)"}}>—</span>
                : <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {customers.map(c => (
                      <a key={c.id} onClick={e=>{e.preventDefault();onNavigate?.("customer-detail", {id:c.id, from:"vlan-detail"});}}
                        href={`#customer-detail/${c.id}`} style={{textDecoration:"none"}}>
                        <Tag color="var(--accent)">{c.name}</Tag>
                      </a>
                    ))}
                  </div>
              }
            </div>

            {/* Sites */}
            <div>
              <div style={{color:"var(--text-muted)",fontSize:11,fontWeight:600,
                textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>
                Sites ({sites.length})
              </div>
              {sites.length === 0
                ? <span style={{color:"var(--text-dim)"}}>—</span>
                : <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {sites.map(s => <Tag key={s}>{s}</Tag>)}
                  </div>
              }
            </div>

            {/* Stats */}
            <div style={{display:"flex",gap:16,paddingTop:4,borderTop:"1px solid var(--border-soft)"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:700,color:"var(--accent)"}}>{allocs.length}</div>
                <div style={{fontSize:10,color:"var(--text-muted)",textTransform:"uppercase"}}>Allocations</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:700,color:"var(--success)"}}>
                  {allocs.filter(a=>a.status==="active").length}
                </div>
                <div style={{fontSize:10,color:"var(--text-muted)",textTransform:"uppercase"}}>Active</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:700,color:"var(--text-muted)"}}>{customers.length}</div>
                <div style={{fontSize:10,color:"var(--text-muted)",textTransform:"uppercase"}}>Customers</div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Allocations table */}
      <Card title={`Allocations (${allocs.length})`} accent="var(--border-soft)">
        {allocs.length === 0 ? (
          <EmptyState icon={Icons.network} title="No allocations" message="No IP allocations linked to this VLAN yet." />
        ) : (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:"var(--surface-1)",borderBottom:"1px solid var(--border-soft)"}}>
                  {["Prefix","Block","Customer","Status","Type","End Device XC","Site"].map(h=>(
                    <th key={h} style={{padding:"8px 12px",textAlign:"left",fontWeight:600,
                      fontSize:10,color:"var(--text-muted)",textTransform:"uppercase",
                      letterSpacing:"0.06em",whiteSpace:"nowrap"}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allocs.map((a, idx) => {
                  const ss2 = STATUS_STYLE[a.status] || STATUS_STYLE.active;
                  return (
                    <tr key={a.id}
                      style={{borderBottom:"1px solid var(--border-soft)",
                        background:idx%2===0?"var(--surface-1)":"transparent"}}>
                      <td style={{padding:"7px 12px",fontFamily:"var(--font-mono)",fontWeight:600,color:"var(--accent)"}}>
                        {a.prefix}
                      </td>
                      <td style={{padding:"7px 12px",color:"var(--text-muted)"}}>
                        <a onClick={e=>{e.preventDefault();onNavigate?.("block-detail",{id:a.block_id,from:"vlan-detail"});}}
                          href={`#block-detail/${a.block_id}`} style={{textDecoration:"none",color:"var(--text-muted)",cursor:"pointer",transition:"color 0.12s"}}
                          onMouseEnter={e=>e.currentTarget.style.color="var(--accent)"}
                          onMouseLeave={e=>e.currentTarget.style.color="var(--text-muted)"}>
                          <span style={{fontFamily:"var(--font-mono)",fontSize:11}}>{a.block_prefix}</span>
                          {a.block_name && <span style={{color:"var(--text-dim)",marginLeft:6}}>{a.block_name}</span>}
                        </a>
                      </td>
                      <td style={{padding:"7px 12px"}}>
                        {a.customer_id ? (
                          <a onClick={e=>{e.preventDefault();onNavigate?.("customer-detail", {id:a.customer_id, from:"vlan-detail"});}}
                            href={`#customer-detail/${a.customer_id}`} style={{textDecoration:"none"}}>
                            <span style={{color:"var(--accent)",cursor:"pointer"}}>{a.customer_name}</span>
                          </a>
                        ) : (
                          <span style={{color:"var(--text-dim)"}}>{a.description || "—"}</span>
                        )}
                      </td>
                      <td style={{padding:"7px 12px"}}>
                        <span style={{display:"inline-flex",alignItems:"center",
                          background:ss2.bg,border:`1px solid ${ss2.border}`,color:ss2.color,
                          padding:"2px 6px",borderRadius:3,fontSize:10,fontWeight:600,textTransform:"uppercase"}}>
                          {a.status}
                        </span>
                      </td>
                      <td style={{padding:"7px 12px",color:OWNER_COLOR[a.owner_type]||"var(--text-muted)",
                        fontSize:11,fontWeight:600,textTransform:"uppercase"}}>
                        {a.owner_type}
                      </td>
                      <td style={{padding:"7px 12px",color:"var(--text-muted)",fontFamily:"var(--font-mono)",fontSize:11}}>
                        {a.end_device_xc || "—"}
                      </td>
                      <td style={{padding:"7px 12px",color:"var(--text-muted)"}}>
                        {a.site_name || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
