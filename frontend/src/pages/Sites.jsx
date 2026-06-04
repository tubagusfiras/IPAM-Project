import { useState, useEffect } from "react";
import { getSites, createSite, updateSite, deleteSite } from "../api.js";
import { C, Btn, Input, Modal, Confirm, SpreadTable, PageHeader, Alert } from "../components/ui.jsx";

export default function Sites() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = () => {
    setLoading(true);
    getSites().then(setItems).finally(()=>setLoading(false));
  };
  useEffect(()=>{ load(); },[]);

  const COLS = [
    { label:"Name",        width:180, render: r=><span style={{color:C.text0,fontWeight:500}}>{r.name}</span> },
    { label:"City",        width:140, render: r=><span style={{color:C.text1}}>{r.city||"—"}</span> },
    { label:"Region",      width:160, render: r=><span style={{color:C.text1}}>{r.region||"—"}</span> },
    { label:"Description", width:260, wrap:true, render: r=><span style={{color:C.text2,fontSize:11}}>{r.description||"—"}</span> },
    { label:"Actions",     width:120, render: r=>(
      <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
        <Btn size="sm" variant="ghost" onClick={()=>setModal(r)}>Edit</Btn>
        <Btn size="sm" variant="danger" onClick={()=>setConfirm(r)}>Del</Btn>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader title="Sites / Locations" icon="◎" count={items.length}>
        <Btn onClick={()=>setModal({})}>+ Add Site</Btn>
      </PageHeader>
      <SpreadTable columns={COLS} rows={items} loading={loading} empty="No sites found." />

      {modal !== null && (
        <SiteModal site={modal?.id?modal:null}
          onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}} />
      )}
      {confirm && (
        <Confirm
          message={`Delete site "${confirm.name}"?`}
          onConfirm={async()=>{ await deleteSite(confirm.id); setConfirm(null); load(); }}
          onCancel={()=>setConfirm(null)}
        />
      )}
    </div>
  );
}

function SiteModal({ site, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:site?.name||"", city:site?.city||"",
    region:site?.region||"", description:site?.description||"",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if (!form.name) return setErr("Name is required");
    setSaving(true); setErr(null);
    try {
      site?.id ? await updateSite(site.id,form) : await createSite(form);
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <Modal title={site?.id?"Edit Site":"Add Site"} onClose={onClose}>
      {err && <Alert type="error" message={err}/>}
      <Input label="Name" value={form.name} onChange={set("name")} placeholder="e.g. Kediri POP" required />
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Input label="City" value={form.city} onChange={set("city")} placeholder="e.g. Kediri" />
        <Input label="Region" value={form.region} onChange={set("region")} placeholder="e.g. Jawa Timur" />
      </div>
      <Input label="Description" value={form.description} onChange={set("description")} />
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving?"Saving…":"Save"}</Btn>
      </div>
    </Modal>
  );
}
