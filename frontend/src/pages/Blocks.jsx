import { useState, useEffect, useCallback } from "react";
import { getBlocks, createBlock, updateBlock, deleteBlock, getSites } from "../api.js";
import { BLOCK_STATUS_OPTS } from "../constants.js";
import { Btn, SearchBar, Loading, PageHeader, Icons, Confirm } from "../components/ui.jsx";

const VERSION_COLOR = {
  IPv4: { bg:"var(--surface-2)", color:"var(--text-muted)", border:"var(--border-soft)" },
  IPv6: { bg:"var(--surface-2)", color:"var(--text-muted)", border:"var(--border-soft)" },
};

const STATUS_COLOR = {
  active:     { bg:"var(--success-surface)", color:"var(--success)",    border:"var(--success-border)" },
  reserved:   { bg:"var(--surface-2)",        color:"var(--text-dim)",  border:"var(--border-soft)" },
  deprecated: { bg:"var(--warning-surface)", color:"var(--warning)",    border:"var(--warning-border)" },
};

function Badge({ label, style }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center",
      padding:"2px 8px", borderRadius:99,
      fontSize:10, fontWeight:600,
      border:"1px solid",
      ...style,
    }}>{label}</span>
  );
}

function UtilBar({ active, total }) {
  const pct = total ? Math.round(active/total*100) : 0;
  const color = pct>85?"var(--danger)":pct>60?"var(--warning)":"var(--success)";
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,minWidth:120}}>
      <div style={{flex:1,height:4,background:"var(--surface-3)",borderRadius:99,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:99,transition:"width 0.4s"}}/>
      </div>
      <span style={{fontSize:11,fontWeight:600,color,minWidth:28,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>
        {pct}%
      </span>
    </div>
  );
}

function Field({ label, k, placeholder, mono, required, form, set }) {
  return (
    <div>
      <label style={{
        display:"block", fontSize:10, fontWeight:600,
        textTransform:"uppercase", letterSpacing:"0.08em",
        color:"var(--text-muted)", marginBottom:6,
      }}>{label}{required && <span style={{color:"var(--danger)",marginLeft:2}}>*</span>}</label>
      <input
        value={form[k]} onChange={e=>set(k)(e.target.value)}
        placeholder={placeholder}
        className="input"
        style={{fontFamily:mono?"var(--font-mono)":"var(--font-main)"}}
      />
    </div>
  );
}

function BlockFormModal({ block, sites, onClose, onSaved }) {
  const isEdit = !!block?.id;
  const [form, setForm] = useState({
    prefix:      block?.prefix      || "",
    name:        block?.name        || "",
    asn:         block?.asn         || "",
    router:      block?.router      || "",
    operator:    block?.operator    || "",
    site_id:     block?.site_id     || "",
    status:      block?.status      || "active",
    description: block?.description || "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);

  const set = k => v => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if (!form.prefix) return setErr("Prefix is required");
    setSaving(true); setErr(null);
    try {
      if (isEdit) await updateBlock(block.id, form);
      else        await createBlock(form);
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  // Field defined outside — see top of file

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.ctrlKey&&!e.altKey&&e.target.tagName!=="TEXTAREA"&&e.target.tagName!=="BUTTON"&&e.target.tagName!=="SELECT"){e.preventDefault();e.stopPropagation();save();}}}>
      <div className="modal" style={{maxWidth:560}} onSubmit={e=>{e.preventDefault();save();}}>
        <div className="modal-header">
          <div>
            <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>
              {isEdit ? "Edit IP Block" : "Add IP Block"}
            </div>
            <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>
              {isEdit ? `Editing ${block.prefix}` : "Add a new IP block to IPAM"}
            </div>
          </div>
          <button onClick={onClose} style={{
            background:"none",border:"none",cursor:"pointer",
            color:"var(--text-muted)",fontSize:18,lineHeight:1,padding:4,
          }}>✕</button>
        </div>

        <div className="modal-body" style={{display:"flex",flexDirection:"column",gap:14}}>
          {err && (
            <div style={{
              background:"var(--danger-surface)",border:"1px solid var(--danger-border)",
              borderRadius:"var(--radius-sm)",padding:"10px 14px",
              color:"var(--danger)",fontSize:13,
            }}>{err}</div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Prefix (CIDR)" k="prefix" placeholder="e.g. 114.198.242.0/24" mono required form={form} set={set}/>
            <Field label="Name" k="name" placeholder="e.g. Kediri Block" form={form} set={set}/>
            <Field label="ASN" k="asn" placeholder="e.g. 56246" mono form={form} set={set}/>
            <Field label="Router" k="router" placeholder="e.g. mx204-kediri" mono form={form} set={set}/>
            <div style={{gridColumn:"1/-1"}}>
              <Field label="Operator" k="operator" placeholder="e.g. PT Sumber Data Indonesia" form={form} set={set}/>
            </div>
            <div>
              <label style={{
                display:"block",fontSize:10,fontWeight:600,
                textTransform:"uppercase",letterSpacing:"0.08em",
                color:"var(--text-muted)",marginBottom:6,
              }}>Site</label>
              <select value={form.site_id} onChange={e=>set("site_id")(e.target.value)} className="select">
                <option value="">— No site —</option>
                {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{
                display:"block",fontSize:10,fontWeight:600,
                textTransform:"uppercase",letterSpacing:"0.08em",
                color:"var(--text-muted)",marginBottom:6,
              }}>Status</label>
              <select value={form.status} onChange={e=>set("status")(e.target.value)} className="select">
                {BLOCK_STATUS_OPTS.map(s=>(
                  <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <Field label="Description" k="description" placeholder="Optional description" form={form} set={set}/>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Block"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[180,80,120,100,80,140,100].map((w,i)=>(
        <td key={i} className="table-cell">
          <div className="skeleton" style={{height:14,width:w,borderRadius:4}}/>
        </td>
      ))}
    </tr>
  );
}

export default function Blocks({ ipVersion="", onSelectBlock, initialStatus="" }) {
  const [items,     setItems]     = useState([]);
  const [total,     setTotal]     = useState(0);
  const [search,    setSearch]    = useState("");
  const [siteFilter,setSiteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [sites,     setSites]     = useState([]);
  const [selected,  setSelected]  = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [sortBy, setSortBy] = useState("");

  useEffect(() => { setStatusFilter(initialStatus||""); }, [initialStatus]);

  const toggleSelect = (id) => {
    setSelected(p => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleSelectAll = (e) => {
    const checked = e.target.checked;
    setSelectAll(checked);
    setSelected(new Set(checked ? items.map(b => b.id) : []));
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} blocks?`)) return;
    for (const id of selected) {
      try { await deleteBlock(id); } catch {}
    }
    setSelected(new Set()); setSelectAll(false); load();
  };

  const bulkExport = () => {
    const ids = Array.from(selected);
    window.open(`/api/v1/export/blocks`, '_blank');
    // For proper export, we'd POST with block_ids. Simplified: just open export page.
  };

  const load = useCallback(() => {
    setLoading(true);
    const p = { limit:100 };
    if (search)     p.search     = search;
    if (ipVersion)  p.ip_version = ipVersion;
    if (siteFilter) p.site_id   = siteFilter;
    if (statusFilter) p.status  = statusFilter;
    getBlocks(p)
      .then(d => { setItems(d.items||[]); setTotal(d.total||0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, ipVersion, siteFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getSites().then(setSites); }, []);

  const handleDelete = async (block) => {
    try { await deleteBlock(block.id); load(); }
    catch(e) { alert(e.message); }
    setConfirm(null);
  };

  const filteredItems = items.filter(b => {
    if (statusFilter && b.status !== statusFilter) return false;
    return true;
  });

  const sortedItems = [...filteredItems].sort((a,b) => {
    switch(sortBy) {
      case "utilization-asc":  return (parseFloat(a.used_ips||0)/parseFloat(a.total_ips||1)) - (parseFloat(b.used_ips||0)/parseFloat(b.total_ips||1));
      case "utilization-desc": return (parseFloat(b.used_ips||0)/parseFloat(b.total_ips||1)) - (parseFloat(a.used_ips||0)/parseFloat(a.total_ips||1));
      case "prefix-asc":      return a.prefix.localeCompare(b.prefix);
      case "prefix-desc":     return b.prefix.localeCompare(a.prefix);
      case "name-asc":        return (a.name||"").localeCompare(b.name||"");
      case "name-desc":       return (b.name||"").localeCompare(a.name||"");
      case "alloc-asc":       return (a.active_allocations||0) - (b.active_allocations||0);
      case "alloc-desc":      return (b.active_allocations||0) - (a.active_allocations||0);
      case "status-asc":      return (a.status||"").localeCompare(b.status||"");
      case "status-desc":     return (b.status||"").localeCompare(a.status||"");
      default:                return 0;
    }
  });

  const ipv = ipVersion || "All";

  return (
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Page header */}
      <PageHeader title={ipVersion ? `${ipVersion} Networks` : "IP Networks"} count={total}>
        <Btn icon={Icons.plus} onClick={()=>setModal("add")}>Add Network</Btn>
      </PageHeader>

      {/* Search & Filter Section - GRID LAYOUT */}
      <div className="card" style={{padding:"14px 20px"}}>
        {/* Row 1: Search (full width) + Sites (inline) */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 220px",gap:16,alignItems:"center",marginBottom:12}}>
          {/* Search Input - pakai SearchBar component */}
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search prefix, name, ASN, router..."
          />

          {/* Sites Filter */}
          <select
            value={siteFilter}
            onChange={e=>setSiteFilter(e.target.value)}
            className="select"
            style={{height:40,fontSize:14,width:"100%",boxSizing:"border-box"}}
          >
            <option value="">All Sites</option>
            {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Row 2: Stats + Status filter */}
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",fontSize:12}}>
          <Badge label={`${total} blocks`} style={{background:"var(--surface-2)",color:"var(--text-muted)",border:"1px solid var(--border-soft)"}}/>
          <Badge label={`${items.filter(b=>b.ip_version==='IPv4').length} IPv4`} style={{background:"var(--accent-dim)",color:"var(--accent)",border:"1px solid var(--accent-border)"}}/>
          <Badge label={`${items.filter(b=>b.ip_version==='IPv6').length} IPv6`} style={{background:"var(--success-surface)",color:"var(--success)",border:"1px solid var(--success-border)"}}/>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
            className="select" style={{height:32,fontSize:12,minWidth:120}}>
            <option value="">All Statuses</option>
            {["active","reserved","deprecated"].map(s=>(
              <option key={s} value={s} style={{textTransform:"capitalize"}}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
            ))}
          </select>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
            className="select" style={{height:32,fontSize:12,minWidth:140}}>
            <option value="">Sort: Default</option>
            <optgroup label="Utilization">
              <option value="utilization-asc">Utilization ↑ (0→100%)</option>
              <option value="utilization-desc">Utilization ↓ (100→0%)</option>
            </optgroup>
            <optgroup label="Prefix">
              <option value="prefix-asc">Prefix A→Z</option>
              <option value="prefix-desc">Prefix Z→A</option>
            </optgroup>
            <optgroup label="Name">
              <option value="name-asc">Name A→Z</option>
              <option value="name-desc">Name Z→A</option>
            </optgroup>
            <optgroup label="Allocations">
              <option value="alloc-asc">Allocations ↑</option>
              <option value="alloc-desc">Allocations ↓</option>
            </optgroup>
            <optgroup label="Status">
              <option value="status-asc">Status A→Z</option>
              <option value="status-desc">Status Z→A</option>
            </optgroup>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr>
              {["","Prefix","Version","Name","ASN / Router","Site","Allocations","Status",""].map(function(h) {
                return h === "" ? (
                  <th key="checkbox" className="table-header" style={{width:32,textAlign:"center"}}>
                    <input type="checkbox" checked={selectAll} onChange={toggleSelectAll} style={{cursor:"pointer",accentColor:"var(--accent)",width:16,height:16}}/>
                  </th>
                ) : (
                  <th key={h} className="table-header">{h}</th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({length:5}).map((_,i)=><SkeletonRow key={i}/>)
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <div style={{
                    display:"flex",flexDirection:"column",alignItems:"center",
                    justifyContent:"center",padding:"60px 0",gap:10,
                  }}>
                    <div style={{fontSize:20,fontWeight:700}}>IP</div>
                    <div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>No networks found</div>
                    <div style={{fontSize:12,color:"var(--text-muted)"}}>
                      {search ? "Try a different search term" : "Add your first IP block to get started"}
                    </div>
                    {!search && (
                      <button onClick={()=>setModal("add")} className="btn btn-primary btn-sm" style={{marginTop:4}}>
                        + Add Network
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : sortedItems.map(block => {
              const vc = VERSION_COLOR[block.ip_version] || VERSION_COLOR.IPv4;
              const sc = STATUS_COLOR[block.status]      || STATUS_COLOR.active;
              return (
                <tr key={block.id} className="table-row"
                  style={{cursor:"pointer"}}
                  onClick={()=>onSelectBlock?.(block.id)}>

                  <td className="table-cell" style={{width:32,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(block.id)}
                      onChange={()=>toggleSelect(block.id)}
                      style={{cursor:"pointer",accentColor:"var(--accent)",width:16,height:16}}
                    />
                  </td>
                  <td className="table-cell">
                    <span style={{
                      fontFamily:"var(--font-mono)",fontSize:13,fontWeight:600,
                      color:"var(--accent)",
                    }}>{block.prefix}</span>
                  </td>

                  <td className="table-cell">
                    <Badge label={block.ip_version} style={{
                      background:vc.bg, color:vc.color, borderColor:vc.border,
                    }}/>
                  </td>

                  <td className="table-cell">
                    <div style={{fontSize:13,color:"var(--text)",fontWeight:500,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {block.name || "—"}
                    </div>
                    {block.operator && (
                      <div style={{fontSize:11,color:"var(--text-dim)",marginTop:2,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {block.operator}
                      </div>
                    )}
                  </td>

                  <td className="table-cell">
                    {block.asn && (
                      <div style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-muted)"}}>
                        {block.asn}
                      </div>
                    )}
                    {block.router && (
                      <div style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-dim)",marginTop:2}}>
                        {block.router}
                      </div>
                    )}
                    {!block.asn && !block.router && <span style={{color:"var(--text-dim)"}}>—</span>}
                  </td>

                  <td className="table-cell">
                    <span style={{fontSize:12,color:"var(--text-muted)"}}>
                      {block.site_name || "—"}
                    </span>
                  </td>

                  <td className="table-cell" style={{minWidth:160}}>
                    <div style={{marginBottom:4}}>
                      <UtilBar active={parseFloat(block.used_ips||0)} total={parseFloat(block.total_ips||1)}/>
                    </div>
                    <div style={{fontSize:11,color:"var(--text-dim)",fontVariantNumeric:"tabular-nums"}}>
                      {block.active_allocations||0} active · {block.total_allocations||0} total
                    </div>
                  </td>

                  <td className="table-cell">
                    <Badge label={block.status} style={{
                      background:sc.bg, color:sc.color, borderColor:sc.border,
                      textTransform:"capitalize",
                    }}/>
                  </td>

                  <td className="table-cell" onClick={e=>e.stopPropagation()}>
                    <div style={{display:"flex",gap:4,justifyContent:"flex-end"}}>
                      <button
                        onClick={()=>setModal(block)}
                        className="btn btn-ghost btn-sm"
                        style={{padding:"4px 10px",fontSize:12}}
                      >Edit</button>
                      <button
                        onClick={()=>setConfirm(block)}
                        className="btn btn-sm"
                        style={{
                          padding:"4px 10px",fontSize:12,
                          background:"var(--danger-surface)",
                          color:"var(--danger)",
                          border:"1px solid var(--danger-border)",
                        }}
                      >Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {modal && (
        <BlockFormModal
          block={modal==="add" ? null : modal}
          sites={sites}
          onClose={()=>setModal(null)}
          onSaved={()=>{ setModal(null); load(); }}
        />
      )}
      {confirm && (
        <Confirm
          message={`Are you sure you want to delete block "${confirm.prefix}"? This will also delete all allocations within this block.`}
          onConfirm={()=>handleDelete(confirm)}
          onCancel={()=>setConfirm(null)}
        />
      )}
    </div>
  );
}
