import { useState, useEffect, useCallback } from "react";
import { getVlans, createVlan, updateVlan, deleteVlan, getSites } from "../api.js";
import { C, Mono, StatusBadge, Tag, Btn, Input, Select, SearchBar,
         Modal, Confirm, SpreadTable, PageHeader, Toolbar, Alert } from "../components/ui.jsx";

export default function Vlans() {
  const [items, setItems]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [search, setSearch]   = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [sites, setSites]     = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    getVlans(search, siteFilter, 500)
      .then(d => { setItems(d.items||[]); setTotal(d.total||0); })
      .finally(() => setLoading(false));
  }, [search, siteFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getSites().then(setSites); }, []);

  const COLS = [
    { label:"VID",         width:70,  render: r => <Mono color={C.text0} size={13}>{r.vid}</Mono> },
    { label:"Name",        width:180, render: r => <span style={{color:C.text0}}>{r.name||"—"}</span> },
    { label:"Site",        width:120, render: r => r.site_name ? <Tag>{r.site_name}</Tag> : <span style={{color:C.text2}}>—</span> },
    { label:"Status",      width:90,  render: r => <StatusBadge status={r.status}/> },
    { label:"Description", width:240, wrap:true, render: r => <span style={{color:C.text1,fontSize:11}}>{r.description||"—"}</span> },
    { label:"Actions",     width:120, render: r => (
      <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
        <Btn size="sm" variant="ghost" onClick={()=>setModal(r)}>Edit</Btn>
        <Btn size="sm" variant="danger" onClick={()=>setConfirm(r)}>Del</Btn>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader title="VLANs" icon="⊟" count={total}>
        <Btn onClick={()=>setModal({})}>+ Add VLAN</Btn>
      </PageHeader>
      <Toolbar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search VLAN ID or name…" />
        <select value={siteFilter} onChange={e=>setSiteFilter(e.target.value)}
          style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.text1,padding:"6px 10px",borderRadius:5,fontSize:12}}>
          <option value="">All Sites</option>
          {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Toolbar>
      <SpreadTable columns={COLS} rows={items} loading={loading} empty="No VLANs found." />
      <div style={{marginTop:8,color:C.text2,fontSize:11}}>Showing {items.length} of {total}</div>

      {modal !== null && (
        <VlanModal vlan={modal?.id?modal:null} siteOpts={sites.map(s=>({value:s.id,label:s.name}))}
          onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}} />
      )}
      {confirm && (
        <Confirm
          message={`Delete VLAN ${confirm.vid} — ${confirm.name||""}?`}
          onConfirm={async()=>{ await deleteVlan(confirm.id); setConfirm(null); load(); }}
          onCancel={()=>setConfirm(null)}
        />
      )}
    </div>
  );
}

function VlanModal({ vlan, siteOpts, onClose, onSaved }) {
  const [form, setForm] = useState({
    vid:         vlan?.vid||"",
    name:        vlan?.name||"",
    site_id:     vlan?.site_id||"",
    status:      vlan?.status||"active",
    description: vlan?.description||"",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if (!form.vid) return setErr("VLAN ID is required");
    setSaving(true); setErr(null);
    try {
      const payload = {...form, vid:parseInt(form.vid)};
      vlan?.id ? await updateVlan(vlan.id,payload) : await createVlan(payload);
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <Modal title={vlan?.id?"Edit VLAN":"Add VLAN"} onClose={onClose}>
      {err && <Alert type="error" message={err}/>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Input label="VLAN ID (1–4094)" value={form.vid} onChange={set("vid")} type="number" required mono />
        <Input label="Name" value={form.name} onChange={set("name")} placeholder="e.g. MGMT, CUST-DATA" />
        <Select label="Site" value={form.site_id} onChange={set("site_id")} options={siteOpts} />
        <Select label="Status" value={form.status} onChange={set("status")}
          options={["active","reserved","deprecated"].map(s=>({value:s,label:s}))} />
        <div style={{gridColumn:"1/-1"}}>
          <Input label="Description" value={form.description} onChange={set("description")} />
        </div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving?"Saving…":"Save"}</Btn>
      </div>
    </Modal>
  );
}
