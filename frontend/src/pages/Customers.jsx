import { useState, useEffect, useCallback } from "react";
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, getAllocationsByCustomerIds } from "../api.js";
import { Btn, SearchBar, Loading, EmptyState, PageHeader, Icons, Badge } from "../components/ui.jsx";

function FieldInput({ label, value, onChange, placeholder, mono, type="text" }) {
  return (
    <div>
      <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
        letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>{label}</label>
      <input type={type} value={value||""} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} className="input"
        style={{fontFamily:mono?"var(--font-mono)":"inherit"}}/>
    </div>
  );
}

function CustomerModal({ customer, onClose, onSaved }) {
  const isEdit = !!customer?.id;
  const [form, setForm] = useState({
    name:        customer?.name        || "",
    code:        customer?.code        || "",
    email:       customer?.contact_email || "",
    phone:       customer?.contact_phone || "",
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
      else        await createCustomer({...form, source:"static"});
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

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
            <div style={{gridColumn:"1/-1"}}><FieldInput label="Customer Name *" value={form.name} onChange={v=>set("name")(v)} placeholder="e.g. PT Sumber Data Indonesia"/></div>
            <FieldInput label="Customer Code" value={form.code} onChange={v=>set("code")(v)} placeholder="e.g. SDI-001" mono/>
            <FieldInput label="Email" value={form.email} onChange={v=>set("email")(v)} placeholder="e.g. noc@sdi.id" type="email"/>
            <FieldInput label="Phone" value={form.phone} onChange={v=>set("phone")(v)} placeholder="e.g. +62..."/>
            <div style={{gridColumn:"1/-1"}}><FieldInput label="Description" value={form.description} onChange={v=>set("description")(v)} placeholder="Optional notes"/></div>
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

function SkeletonRow() {
  return (
    <tr>
      {[140,80,160,120,100,120,80,60].map((w,i)=>(
        <td key={i} className="table-cell">
          <div className="skeleton" style={{height:13,width:w,borderRadius:4}}/>
        </td>
      ))}
    </tr>
  );
}

function RouterTags({ routers }) {
  if (!routers?.length) return <span style={{color:"var(--text-dim)",fontSize:11}}>—</span>;
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
      {routers.map((r,i) => (
        <span key={i} style={{
          fontFamily:"var(--font-mono)",fontSize:10,fontWeight:500,
          padding:"2px 7px",borderRadius:4,
          background:"var(--surface-3)",
          color:"var(--text-muted)",
          border:"1px solid var(--border-soft)",
        }}>{r}</span>
      ))}
    </div>
  );
}

export default function Customers() {
  const [items,      setItems]      = useState([]);
  const [total,      setTotal]      = useState(0);
  const [search,     setSearch]     = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState(null);
  const [confirm,    setConfirm]    = useState(null);
  const [page,       setPage]       = useState(0);
  const [routerMap,  setRouterMap]  = useState({});  // customer_id → [router, ...]
  const LIMIT = 50;

  const load = useCallback(() => {
    setLoading(true);
    getCustomers(search, LIMIT, page*LIMIT, sourceFilter==="all"?"":sourceFilter)
      .then(d=>{ setItems(d.items||[]); setTotal(d.total||0); })
      .catch(console.error)
      .finally(()=>setLoading(false));
  }, [search, page, sourceFilter]);

  useEffect(()=>{
    const t = setTimeout(()=>{ load(); }, 300);
    return ()=>clearTimeout(t);
  },[load]);

  // Fetch router placements per customer dari allocations (batch, single request)
  useEffect(()=>{
    if (!items.length) { setRouterMap({}); return; }
    const ids = items.map(c=>c.id);
    getAllocationsByCustomerIds(ids)
      .then(d=>{
        const allocs = d.items || [];
        const map = {};
        ids.forEach(id=>{ map[id] = []; });
        allocs.forEach(a=>{
          if (!a.customer_id || !a.block_router) return;
          if (!map[a.customer_id]) map[a.customer_id] = [];
          if (!map[a.customer_id].includes(a.block_router)) map[a.customer_id].push(a.block_router);
        });
        Object.keys(map).forEach(id=>map[id].sort());
        setRouterMap(map);
      })
      .catch(()=>setRouterMap({}));
  }, [items]);

  const handleDelete = async (c) => {
    try { await deleteCustomer(c.id); load(); }
    catch(e) { alert(e.message); }
    setConfirm(null);
  };

  const filteredItems = items.filter(c => {
    if (sourceFilter === "all") return true;
    if (sourceFilter === "dynamic") return c.source === "dynamic";
    if (sourceFilter === "static") return c.source === "static";
    return true;
  });
  const activeCount = items.filter(c=>c.is_active).length;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Header */}
      <PageHeader title="Customers" count={total}>
        <Btn icon={Icons.plus} onClick={()=>setModal("add")}>Add Customer</Btn>
      </PageHeader>

      {/* Toolbar */}
      <div className="card" style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
        <SearchBar value={search} onChange={v=>{setSearch(v);setPage(0);}} placeholder="Search by name, code, email..." width={320} />
        <select value={sourceFilter} onChange={e=>{setSourceFilter(e.target.value);setPage(0);}} 
          className="select" style={{height:36,fontSize:13,minWidth:140}}>
          <option value="all">All Sources</option>
          <option value="dynamic">Dynamic (D)</option>
          <option value="static">Static (S)</option>
        </select>
        <span style={{fontSize:12,color:"var(--text-muted)"}}>{filteredItems.length} results</span>
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
              {["Customer","Customer ID","Contact","Allocations","VLANs","Router Placements","Status",""].map(h=>(
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{padding:0}}><Loading message="Loading customers..." /></td></tr>
            ) : items.length===0 ? (
              <tr><td colSpan={8}>
                <EmptyState icon={Icons.wireless} title="No customers found"
                  message={search?"Try a different search term":"Add your first customer"}
                  action={!search?"Add Customer":null} onAction={!search?()=>setModal("add"):null} />
              </td></tr>
            ) : filteredItems.map((c,idx)=>(
              <tr key={c.id} className="table-row"
                style={{background: idx%2===0?"var(--surface-1)":"var(--surface-2)"}}>

                {/* Customer name + avatar */}
                <td className="table-cell">
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:34,height:34,borderRadius:8,flexShrink:0,
                      background: c.source === "static" ? "var(--warning-surface)" : "var(--info-surface)",border: `1px solid ${c.source === "static" ? "var(--warning-border)" : "var(--info-border)"}`,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{color:"var(--accent)",fontSize:12,fontWeight:700}}>{c.source === "static" ? "S" : "D"}</span>
                    </div>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--text)",display:"flex",alignItems:"center",gap:6}}>
{c.name}
                      </div>
                      {c.description && (
                        <div style={{fontSize:11,color:"var(--text-dim)",marginTop:1,
                          maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {c.description}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Code */}
                <td className="table-cell">
                  <span style={{fontFamily:"var(--font-mono)",fontSize:12,
                    color:c.code?"var(--text-muted)":"var(--text-dim)"}}>
                    {c.code||"—"}
                  </span>
                </td>

                {/* Contact */}
                <td className="table-cell">
                  <div style={{display:"flex",flexDirection:"column",gap:2}}>
                    {c.contact_email && (
                      <span style={{fontSize:11,color:"var(--text-muted)"}}>{c.contact_email}</span>
                    )}
                    {c.contact_phone && (
                      <span style={{fontSize:11,color:"var(--text-dim)",fontFamily:"var(--font-mono)"}}>{c.contact_phone}</span>
                    )}
                    {!c.contact_email && !c.contact_phone && (
                      <span style={{fontSize:11,color:"var(--text-dim)"}}>—</span>
                    )}
                  </div>
                </td>

                {/* Allocations count */}
                <td className="table-cell">
                  <span style={{
                    fontFamily:"var(--font-mono)",fontSize:13,fontWeight:700,
                    color: (c.alloc_count||0)>0 ? "var(--accent)" : "var(--text-dim)",
                    fontVariantNumeric:"tabular-nums",
                  }}>
                    {c.alloc_count||0}
                  </span>
                </td>

                {/* VLANs */}
                <td className="table-cell" style={{minWidth:140}}>
                  {(c.vlan_ids||[]).length === 0 ? (
                    <span style={{color:"var(--text-dim)",fontSize:11}}>—</span>
                  ) : (
                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      {c.vlan_ids.slice(0,3).map(vid=>(
                        <span key={vid} style={{
                          fontFamily:"var(--font-mono)",fontSize:10,fontWeight:500,
                          padding:"2px 7px",borderRadius:4,
                          background:"var(--surface-3)",color:"var(--text-muted)",
                          border:"1px solid var(--border-soft)",
                        }}>{vid}</span>
                      ))}
                      {c.vlan_ids.length>3 && (
                        <span style={{fontSize:10,color:"var(--text-dim)"}}>+{c.vlan_ids.length-3}</span>
                      )}
                    </div>
                  )}
                </td>

                {/* Router placements */}
                <td className="table-cell" style={{minWidth:180}}>
                  <RouterTags routers={routerMap[c.id]}/>
                </td>

                {/* Status */}
                <td className="table-cell">
                  {c.is_active ? (
                    <span style={{display:"inline-flex",alignItems:"center",gap:5,
                      padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:600,
                      background:"var(--success-surface)",color:"var(--success)",
                      border:"1px solid var(--success-border)"}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:"var(--success)"}}/>
                      Active
                    </span>
                  ) : (
                    <span style={{display:"inline-flex",alignItems:"center",gap:5,
                      padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:600,
                      background:"var(--surface-3)",color:"var(--text-dim)",
                      border:"1px solid var(--border-soft)"}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:"var(--text-dim)"}}/>
                      Inactive
                    </span>
                  )}
                </td>

                {/* Actions */}
                <td className="table-cell" onClick={e=>e.stopPropagation()}>
                  <div style={{display:"flex",gap:4,justifyContent:"flex-end"}}>
                    <button onClick={()=>setModal(c)} className="btn btn-ghost btn-sm"
                      style={{padding:"4px 10px",fontSize:12}}>Edit</button>
                    <button onClick={()=>setConfirm(c)} className="btn btn-sm"
                      style={{padding:"4px 10px",fontSize:12,background:"var(--danger-surface)",
                        color:"var(--danger)",border:"1px solid var(--danger-border)"}}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
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

      {modal&&<CustomerModal customer={modal==="add"?null:modal}
        onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}}/>}
      {confirm&&<ConfirmModal
        message={confirm.alloc_count>0
          ? `Delete customer "${confirm.name}"? This customer has ${confirm.alloc_count} allocation(s) linked. Deleting may orphan or unlink those allocations. This action cannot be undone.`
          : `Delete customer "${confirm.name}"? This action cannot be undone.`}
        onConfirm={()=>handleDelete(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
