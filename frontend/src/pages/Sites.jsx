import { useState, useEffect, useCallback } from "react";
import { getSites, createSite, updateSite, deleteSite, authFetch} from "../api.js";

function SiteModal({ site, onClose, onSaved }) {
  const isEdit = !!site?.id;
  const [form, setForm] = useState({
    name:        site?.name        || "",
    city:        site?.city        || "",
    region:      site?.region      || "",
    description: site?.description || "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if (!form.name.trim()) return setErr("Site name is required");
    setSaving(true); setErr(null);
    try {
      if (isEdit) await updateSite(site.id, form);
      else        await createSite(form);
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  const Field = ({ label, k, placeholder }) => (
    <div>
      <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
        letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>{label}</label>
      <input value={form[k]} onChange={e=>set(k)(e.target.value)}
        placeholder={placeholder} className="input"/>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:440}}>
        <div className="modal-header">
          <div>
            <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>
              {isEdit?"Edit Site":"Add Site"}
            </div>
            <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>
              {isEdit?`Editing ${site.name}`:"Register a new site/location"}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
            color:"var(--text-muted)",fontSize:18,padding:4}}>✕</button>
        </div>
        <div className="modal-body" style={{display:"flex",flexDirection:"column",gap:14}}>
          {err && (
            <div style={{background:"var(--danger-surface)",border:"1px solid var(--danger-border)",
              borderRadius:"var(--radius-sm)",padding:"10px 14px",color:"var(--danger)",fontSize:13}}>{err}</div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{gridColumn:"1/-1"}}><Field label="Site Name *" k="name" placeholder="e.g. Kediri DC"/></div>
            <Field label="City"   k="city"   placeholder="e.g. Kediri"/>
            <Field label="Region" k="region" placeholder="e.g. East Java"/>
            <div style={{gridColumn:"1/-1"}}><Field label="Description" k="description" placeholder="Optional description"/></div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose}  className="btn btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving?"Saving…":isEdit?"Save Changes":"Add Site"}
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

export default function Sites() {
  const [items,    setItems]    = useState([]);
  const [search,   setSearch]   = useState("");
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(null);
  const [confirm,  setConfirm]  = useState(null);
  const [blockMap, setBlockMap] = useState({});

  const load = useCallback(()=>{
    setLoading(true);
    getSites(search)
      .then(d=>setItems(Array.isArray(d)?d:d.items||[]))
      .catch(console.error)
      .finally(()=>setLoading(false));
  },[search]);

  useEffect(()=>{ load(); },[load]);

  // Fetch block count per site
  useEffect(()=>{
    if (!items.length) return;
    Promise.all(items.map(s=>
      authFetch(`/api/v1/blocks?site_id=${s.id}&limit=100`)
        .then(r=>r.json())
        .then(d=>[ s.id, { total: d.total||0, items: d.items||[] } ])
        .catch(()=>[s.id,{total:0,items:[]}])
    )).then(results=>{
      const map = {};
      results.forEach(([id,data])=>{ map[id]=data; });
      setBlockMap(map);
    });
  },[items]);

  const handleDelete = async (s) => {
    try { await deleteSite(s.id); load(); }
    catch(e) { alert(e.message); }
    setConfirm(null);
  };

  // Avatar color per site (consistent)
  const siteColor = (name) => {
    const colors = ["#3b82f6","#8b5cf6","#0ea5e9","#10b981","#f59e0b","#ef4444","#ec4899"];
    let h = 0;
    for (let i=0; i<name.length; i++) h = (h*31 + name.charCodeAt(i)) % colors.length;
    return colors[Math.abs(h)];
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div>
          <h1 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text)"}}>Sites</h1>
          <p style={{margin:"4px 0 0",fontSize:13,color:"var(--text-muted)"}}>
            {items.length} site{items.length!==1?"s":""} registered
          </p>
        </div>
        <button onClick={()=>setModal("add")} className="btn btn-primary">
          + Add Site
        </button>
      </div>

      {/* Search */}
      <div className="card" style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
        <div style={{position:"relative",flex:1,maxWidth:300}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
            color:"var(--text-dim)",pointerEvents:"none",fontSize:14}}>S</span>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search site name or city..."
            className="input" style={{paddingLeft:32,height:34,fontSize:13}}/>
        </div>
        <div style={{marginLeft:"auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,
            padding:"4px 12px",borderRadius:99,
            background:"var(--surface-3)",border:"1px solid var(--border-soft)",
            fontSize:12,fontWeight:500}}>
            <span style={{color:"var(--text)",fontWeight:700}}>{items.length}</span>
            <span style={{color:"var(--text-muted)"}}>Total</span>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16}}>
          {Array.from({length:4}).map((_,i)=>(
            <div key={i} className="card" style={{padding:20}}>
              <div className="skeleton" style={{height:40,width:40,borderRadius:10,marginBottom:14}}/>
              <div className="skeleton" style={{height:16,width:140,borderRadius:4,marginBottom:8}}/>
              <div className="skeleton" style={{height:12,width:100,borderRadius:4,marginBottom:6}}/>
              <div className="skeleton" style={{height:12,width:180,borderRadius:4}}/>
            </div>
          ))}
        </div>
      ) : items.length===0 ? (
        <div className="card" style={{padding:60}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
            <div style={{fontSize:20,fontWeight:700}}>S</div>
            <div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>No sites found</div>
            <div style={{fontSize:12,color:"var(--text-muted)"}}>
              {search?"Try a different search":"Add your first site/location"}
            </div>
            {!search&&(
              <button onClick={()=>setModal("add")} className="btn btn-primary btn-sm" style={{marginTop:4}}>
                + Add Site
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16}}>
          {items.map(s=>{
            const color = siteColor(s.name);
            const blocks = blockMap[s.id];
            return (
              <div key={s.id} className="card" style={{padding:20,position:"relative"}}>

                {/* Header */}
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
                  <div style={{
                    width:44,height:44,borderRadius:12,flexShrink:0,
                    background:`${color}18`,border:`1px solid ${color}30`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:11,fontWeight:700,color:color,fontFamily:"var(--font-mono)",
                  }}>
                    {s.name.slice(0,3).toUpperCase()}
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>setModal(s)} className="btn btn-ghost btn-sm"
                      style={{padding:"4px 10px",fontSize:12}}>Edit</button>
                    <button onClick={()=>setConfirm(s)} className="btn btn-sm"
                      style={{padding:"4px 10px",fontSize:12,background:"var(--danger-surface)",
                        color:"var(--danger)",border:"1px solid var(--danger-border)"}}>Del</button>
                  </div>
                </div>

                {/* Site name */}
                <div style={{fontWeight:700,fontSize:15,color:"var(--text)",marginBottom:4}}>
                  {s.name}
                </div>

                {/* City / Region */}
                {(s.city||s.region) && (
                  <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:8,
                    display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:11}}>S</span>
                    {[s.city,s.region].filter(Boolean).join(", ")}
                  </div>
                )}

                {/* Description */}
                {s.description && (
                  <div style={{fontSize:12,color:"var(--text-dim)",lineHeight:1.5,marginBottom:12,
                    overflow:"hidden",textOverflow:"ellipsis",
                    display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>
                    {s.description}
                  </div>
                )}

                {/* Blocks info */}
                <div style={{
                  marginTop:14,paddingTop:12,
                  borderTop:"1px solid var(--border-soft)",
                  display:"flex",alignItems:"center",gap:12,
                }}>
                  {blocks === undefined ? (
                    <div className="skeleton" style={{height:12,width:100,borderRadius:4}}/>
                  ) : (
                    <>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{
                          fontFamily:"var(--font-mono)",fontSize:13,fontWeight:700,
                          color: blocks.total>0?"var(--accent)":"var(--text-dim)",
                        }}>{blocks.total}</span>
                        <span style={{fontSize:11,color:"var(--text-dim)"}}>
                          block{blocks.total!==1?"s":""}
                        </span>
                      </div>
                      {blocks.items?.length>0 && (
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginLeft:4}}>
                          {blocks.items.slice(0,3).map(b=>(
                            <span key={b.id} style={{
                              fontFamily:"var(--font-mono)",fontSize:9,
                              padding:"1px 5px",borderRadius:3,
                              background:"var(--surface-3)",
                              color:"var(--text-muted)",
                              border:"1px solid var(--border-soft)",
                            }}>{b.prefix}</span>
                          ))}
                          {blocks.total>3 && (
                            <span style={{fontSize:9,color:"var(--text-dim)"}}>+{blocks.total-3}</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  <div style={{marginLeft:"auto",fontSize:10,color:"var(--text-dim)",
                    fontFamily:"var(--font-mono)"}}>
                    {new Date(s.created_at).toLocaleDateString("id-ID")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal&&<SiteModal site={modal==="add"?null:modal}
        onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}}/>}
      {confirm&&<ConfirmModal
        message={`Delete site "${confirm.name}"? IP blocks assigned to this site will be unlinked.`}
        onConfirm={()=>handleDelete(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
