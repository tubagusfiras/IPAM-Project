import { useState, useEffect, useCallback } from "react";
import { getSites, createSite, updateSite, deleteSite } from "../api.js";

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
      <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
        letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:6}}>{label}</label>
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
          {err&&<div style={{background:"var(--danger-surface)",border:"1px solid var(--danger-border)",
            borderRadius:"var(--radius-sm)",padding:"10px 14px",color:"var(--danger)",fontSize:13}}>{err}</div>}
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

export default function Sites() {
  const [items,   setItems]   = useState([]);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(()=>{
    setLoading(true);
    getSites(search)
      .then(d=>setItems(Array.isArray(d)?d:d.items||[]))
      .catch(console.error)
      .finally(()=>setLoading(false));
  },[search]);

  useEffect(()=>{ load(); },[load]);

  const handleDelete = async (s) => {
    try { await deleteSite(s.id); load(); }
    catch(e) { alert(e.message); }
    setConfirm(null);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div>
          <h1 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text)"}}>Sites</h1>
          <p style={{margin:"4px 0 0",fontSize:13,color:"var(--text-muted)"}}>
            {items.length} site{items.length!==1?"s":""} registered
          </p>
        </div>
        <button onClick={()=>setModal("add")} className="btn btn-primary">
          <span style={{fontSize:16,lineHeight:1}}>+</span>Add Site
        </button>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",
        background:"var(--surface-1)",border:"1px solid var(--border-subtle)",borderRadius:"var(--radius)"}}>
        <div style={{position:"relative",flex:1,maxWidth:280}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
            color:"var(--text-dim)",pointerEvents:"none",fontSize:14}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search site name or city..."
            className="input" style={{paddingLeft:32,height:34,fontSize:13}}/>
        </div>
      </div>

      {/* Site cards grid */}
      {loading ? (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
          {Array.from({length:6}).map((_,i)=>(
            <div key={i} className="card" style={{padding:20}}>
              <div className="skeleton" style={{height:16,width:120,borderRadius:4,marginBottom:10}}/>
              <div className="skeleton" style={{height:12,width:80,borderRadius:4,marginBottom:8}}/>
              <div className="skeleton" style={{height:12,width:160,borderRadius:4}}/>
            </div>
          ))}
        </div>
      ) : items.length===0 ? (
        <div className="card" style={{padding:60}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
            <div style={{fontSize:36}}>📍</div>
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
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
          {items.map(s=>(
            <div key={s.id} className="card" style={{padding:20,position:"relative"}}>
              {/* Icon */}
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14}}>
                <div style={{
                  width:40,height:40,borderRadius:10,
                  background:"var(--accent-dim)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:18,
                }}>📍</div>
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>setModal(s)} className="btn btn-ghost btn-sm"
                    style={{padding:"4px 10px",fontSize:12}}>Edit</button>
                  <button onClick={()=>setConfirm(s)} className="btn btn-sm"
                    style={{padding:"4px 10px",fontSize:12,background:"var(--danger-surface)",
                      color:"var(--danger)",border:"1px solid var(--danger-border)"}}>Del</button>
                </div>
              </div>

              {/* Info */}
              <div style={{fontWeight:700,fontSize:15,color:"var(--text)",marginBottom:4}}>{s.name}</div>
              {(s.city||s.region) && (
                <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:8}}>
                  📍 {[s.city,s.region].filter(Boolean).join(", ")}
                </div>
              )}
              {s.description && (
                <div style={{fontSize:12,color:"var(--text-dim)",lineHeight:1.5,
                  overflow:"hidden",textOverflow:"ellipsis",
                  display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>
                  {s.description}
                </div>
              )}

              {/* Footer */}
              <div style={{
                marginTop:14,paddingTop:12,
                borderTop:"1px solid var(--border-subtle)",
                display:"flex",alignItems:"center",gap:12,
              }}>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:10,color:"var(--text-dim)"}}>Created</span>
                  <span style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--text-muted)"}}>
                    {new Date(s.created_at).toLocaleDateString("id-ID")}
                  </span>
                </div>
              </div>
            </div>
          ))}
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
