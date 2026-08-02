import { useState, useEffect } from "react";
import { getCustomer } from "../api.js";
import { Btn, Loading, EmptyState, PageHeader, Icons, Card, Tag } from "../components/ui.jsx";

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_STYLE = {
  active:     { color:"var(--success)", bg:"rgba(34,197,94,0.08)", border:"rgba(34,197,94,0.25)" },
  reserved:   { color:"var(--warning)", bg:"rgba(234,179,8,0.08)", border:"rgba(234,179,8,0.25)" },
  deprecated: { color:"var(--text-dim)",bg:"rgba(100,116,139,0.08)",border:"rgba(100,116,139,0.25)" },
};

const OWNER_COLOR = {
  customer:"var(--accent)", internal:"var(--success)", ptp:"var(--warning)",
  peering:"#a78bfa", management:"#f472b6", reserved:"var(--text-muted)",
};

export default function CustomerDetail({ customerId, onBack, onNavigate }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getCustomer(customerId)
      .then(d => { if (mounted) { setData(d); setLoading(false); } })
      .catch(e => { if (mounted) { setErr(e.message); setLoading(false); } });
    return () => { mounted = false; };
  }, [customerId]);

  if (loading) return <Loading message="Loading customer..." />;
  if (err)     return (
    <div style={{padding:24,background:"var(--danger-surface)",border:"1px solid var(--danger-border)",borderRadius:"var(--radius)",color:"var(--danger)"}}>
      Error: {err}
    </div>
  );
  if (!data)   return null;

  const allocs = data.allocations || [];
  // Unique VLANs from allocations
  const vlanMap = new Map();
  allocs.forEach(a => {
    if (a.vlan_id && a.vlan_vid) {
      if (!vlanMap.has(a.vlan_id)) vlanMap.set(a.vlan_id, { id: a.vlan_id, vid: a.vlan_vid, name: a.vlan_name });
    }
  });
  const vlans = [...vlanMap.values()];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Header */}
      <PageHeader title={data.name} icon={Icons.customers}>
        <Btn variant="ghost" size="sm" icon={Icons.arrowLeft} onClick={onBack}>Back to Customers</Btn>
      </PageHeader>

      {/* Info cards row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

        {/* Identity card */}
        <Card title="Customer Info" accent="var(--accent)">
          <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:"8px 12px",fontSize:13}}>
            <span style={{color:"var(--text-muted)"}}>Name</span>
            <span style={{fontWeight:600}}>{data.name}</span>

            {data.code && <>
              <span style={{color:"var(--text-muted)"}}>Code</span>
              <span style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--text-muted)"}}>{data.code}</span>
            </>}

            <span style={{color:"var(--text-muted)"}}>Status</span>
            <span>
              <span style={{display:"inline-flex",alignItems:"center",gap:5,
                background:data.is_active ? "rgba(34,197,94,0.08)" : "rgba(100,116,139,0.08)",
                border:`1px solid ${data.is_active ? "rgba(34,197,94,0.25)" : "rgba(100,116,139,0.25)"}`,
                color:data.is_active ? "var(--success)" : "var(--text-dim)",
                padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>
                {data.is_active ? "Active" : "Inactive"}
              </span>
            </span>

            {data.source && <>
              <span style={{color:"var(--text-muted)"}}>Source</span>
              <span style={{display:"inline-flex",alignItems:"center",gap:4,
                background:"var(--surface-1)",border:"1px solid var(--border-soft)",
                padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,width:"fit-content"}}>
                {data.source === "static" ? "S" : "D"} {data.source}
              </span>
            </>}

            {data.description && <>
              <span style={{color:"var(--text-muted)"}}>Description</span>
              <span style={{color:"var(--text-muted)"}}>{data.description}</span>
            </>}

            <span style={{color:"var(--text-muted)"}}>Created</span>
            <span style={{color:"var(--text-muted)",fontSize:11}}>{formatTime(data.created_at)}</span>

            <span style={{color:"var(--text-muted)"}}>Updated</span>
            <span style={{color:"var(--text-muted)",fontSize:11}}>{formatTime(data.updated_at)}</span>
          </div>
        </Card>

        {/* Contact + Stats card */}
        <Card title="Contact &amp; Stats" accent="var(--accent2)">
          <div style={{display:"flex",flexDirection:"column",gap:12,fontSize:13}}>
            {data.contact_name && <div>
              <span style={{color:"var(--text-muted)",fontSize:11,display:"block",marginBottom:2}}>Contact</span>
              <span>{data.contact_name}</span>
            </div>}
            {data.contact_email && <div>
              <span style={{color:"var(--text-muted)",fontSize:11,display:"block",marginBottom:2}}>Email</span>
              <span style={{fontFamily:"var(--font-mono)",fontSize:12}}>{data.contact_email}</span>
            </div>}
            {data.contact_phone && <div>
              <span style={{color:"var(--text-muted)",fontSize:11,display:"block",marginBottom:2}}>Phone</span>
              <span>{data.contact_phone}</span>
            </div>}

            {/* Divider if any contact shown */}
            {(data.contact_name||data.contact_email||data.contact_phone) &&
              <div style={{borderTop:"1px solid var(--border-soft)"}} />}

            {/* Stats */}
            <div style={{display:"flex",gap:16}}>
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
                <div style={{fontSize:20,fontWeight:700,color:"var(--warning)"}}>{vlans.length}</div>
                <div style={{fontSize:10,color:"var(--text-muted)",textTransform:"uppercase"}}>VLANs</div>
              </div>
            </div>

            {/* VLANs */}
            {vlans.length > 0 && <>
              <div style={{borderTop:"1px solid var(--border-soft)"}} />
              <div>
                <div style={{color:"var(--text-muted)",fontSize:11,fontWeight:600,
                  textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>
                  VLANs ({vlans.length})
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {vlans.map(v => (
                    <a key={v.id} onClick={e=>{e.preventDefault();onNavigate?.("vlan-detail", {id:v.id, from:"customer-detail"});}}
                      href="#" style={{textDecoration:"none"}}>
                      <Tag color="var(--accent)" mono>
                        {v.vid}{v.name ? ` — ${v.name}` : ""}
                      </Tag>
                    </a>
                  ))}
                </div>
              </div>
            </>}
          </div>
        </Card>
      </div>

      {/* Allocations table */}
      <Card title={`Allocations (${allocs.length})`} accent="var(--border-soft)">
        {allocs.length === 0 ? (
          <EmptyState icon={Icons.network} title="No allocations" message="No IP allocations exist for this customer yet." />
        ) : (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:"var(--surface-1)",borderBottom:"1px solid var(--border-soft)"}}>
                  {["Prefix","Block","VLAN","Status","Type","End Device XC","Site","Block Router"].map(h=>(
                    <th key={h} style={{padding:"8px 12px",textAlign:"left",fontWeight:600,
                      fontSize:10,color:"var(--text-muted)",textTransform:"uppercase",
                      letterSpacing:"0.06em",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allocs.map((a, idx) => {
                  const ss = STATUS_STYLE[a.status] || STATUS_STYLE.active;
                  return (
                    <tr key={a.id}
                      style={{borderBottom:"1px solid var(--border-soft)",
                        background:idx%2===0?"var(--surface-1)":"transparent"}}>
                      <td style={{padding:"7px 12px",fontFamily:"var(--font-mono)",fontWeight:600,color:"var(--accent)"}}>
                        {a.prefix}
                      </td>
                      <td style={{padding:"7px 12px",color:"var(--text-muted)"}}>
                        <span style={{fontFamily:"var(--font-mono)",fontSize:11}}>{a.block_prefix}</span>
                        {a.block_name && <span style={{color:"var(--text-dim)",marginLeft:6}}>{a.block_name}</span>}
                      </td>
                      <td style={{padding:"7px 12px"}}>
                        {a.vlan_id ? (
                          <a onClick={e=>{e.preventDefault();onNavigate?.("vlan-detail", {id:a.vlan_id, from:"customer-detail"});}}
                            href="#" style={{textDecoration:"none"}}>
                            <span style={{fontFamily:"var(--font-mono)",fontWeight:600,color:"var(--accent)",cursor:"pointer"}}>
                              {a.vlan_vid}{a.vlan_name ? ` — ${a.vlan_name}` : ""}
                            </span>
                          </a>
                        ) : <span style={{color:"var(--text-dim)"}}>—</span>}
                      </td>
                      <td style={{padding:"7px 12px"}}>
                        <span style={{display:"inline-flex",alignItems:"center",
                          background:ss.bg,border:`1px solid ${ss.border}`,color:ss.color,
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
                      <td style={{padding:"7px 12px",color:"var(--text-muted)"}}>
                        {a.block_router || "—"}
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
