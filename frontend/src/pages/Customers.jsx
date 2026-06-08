import { useState, useEffect, useCallback } from "react";
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from "../api.js";

function CustomerModal({ customer, onClose, onSaved }) {
  const isEdit = !!customer?.id;
  const [form, setForm] = useState({
    name:        customer?.name        || "",
    code:        customer?.code        || "",
    email:       customer?.email       || "",
    phone:       customer?.phone       || "",
    address:     customer?.address     || "",
    description: customer?.description || "",
    is_active:   customer?.is_active   ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if (!form.name.trim()) return setErr("Customer name is required");
    setSaving(true); setErr(null);
    try {
      if (isEdit) await updateCustomer(customer.id, form);
      else        await createCustomer(form);
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  const Field = ({ label, k, placeholder, mono, type="text" }) => (
    <div>
      <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
        letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:6}}>{label}</label>
      <input type={type} value={form[k]} onChange={e=>set(k)(e.target.value)}
        placeholder={placeholder} className="input"
        style={{fontFamily:mono?"var(--font-mono)":"inherit"}}/>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:520}}>
        <div className="modal-header">
          <div>
            <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>
              {isEdit?"Edit Customer":"Add Customer"}
            </div>
            <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>
              {isEdit?`Editing ${customer.name}`:"Register a new customer"}
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
            <div style={{gridColumn:"1/-1"}}><Field label="Customer Name *" k="name" placeholder="e.g. PT Sumber Data Indonesia"/></div>
            <Field label="Customer Code" k="code" placeholder="e.g. SDI-001" mono/>
            <Field label="Email" k="email" placeholder="e.g. noc@sdi.id" type="email"/>
            <Field label="Phone" k="phone" placeholder="e.g. +62..."/>
            <div style={{gridColumn:"1/-1"}}><Field label="Address" k="address" placeholder="Full address"/></div>
            <div style={{gridColumn:"1/-1"}}><Field label="Description" k="description" placeholder="Optional notes"/></div>
            <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:10}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                <input type="checkbox" checked={form.is_active}
                  onChange={e=>set("is_active")(e.target.checked)}
                  style={{width:16,height:16,accentColor:"var(--accent)"}}/>
                <span style={{fontSize:13,color:"var(--text)"}}>Active customer</span>
              </label>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose}  className="btn btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving?"Saving…":isEdit?"Save Changes":"Add Customer"}
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

function SkeletonRow({ cols=6 }) {
  return (
    <tr>
      {Array.from({length:cols}).map((_,i)=>(
        <td key={i} className="table-cell">
          <div className="skeleton" style={{height:14,width:[120,60,140,100,80,60][i]||80,borderRadius:4}}/>
        </td>
      ))}
    </tr>
  );
}

export default function Customers() {
  const [items,   setItems]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [page,    setPage]    = useState(0);
  const LIMIT = 50;

  const load = useCallback(() => {
    setLoading(true);
    getCustomers(search, LIMIT, page*LIMIT)
      .then(d=>{ setItems(d.items||[]); setTotal(d.total||0); })
      .catch(console.error)
      .finally(()=>setLoading(false));
  }, [search, page]);

  useEffect(()=>{ load(); },[load]);

  const handleDelete = async (c) => {
    try { await deleteCustomer(c.id); load(); }
    catch(e) { alert(e.message); }
    setConfirm(null);
  };

  const activeCount = items.filter(c=>c.is_active).length;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div>
          <h1 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text)"}}>Customers</h1>
          <p style={{margin:"4px 0 0",fontSize:13,color:"var(--text-muted)"}}>
            {total} customer{total!==1?"s":""} registered
          </p>
        </div>
        <button onClick={()=>setModal("add")} className="btn btn-primary">
          <span style={{fontSize:16,lineHeight:1}}>+</span>Add Customer
        </button>
      </div>

      {/* Toolbar */}
      <div style={{display:"flex",alignItems:"center",gap:10,
        padding:"12px 16px",background:"var(--surface-1)",
        border:"1px solid var(--border-subtle)",borderRadius:"var(--radius)"}}>
        <div style={{position:"relative",flex:1,maxWidth:320}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
            color:"var(--text-dim)",pointerEvents:"none",fontSize:14}}>🔍</span>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}
            placeholder="Search by name, code, email..."
            className="input" style={{paddingLeft:32,height:34,fontSize:13}}/>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          {[
            ["Total",  total,       "var(--text-muted)","var(--surface-3)"],
            ["Active", activeCount, "var(--success)",   "var(--success-surface)"],
          ].map(([l,v,c,bg])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:6,
              padding:"4px 10px",borderRadius:99,background:bg,fontSize:12,fontWeight:500}}>
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
              {["Customer","Code","Email","Phone","Allocations","Status",""].map(h=>(
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({length:8}).map((_,i)=><SkeletonRow key={i}/>)
            ) : items.length===0 ? (
              <tr><td colSpan={7}>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",
                  justifyContent:"center",padding:"60px 0",gap:10}}>
                  <div style={{fontSize:36}}>👥</div>
                  <div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>No customers found</div>
                  <div style={{fontSize:12,color:"var(--text-muted)"}}>
                    {search?"Try a different search term":"Add your first customer"}
                  </div>
                  {!search&&(
                    <button onClick={()=>setModal("add")} className="btn btn-primary btn-sm" style={{marginTop:4}}>
                      + Add Customer
                    </button>
                  )}
                </div>
              </td></tr>
            ) : items.map(c=>(
              <tr key={c.id} className="table-row">
                <td className="table-cell">
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,
                      background:"var(--accent-dim)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{color:"var(--accent)",fontSize:11,fontWeight:700}}>
                        {c.name?.slice(0,2).toUpperCase()||"??"}
                      </span>
                    </div>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{c.name}</div>
                      {c.address&&<div style={{fontSize:11,color:"var(--text-dim)",marginTop:1,
                        maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {c.address}
                      </div>}
                    </div>
                  </div>
                </td>
                <td className="table-cell">
                  <span style={{fontFamily:"var(--font-mono)",fontSize:12,
                    color:c.code?"var(--text-muted)":"var(--text-dim)"}}>
                    {c.code||"—"}
                  </span>
                </td>
                <td className="table-cell">
                  <span style={{fontSize:12,color:"var(--text-muted)"}}>{c.email||"—"}</span>
                </td>
                <td className="table-cell">
                  <span style={{fontSize:12,color:"var(--text-muted)"}}>{c.phone||"—"}</span>
                </td>
                <td className="table-cell">
                  <span style={{fontFamily:"var(--font-mono)",fontSize:13,fontWeight:600,
                    color:"var(--text)",fontVariantNumeric:"tabular-nums"}}>
                    {c.alloc_count||0}
                  </span>
                </td>
                <td className="table-cell">
                  {c.is_active ? (
                    <span style={{display:"inline-flex",alignItems:"center",gap:5,
                      padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:600,
                      background:"var(--success-surface)",color:"var(--success)",
                      border:"1px solid var(--success-border)"}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:"var(--success)"}}/>
                      Active
                    </span>
                  ) : (
                    <span style={{display:"inline-flex",alignItems:"center",gap:5,
                      padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:600,
                      background:"var(--surface-3)",color:"var(--text-muted)",
                      border:"1px solid var(--border-soft)"}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:"var(--text-dim)"}}/>
                      Inactive
                    </span>
                  )}
                </td>
                <td className="table-cell" onClick={e=>e.stopPropagation()}>
                  <div style={{display:"flex",gap:4,justifyContent:"flex-end"}}>
                    <button onClick={()=>setModal(c)} className="btn btn-ghost btn-sm"
                      style={{padding:"4px 10px",fontSize:12}}>Edit</button>
                    <button onClick={()=>setConfirm(c)} className="btn btn-sm"
                      style={{padding:"4px 10px",fontSize:12,background:"var(--danger-surface)",
                        color:"var(--danger)",border:"1px solid var(--danger-border)"}}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {total > LIMIT && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"12px 16px",borderTop:"1px solid var(--border-subtle)"}}>
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

      {modal&&<CustomerModal customer={modal==="add"?null:modal}
        onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}}/>}
      {confirm&&<ConfirmModal
        message={`Delete customer "${confirm.name}"? This action cannot be undone.`}
        onConfirm={()=>handleDelete(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
