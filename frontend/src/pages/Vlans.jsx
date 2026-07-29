import { useState, useEffect, useCallback } from "react";
import { getVlans, getSites, createVlan, updateVlan, deleteVlan, getAllocationsByVlanIds } from "../api.js";
import { VLAN_STATUS_OPTS } from "../constants.js";
import { Btn, SearchBar, Loading, EmptyState, PageHeader, Icons, Badge, StatusBadge } from "../components/ui.jsx";

const STATUS_STYLE = {
  active:     { color:"var(--success)", bg:"var(--success-surface)", border:"var(--success-border)" },
  reserved:   { color:"var(--text-dim)", bg:"var(--surface-3)", border:"var(--border-soft)" },
  deprecated: { color:"var(--warning)", bg:"var(--warning-surface)", border:"var(--warning-border)" },
};

function VlanModal({ vlan, sites, onClose, onSaved }) {
  const isEdit = !!vlan?.id;
  const [form, setForm] = useState({
    vid:         vlan?.vid         || "",
    name:        vlan?.name        || "",
    status:      vlan?.status      || "active",
    site_id:     vlan?.site_id     || "",
    description: vlan?.description || "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if (!form.vid) return setErr("VLAN ID is required");
    setSaving(true); setErr(null);
    try {
      const payload = { ...form, vid: parseInt(form.vid), site_id: form.site_id||null, source: isEdit ? form.source : "static" };
      if (isEdit) await updateVlan(vlan.id, payload);
      else        await createVlan(payload);
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:480}}>
        <div className="modal-header">
          <div>
            <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>
              {isEdit?"Edit VLAN":"Add VLAN"}
            </div>
            <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>
              {isEdit?`Editing VLAN ${vlan.vid}`:"Register a new VLAN"}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
            color:"var(--text-muted)",fontSize:18,padding:4}}>✕</button>
        </div>
        <div className="modal-body" style={{display:"flex",flexDirection:"column",gap:14}}>
          {err && (
            <div style={{background:"var(--danger-surface)",border:"1px solid var(--danger-border)",
              borderRadius:"var(--radius-sm)",padding:"10px 14px",color:"var(--danger)",fontSize:13}}>
              {err}
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>VLAN ID *</label>
              <input type="number" value={form.vid} onChange={e=>set("vid")(e.target.value)}
                placeholder="e.g. 100" className="input" style={{fontFamily:"var(--font-mono)"}}/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Name</label>
              <input value={form.name} onChange={e=>set("name")(e.target.value)}
                placeholder="e.g. MGMT" className="input"/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Status</label>
              <select value={form.status} onChange={e=>set("status")(e.target.value)} className="select">
                {VLAN_STATUS_OPTS.map(s=>(
                  <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Site</label>
              <select value={form.site_id} onChange={e=>set("site_id")(e.target.value)} className="select">
                <option value="">— All Sites —</option>
                {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Description</label>
              <input value={form.description} onChange={e=>set("description")(e.target.value)}
                placeholder="Optional notes" className="input"/>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving?"Saving…":isEdit?"Save Changes":"Add VLAN"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal" style={{maxWidth:380}}>
        <div className="modal-header">
          <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>Confirm Delete</div>
          <button onClick={onCancel} style={{background:"none",border:"none",cursor:"pointer",
            color:"var(--text-muted)",fontSize:18,padding:4}}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{fontSize:13,color:"var(--text-muted)",lineHeight:1.6,margin:0}}>{message}</p>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn btn-secondary">Cancel</button>
          <button onClick={onConfirm} className="btn btn-danger">Delete</button>
        </div>
      </div>
    </div>
  );
}


export default function Vlans() {
  const [items,     setItems]     = useState([]);
  const [total,     setTotal]     = useState(0);
  const [sites,     setSites]     = useState([]);
  const [search,    setSearch]    = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [siteFilter,setSiteFilter]= useState("");
  const [page,      setPage]      = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [allocCountMap, setAllocCountMap] = useState({});
  const LIMIT = 100;

  const load = useCallback(() => {
    setLoading(true);
    getVlans(search, siteFilter, LIMIT, page*LIMIT, sourceFilter==="all"?"":sourceFilter)
      .then(d=>{ setItems(d.items||[]); setTotal(d.total||0); })
      .catch(console.error)
      .finally(()=>setLoading(false));
  }, [search, siteFilter, sourceFilter, page]);

  useEffect(()=>{
    const t = setTimeout(()=>{ load(); }, 300);
    return ()=>clearTimeout(t);
  },[load]);
  useEffect(()=>{ getSites("",100).then(d=>setSites(d.items||d||[])); },[]);

  // Fetch allocation counts per VLAN (used for delete-impact preview)
  useEffect(()=>{
    if (!items.length) return;
    const ids = items.map(v=>v.id);
    getAllocationsByVlanIds(ids)
      .then(d=>{
        const allocs = d.items || [];
        const countMap = {};
        ids.forEach(id=>{ countMap[id] = 0; });
        allocs.forEach(a=>{
          if (!a.vlan_id) return;
          countMap[a.vlan_id] = (countMap[a.vlan_id]||0) + 1;
        });
        setAllocCountMap(countMap);
      })
      .catch(()=>{});
  }, [items]);

  const handleDelete = async (v) => {
    try { await deleteVlan(v.id); load(); }
    catch(e) { alert(e.message); }
    setConfirm(null);
  };

  const filteredItems = items;
  const activeCount = items.filter(v=>v.status==="active").length;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Header */}
      <PageHeader title="VLANs" count={total}>
        <Btn icon={Icons.plus} onClick={()=>setModal("add")}>Add VLAN</Btn>
      </PageHeader>

      {/* Toolbar */}
      <div className="card" style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search VLAN ID or name..." width={320} />
        <select value={sourceFilter} onChange={e=>{setSourceFilter(e.target.value);setPage(0);}}
          className="select" style={{height:34,fontSize:13,minWidth:140}}>
          <option value="all">All Sources</option>
          <option value="dynamic">Dynamic (D)</option>
          <option value="static">Static (S)</option>
        </select>
        <span style={{fontSize:12,color:"var(--text-muted)"}}>{filteredItems.length} results</span>
        <select value={siteFilter} onChange={e=>{setSiteFilter(e.target.value);setPage(0);}}
          className="select" style={{height:34,fontSize:13,minWidth:140}}>
          <option value="">All Sites</option>
          {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          {[
            ["Total",  total,       "var(--text-muted)","var(--surface-3)","var(--border-soft)"],
            ["Active", activeCount, "var(--success)",   "var(--success-surface)","var(--success-border)"],
          ].map(([l,v,c,bg,border])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:6,
              padding:"4px 12px",borderRadius:99,background:bg,
              border:`1px solid ${border}`,fontSize:12,fontWeight:500}}>
              <span style={{color:c,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{v}</span>
              <span style={{color:"var(--text-muted)"}}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr>
              {["VLAN ID","Name","Src","Site","Customer","Status","Router Placements","End Device XC",""].map(h=>(
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{padding:0}}><Loading message="Loading VLANs..." /></td></tr>
            ) : filteredItems.length===0 ? (
              <tr><td colSpan={7}>
                <EmptyState icon={Icons.network} title="No VLANs found"
                  message={search?"Try a different search":"Add your first VLAN"} />
              </td></tr>
            ) : filteredItems.map((v,idx)=>{
              const sc = STATUS_STYLE[v.status]||STATUS_STYLE.active;
              return (
                <tr key={v.id} className="table-row"
                  style={{background: idx%2===0?"var(--surface-1)":"var(--surface-2)"}}>

                  {/* VLAN ID */}
                  <td className="table-cell">
                    <span style={{fontFamily:"var(--font-mono)",fontSize:15,fontWeight:700,
                      color:"var(--accent)",fontVariantNumeric:"tabular-nums"}}>
                      {v.vid}
                    </span>
                  </td>

                  {/* Name */}
                  <td className="table-cell">
                    <span style={{fontSize:13,fontWeight:500,
                      color:v.name?"var(--text)":"var(--text-dim)",
                      fontStyle:v.name?"normal":"italic"}}>
                      {v.name||"—"}
                    </span>
                  </td>

                  {/* Source */}
                  <td className="table-cell">
                    <span style={{
                      fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:99,
                      background: v.source === "static" ? "var(--warning-surface)" : "var(--info-surface)",
                      color: v.source === "static" ? "var(--warning)" : "var(--accent)",
                      border: `1px solid ${v.source === "static" ? "var(--warning-border)" : "var(--info-border)"}`,
                    }}>{v.source === "static" ? "S" : "D"}</span>
                  </td>

                  {/* Site */}
                  <td className="table-cell" style={{minWidth:120}}>
                    {(v.site_names||[]).length === 0 ? (
                      <span style={{color:"var(--text-dim)",fontSize:11}}>—</span>
                    ) : (
                      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                        {v.site_names.map((name,i)=>(
                          <span key={i} style={{
                            fontSize:10,fontWeight:500,padding:"2px 7px",borderRadius:4,
                            background:"var(--surface-3)",color:"var(--text-muted)",
                            border:"1px solid var(--border-soft)",
                          }}>{name}</span>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Customer */}
                  <td className="table-cell" style={{minWidth:140}}>
                    {(v.customer_names||[]).length === 0 ? (
                      <span style={{color:"var(--text-dim)",fontSize:11}}>—</span>
                    ) : (
                      <div style={{display:"flex",flexDirection:"column",gap:2}}>
                        {v.customer_names.slice(0,2).map((name,i)=>(
                          <span key={i} style={{fontSize:11,color:"var(--text-muted)"}}>{name}</span>
                        ))}
                        {v.customer_names.length>2 && (
                          <span style={{fontSize:10,color:"var(--text-dim)"}}>+{v.customer_names.length-2} more</span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="table-cell">
                    <span style={{display:"inline-flex",alignItems:"center",gap:5,
                      padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:600,
                      background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:sc.color}}/>
                      {v.status}
                    </span>
                  </td>

                  {/* End Device XC */}
                  <td className="table-cell">
                    <span style={{fontSize:12,color:"var(--text-muted)",maxWidth:180,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>
                      {v.description||"—"}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="table-cell" onClick={e=>e.stopPropagation()}>
                    <div style={{display:"flex",gap:4,justifyContent:"flex-end"}}>
                      <button onClick={()=>setModal(v)} className="btn btn-ghost btn-sm"
                        style={{padding:"4px 10px",fontSize:12}}>Edit</button>
                      <button onClick={()=>setConfirm(v)} className="btn btn-sm"
                        style={{padding:"4px 10px",fontSize:12,background:"var(--danger-surface)",
                          color:"var(--danger)",border:"1px solid var(--danger-border)"}}>Del</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {total > LIMIT && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"12px 16px",borderTop:"1px solid var(--border-soft)"}}>
            <span style={{fontSize:12,color:"var(--text-muted)"}}>
              Showing {page*LIMIT+1}–{Math.min((page+1)*LIMIT,total)} of {total}
            </span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}
                className="btn btn-secondary btn-sm">← Prev</button>
              <button onClick={()=>setPage(p=>p+1)} disabled={(page+1)*LIMIT>=total}
                className="btn btn-secondary btn-sm">Next →</button>
            </div>
          </div>
        )}
      </div>

      {modal&&<VlanModal vlan={modal==="add"?null:modal} sites={sites}
        onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}}/>}
      {confirm&&<ConfirmModal
        message={allocCountMap[confirm.id]>0
          ? `Delete VLAN ${confirm.vid}${confirm.name?` (${confirm.name})`:""}? This VLAN has ${allocCountMap[confirm.id]} allocation(s) linked. Deleting may orphan or unlink those allocations. This action cannot be undone.`
          : `Delete VLAN ${confirm.vid}${confirm.name?` (${confirm.name})`:""}? This action cannot be undone.`}
        onConfirm={()=>handleDelete(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
