import { useState, useEffect, useCallback } from "react";
import { getBlocks, getBlock, createBlock, updateBlock, deleteBlock,
         getAllocations, createAllocation, updateAllocation, deleteAllocation,
         getSites, getCustomers, getVlans } from "../api.js";
import { C, Mono, StatusBadge, VersionBadge, Tag, Btn, Input, Select,
         SearchBar, Modal, Confirm, SpreadTable, PageHeader, Toolbar, Alert } from "../components/ui.jsx";

// ── BLOCK LIST ───────────────────────────────────────────────
export default function Blocks({ ipVersion="", onNavigate }) {
  const [items, setItems]   = useState([]);
  const [total, setTotal]   = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState({ ip_version:ipVersion, site_id:"" });
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(null);
  const [detail, setDetail] = useState(null); // kept for compat
  const [sites, setSites]   = useState([]);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const p = { limit:100 };
    if (search) p.search = search;
    if (filter.ip_version || ipVersion) p.ip_version = filter.ip_version || ipVersion;
    if (filter.site_id) p.site_id = filter.site_id;
    getBlocks(p)
      .then(d => { setItems(d.items||[]); setTotal(d.total||0); })
      .finally(() => setLoading(false));
  }, [search, filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getSites().then(setSites); }, []);

  const siteOpts = sites.map(s => ({ value:s.id, label:s.name }));

  const COLS = [
    { label:"Prefix",       width:180, render: r => <Mono>{r.prefix}</Mono> },
    { label:"Ver",          width:60,  render: r => <VersionBadge v={r.ip_version}/> },
    { label:"Name",         width:200, render: r => <span style={{color:C.text0}}>{r.name||"—"}</span> },
    { label:"ASN",          width:80,  render: r => <Mono color={C.amber}>{r.asn||"—"}</Mono> },
    { label:"Router",       width:180, render: r => <span style={{color:C.text1,fontSize:11}}>{r.router||"—"}</span> },
    { label:"Operator",     width:200, render: r => <span style={{color:C.text1,fontSize:11}}>{r.operator||"—"}</span> },
    { label:"Site",         width:100, render: r => r.site_name ? <Tag>{r.site_name}</Tag> : <span style={{color:C.text2}}>—</span> },
    { label:"Alloc",        width:80,  render: r => <span style={{fontFamily:C.mono,color:C.green,fontSize:12}}>{r.active_allocations}/{r.total_allocations}</span> },
    { label:"Status",       width:90,  render: r => <StatusBadge status={r.status}/> },
    { label:"Actions",      width:140, render: r => (
      <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
        <Btn size="sm" variant="ghost" onClick={()=>onNavigate&&onNavigate('block-detail',{id:r.id,from:ipVersion?'ipv'+ipVersion.slice(-1).toLowerCase():'ipv4'})}>View</Btn>
        <Btn size="sm" variant="ghost" onClick={()=>setModal(r)}>Edit</Btn>
        <Btn size="sm" variant="danger" onClick={()=>setConfirm(r)}>Del</Btn>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader title="IP Blocks" icon="⬡" count={total}>
        <Btn onClick={()=>setModal({})}>+ Add Block</Btn>
      </PageHeader>

      <Toolbar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search prefix, ASN, router, name…" width={300} />
        {!ipVersion && (
          <select value={filter.ip_version} onChange={e=>setFilter(f=>({...f,ip_version:e.target.value}))}
            style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.text1,padding:"6px 10px",borderRadius:5,fontSize:12}}>
            <option value="">All Versions</option>
            <option value="IPv4">IPv4</option>
            <option value="IPv6">IPv6</option>
          </select>
        )}
        <select value={filter.site_id} onChange={e=>setFilter(f=>({...f,site_id:e.target.value}))}
          style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.text1,padding:"6px 10px",borderRadius:5,fontSize:12}}>
          <option value="">All Sites</option>
          {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Toolbar>

      <SpreadTable
        columns={COLS}
        rows={items}
        loading={loading}
        onRowClick={r => onNavigate&&onNavigate('block-detail',{id:r.id,from:ipVersion?'ipv'+ipVersion.slice(-1).toLowerCase():'ipv4'})}
        empty="No IP blocks found. Import a CSV or add manually."
      />
      <div style={{marginTop:8,color:C.text2,fontSize:11}}>Showing {items.length} of {total} blocks</div>

      {modal !== null && (
        <BlockModal block={modal?.id?modal:null} siteOpts={siteOpts}
          onClose={()=>setModal(null)} onSaved={()=>{setModal(null);load();}} />
      )}

      {confirm && (
        <Confirm
          message={`Delete block ${confirm.prefix}? This will also delete all its allocations.`}
          onConfirm={async()=>{ await deleteBlock(confirm.id); setConfirm(null); load(); }}
          onCancel={()=>setConfirm(null)}
        />
      )}
    </div>
  );
}

// ── BLOCK FORM MODAL ─────────────────────────────────────────
function BlockModal({ block, siteOpts, onClose, onSaved }) {
  const [form, setForm] = useState({
    prefix:block?.prefix||"", name:block?.name||"",
    asn:block?.asn||"", router:block?.router||"",
    operator:block?.operator||"", site_id:block?.site_id||"",
    status:block?.status||"active", description:block?.description||"",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if (!form.prefix) return setErr("Prefix is required");
    setSaving(true); setErr(null);
    try {
      block?.id ? await updateBlock(block.id, form) : await createBlock(form);
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <Modal title={block?.id?"Edit IP Block":"Add IP Block"} onClose={onClose}>
      {err && <Alert type="error" message={err}/>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Input label="Prefix (CIDR)" value={form.prefix} onChange={set("prefix")} placeholder="e.g. 114.198.242.0/24" required mono />
        <Input label="Name" value={form.name} onChange={set("name")} placeholder="e.g. Kediri /24 Block" />
        <Input label="ASN" value={form.asn} onChange={set("asn")} placeholder="e.g. 56246" mono />
        <Input label="Router" value={form.router} onChange={set("router")} placeholder="e.g. mx204 kediri" mono />
        <div style={{gridColumn:"1/-1"}}>
          <Input label="Operator" value={form.operator} onChange={set("operator")} placeholder="e.g. PT Sumber Data Indonesia" />
        </div>
        <Select label="Site" value={form.site_id} onChange={set("site_id")} options={siteOpts} />
        <Select label="Status" value={form.status} onChange={set("status")}
          options={["active","reserved","deprecated"].map(s=>({value:s,label:s}))} />
        <div style={{gridColumn:"1/-1"}}>
          <Input label="Description" value={form.description} onChange={set("description")} placeholder="Optional notes" />
        </div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving?"Saving…":"Save Block"}</Btn>
      </div>
    </Modal>
  );
}

// ── BLOCK DETAIL (allocation spreadsheet) ────────────────────
function BlockDetail({ block, onClose, onSaved, siteOpts }) {
  const [data, setData]     = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [allocModal, setAllocModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [err, setErr]       = useState(null);

  const load = useCallback(() => {
    getBlock(block.id).then(setData).catch(e=>setErr(e.message));
  }, [block.id]);

  useEffect(() => { load(); }, [load]);

  const allocs = (data?.allocations||[]).filter(a => {
    const matchSearch = !search ||
      a.prefix?.includes(search) ||
      (a.customer_name||"").toLowerCase().includes(search.toLowerCase()) ||
      (a.description||"").toLowerCase().includes(search.toLowerCase());
    const matchFilter = !filter || a.status === filter;
    return matchSearch && matchFilter;
  });

  const COLS = [
    { label:"#",           width:36,  render:(_,i)=><span style={{color:C.text2,fontFamily:C.mono,fontSize:10}}>{i+1}</span> },
    { label:"Prefix",      width:185, render: r=><Mono size={12}>{r.prefix}</Mono> },
    { label:"Mask",        width:50,  render: r=>{
      const pl = parseInt(r.prefix?.split("/")?.[1]||0);
      return <span style={{color:C.text2,fontFamily:C.mono,fontSize:10}}>/{pl}</span>;
    }},
    { label:"Customer",    width:220, render: r=> r.customer_name
      ? <span style={{color:C.text0,fontSize:12}}>{r.customer_name}</span>
      : <span style={{color:C.text2,fontSize:11,fontStyle:"italic"}}>— available —</span>
    },
    { label:"VLAN",        width:70,  render: r=> r.vlan_id
      ? <Mono color={C.purple} size={12}>{r.vlan_id}</Mono>
      : <span style={{color:C.text2}}>—</span>
    },
    { label:"Description", width:220, wrap:true, render: r=><span style={{color:C.text1,fontSize:11}}>{r.description||"—"}</span> },
    { label:"Notes",       width:150, wrap:true, render: r=><span style={{color:C.text2,fontSize:11}}>{r.notes||"—"}</span> },
    { label:"Status",      width:90,  render: r=><StatusBadge status={r.status}/> },
    { label:"Actions",     width:120, render: r=>(
      <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
        <Btn size="sm" variant="ghost" onClick={()=>setAllocModal(r)}>Edit</Btn>
        <Btn size="sm" variant="danger" onClick={()=>setConfirm(r)}>Del</Btn>
      </div>
    )},
  ];

  // add row index to allocs
  const rows = allocs.map((a,i)=>({...a,_idx:i,_key:a.id}));

  return (
    <Modal title={`Block: ${block.prefix}`} onClose={onClose} width={1100}>
      {err && <Alert type="error" message={err}/>}

      {/* Block info bar */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
        {[["ASN",data?.asn],["Router",data?.router],["Operator",data?.operator],["Site",data?.site_name]].map(([k,v])=>(
          <div key={k} style={{background:C.bg1,borderRadius:5,padding:"8px 12px",border:`1px solid ${C.border}`}}>
            <div style={{color:C.text2,fontSize:9,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{k}</div>
            <div style={{color:C.text0,fontFamily:C.mono,fontSize:12}}>{v||"—"}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search prefix, customer…" width={240} />
          <select value={filter} onChange={e=>setFilter(e.target.value)}
            style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.text1,padding:"6px 10px",borderRadius:5,fontSize:11}}>
            <option value="">All Status</option>
            {["active","available","reserved","deprecated"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{color:C.text2,fontSize:11}}>{allocs.length} rows</span>
        </div>
        <Btn size="sm" onClick={()=>setAllocModal({})}>+ Add Allocation</Btn>
      </div>

      {/* Spreadsheet table */}
      {!data
        ? <div style={{color:C.text2,textAlign:"center",padding:32}}>Loading allocations…</div>
        : <SpreadTable columns={COLS} rows={rows} empty="No allocations found." />
      }

      {/* Utilization bar */}
      {data && (
        <div style={{marginTop:10,display:"flex",alignItems:"center",gap:10}}>
          <span style={{color:C.text2,fontSize:11}}>Utilization:</span>
          <div style={{flex:1,height:4,background:C.bg1,borderRadius:2,overflow:"hidden"}}>
            {(() => {
              const used  = (data.allocations||[]).filter(a=>a.status==="active").length;
              const total = (data.allocations||[]).length;
              const pct   = total ? Math.round(used/total*100) : 0;
              const color = pct>85?C.red:pct>60?C.amber:C.green;
              return <div style={{width:`${pct}%`,height:"100%",background:color}}/>;
            })()}
          </div>
          <span style={{color:C.text2,fontFamily:C.mono,fontSize:11}}>
            {(data.allocations||[]).filter(a=>a.status==="active").length}/{(data.allocations||[]).length} active
          </span>
        </div>
      )}

      {/* Modals */}
      {allocModal !== null && (
        <AllocModal
          alloc={allocModal?.id?allocModal:null}
          blockId={block.id}
          onClose={()=>setAllocModal(null)}
          onSaved={()=>{setAllocModal(null);load();onSaved();}}
        />
      )}
      {confirm && (
        <Confirm
          message={`Delete allocation ${confirm.prefix}?`}
          onConfirm={async()=>{ await deleteAllocation(confirm.id); setConfirm(null); load(); onSaved(); }}
          onCancel={()=>setConfirm(null)}
        />
      )}
    </Modal>
  );
}

// ── ALLOCATION FORM MODAL ────────────────────────────────────
function AllocModal({ alloc, blockId, onClose, onSaved }) {
  const [form, setForm] = useState({
    prefix:     alloc?.prefix||"",
    block_id:   blockId,
    customer_id:alloc?.customer_id||"",
    vlan_id:    alloc?.vlan_id||"",
    status:     alloc?.status||"active",
    description:alloc?.description||"",
    notes:      alloc?.notes||"",
  });
  const [customers, setCustomers] = useState([]);
  const [vlans, setVlans]         = useState([]);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState(null);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  useEffect(() => {
    getCustomers("",500).then(d=>setCustomers(d.items||[]));
    getVlans("","",500).then(d=>setVlans(d.items||[]));
  }, []);

  const save = async () => {
    if (!form.prefix) return setErr("Prefix is required");
    setSaving(true); setErr(null);
    try {
      const payload = {...form, block_id:blockId};
      alloc?.id
        ? await updateAllocation(alloc.id, payload)
        : await createAllocation(payload);
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <Modal title={alloc?.id?"Edit Allocation":"Add Allocation"} onClose={onClose}>
      {err && <Alert type="error" message={err}/>}
      <Input label="Prefix (CIDR)" value={form.prefix} onChange={set("prefix")}
        placeholder="e.g. 114.198.242.4/30" required mono />
      <Select label="Customer" value={form.customer_id} onChange={set("customer_id")}
        options={customers.map(c=>({value:c.id,label:c.name}))} />
      <Select label="VLAN" value={form.vlan_id} onChange={set("vlan_id")}
        options={vlans.map(v=>({value:v.id,label:`${v.vid}${v.name?" — "+v.name:""}${v.site_name?" ("+v.site_name+")":""}`}))} />
      <Select label="Status" value={form.status} onChange={set("status")}
        options={["active","available","reserved","deprecated"].map(s=>({value:s,label:s}))} />
      <Input label="Description" value={form.description} onChange={set("description")}
        placeholder="Customer name or usage" />
      <Input label="Notes" value={form.notes} onChange={set("notes")}
        placeholder="Additional info" />
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving?"Saving…":"Save"}</Btn>
      </div>
    </Modal>
  );
}
