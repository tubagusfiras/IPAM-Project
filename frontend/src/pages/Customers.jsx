import { useState, useEffect, useCallback } from "react";
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from "../api.js";
import { C, Mono, StatusBadge, Btn, Input, Select, SearchBar,
         Modal, Confirm, SpreadTable, PageHeader, Toolbar, Alert } from "../components/ui.jsx";

export default function Customers() {
  const [items, setItems]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getCustomers(search, 200)
      .then(d => { setItems(d.items||[]); setTotal(d.total||0); })
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const COLS = [
    { label:"Name",         width:220, render: r => <span style={{color:C.text0,fontWeight:500}}>{r.name}</span> },
    { label:"Code",         width:100, render: r => r.code ? <Mono color={C.amber}>{r.code}</Mono> : <span style={{color:C.text2}}>—</span> },
    { label:"Contact Name", width:160, render: r => <span style={{color:C.text1,fontSize:12}}>{r.contact_name||"—"}</span> },
    { label:"Email",        width:200, render: r => <span style={{color:C.cyan,fontSize:12}}>{r.contact_email||"—"}</span> },
    { label:"Phone",        width:130, render: r => <Mono color={C.text1} size={12}>{r.contact_phone||"—"}</Mono> },
    { label:"Allocations",  width:90,  render: r => <Mono color={C.green}>{r.alloc_count||0}</Mono> },
    { label:"Status",       width:90,  render: r => <StatusBadge status={r.is_active?"active":"deprecated"}/> },
    { label:"Actions",      width:120, render: r => (
      <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
        <Btn size="sm" variant="ghost" onClick={()=>setModal(r)}>Edit</Btn>
        <Btn size="sm" variant="danger" onClick={()=>setConfirm(r)}>Del</Btn>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader title="Customers" icon="⬤" count={total}>
        <Btn onClick={()=>setModal({})}>+ Add Customer</Btn>
      </PageHeader>
      <Toolbar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search name or code…" width={280} />
      </Toolbar>
      <SpreadTable columns={COLS} rows={items} loading={loading} empty="No customers found." />
      <div style={{marginTop:8,color:C.text2,fontSize:11}}>Showing {items.length} of {total}</div>

      {modal !== null && (
        <CustomerModal customer={modal?.id?modal:null}
          onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}} />
      )}
      {confirm && (
        <Confirm
          message={`Delete customer "${confirm.name}"?`}
          onConfirm={async()=>{ await deleteCustomer(confirm.id); setConfirm(null); load(); }}
          onCancel={()=>setConfirm(null)}
        />
      )}
    </div>
  );
}

function CustomerModal({ customer, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:          customer?.name||"",
    code:          customer?.code||"",
    contact_name:  customer?.contact_name||"",
    contact_email: customer?.contact_email||"",
    contact_phone: customer?.contact_phone||"",
    description:   customer?.description||"",
    is_active:     customer?.is_active??true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if (!form.name) return setErr("Name is required");
    setSaving(true); setErr(null);
    try {
      customer?.id ? await updateCustomer(customer.id,form) : await createCustomer(form);
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <Modal title={customer?.id?"Edit Customer":"Add Customer"} onClose={onClose}>
      {err && <Alert type="error" message={err}/>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <div style={{gridColumn:"1/-1"}}><Input label="Full Name" value={form.name} onChange={set("name")} placeholder="Customer full name" required /></div>
        <Input label="Code" value={form.code} onChange={set("code")} placeholder="e.g. CUST-001" mono />
        <Input label="Contact Name" value={form.contact_name} onChange={set("contact_name")} />
        <Input label="Email" value={form.contact_email} onChange={set("contact_email")} type="email" />
        <Input label="Phone" value={form.contact_phone} onChange={set("contact_phone")} />
        <div style={{gridColumn:"1/-1"}}><Input label="Description" value={form.description} onChange={set("description")} /></div>
        <Select label="Status" value={form.is_active?"active":"inactive"} onChange={v=>set("is_active")(v==="active")}
          options={[{value:"active",label:"Active"},{value:"inactive",label:"Inactive"}]} />
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving?"Saving…":"Save"}</Btn>
      </div>
    </Modal>
  );
}
