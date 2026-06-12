import { useState, useEffect, useCallback } from "react";
import { getVlans, createVlan, updateVlan, deleteVlan, getSites } from "../api.js";

function VlanModal({ vlan, sites, onClose, onSaved }) {
  const isEdit = !!vlan?.id;
  const [form, setForm] = useState({
    vid:         vlan?.vid         || "",
    name:        vlan?.name        || "",
    site_id:     vlan?.site_id     || "",
    status:      vlan?.status      || "active",
    description: vlan?.description || "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if (!form.vid) return setErr("VLAN ID is required");
    const vid = parseInt(form.vid);
    if (isNaN(vid) || vid < 1 || vid > 4094) return setErr("VLAN ID must be between 1 and 4094");
    setSaving(true); setErr(null);
    try {
      const payload = {...form, vid};
      if (isEdit) await updateVlan(vlan.id, payload);
      else        await createVlan(payload);
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  const STATUS_OPTS = ["active","reserved","deprecated"];

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:460}}>
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
          {err&&<div style={{background:"var(--danger-surface)",border:"1px solid var(--danger-border)",
            borderRadius:"var(--radius-sm)",padding:"10px 14px",color:"var(--danger)",fontSize:13}}>{err}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:6}}>
                VLAN ID (1-4094) *
              </label>
              <input value={form.vid} onChange={e=>set("vid")(e.target.value)}
                placeholder="e.g. 1336" className="input"
                style={{fontFamily:"var(--font-mono)"}} type="number" min="1" max="4094"/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:6}}>Name</label>
              <input value={form.name} onChange={e=>set("name")(e.target.value)}
                placeholder="e.g. VLAN-KEDIRI" className="input"/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:6}}>Site</label>
              <select value={form.site_id} onChange={e=>set("site_id")(e.target.value)} className="select">
                <option value="">— No site —</option>
                {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:6}}>Status</label>
              <select value={form.status} onChange={e=>set("status")(e.target.value)} className="select">
                {STATUS_OPTS.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
              </select>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:6}}>End Device XC</label>
              <input value={form.description} onChange={e=>set("description")(e.target.value)}
                placeholder="Optional description" className="input"/>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose}  className="btn btn-secondary">Cancel</button>
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
          <button onClick={onCancel} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",fontSize:18,padding:4}}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{fontSize:13,color:"var(--text-muted)",lineHeight:1.6,margin:0}}>{message}</p>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel}  className="btn btn-secondary">Cancel</button>
          <button onClick={onConfirm} className="btn btn-danger">Delete</button>
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLE = {
  active:     {bg:"var(--success-surface)", color:"var(--success)",  border:"var(--success-border)"},
  reserved:   {bg:"rgba(168,85,247,0.1)",   color:"#a855f7",          border:"rgba(168,85,247,0.25)"},
  deprecated: {bg:"var(--warning-surface)", color:"var(--warning)",  border:"var(--warning-border)"},
};

export default function Vlans() {
  const [items,   setItems]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [search,  setSearch]  = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [sites,   setSites]   = useState([]);

  const load = useCallback(()=>{
    setLoading(true);
    getVlans(search, siteFilter, 200)
      .then(d=>{ setItems(d.items||[]); setTotal(d.total||0); })
      .catch(console.error)
      .finally(()=>setLoading(false));
  },[search, siteFilter]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ getSites().then(setSites); },[]);

  const handleDelete = async (v) => {
    try { await deleteVlan(v.id); load(); }
    catch(e) { alert(e.message); }
    setConfirm(null);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div>
          <h1 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text)"}}>VLANs</h1>
          <p style={{margin:"4px 0 0",fontSize:13,color:"var(--text-muted)"}}>
            {total} VLAN{total!==1?"s":""} registered
          </p>
        </div>
        <button onClick={()=>setModal("add")} className="btn btn-primary">
          <span style={{fontSize:16,lineHeight:1}}>+</span>Add VLAN
        </button>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",
        background:"var(--surface-1)",border:"1px solid var(--border-subtle)",borderRadius:"var(--radius)"}}>
        <div style={{position:"relative",flex:1,maxWidth:280}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
            color:"var(--text-dim)",pointerEvents:"none",fontSize:14}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search VLAN ID or name..."
            className="input" style={{paddingLeft:32,height:34,fontSize:13}}/>
        </div>
        <select value={siteFilter} onChange={e=>setSiteFilter(e.target.value)}
          className="select" style={{height:34,fontSize:13,minWidth:140}}>
          <option value="">All Sites</option>
          {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",
            borderRadius:99,background:"var(--surface-3)",fontSize:12,fontWeight:500}}>
            <span style={{color:"var(--text-muted)",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{total}</span>
            <span style={{color:"var(--text-dim)"}}>Total</span>
          </div>
        </div>
      </div>

      <div className="card" style={{overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr>
              {["VLAN ID","Name","Site","Status","End Device XC",""].map(h=>(
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({length:6}).map((_,i)=>(
              <tr key={i}>
                {[60,120,100,80,180,60].map((w,j)=>(
                  <td key={j} className="table-cell">
                    <div className="skeleton" style={{height:14,width:w,borderRadius:4}}/>
                  </td>
                ))}
              </tr>
            )) : items.length===0 ? (
              <tr><td colSpan={6}>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",
                  justifyContent:"center",padding:"60px 0",gap:10}}>
                  <div style={{fontSize:36}}>🔗</div>
                  <div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>No VLANs found</div>
                  <div style={{fontSize:12,color:"var(--text-muted)"}}>
                    {search?"Try a different search":"Add your first VLAN"}
                  </div>
                </div>
              </td></tr>
            ) : items.map(v=>{
              const sc = STATUS_STYLE[v.status]||STATUS_STYLE.active;
              return (
                <tr key={v.id} className="table-row">
                  <td className="table-cell">
                    <span style={{fontFamily:"var(--font-mono)",fontSize:14,fontWeight:700,
                      color:"var(--accent)",fontVariantNumeric:"tabular-nums"}}>
                      {v.vid}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span style={{fontSize:13,color:v.name?"var(--text)":"var(--text-dim)",
                      fontStyle:v.name?"normal":"italic"}}>
                      {v.name||"—"}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span style={{fontSize:12,color:"var(--text-muted)"}}>{v.site_name||"—"}</span>
                  </td>
                  <td className="table-cell">
                    <span style={{display:"inline-flex",alignItems:"center",gap:5,
                      padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:600,
                      background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:sc.color}}/>
                      {v.status}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span style={{fontSize:12,color:"var(--text-muted)",maxWidth:200,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>
                      {v.description||"—"}
                    </span>
                  </td>
                  <td className="table-cell" onClick={e=>e.stopPropagation()}>
                    <div style={{display:"flex",gap:4,justifyContent:"flex-end"}}>
                      <button onClick={()=>setModal(v)} className="btn btn-ghost btn-sm"
                        style={{padding:"4px 10px",fontSize:12}}>Edit</button>
                      <button onClick={()=>setConfirm(v)} className="btn btn-sm"
                        style={{padding:"4px 10px",fontSize:12,background:"var(--danger-surface)",
                          color:"var(--danger)",border:"1px solid var(--danger-border)"}}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal&&<VlanModal vlan={modal==="add"?null:modal} sites={sites}
        onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}}/>}
      {confirm&&<ConfirmModal
        message={`Delete VLAN ${confirm.vid}${confirm.name?` (${confirm.name})`:""} ? This action cannot be undone.`}
        onConfirm={()=>handleDelete(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
