import { useState, useEffect, useRef } from "react";
import { createAllocation, updateAllocation, getBlock, updateBlock, authFetch} from "../api.js";

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const OWNER_TYPES = [
  { value:"customer",   label:"Customer",   color:"var(--accent)",   icon:"👤" },
  { value:"internal",   label:"Internal",   color:"var(--accent2)",  icon:"🖥️" },
  { value:"ptp",        label:"PTP",        color:"var(--warning)",  icon:"🔗" },
  { value:"peering",    label:"Peering",    color:"#a855f7",         icon:"🌐" },
  { value:"management", label:"Mgmt",       color:"var(--info)",     icon:"⚙️" },
  { value:"reserved",   label:"Reserved",   color:"var(--text-dim)", icon:"🔒" },
];

const STATUS_OPTS = ["active","available","reserved","deprecated"];

const STATUS_STYLE = {
  active:     { color:"var(--success)", bg:"var(--success-surface)", border:"var(--success-border)" },
  available:  { color:"var(--accent2)", bg:"rgba(56,232,198,0.1)",   border:"rgba(56,232,198,0.25)" },
  reserved:   { color:"#a855f7",        bg:"rgba(168,85,247,0.1)",   border:"rgba(168,85,247,0.25)" },
  deprecated: { color:"var(--warning)", bg:"var(--warning-surface)", border:"var(--warning-border)" },
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

// ─── IPv6 helpers ───────────────────────────────────────────────
function expandIPv6(addr) {
  // Expand :: notation and return 8 groups of 16-bit as numbers
  let s = addr;
  if (s.includes("::")) {
    const sides = s.split("::");
    const left  = sides[0] ? sides[0].split(":") : [];
    const right = sides[1] ? sides[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    const mid = Array(missing).fill("0");
    s = [...left, ...mid, ...right].join(":");
  }
  return s.split(":").map(g => parseInt(g||"0", 16));
}

function ipv6ToBigInt(addr) {
  const groups = expandIPv6(addr);
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(g), 0n);
}

function isValidIPv6(addr) {
  try {
    // Basic format check
    if (!addr || addr.includes(":::")) return false;
    const dcCount = (addr.match(/::/g)||[]).length;
    if (dcCount > 1) return false;
    const groups = expandIPv6(addr);
    if (groups.length !== 8) return false;
    return groups.every(g => g >= 0 && g <= 65535 && !isNaN(g));
  } catch { return false; }
}

function ipv6InBlock(addr, blockAddr, blockPlen) {
  try {
    const ip    = ipv6ToBigInt(addr);
    const bBase = ipv6ToBigInt(blockAddr);
    const mask  = blockPlen === 0 ? 0n : (~0n << BigInt(128 - blockPlen)) & ((1n << 128n) - 1n);
    const bEnd  = bBase | (~mask & ((1n << 128n) - 1n));
    return ip >= bBase && ip <= bEnd;
  } catch { return false; }
}

function ipv6Overlaps(addr1, plen1, addr2, plen2) {
  try {
    const makeRange = (addr, plen) => {
      const base = ipv6ToBigInt(addr);
      const mask = plen === 0 ? 0n : (~0n << BigInt(128 - plen)) & ((1n << 128n) - 1n);
      const start = base & mask;
      const end   = start | (~mask & ((1n << 128n) - 1n));
      return [start, end];
    };
    const [s1, e1] = makeRange(addr1, plen1);
    const [s2, e2] = makeRange(addr2, plen2);
    return s1 <= e2 && e1 >= s2;
  } catch { return false; }
}
// ────────────────────────────────────────────────────────────────

function validateSubnet(prefix, allocations, blockPrefix) {
  const errors   = [];
  const warnings = [];

  if (!prefix || !prefix.includes("/"))
    return { valid:false, errors:["Invalid prefix format (use CIDR notation)"], warnings };

  const [ip, plenStr] = prefix.split("/");
  const plen = parseInt(plenStr);
  const isV6 = ip.includes(":");

  try {
    if (isV6) {
      // ── IPv6 validation ──
      if (!isValidIPv6(ip))
        return { valid:false, errors:["Invalid IPv6 address"], warnings };
      if (isNaN(plen) || plen < 1 || plen > 128)
        return { valid:false, errors:["Invalid prefix length (1-128)"], warnings };

      // Block containment
      if (blockPrefix) {
        const [bAddr, bPlenStr] = blockPrefix.split("/");
        if (!ipv6InBlock(ip, bAddr, parseInt(bPlenStr)))
          errors.push(`Prefix is outside block ${blockPrefix}`);
      }

      // Overlap check
      for (const a of (allocations||[])) {
        if (a.status === "available") continue;
        if (!a.prefix.includes(":")) continue;
        try {
          const [aAddr, aPlenStr] = a.prefix.split("/");
          const aPlen = parseInt(aPlenStr);
          if (ipv6Overlaps(ip, plen, aAddr, aPlen)) {
            if (ip === aAddr && plen === aPlen)
              warnings.push(`Prefix already exists as ${a.prefix}`);
            else
              errors.push(`Overlaps with ${a.prefix} (${a.description||a.customer_name||"allocated"})`);
          }
        } catch {}
      }

    } else {
      // ── IPv4 validation ──
      const parts = ip.split(".").map(Number);
      if (parts.length !== 4 || parts.some(p=>isNaN(p)||p<0||p>255))
        return { valid:false, errors:["Invalid IPv4 address"], warnings };
      if (isNaN(plen) || plen < 1 || plen > 32)
        return { valid:false, errors:["Invalid prefix length (1-32)"], warnings };

      const ipInt = ipToInt(ip);
      const size  = Math.pow(2, 32-plen);
      const ipEnd = (ipInt + size - 1)>>>0;

      // Block containment
      if (blockPrefix) {
        const [bAddr, bPlen] = blockPrefix.split("/");
        const bStart = ipToInt(bAddr);
        const bSize  = Math.pow(2, 32-parseInt(bPlen));
        const bEnd   = (bStart+bSize-1)>>>0;
        if (ipInt < bStart || ipEnd > bEnd)
          errors.push(`Prefix is outside block ${blockPrefix}`);
      }

      // Alignment check
      if (!isAligned(ip, plen)) {
        const snapped = snapToBoundary(ip, plen);
        errors.push(`Not aligned — should start at ${snapped}/${plen}`);
      }

      // Overlap check
      for (const a of (allocations||[])) {
        if (a.status === "available") continue;
        if (a.prefix.includes(":")) continue;
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
      if (a.status === "available") continue;
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

function bigIntToIPv6(n) {
  const groups = [];
  for (let i = 0; i < 8; i++) {
    groups.unshift((n & 0xffffn).toString(16));
    n >>= 16n;
  }
  // Compress longest run of zeros
  let best = {start:-1,len:0}, cur = {start:-1,len:0};
  groups.forEach((g,i) => {
    if (g==="0") {
      if (cur.start<0) cur={start:i,len:1}; else cur.len++;
      if (cur.len>best.len) best={...cur};
    } else { cur={start:-1,len:0}; }
  });
  if (best.len > 1) {
    const left  = groups.slice(0,best.start).join(":");
    const right = groups.slice(best.start+best.len).join(":");
    return (left?left+":":"") + ":" + (right?right:"");
  }
  return groups.join(":");
}

function calcUsableRange(prefix) {
  if (!prefix) return "";
  try {
    const [addr, plenStr] = prefix.split("/");
    const plen = parseInt(plenStr);
    if (addr.includes(":")) {
      const base = ipv6ToBigInt(addr);
      const mask = plen === 0 ? 0n : (~0n << BigInt(128-plen)) & ((1n<<128n)-1n);
      const network = base & mask;
      const bcast   = network | (~mask & ((1n<<128n)-1n));
      if (plen === 128) return addr;
      if (plen === 127) return `${bigIntToIPv6(network)} — ${bigIntToIPv6(bcast)}`; // RFC 6164: both usable
      return `${bigIntToIPv6(network+1n)} — ${bigIntToIPv6(bcast-1n)}`;
    }
    // IPv4
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
    const [addr, plenStr] = prefix.split("/");
    const plen = parseInt(plenStr);
    if (addr.includes(":")) {
      if (plen === 128) return 1;
      if (plen === 127) return 2; // RFC 6164
      const total = 1n << BigInt(128-plen);
      const usable = total - 2n;
      return usable > BigInt(Number.MAX_SAFE_INTEGER) ? usable.toString() : Number(usable);
    }
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


const LabelRow = ({label, required, children}) => (
  <div>
    <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
      letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:6}}>
      {label}{required&&<span style={{color:"var(--danger)",marginLeft:2}}>*</span>}
    </label>
    {children}
  </div>
);

function AllocModal({ alloc, blockId, blockPrefix, prefillPrefix, customers, vlans, onClose, onSaved }) {
  const isV6    = blockPrefix?.includes(":");
  const isEdit  = !!alloc?.id;
  const MASKS   = isV6 ? V6_MASKS : V4_MASKS;

  const [prefix,      setPrefix]      = useState(prefillPrefix||alloc?.prefix||"");
  const [mask,        setMask]        = useState(parseInt((prefillPrefix||alloc?.prefix||"").split("/")[1])||30);
  const [ownerType,   setOwnerType]   = useState(alloc?.owner_type||"customer");
  const [custName,    setCustName]    = useState(alloc?.customer_name||"");
  const [vlanVid,     setVlanVid]     = useState(alloc?.vlan_vid?String(alloc.vlan_vid):"");
  const [status,      setStatus]      = useState(alloc?.status||"active");
  const [description, setDescription]= useState(alloc?.description||"");
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState(null);

  const custNames = customers.map(c=>c.name);
  const vlanVids  = vlans.map(v=>String(v.vid));

  // Load allocations into ref — no re-render on fetch complete
  const allocationsRef = useRef([]);
  const [allocLoaded, setAllocLoaded] = useState(false);
  useEffect(()=>{
    if (blockId) authFetch(`/api/v1/blocks/${blockId}`)
      .then(r=>r.json())
      .then(d=>{
        allocationsRef.current = (d.allocations||[]).filter(a=>!alloc?.id||a.id!==alloc?.id);
        setAllocLoaded(true);
      });
  },[blockId]);
  const allocations = allocationsRef.current;

  // Validate inline — no state update, no re-render, no focus loss
  // validation hanya saat save
  const isCompletePrefix = prefix && prefix.includes("/") && prefix.split("/")[1] !== "" &&
    (prefix.includes(":") || prefix.split(".").length === 4);
  const hasError = false;

  const handleMaskChange = (newPlen) => {
    setMask(newPlen);
    const newPrefix = changeMaskAligned(prefix, newPlen, allocations);
    setPrefix(newPrefix);
  };


  const save = async () => {
    if (!prefix) return setErr("Prefix is required");
    const vr = validateSubnet(prefix, allocations, blockPrefix);
    if (vr && !vr.valid) {
      const errMsg = vr.errors[0] || "Invalid prefix";
      // Cari rekomendasi: next valid boundary dengan mask yang sama
      try {
        const plen = parseInt(prefix.split("/")[1]);
        const rec = nextValidBoundary(0, plen, allocations);
        if (rec !== null) {
          const parts = blockPrefix.split(".");
          const base = (parseInt(parts[0])<<24)|(parseInt(parts[1])<<16)|(parseInt(parts[2])<<8);
          const ip = base + rec;
          const recIp = `${(ip>>24)&255}.${(ip>>16)&255}.${(ip>>8)&255}.${ip&255}`;
          return setErr(`${errMsg} — coba: ${recIp}/${plen}`);
        }
      } catch {}
      return setErr(errMsg);
    }
    setSaving(true); setErr(null);
    try {
      let customer_id = null;
      if (ownerType==="customer" && custName.trim()) {
        let cust = customers.find(c=>c.name.toLowerCase()===custName.trim().toLowerCase());
        if (!cust) {
          const r = await authFetch("/api/v1/customers",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({name:custName.trim(),is_active:true})
          });
          cust = await r.json();
        }
        customer_id = cust.id;
      }

      let vlan_id = null;
      if (vlanVid.trim() && !isNaN(parseInt(vlanVid))) {
        const vid = parseInt(vlanVid);
        let vlan = vlans.find(v=>v.vid===vid);
        if (!vlan) {
          const r = await authFetch("/api/v1/vlans",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({vid,name:"",status:"active"})
          });
          if (r.ok) vlan = await r.json();
        }
        vlan_id = vlan?.id||null;
      }

      const payload = {
        prefix, block_id:blockId, customer_id, vlan_id,
        status: ownerType==="reserved"?"available":status,
        owner_type: ownerType,
        description: description||(ownerType==="customer"?custName:""),
        notes: "",
      };

      if (isEdit) await updateAllocation(alloc.id, payload);
      else        await createAllocation(payload);
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  // LabelRow moved outside

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:560}}>
        <div className="modal-header">
          <div>
            <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>
              {isEdit?"Edit Allocation":"Add Allocation"}
            </div>
            <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>
              {blockPrefix}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
            color:"var(--text-muted)",fontSize:18,padding:4}}>✕</button>
        </div>

        <div className="modal-body" style={{display:"flex",flexDirection:"column",gap:14}}>
          {err&&<div style={{background:"var(--danger-surface)",border:"1px solid var(--danger-border)",
            borderRadius:"var(--radius-sm)",padding:"10px 14px",color:"var(--danger)",fontSize:13}}>{err}</div>}

          {/* Owner Type selector */}
          <LabelRow label="Type / Owner">
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {OWNER_TYPES.map(ot=>(
                <button key={ot.value} onClick={()=>setOwnerType(ot.value)}
                  style={{
                    display:"flex",alignItems:"center",gap:5,
                    padding:"5px 10px",borderRadius:99,fontSize:11,fontWeight:600,
                    cursor:"pointer",border:"1px solid",
                    background: ownerType===ot.value ? ot.color+"22" : "var(--surface-2)",
                    color:       ownerType===ot.value ? ot.color : "var(--text-muted)",
                    borderColor: ownerType===ot.value ? ot.color : "var(--border-soft)",
                    transition:"all var(--transition)",
                  }}>
                  <span>{ot.icon}</span>{ot.label}
                </button>
              ))}
            </div>
          </LabelRow>

          {/* Prefix with smart mask selector */}
          <LabelRow label="Prefix (CIDR)" required>
            <div style={{display:"flex",gap:6}}>
              <input
                ref={el=>{ if(el && document.activeElement!==el) el.value=prefix; }}
                defaultValue={prefix}
                onChange={e=>setPrefix(e.target.value)}
                placeholder={isV6
                  ? `e.g. ${blockPrefix?.split("/")?.[0]}1/127`
                  : `e.g. ${blockPrefix?.split(".")?.[0]}.${blockPrefix?.split(".")?.[1]}.${blockPrefix?.split(".")?.[2]}.4/30`}
                className="input" style={{
                  fontFamily:"var(--font-mono)",flex:1,
                  borderColor: "",
                }}/>
              {!isV6 && (
                <select
                  value={mask}
                  onChange={e=>handleMaskChange(parseInt(e.target.value))}
                  className="select"
                  style={{width:80,fontFamily:"var(--font-mono)",fontSize:13}}>
                  {V4_MASKS.map(p=><option key={p} value={p}>/{p}</option>)}
                </select>
              )}
            </div>


          </LabelRow>

          {/* Subnet breakdown info */}
          {prefix && prefix.includes("/") && prefix.split("/")[1] !== "" && !isV6 && (()=>{
            try {
              const plen = parseInt(prefix.split("/")[1]);
              const size = Math.pow(2, 32-plen);
              const breakdowns = [];
              if (plen < 31) breakdowns.push(`2× /${plen+1}`);
              if (plen < 30) breakdowns.push(`4× /${plen+2}`);
              if (plen < 29) breakdowns.push(`${Math.pow(2,Math.min(3,30-plen))}× /${Math.min(plen+3,31)}`);
              return breakdowns.length>0 ? (
                <div style={{marginTop:6,padding:"6px 10px",background:"var(--surface-1)",
                  borderRadius:"var(--radius-sm)",border:"1px solid var(--border-subtle)"}}>
                  <span style={{fontSize:10,color:"var(--text-dim)"}}>Can be split into: </span>
                  {breakdowns.map((b,i)=>(
                    <span key={i} style={{fontSize:11,fontFamily:"var(--font-mono)",
                      color:"var(--accent)",marginLeft:8}}>{b}</span>
                  ))}
                </div>
              ) : null;
            } catch { return null; }
          })()}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {/* Customer - only show if owner_type = customer */}
            {ownerType==="customer" && (
              <LabelRow label="Customer">
                <AutoInput value={custName} onChange={setCustName}
                  suggestions={custNames} placeholder="Type to search or create"
                  onCreate={v=>setCustName(v)}/>
              </LabelRow>
            )}

            {/* Description for non-customer */}
            {ownerType!=="customer" && (
              <LabelRow label="Description">
                <input value={description} onChange={e=>setDescription(e.target.value)}
                  placeholder="e.g. PTP Kediri-Jakarta" className="input" style={{fontSize:13}}/>
              </LabelRow>
            )}

            {/* VLAN */}
            <LabelRow label="VLAN ID">
              <AutoInput value={vlanVid} onChange={setVlanVid}
                suggestions={vlanVids} placeholder="e.g. 1336" mono/>
            </LabelRow>

            {/* Status */}
            <LabelRow label="Status">
              <select value={status} onChange={e=>setStatus(e.target.value)} className="select" style={{fontSize:13}}>
                {STATUS_OPTS.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
              </select>
            </LabelRow>


          </div>

          {/* Preview - only show when prefix is complete and valid */}
          {isCompletePrefix && !hasError && (
            <div style={{
              padding:"10px 14px",background:"var(--surface-1)",
              borderRadius:"var(--radius-sm)",border:"1px solid var(--border-subtle)",
              display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",
            }}>
              <div>
                <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:2}}>PREFIX</div>
                <div style={{fontFamily:"var(--font-mono)",fontSize:13,fontWeight:600,color:"var(--accent)"}}>{prefix}</div>
              </div>
              <div>
                <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:2}}>USABLE RANGE</div>
                <div style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--text-muted)"}}>
                  {calcUsableRange(prefix)||"—"}
                </div>
              </div>
              <div>
                <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:2}}>USABLE IPs</div>
                <div style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--text-muted)"}}>
                  {calcUsableCount(prefix)}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving||!prefix} className="btn btn-primary">
            {saving?"Saving…":isEdit?"Save Changes":"Add Allocation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CONFIRM MODAL ────────────────────────────────────────────────────────────
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

// ── BLOCK EDIT MODAL ─────────────────────────────────────────────────────────
function BlockEditModal({ block, sites, onClose, onSaved }) {
  const [form, setForm] = useState({
    prefix:      block.prefix||"",
    name:        block.name||"",
    asn:         block.asn||"",
    router:      block.router||"",
    operator:    block.operator||"",
    site_id:     block.site_id||"",
    status:      block.status||"active",
    description: block.description||"",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    setSaving(true); setErr(null);
    try { await updateBlock(block.id,form); onSaved(); }
    catch(e) { setErr(e.message); }
    setSaving(false);
  };

  const Field = ({label,k,placeholder,mono}) => (
    <div>
      <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
        letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:6}}>{label}</label>
      <input value={form[k]} onChange={e=>set(k)(e.target.value)} placeholder={placeholder}
        className="input" style={{fontFamily:mono?"var(--font-mono)":"inherit"}}/>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:520}}>
        <div className="modal-header">
          <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>Edit IP Block</div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",fontSize:18,padding:4}}>✕</button>
        </div>
        <div className="modal-body" style={{display:"flex",flexDirection:"column",gap:14}}>
          {err&&<div style={{background:"var(--danger-surface)",border:"1px solid var(--danger-border)",
            borderRadius:"var(--radius-sm)",padding:"10px 14px",color:"var(--danger)",fontSize:13}}>{err}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Prefix" k="prefix" placeholder="114.198.242.0/24" mono/>
            <Field label="Name"   k="name"   placeholder="Block name"/>
            <Field label="ASN"    k="asn"    placeholder="56246" mono/>
            <Field label="Router" k="router" placeholder="mx204-kediri" mono/>
            <div style={{gridColumn:"1/-1"}}><Field label="Operator" k="operator" placeholder="PT Sumber Data Indonesia"/></div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:6}}>Site</label>
              <select value={form.site_id} onChange={e=>set("site_id")(e.target.value)} className="select">
                <option value="">— No site —</option>
                {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:6}}>Status</label>
              <select value={form.status} onChange={e=>set("status")(e.target.value)} className="select">
                {["active","reserved","deprecated"].map(s=>(
                  <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving?"Saving…":"Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SUBNET CALCULATOR ────────────────────────────────────────────────────────
function SubnetCalc({ blockPrefix, allocations, onSelect }) {
  const isV6    = blockPrefix?.includes(":");
  const SIZES   = isV6 ? V6_MASKS : V4_MASKS;
  const [plen, setPlen] = useState(isV6?127:30);
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(()=>{
    if (isV6) { setSlots(allocations.filter(a=>a.status==="available").map(a=>a.prefix)); return; }
    try {
      const [blockAddr, blockPlenStr] = blockPrefix.split("/");
      const blockPlen = parseInt(blockPlenStr);
      if (plen < blockPlen) { setSlots([]); return; }
      const slotSize = Math.pow(2, 32-plen);
      const toInt = ip => { const p=ip.split(".").map(Number); return ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0; };
      const toIP  = n  => [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".");
      const blockStart = toInt(blockAddr);
      const blockSize  = Math.pow(2, 32-blockPlen);
      const blockEnd   = (blockStart+blockSize-1)>>>0;
      const used = allocations
        .filter(a=> a.status !== "available" && a.prefix !== blockPrefix)
        .map(a=>{
          try { const [addr,p]=a.prefix.split("/"); const s=toInt(addr); return {start:s>>>0,end:(s+Math.pow(2,32-parseInt(p))-1)>>>0}; }
          catch { return null; }
        }).filter(Boolean).sort((a,b)=>a.start-b.start);
      const found = []; let cursor = blockStart;
      if (cursor%slotSize!==0) cursor=cursor-cursor%slotSize+slotSize;
      outer: while (cursor+slotSize-1<=blockEnd && found.length<50) {
        let overlaps=false;
        for (const u of used) {
          if (cursor<=u.end && cursor+slotSize-1>=u.start) {
            cursor=(u.end+1)>>>0;
            if(cursor%slotSize!==0) cursor=cursor-cursor%slotSize+slotSize;
            overlaps=true; break;
          }
        }
        if (!overlaps) { found.push(`${toIP(cursor)}/${plen}`); cursor=(cursor+slotSize)>>>0; }
      }
      setSlots(found); setSelected(null);
    } catch { setSlots([]); }
  },[plen, allocations, blockPrefix]);

  return (
    <div style={{
      background:"var(--surface-1)",border:"1px solid var(--border-subtle)",
      borderRadius:"var(--radius)",padding:16,
    }}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>
          🧮 Subnet Calculator
          <span style={{fontSize:11,color:"var(--text-muted)",fontWeight:400,marginLeft:8}}>
            find available space in {blockPrefix}
          </span>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"flex-end",gap:12,marginBottom:12,flexWrap:"wrap"}}>
        <div>
          <label style={{display:"block",fontSize:10,fontWeight:600,textTransform:"uppercase",
            letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:6}}>Prefix Size</label>
          <select value={plen} onChange={e=>setPlen(parseInt(e.target.value))}
            className="select" style={{minWidth:200,fontSize:13}}>
            {SIZES.map(p=>(
              <option key={p} value={p}>
                /{p} — {isV6?`2^${128-p} IPs`:`${Math.pow(2,32-p)} IPs (${p<31?Math.pow(2,32-p)-2:Math.pow(2,32-p)} usable)`}
              </option>
            ))}
          </select>
        </div>
        <div style={{fontSize:12,paddingBottom:4}}>
          {slots.length===0
            ? <span style={{color:"var(--warning)"}}>⚠ No available slots</span>
            : <span style={{color:"var(--success)"}}>✓ {slots.length} slot{slots.length>1?"s":""} available</span>
          }
        </div>
      </div>

      {slots.length>0 && (
        <div>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",
            color:"var(--text-muted)",marginBottom:8}}>Available Slots — click to select</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:120,overflowY:"auto",marginBottom:10}}>
            {slots.map(s=>(
              <div key={s} onClick={()=>setSelected(s===selected?null:s)} style={{
                fontFamily:"var(--font-mono)",fontSize:11,padding:"4px 10px",
                borderRadius:"var(--radius-sm)",cursor:"pointer",
                border:`1px solid ${s===selected?"var(--accent)":"var(--border-soft)"}`,
                background: s===selected?"var(--accent-dim)":"var(--surface-2)",
                color: s===selected?"var(--accent)":"var(--text-muted)",
                transition:"all var(--transition)",
              }}>{s}</div>
            ))}
          </div>
          {selected && (
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
              background:"var(--surface-2)",borderRadius:"var(--radius-sm)",
              border:"1px solid var(--success-border)"}}>
              <span style={{fontSize:12,color:"var(--text-muted)"}}>Selected:</span>
              <span style={{fontFamily:"var(--font-mono)",fontSize:13,color:"var(--success)",fontWeight:600}}>{selected}</span>
              <button onClick={()=>onSelect(selected)} className="btn btn-primary btn-sm">Use This →</button>
              <button onClick={()=>setSelected(null)} className="btn btn-ghost btn-sm">Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export { BlockEditModal, ConfirmModal, SubnetCalc };
export default AllocModal;
