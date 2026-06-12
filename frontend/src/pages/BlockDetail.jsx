import { useState, useEffect, useCallback, useRef, memo } from "react";
import AllocModal, { BlockEditModal, ConfirmModal, SubnetCalc } from "./AllocModal.jsx";
import IPGrid from "./IPGrid.jsx";
import { createPortal } from "react-dom";
import { getBlock, updateBlock, getSites, getCustomers, getVlans,
         createAllocation, updateAllocation, deleteAllocation, createCustomer, createVlan } from "../api.js";

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const OWNER_TYPES = [
  { value:"customer",       label:"Customer",       color:"var(--text-muted)", icon:"" },
  { value:"infrastructure", label:"Infrastructure", color:"var(--text-muted)", icon:"" },
  { value:"ptp",            label:"PTP",            color:"var(--text-muted)", icon:"" },
  { value:"peering",        label:"Peering",        color:"var(--text-muted)", icon:"" },
  { value:"management",     label:"Mgmt",           color:"var(--text-muted)", icon:"" },
  { value:"reserved",       label:"Reserved",       color:"var(--text-dim)",   icon:"" },
];

const STATUS_OPTS = ["active","available","reserved","deprecated"];

const STATUS_STYLE = {
  active:     { color:"var(--success)",  bg:"var(--success-surface)", border:"var(--success-border)" },
  available:  { color:"var(--text-muted)", bg:"transparent",          border:"var(--border-soft)" },
  reserved:   { color:"var(--text-dim)",   bg:"transparent",          border:"var(--border-soft)" },
  deprecated: { color:"var(--warning)",  bg:"var(--warning-surface)", border:"var(--warning-border)" },
};

const V4_MASKS = [24,25,26,27,28,29,30,31];
const V6_MASKS = [48,56,64,96,112,120,124,126,127];

// ── HELPERS ──────────────────────────────────────────────────────────────────
// ── SUBNET VALIDATION ───────────────────────────────────────────────────────
function ipToInt(ip) {
  const p = ip.split(".").map(Number);
  return ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0;
}

function intToIp(n) {
  return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".");
}

function isAligned(ip, plen) {
  // Check if IP is aligned to prefix boundary
  const size = Math.pow(2, 32-plen);
  const ipInt = ipToInt(ip);
  return (ipInt % size) === 0;
}

function snapToBoundary(ip, plen) {
  // Snap IP down to nearest aligned boundary for given plen
  const size = Math.pow(2, 32-plen);
  const ipInt = ipToInt(ip);
  const aligned = Math.floor(ipInt / size) * size;
  return intToIp(aligned>>>0);
}

function nextValidBoundary(ip, plen, allocations) {
  // Find next aligned boundary that doesn't overlap existing allocations
  const size = Math.pow(2, 32-plen);
  let ipInt = ipToInt(ip);
  // Align up
  if (ipInt % size !== 0) ipInt = (Math.floor(ipInt/size)+1)*size;

  for (let attempt=0; attempt<256; attempt++) {
    const candidate = ipInt + (attempt * size);
    const candEnd   = candidate + size - 1;
    let overlaps = false;
    for (const a of allocations) {
      try {
        const [addr, p] = a.prefix.split("/");
        const aStart = ipToInt(addr);
        const aEnd   = aStart + Math.pow(2, 32-parseInt(p)) - 1;
        if (candidate <= aEnd && candEnd >= aStart) { overlaps=true; break; }
      } catch {}
    }
    if (!overlaps) return intToIp(candidate>>>0);
  }
  return null;
}

function validateSubnet(prefix, allocations, blockPrefix) {
  // Returns { valid, errors[], warnings[] }
  const errors   = [];
  const warnings = [];

  if (!prefix || !prefix.includes("/")) return { valid:false, errors:["Invalid prefix format"], warnings };

  try {
    const [ip, plenStr] = prefix.split("/");
    const plen = parseInt(plenStr);
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some(p=>isNaN(p)||p<0||p>255))
      return { valid:false, errors:["Invalid IP address"], warnings };
    if (isNaN(plen) || plen < 1 || plen > 32)
      return { valid:false, errors:["Invalid prefix length"], warnings };

    const ipInt  = ipToInt(ip);
    const size   = Math.pow(2, 32-plen);
    const ipEnd  = (ipInt + size - 1)>>>0;

    // Check block containment
    if (blockPrefix) {
      const [bAddr, bPlen] = blockPrefix.split("/");
      const bStart = ipToInt(bAddr);
      const bSize  = Math.pow(2, 32-parseInt(bPlen));
      const bEnd   = (bStart+bSize-1)>>>0;
      if (ipInt < bStart || ipEnd > bEnd)
        errors.push(`Prefix is outside block ${blockPrefix}`);
    }

    // Check alignment
    if (!isAligned(ip, plen)) {
      const snapped = snapToBoundary(ip, plen);
      errors.push(`Not aligned — should start at ${snapped}/${plen}`);
    }

    // Check overlaps
    for (const a of (allocations||[])) {
      try {
        const [aAddr, aPlen] = a.prefix.split("/");
        const aStart = ipToInt(aAddr);
        const aSize  = Math.pow(2, 32-parseInt(aPlen));
        const aEnd   = (aStart+aSize-1)>>>0;
        if (ipInt <= aEnd && ipEnd >= aStart) {
          if (ipInt===aStart && ipEnd===aEnd)
            warnings.push(`Prefix already exists as ${a.prefix}`);
          else
            errors.push(`Overlaps with ${a.prefix} (${a.description||a.customer_name||"allocated"})`);
        }
      } catch {}
    }

  } catch(e) {
    errors.push("Validation error: " + e.message);
  }

  return { valid: errors.length===0, errors, warnings };
}

function changeMaskAligned(currentPrefix, newPlen, allocations) {
  // Change mask and snap to valid aligned boundary
  if (!currentPrefix) return `0.0.0.0/${newPlen}`;
  try {
    const [ip] = currentPrefix.split("/");
    const snapped = snapToBoundary(ip, newPlen);
    // Check if snapped is free, if not find next
    const size   = Math.pow(2, 32-newPlen);
    const ipInt  = ipToInt(snapped);
    const ipEnd  = (ipInt+size-1)>>>0;
    let overlaps = false;
    for (const a of (allocations||[])) {
      try {
        const [aAddr,aPlen] = a.prefix.split("/");
        const aStart = ipToInt(aAddr);
        const aEnd   = (aStart+Math.pow(2,32-parseInt(aPlen))-1)>>>0;
        if (ipInt<=aEnd && ipEnd>=aStart) { overlaps=true; break; }
      } catch {}
    }
    if (!overlaps) return `${snapped}/${newPlen}`;
    // Find next valid
    const next = nextValidBoundary(snapped, newPlen, allocations);
    return next ? `${next}/${newPlen}` : `${snapped}/${newPlen}`;
  } catch {
    return `0.0.0.0/${newPlen}`;
  }
}

function calcUsableRange(prefix) {
  if (!prefix) return "";
  try {
    if (prefix.includes(":")) return prefix;
    const [addr, plenStr] = prefix.split("/");
    const plen = parseInt(plenStr);
    const parts = addr.split(".").map(Number);
    const toInt = p => ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0;
    const toIP  = n => [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".");
    const base  = toInt(parts);
    const size  = Math.pow(2, 32-plen);
    if (plen === 32) return addr;
    if (plen === 31) return `${addr} — ${toIP((base+1)>>>0)}`;
    return `${toIP((base+1)>>>0)} — ${toIP((base+size-2)>>>0)}`;
  } catch { return ""; }
}

function calcUsableCount(prefix) {
  if (!prefix) return 0;
  try {
    if (prefix.includes(":")) return 2;
    const plen = parseInt(prefix.split("/")[1]);
    if (plen === 32) return 1;
    if (plen === 31) return 2;
    return Math.pow(2, 32-plen) - 2;
  } catch { return 0; }
}

function ownerInfo(type) {
  return OWNER_TYPES.find(o=>o.value===type) || OWNER_TYPES[0];
}

// ── AUTOCOMPLETE INPUT ───────────────────────────────────────────────────────
function AutoInput({ value, onChange, suggestions=[], placeholder, mono, onCreate }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState(value||"");
  const ref = useRef();

  useEffect(()=>{ setQuery(value||""); },[value]);

  const filtered = query
    ? suggestions.filter(s=>s.toLowerCase().includes(query.toLowerCase())).slice(0,8)
    : suggestions.slice(0,8);

  const select = v => { setQuery(v); onChange(v); setOpen(false); };

  return (
    <div ref={ref} style={{position:"relative",width:"100%"}}>
      <input value={query}
        onChange={e=>{ setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={()=>setOpen(true)}
        onBlur={()=>setTimeout(()=>setOpen(false),150)}
        onKeyDown={e=>{
          if(e.key==="Enter") {
            if(filtered.length===1) select(filtered[0]);
            else if(query && onCreate) { onCreate(query); setOpen(false); }
            else if(query) onChange(query);
          }
          if(e.key==="Escape") setOpen(false);
        }}
        placeholder={placeholder}
        className="input"
        style={{fontSize:12,padding:"4px 8px",fontFamily:mono?"var(--font-mono)":"inherit"}}
      />
      {open && (filtered.length>0 || (query && onCreate)) && (
        <div style={{
          position:"absolute",top:"100%",left:0,right:0,zIndex:200,
          background:"var(--bg-secondary,var(--bg))",
          border:"1px solid var(--border-soft)",
          borderRadius:"var(--radius-sm)",
          boxShadow:"var(--shadow-lg)",
          maxHeight:180,overflowY:"auto",
        }}>
          {filtered.map(s=>(
            <div key={s} onMouseDown={()=>select(s)} style={{
              padding:"6px 10px",cursor:"pointer",fontSize:12,
              color:"var(--text)",fontFamily:mono?"var(--font-mono)":"inherit",
              borderBottom:"1px solid var(--border-subtle)",
            }}
            onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >{s}</div>
          ))}
          {query && !filtered.find(s=>s.toLowerCase()===query.toLowerCase()) && onCreate && (
            <div onMouseDown={()=>{ onCreate(query); setOpen(false); }} style={{
              padding:"6px 10px",cursor:"pointer",fontSize:12,
              color:"var(--accent)",borderTop:"1px solid var(--border-subtle)",
            }}>+ Create "{query}"</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── INLINE CELL ──────────────────────────────────────────────────────────────
function InlineCell({ value, onSave, mono, placeholder, suggestions=[], onCreate, type="text" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value||"");
  const ref = useRef();

  useEffect(()=>{ setVal(value||""); },[value]);
  useEffect(()=>{ if(editing && ref.current) ref.current.focus(); },[editing]);

  const commit = async v => {
    const final = v!==undefined ? v : val;
    setEditing(false);
    if (final !== (value||"")) await onSave(final||null);
  };

  if (!editing) return (
    <div onClick={()=>setEditing(true)} title="Click to edit" style={{
      cursor:"text", padding:"3px 6px", borderRadius:"var(--radius-sm)",
      minWidth:40, color:value?"var(--text)":"var(--text-dim)",
      fontSize:12, fontFamily:mono?"var(--font-mono)":"inherit",
      fontStyle:value?"normal":"italic",
      border:"1px solid transparent", transition:"border var(--transition)",
    }}
    onMouseEnter={e=>e.currentTarget.style.borderColor="var(--border-soft)"}
    onMouseLeave={e=>e.currentTarget.style.borderColor="transparent"}
    >{value||<span style={{fontSize:11}}>{placeholder||"—"}</span>}</div>
  );

  if (suggestions.length>0) return (
    <AutoInput value={val} onChange={v=>setVal(v)}
      suggestions={suggestions} mono={mono}
      placeholder={placeholder} onCreate={onCreate}
      onBlur={()=>commit()}
    />
  );

  return (
    <input ref={ref} value={val} autoFocus type={type}
      onChange={e=>setVal(e.target.value)}
      onBlur={()=>commit()}
      onKeyDown={e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape"){ setEditing(false); setVal(value||""); }}}
      className="input"
      style={{fontSize:12,padding:"3px 8px",fontFamily:mono?"var(--font-mono)":"inherit",minWidth:80}}
    />
  );
}

// ── ALLOCATION MODAL (Add/Edit) ──────────────────────────────────────────────
export default function BlockDetail({ blockId, onBack, dark }) {
  const [data,      setData]      = useState(null);
  const [search,    setSearch]    = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [statusFilter,setStatusFilter]= useState("");
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [allocModal,setAllocModal]= useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [sites,     setSites]     = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vlans,     setVlans]     = useState([]);
  const [showCalc,  setShowCalc]  = useState(false);
  const [showGrid,  setShowGrid]  = useState(true);
  const [saveMsg,   setSaveMsg]   = useState(null);

  const load = useCallback(()=>{
    setLoading(true);
    getBlock(blockId)
      .then(d=>{ setData(d); setErr(null); })
      .catch(e=>setErr(e.message))
      .finally(()=>setLoading(false));
  },[blockId]);

  useEffect(()=>{
    load();
    getSites().then(setSites);
    getCustomers("",500).then(d=>setCustomers(d.items||[]));
    getVlans("","",500).then(d=>setVlans(d.items||[]));
  },[load]);

  const saveField = async (allocId, field, value) => {
    const alloc = data.allocations.find(a=>a.id===allocId);
    if (!alloc) return;
    let payload = {
      prefix:      alloc.prefix,
      block_id:    blockId,
      customer_id: alloc.customer_id||null,
      vlan_id:     alloc.vlan_id||null,
      status:      alloc.status,
      owner_type:  alloc.owner_type||"customer",
      description: alloc.description||"",
      notes:       alloc.notes||"",
    };

    if (field==="customer_name") {
      if (!value) { payload.customer_id=null; }
      else {
        let cust=customers.find(c=>c.name.toLowerCase()===value.toLowerCase());
        if (!cust) {
          const r=await fetch("/api/v1/customers",{method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({name:value,is_active:true})});
          cust=await r.json();
          setCustomers(prev=>[...prev,cust]);
        }
        payload.customer_id=cust.id;
        payload.status="active";
      }
    } else if (field==="vlan_vid") {
      if (!value) { payload.vlan_id=null; }
      else {
        const vid=parseInt(value);
        let vlan=vlans.find(v=>v.vid===vid);
        if (!vlan) {
          const r=await fetch("/api/v1/vlans",{method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({vid,name:"",status:"active"})});
          if(r.ok){vlan=await r.json();setVlans(prev=>[...prev,vlan]);}
        }
        payload.vlan_id=vlan?.id||null;
      }
    } else if (field==="owner_type")  { payload.owner_type=value; }
    else if (field==="status")        { payload.status=value; }
    else if (field==="description")   { payload.description=value||""; }
    else if (field==="notes")         { payload.notes=value||""; }
    else if (field==="mask") {
      if (String(value).includes("__")) {
        const [plen, newIp] = String(value).split("__");
        payload.prefix = `${newIp}/${plen}`;
      } else {
        const [addr] = alloc.prefix.split("/");
        payload.prefix = `${addr}/${value}`;
      }
    }
    try {
      await updateAllocation(allocId,payload);
      setSaveMsg("Saved ✓"); setTimeout(()=>setSaveMsg(null),1500);
      load();
    } catch(e) {
      setSaveMsg("Error: "+e.message); setTimeout(()=>setSaveMsg(null),3000);
    }
  };

  // Filter allocations
  const allocs = (data?.allocations||[]).filter(a=>{
    const ms = !search ||
      a.prefix?.includes(search) ||
      (a.customer_name||"").toLowerCase().includes(search.toLowerCase()) ||
      (a.description||"").toLowerCase().includes(search.toLowerCase()) ||
      String(a.vlan_vid||"").includes(search);
    const mf = !statusFilter || a.status===statusFilter;
    const mo = !ownerFilter  || a.owner_type===ownerFilter;
    return ms && mf && mo;
  });

  const custNames = customers.map(c=>c.name);
  const vlanVids  = vlans.map(v=>String(v.vid));
  const isV6      = data?.prefix?.includes(":");

  // Compute free gaps (IPv4 only)
  const computeGaps = (allocations, blockPrefix) => {
    if (!blockPrefix || blockPrefix.includes(":")) return [];
    try {
      const [bAddr, bPlen] = blockPrefix.split("/");
      const bStart = ipToInt(bAddr);
      const bEnd   = (bStart + Math.pow(2, 32-parseInt(bPlen)) - 1) >>> 0;
      const sorted = [...allocations]
        .filter(a => !a.prefix.includes(":"))
        .sort((a,b) => ipToInt(a.prefix.split("/")[0]) - ipToInt(b.prefix.split("/")[0]));
      const gaps = [];
      let cursor = bStart;
      for (const a of sorted) {
        const aStart = ipToInt(a.prefix.split("/")[0]);
        const aSize  = Math.pow(2, 32 - parseInt(a.prefix.split("/")[1]));
        const aEnd   = (aStart + aSize - 1) >>> 0;
        if (aStart > cursor) {
          gaps.push({ type:"gap", start:cursor, end:aEnd-1, startIp:intToIp(cursor), endIp:intToIp(aStart-1), size:aStart-cursor });
        }
        cursor = Math.max(cursor, (aEnd+1)>>>0);
      }
      if (cursor <= bEnd) {
        gaps.push({ type:"gap", start:cursor, end:bEnd, startIp:intToIp(cursor), endIp:intToIp(bEnd), size:bEnd-cursor+1 });
      }
      return gaps;
    } catch { return []; }
  };
  const gaps = !isV6 && !ownerFilter && !statusFilter && !search ? computeGaps(data?.allocations||[], data?.prefix) : [];

  // Stats
  const totalAllocs   = (data?.allocations||[]).length;
  const activeAllocs  = (data?.allocations||[]).filter(a=>a.status==="active").length;
  const availAllocs   = (data?.allocations||[]).filter(a=>a.status==="available").length;
  const usedIps       = parseFloat(data?.used_ips||0);
  const totalIps      = parseFloat(data?.total_ips||1);
  const utilPct       = totalIps ? Math.round(usedIps/totalIps*100) : 0;
  const utilColor     = utilPct>85?"var(--danger)":utilPct>60?"var(--warning)":"var(--success)";

  // Owner type breakdown
  const ownerBreakdown = OWNER_TYPES.map(ot=>({
    ...ot,
    count:(data?.allocations||[]).filter(a=>a.owner_type===ot.value).length
  })).filter(o=>o.count>0);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:240,gap:12,flexDirection:"column"}}>
      <div style={{width:32,height:32,borderRadius:"50%",border:"2px solid var(--accent-dim)",
        borderTopColor:"var(--accent)",animation:"spin 0.8s linear infinite"}}/>
      <span style={{fontSize:13,color:"var(--text-muted)"}}>Loading block...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (err) return (
    <div style={{background:"var(--danger-surface)",border:"1px solid var(--danger-border)",
      borderRadius:"var(--radius)",padding:"16px 20px",color:"var(--danger)",fontSize:14}}>
      Error: {err}
    </div>
  );

  if (!data) return null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* Save toast */}
      {saveMsg && (
        <div style={{
          position:"fixed",top:16,right:20,zIndex:999,
          background: saveMsg.startsWith("Error") ? "var(--danger)" : "var(--success)",
          color:"#fff",padding:"8px 16px",borderRadius:"var(--radius)",
          fontSize:12,fontFamily:"var(--font-mono)",
          boxShadow:"var(--shadow-lg)",animation:"slideFromTop 0.2s ease-out",
        }}>{saveMsg}</div>
      )}

      {/* Block header card */}
      <div className="card" style={{padding:20}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {/* Version badge */}
            <span style={{
              padding:"3px 8px",borderRadius:99,fontSize:11,fontWeight:700,
              background: isV6?"var(--success-surface)":"var(--info-surface)",
              color:       isV6?"var(--success)":"var(--info)",
              border:`1px solid ${isV6?"var(--success-border)":"var(--info-border)"}`,
            }}>{data.ip_version}</span>
            <span style={{fontFamily:"var(--font-mono)",fontSize:22,fontWeight:700,color:"var(--text)"}}>
              {data.prefix}
            </span>
            <span style={{
              padding:"3px 8px",borderRadius:99,fontSize:11,fontWeight:600,
              background: data.status==="active"?"var(--success-surface)":"var(--warning-surface)",
              color:       data.status==="active"?"var(--success)":"var(--warning)",
              border:`1px solid ${data.status==="active"?"var(--success-border)":"var(--warning-border)"}`,
              textTransform:"capitalize",
            }}>{data.status}</span>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowGrid(v=>!v)}
              className={`btn ${showGrid?"btn-primary":"btn-secondary"} btn-sm`}>
              🗺 IP Map
            </button>
            <button onClick={()=>setShowCalc(v=>!v)}
              className={`btn ${showCalc?"btn-primary":"btn-secondary"} btn-sm`}>
              🧮 Subnet Calc
            </button>
            <button onClick={()=>setEditModal(true)} className="btn btn-secondary btn-sm">
              Edit Block
            </button>
            <button onClick={()=>setAllocModal({})} className="btn btn-primary btn-sm">
              + Add Allocation
            </button>
          </div>
        </div>

        {/* Block metadata */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:16}}>
          {[
            ["Name",     data.name],
            ["ASN",      data.asn || null],
            ["Router",   data.router],
            ["Operator", data.operator],
            ["Site",     data.site_name],
          ].map(([k,v])=>(
            <div key={k} style={{
              background:"var(--surface-1)",borderRadius:"var(--radius-sm)",
              padding:"8px 12px",border:"1px solid var(--border-subtle)",
            }}>
              <div style={{fontSize:9,fontWeight:600,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:3}}>{k}</div>
              <div style={{fontSize:12,fontFamily:"var(--font-mono)",color:"var(--text)",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {v||"—"}
              </div>
            </div>
          ))}
        </div>

        {/* Utilization bar */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <div style={{flex:1,height:6,background:"var(--surface-3)",borderRadius:99,overflow:"hidden"}}>
            <div style={{width:`${utilPct}%`,height:"100%",background:utilColor,
              borderRadius:99,transition:"width 0.5s"}}/>
          </div>
          <span style={{fontFamily:"var(--font-mono)",fontSize:12,color:utilColor,
            fontWeight:700,minWidth:36,textAlign:"right"}}>{utilPct}%</span>
        </div>

        {/* Stats row */}
        <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
          {[
            ["Used IPs",  `${parseInt(usedIps).toLocaleString()} / ${parseInt(totalIps).toLocaleString()}`, utilColor],
            ["Active",    activeAllocs, "var(--success)"],
            ["Available", availAllocs,  "var(--accent2)"],
            ["Total",     totalAllocs,  "var(--text-muted)"],
          ].map(([l,v,c])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11,color:"var(--text-dim)"}}>{l}:</span>
              <span style={{fontFamily:"var(--font-mono)",fontSize:13,fontWeight:700,color:c}}>{v}</span>
            </div>
          ))}
          {/* Owner type pills */}
          <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
            {ownerBreakdown.map(o=>(
              <div key={o.value} style={{
                display:"flex",alignItems:"center",gap:4,
                padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:600,
                background:`${o.color}18`,color:o.color,
                border:`1px solid ${o.color}44`,
              }}>
                <span>{o.icon}</span>{o.label}: {o.count}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Subnet calculator */}
      {showGrid && (
        <IPGrid
          blockPrefix={data.prefix}
          allocations={data.allocations||[]}
          onAllocate={prefix=>{ setAllocModal({prefix}); }}
          onEdit={row=>setAllocModal(row)}
          dark={dark}
        />)}

      {showCalc && (
        <SubnetCalc
          blockPrefix={data.prefix}
          allocations={data.allocations||[]}
          onSelect={prefix=>{ setAllocModal({prefix}); setShowCalc(false); }}
        />
      )}

      {/* Allocation table */}
      <div className="card" style={{overflow:"hidden"}}>
        {/* Toolbar */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 16px",
          borderBottom:"1px solid var(--border-subtle)",flexWrap:"wrap"}}>
          {/* Search */}
          <div style={{position:"relative",flex:1,minWidth:200,maxWidth:300}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
              color:"var(--text-dim)",pointerEvents:"none",fontSize:13}}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search prefix, customer, VLAN..."
              className="input" style={{paddingLeft:32,height:32,fontSize:12}}/>
          </div>

          {/* Owner filter */}
          <select value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}
            className="select" style={{height:32,fontSize:12,width:130}}>
            <option value="">All Types</option>
            {OWNER_TYPES.map(o=><option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
          </select>

          {/* Status filter */}
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
            className="select" style={{height:32,fontSize:12,width:120}}>
            <option value="">All Status</option>
            {STATUS_OPTS.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>

          <span style={{fontSize:11,color:"var(--text-dim)",marginLeft:"auto"}}>{allocs.length}/{totalAllocs} rows</span>
          <span style={{fontSize:10,color:"var(--text-dim)",fontStyle:"italic"}}>✎ click cell to edit</span>
        </div>

        {/* Table */}
        <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"calc(100vh - 420px)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead style={{position:"sticky",top:0,zIndex:10}}>
              <tr style={{background:"var(--surface-1)",borderBottom:"2px solid var(--border-soft)"}}>
                {["#","Type","Prefix","Usable Range","Owner / Customer","VLAN","End Device XC","Status",""].map((h,i)=>(
                  <th key={i} style={{
                    textAlign:"left",padding:"8px 10px",whiteSpace:"nowrap",
                    fontSize:10,fontWeight:600,textTransform:"uppercase",
                    letterSpacing:"0.07em",color:"var(--text-muted)",
                    borderRight:"1px solid var(--border-subtle)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allocs.length===0 ? (
                <tr><td colSpan={11}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",
                    justifyContent:"center",padding:"48px 0",gap:8}}>
                    <div style={{fontSize:28}}>📋</div>
                    <div style={{fontSize:13,color:"var(--text-muted)"}}>No allocations found</div>
                  </div>
                </td></tr>
              ) : (() => {
                // Merge allocs + gaps, sort by IP
                const rows = [
                  ...allocs.map(r=>({...r, _type:"alloc"})),
                  ...gaps.map(g=>({...g, _type:"gap"}))
                ].sort((a,b)=>{
                  const ipA = a._type==="alloc" ? ipToInt(a.prefix.split("/")[0]) : a.start;
                  const ipB = b._type==="alloc" ? ipToInt(b.prefix.split("/")[0]) : b.start;
                  return ipA - ipB;
                });
                let allocIdx = 0;
                return rows.map((row,i)=>{
                  if (row._type==="gap") return (
                    <tr key={"gap-"+i} style={{borderBottom:"1px solid var(--border-subtle)",opacity:0.6}}>
                      <td style={{padding:"5px 10px",color:"var(--text-dim)",fontFamily:"var(--font-mono)",fontSize:10,borderRight:"1px solid var(--border-subtle)"}}>—</td>
                      <td style={{padding:"5px 8px",borderRight:"1px solid var(--border-subtle)"}}><span style={{fontSize:10,color:"var(--text-dim)",fontStyle:"italic"}}>free</span></td>
                      <td style={{padding:"5px 10px",borderRight:"1px solid var(--border-subtle)"}}>
                        <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-dim)"}}>
                          {row.startIp} — {row.endIp}
                        </span>
                        <span style={{fontSize:10,color:"var(--text-dim)",marginLeft:8}}>({row.size} IPs)</span>
                      </td>
                      <td colSpan={5} style={{padding:"5px 10px"}}>
                        <button onClick={()=>setAllocModal({prefix:row.startIp+"/30"})}
                          className="btn btn-ghost btn-sm"
                          style={{fontSize:10,padding:"2px 8px",opacity:0.7}}>+ Allocate</button>
                      </td>
                    </tr>
                  );
                  const rowI = allocIdx++;
                  const oi = ownerInfo(row.owner_type);
                const ss = STATUS_STYLE[row.status]||STATUS_STYLE.available;
                const rowBg = row.status==="available"
                  ? "rgba(56,232,198,0.03)"
                  : row.status==="reserved"
                  ? "rgba(168,85,247,0.03)"
                  : i%2===0?"var(--surface-1)":"transparent";

                return (
                  <tr key={row.id} style={{
                    borderBottom:"1px solid var(--border-subtle)",
                    background:rowBg,
                    transition:"background var(--transition)",
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
                  onMouseLeave={e=>e.currentTarget.style.background=rowBg}>

                    {/* # */}
                    <td style={{padding:"6px 10px",color:"var(--text-dim)",
                      fontFamily:"var(--font-mono)",fontSize:10,borderRight:"1px solid var(--border-subtle)"}}>
                      {i+1}
                    </td>

                    {/* Type */}
                    <td style={{padding:"6px 8px",borderRight:"1px solid var(--border-subtle)"}}>
                      <select value={row.owner_type||"customer"}
                        onChange={e=>saveField(row.id,"owner_type",e.target.value)}
                        onClick={e=>e.stopPropagation()}
                        style={{
                          background:"transparent",border:"none",
                          color:oi.color,fontSize:11,fontWeight:600,
                          cursor:"pointer",outline:"none",
                        }}>
                        {OWNER_TYPES.map(o=>(
                          <option key={o.value} value={o.value} style={{background:"var(--bg-secondary,var(--bg))",color:"var(--text)"}}>
                            {o.icon} {o.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Prefix */}
                    <td style={{padding:"6px 10px",borderRight:"1px solid var(--border-subtle)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:600,color:"var(--accent)"}}>
                          {row.prefix?.split("/")?.[0]}
                        </span>
                        <select value={row.prefix?.split("/")?.[1]||""}
                          onChange={e=>{
                            const newPlen = parseInt(e.target.value);
                            const newPrefix = changeMaskAligned(row.prefix, newPlen, data?.allocations?.filter(a=>a.id!==row.id)||[]);
                            saveField(row.id,"mask",newPrefix.split("/")[1]+"__"+newPrefix.split("/")[0]);
                          }}
                          onClick={e=>e.stopPropagation()}
                          style={{
                            background:"transparent",border:"1px solid var(--border-soft)",
                            color:"var(--accent2)",fontSize:11,fontFamily:"var(--font-mono)",
                            cursor:"pointer",outline:"none",borderRadius:"var(--radius-sm)",
                            padding:"2px 4px",
                          }}>
                          {(isV6?V6_MASKS:V4_MASKS).map(p=>(
                            <option key={p} value={p} style={{background:"var(--bg-secondary,var(--bg))",color:"var(--text)"}}>/{p}</option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* Usable Range */}
                    <td style={{padding:"6px 10px",borderRight:"1px solid var(--border-subtle)"}}>
                      <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-muted)"}}>
                        {calcUsableRange(row.prefix)}
                      </span>
                    </td>

                    {/* Owner / Customer */}
                    <td style={{padding:"4px 8px",borderRight:"1px solid var(--border-subtle)",minWidth:160}}>
                      {row.owner_type==="customer" ? (
                        <InlineCell value={row.customer_name} placeholder="assign customer"
                          suggestions={custNames}
                          onCreate={v=>saveField(row.id,"customer_name",v)}
                          onSave={v=>saveField(row.id,"customer_name",v)}/>
                      ) : (
                        <InlineCell value={row.description} placeholder="description"
                          onSave={v=>saveField(row.id,"description",v)}/>
                      )}
                    </td>

                    {/* VLAN */}
                    <td style={{padding:"4px 8px",borderRight:"1px solid var(--border-subtle)"}}>
                      <InlineCell value={row.vlan_vid?String(row.vlan_vid):""} placeholder="—"
                        suggestions={vlanVids} mono
                        onSave={v=>saveField(row.id,"vlan_vid",v)}/>
                    </td>

                    {/* End Device XC */}
                    <td style={{padding:"4px 8px",borderRight:"1px solid var(--border-subtle)",maxWidth:160}}>
                      <InlineCell value={row.description} placeholder="—"
                        onSave={v=>saveField(row.id,"description",v)}/>
                    </td>

                    {/* Status */}
                    <td style={{padding:"6px 8px",borderRight:"1px solid var(--border-subtle)"}}>
                      <select value={row.status}
                        onChange={e=>saveField(row.id,"status",e.target.value)}
                        onClick={e=>e.stopPropagation()}
                        style={{
                          background:"transparent",border:"none",
                          color:ss.color,fontSize:11,fontFamily:"var(--font-mono)",
                          cursor:"pointer",outline:"none",fontWeight:600,
                          textTransform:"uppercase",letterSpacing:"0.04em",
                        }}>
                        {STATUS_OPTS.map(s=>(
                          <option key={s} value={s} style={{background:"var(--bg-secondary,var(--bg))",color:"var(--text)"}}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Actions */}
                    <td style={{padding:"4px 8px"}} onClick={e=>e.stopPropagation()}>
                      <div style={{display:"flex",gap:4}}>
                        <button onClick={()=>setAllocModal(row)}
                          className="btn btn-ghost btn-sm"
                          style={{padding:"3px 8px",fontSize:11}}>Edit</button>
                        <button onClick={()=>setConfirm(row)}
                          style={{
                            padding:"3px 8px",fontSize:11,
                            background:"var(--danger-surface)",color:"var(--danger)",
                            border:"1px solid var(--danger-border)",
                            borderRadius:"var(--radius-sm)",cursor:"pointer",
                          }}>Del</button>
                      </div>
                    </td>
                  </tr>
                );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {editModal && (
        <BlockEditModal block={data} sites={sites}
          onClose={()=>setEditModal(false)}
          onSaved={()=>{ setEditModal(false); load(); }}/>
      )}
      {allocModal!==null && createPortal(
        <AllocModal
          alloc={allocModal?.id?allocModal:null}
          blockId={blockId}
          blockPrefix={data.prefix}
          prefillPrefix={allocModal?.prefix}
          customers={customers} vlans={vlans}
          onClose={()=>setAllocModal(null)}
          onSaved={()=>{
            setAllocModal(null); load();
            getCustomers("",500).then(d=>setCustomers(d.items||[]));
            getVlans("","",500).then(d=>setVlans(d.items||[]));
          }}/>,
        document.body
      )}
      {confirm && (
        <ConfirmModal
          message={`Delete allocation ${confirm.prefix}?`}
          onConfirm={async()=>{ await deleteAllocation(confirm.id); setConfirm(null); load(); }}
          onCancel={()=>setConfirm(null)}/>
      )}
    </div>
  );
}
