import { useState, useEffect, useCallback, useRef } from "react";
import { getBlock, updateBlock, getSites, getCustomers, getVlans,
         createAllocation, updateAllocation, deleteAllocation } from "../api.js";
import { C, Mono, StatusBadge, VersionBadge, Btn, Input, Select,
         SearchBar, Modal, Confirm, Alert } from "../components/ui.jsx";

// ── AUTOCOMPLETE INPUT ───────────────────────────────────────
function AutocompleteInput({ value, onChange, suggestions=[], placeholder, mono, onCreate }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState(value||"");
  const ref               = useRef();

  useEffect(()=>{ setQuery(value||""); },[value]);

  const filtered = query
    ? suggestions.filter(s=>s.toLowerCase().includes(query.toLowerCase())).slice(0,8)
    : suggestions.slice(0,8);

  const select = v => { setQuery(v); onChange(v); setOpen(false); };

  const handleKey = e => {
    if (e.key==="Enter") {
      if (filtered.length===1) select(filtered[0]);
      else if (query && onCreate) { onCreate(query); setOpen(false); }
      else if (query) onChange(query);
    }
    if (e.key==="Escape") setOpen(false);
  };

  return (
    <div ref={ref} style={{position:"relative"}}>
      <input
        value={query}
        onChange={e=>{ setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={()=>setOpen(true)}
        onBlur={()=>setTimeout(()=>setOpen(false),150)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        style={{
          width:"100%", boxSizing:"border-box",
          background:C.bg1, border:`1px solid ${C.border}`, color:C.text0,
          padding:"7px 11px", borderRadius:5, fontSize:13, outline:"none",
          fontFamily: mono?C.mono:"inherit",
        }}
        onFocus={e=>e.target.style.borderColor=C.blue}
        onBlur={e=>e.target.style.borderColor=C.border}
      />
      {open && (filtered.length>0 || (query && onCreate)) && (
        <div style={{
          position:"absolute", top:"100%", left:0, right:0, zIndex:100,
          background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:5,
          boxShadow:"0 8px 24px #0008", maxHeight:200, overflowY:"auto",
        }}>
          {filtered.map(s=>(
            <div key={s} onMouseDown={()=>select(s)} style={{
              padding:"7px 12px", cursor:"pointer", fontSize:12,
              color:C.text0, fontFamily:mono?C.mono:"inherit",
              borderBottom:`1px solid ${C.border}`,
            }}
            onMouseEnter={e=>e.currentTarget.style.background=C.bg3}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >{s}</div>
          ))}
          {query && !filtered.find(s=>s.toLowerCase()===query.toLowerCase()) && onCreate && (
            <div onMouseDown={()=>{ onCreate(query); setOpen(false); }} style={{
              padding:"7px 12px", cursor:"pointer", fontSize:12,
              color:C.green, borderTop:`1px solid ${C.border}`,
            }}>
              + Create "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── INLINE CELL ──────────────────────────────────────────────
function InlineCell({ value, onSave, type="text", mono, placeholder, suggestions=[], onCreate }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value||"");
  const ref                   = useRef();

  useEffect(()=>{ setVal(value||""); },[value]);
  useEffect(()=>{ if(editing && ref.current) ref.current.focus(); },[editing]);

  const commit = async v => {
    const final = v!==undefined ? v : val;
    setEditing(false);
    if (final !== (value||"")) await onSave(final||null);
  };

  const cancel = ()=>{ setEditing(false); setVal(value||""); };

  if (!editing) return (
    <div onClick={()=>setEditing(true)} title="Click to edit" style={{
      cursor:"text", padding:"2px 4px", borderRadius:3, minWidth:40,
      color: value?C.text0:C.text2, fontSize:12,
      fontFamily: mono?C.mono:"inherit",
      fontStyle: value?"normal":"italic",
      border:"1px solid transparent", transition:"border 0.1s",
    }}
    onMouseEnter={e=>e.currentTarget.style.borderColor=C.border2}
    onMouseLeave={e=>e.currentTarget.style.borderColor="transparent"}
    >{value||<span style={{color:C.text2,fontSize:11}}>{placeholder||"—"}</span>}</div>
  );

  if (suggestions.length>0) return (
    <AutocompleteInput
      value={val} onChange={v=>setVal(v)}
      suggestions={suggestions} mono={mono}
      placeholder={placeholder}
      onCreate={onCreate}
    />
  );

  return (
    <input ref={ref} value={val} autoFocus
      onChange={e=>setVal(e.target.value)}
      onBlur={()=>commit()}
      onKeyDown={e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape") cancel(); }}
      style={{
        background:C.bg3, border:`1px solid ${C.blue}`, color:C.text0,
        padding:"2px 6px", borderRadius:3, fontSize:12, outline:"none",
        fontFamily:mono?C.mono:"inherit", width:"100%", minWidth:60,
      }}
    />
  );
}

// ── SUBNET CALCULATOR ────────────────────────────────────────
function calcAvailableSlots(blockPrefix, allocations, prefixLen) {
  const isV6 = blockPrefix.includes(":");
  if (isV6) {
    // IPv6: show available slots from existing available allocations
    return allocations
      .filter(a=>a.status==="available")
      .map(a=>a.prefix);
  }

  try {
    const [blockAddr, blockPlenStr] = blockPrefix.split("/");
    const blockPlen = parseInt(blockPlenStr);
    const slotSize  = Math.pow(2, 32-prefixLen);
    if (prefixLen < blockPlen) return [];

    const toInt = ip => {
      const p = ip.split(".").map(Number);
      return ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0;
    };
    const toIP = n => [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".");

    const blockStart = toInt(blockAddr);
    const blockSize  = Math.pow(2, 32-blockPlen);
    const blockEnd   = (blockStart+blockSize-1)>>>0;

    // build used ranges from allocations
    const used = allocations.map(a=>{
      try {
        const [addr,plen] = a.prefix.split("/");
        const s = toInt(addr);
        const sz = Math.pow(2,32-parseInt(plen));
        return {start:s>>>0, end:(s+sz-1)>>>0};
      } catch { return null; }
    }).filter(Boolean).sort((a,b)=>a.start-b.start);

    const slots = [];
    let cursor = blockStart;
    // align cursor to slot boundary
    if (cursor%slotSize!==0) cursor=cursor-cursor%slotSize+slotSize;

    const addSlot = () => {
      if (cursor+slotSize-1<=blockEnd) {
        slots.push(`${toIP(cursor)}/${prefixLen}`);
      }
    };

    outer: while (cursor+slotSize-1<=blockEnd && slots.length<50) {
      // check if cursor overlaps any used range
      let overlaps = false;
      for (const u of used) {
        if (cursor<=u.end && cursor+slotSize-1>=u.start) {
          // overlap — skip past this used range
          cursor = (u.end+1)>>>0;
          // realign
          if (cursor%slotSize!==0) cursor=cursor-cursor%slotSize+slotSize;
          overlaps=true;
          break;
        }
      }
      if (!overlaps) {
        addSlot();
        cursor=(cursor+slotSize)>>>0;
      }
    }
    return slots;
  } catch(e) {
    console.error(e); return [];
  }
}

function SubnetCalculator({ blockPrefix, allocations, onSelect }) {
  const isV6 = blockPrefix?.includes(":");
  const V4_SIZES = [24,25,26,27,28,29,30,31].map(p=>({value:p,label:`/${p} — ${Math.pow(2,32-p)} addr (${Math.pow(2,32-p)-2} usable)`}));
  const V6_SIZES = [64,96,112,120,124,126,127].map(p=>({value:p,label:`/${p}`}));

  const [prefixLen, setPrefixLen] = useState(isV6?127:30);
  const [slots, setSlots]         = useState([]);
  const [selected, setSelected]   = useState(null);

  useEffect(()=>{
    const s = calcAvailableSlots(blockPrefix, allocations, prefixLen);
    setSlots(s);
    setSelected(null);
  },[prefixLen, allocations, blockPrefix]);

  return (
    <div style={{background:C.bg2,border:`1px solid ${C.blue}33`,borderRadius:8,padding:18,marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{color:C.text0,fontWeight:600,fontSize:13}}>
          🧮 Subnet Calculator
          <span style={{color:C.text2,fontWeight:400,fontSize:11,marginLeft:8}}>
            — find available address space in {blockPrefix}
          </span>
        </div>
      </div>

      <div style={{display:"flex",gap:12,alignItems:"flex-end",marginBottom:14}}>
        <div>
          <div style={{color:C.text2,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Requested Prefix Size</div>
          <select value={prefixLen} onChange={e=>setPrefixLen(parseInt(e.target.value))}
            style={{background:C.bg1,border:`1px solid ${C.border}`,color:C.text0,padding:"7px 14px",borderRadius:5,fontSize:13,minWidth:280}}>
            {(isV6?V6_SIZES:V4_SIZES).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{color:C.text2,fontSize:11,paddingBottom:8}}>
          {slots.length===0
            ? <span style={{color:C.amber}}>⚠ No available slots</span>
            : <span style={{color:C.green}}>✓ {slots.length} slot{slots.length>1?"s":""} available</span>
          }
        </div>
      </div>

      {slots.length>0 && (
        <>
          <div style={{color:C.text2,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>
            Available Slots — click to select
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:160,overflowY:"auto",marginBottom:12}}>
            {slots.map(s=>(
              <div key={s} onClick={()=>setSelected(s===selected?null:s)}
                style={{
                  fontFamily:C.mono, fontSize:12, padding:"5px 12px", borderRadius:4,
                  border:`1px solid ${s===selected?C.blue:C.border}`,
                  background: s===selected?"#1d4ed822":C.bg1,
                  color: s===selected?C.blue:C.text1,
                  cursor:"pointer", transition:"all 0.1s",
                }}>
                {s}
              </div>
            ))}
          </div>
        </>
      )}

      {selected && (
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:C.bg1,borderRadius:6,border:`1px solid ${C.green}44`}}>
          <span style={{color:C.text2,fontSize:12}}>Selected:</span>
          <Mono color={C.green} size={13}>{selected}</Mono>
          <Btn size="sm" variant="success" onClick={()=>onSelect(selected)}>
            Use This Prefix →
          </Btn>
          <Btn size="sm" variant="ghost" onClick={()=>setSelected(null)}>Clear</Btn>
        </div>
      )}
    </div>
  );
}

// ── ADD/EDIT ALLOCATION MODAL ────────────────────────────────
function AllocModal({ alloc, blockId, blockPrefix, prefillPrefix, customers, vlans, onClose, onSaved }) {
  const isV6      = blockPrefix?.includes(":");
  const V4_SIZES  = [24,25,26,27,28,29,30,31];
  const V6_SIZES  = [64,96,112,120,124,126,127];
  const SIZES     = isV6?V6_SIZES:V4_SIZES;

  const parsePrefixLen = p => parseInt((p||"").split("/")?.[1]||( isV6?127:30));

  const [prefixMode, setPrefixMode]   = useState(prefillPrefix?"manual":"calc");
  const [prefixLen, setPrefixLen]     = useState(parsePrefixLen(prefillPrefix||alloc?.prefix));
  const [selectedSlot, setSelectedSlot] = useState(prefillPrefix||"");
  const [manualPrefix, setManualPrefix] = useState(alloc?.prefix||prefillPrefix||"");
  const [customerName, setCustomerName] = useState(alloc?.customer_name||"");
  const [vlanVid, setVlanVid]         = useState(alloc?.vlan_id?String(alloc.vlan_id):"");
  const [status, setStatus]           = useState(alloc?.status||"active");
  const [description, setDescription] = useState(alloc?.description||"");
  const [notes, setNotes]             = useState(alloc?.notes||"");
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState(null);
  const [allocations, setAllocations] = useState([]);

  const custNames = customers.map(c=>c.name);
  const vlanVids  = vlans.map(v=>String(v.vid));

  useEffect(()=>{
    // load block allocations for calculator
    if (blockId) {
      fetch(`/api/v1/blocks/${blockId}`)
        .then(r=>r.json())
        .then(d=>setAllocations(d.allocations||[]));
    }
  },[blockId]);

  const finalPrefix = prefixMode==="manual" ? manualPrefix : selectedSlot;

  const save = async () => {
    if (!finalPrefix) return setErr("Prefix is required — select from calculator or enter manually");
    setSaving(true); setErr(null);
    try {
      // resolve or create customer
      let customer_id = null;
      if (customerName.trim()) {
        let cust = customers.find(c=>c.name.toLowerCase()===customerName.trim().toLowerCase());
        if (!cust) {
          const r = await fetch("/api/v1/customers",{
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({name:customerName.trim(),is_active:true})
          });
          if (!r.ok) throw new Error("Failed to create customer");
          cust = await r.json();
        }
        customer_id = cust.id;
      }

      // resolve or create VLAN
      let vlan_id = null;
      if (vlanVid.trim() && !isNaN(parseInt(vlanVid))) {
        const vid = parseInt(vlanVid);
        let vlan = vlans.find(v=>v.vid===vid);
        if (!vlan) {
          // create VLAN without site
          const r = await fetch("/api/v1/vlans",{
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({vid, name:"", status:"active"})
          });
          if (r.ok) { vlan = await r.json(); }
        }
        vlan_id = vlan?.id||null;
      }

      const payload = {
        prefix:      finalPrefix,
        block_id:    blockId,
        customer_id, vlan_id,
        status:      customerName.trim() ? "active" : status,
        description: description||customerName||"",
        notes:       notes||"",
      };

      if (alloc?.id) await updateAllocation(alloc.id, payload);
      else           await createAllocation(payload);
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <Modal title={alloc?.id?"Edit Allocation":"Add Allocation"} onClose={onClose} width={620}>
      {err && <Alert type="error" message={err}/>}

      {/* Prefix selection */}
      <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:6,padding:14,marginBottom:14}}>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <Btn size="sm" variant={prefixMode==="calc"?"primary":"ghost"} onClick={()=>setPrefixMode("calc")}>
            🧮 From Calculator
          </Btn>
          <Btn size="sm" variant={prefixMode==="manual"?"primary":"ghost"} onClick={()=>setPrefixMode("manual")}>
            ✏ Manual Input
          </Btn>
        </div>

        {prefixMode==="calc" ? (
          <>
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:10}}>
              <div style={{flex:1}}>
                <div style={{color:C.text2,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Prefix Size</div>
                <select value={prefixLen} onChange={e=>{ setPrefixLen(parseInt(e.target.value)); setSelectedSlot(""); }}
                  style={{width:"100%",background:C.bg2,border:`1px solid ${C.border}`,color:C.text0,padding:"7px 10px",borderRadius:5,fontSize:13}}>
                  {SIZES.map(p=>{
                    const hosts = isV6 ? `2^${128-p}` : `${Math.pow(2,32-p)} addr`;
                    return <option key={p} value={p}>/{p} — {hosts}</option>;
                  })}
                </select>
              </div>
            </div>

            {/* Available slots */}
            {allocations.length>0 && (()=>{
              const slots = calcAvailableSlots(blockPrefix, allocations, prefixLen);
              return slots.length>0 ? (
                <div>
                  <div style={{color:C.text2,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>
                    Available Slots ({slots.length}) — click to select
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,maxHeight:120,overflowY:"auto"}}>
                    {slots.map(s=>(
                      <div key={s} onClick={()=>setSelectedSlot(s===selectedSlot?"":s)}
                        style={{
                          fontFamily:C.mono, fontSize:12, padding:"4px 10px", borderRadius:4,
                          border:`1px solid ${s===selectedSlot?C.green:C.border}`,
                          background: s===selectedSlot?"#15803d22":C.bg2,
                          color: s===selectedSlot?C.green:C.text1,
                          cursor:"pointer",
                        }}>
                        {s}
                      </div>
                    ))}
                  </div>
                  {selectedSlot && (
                    <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{color:C.text2,fontSize:11}}>Selected:</span>
                      <Mono color={C.green}>{selectedSlot}</Mono>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{color:C.amber,fontSize:12,padding:"8px 0"}}>
                  ⚠ No available /{prefixLen} slots in this block
                </div>
              );
            })()}
          </>
        ) : (
          <Input label="Prefix (CIDR)" value={manualPrefix} onChange={setManualPrefix}
            placeholder={isV6?"e.g. 2404:fd00:36::2/127":"e.g. 114.198.242.4/30"} mono required/>
        )}

        {finalPrefix && (
          <div style={{marginTop:10,padding:"6px 10px",background:C.bg0,borderRadius:4,display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:C.text2,fontSize:11}}>Will allocate:</span>
            <Mono color={C.green} size={13}>{finalPrefix}</Mono>
          </div>
        )}
      </div>

      {/* Customer */}
      <div style={{marginBottom:14}}>
        <div style={{color:C.text2,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>
          Customer <span style={{color:C.text2,fontWeight:400,textTransform:"none",letterSpacing:0}}>(type to search or create new)</span>
        </div>
        <AutocompleteInput
          value={customerName}
          onChange={setCustomerName}
          suggestions={custNames}
          placeholder="Customer name — type to search or create new"
          onCreate={v=>setCustomerName(v)}
        />
      </div>

      {/* VLAN */}
      <div style={{marginBottom:14}}>
        <div style={{color:C.text2,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>
          VLAN ID <span style={{color:C.text2,fontWeight:400,textTransform:"none",letterSpacing:0}}>(type VID — existing or new)</span>
        </div>
        <AutocompleteInput
          value={vlanVid}
          onChange={setVlanVid}
          suggestions={vlanVids}
          placeholder="e.g. 1336"
          mono
        />
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Select label="Status" value={status} onChange={setStatus}
          options={["active","available","reserved","deprecated"].map(s=>({value:s,label:s}))}/>
        <Input label="Description" value={description} onChange={setDescription} placeholder="Usage description"/>
      </div>
      <Input label="Notes" value={notes} onChange={setNotes} placeholder="Additional notes"/>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving||!finalPrefix}>
          {saving?"Saving…":alloc?.id?"Save Changes":"Add Allocation"}
        </Btn>
      </div>
    </Modal>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────
export default function BlockDetail({ blockId, onBack }) {
  const [data, setData]             = useState(null);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState(null);
  const [editModal, setEditModal]   = useState(false);
  const [allocModal, setAllocModal] = useState(null);
  const [confirm, setConfirm]       = useState(null);
  const [sites, setSites]           = useState([]);
  const [customers, setCustomers]   = useState([]);
  const [vlans, setVlans]           = useState([]);
  const [saveMsg, setSaveMsg]       = useState(null);

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
      description: alloc.description||"",
      notes:       alloc.notes||"",
    };

    if (field==="customer_name") {
      if (!value) { payload.customer_id=null; }
      else {
        let cust = customers.find(c=>c.name.toLowerCase()===value.toLowerCase());
        if (!cust) {
          const r = await fetch("/api/v1/customers",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({name:value,is_active:true})
          });
          cust = await r.json();
          setCustomers(prev=>[...prev,cust]);
        }
        payload.customer_id = cust.id;
        payload.status = "active";
      }
    } else if (field==="vlan_vid") {
      if (!value) { payload.vlan_id=null; }
      else {
        const vid = parseInt(value);
        let vlan = vlans.find(v=>v.vid===vid);
        if (!vlan) {
          const r = await fetch("/api/v1/vlans",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({vid,name:"",status:"active"})
          });
          if (r.ok) { vlan=await r.json(); setVlans(prev=>[...prev,vlan]); }
        }
        payload.vlan_id = vlan?.id||null;
      }
    } else if (field==="status")      { payload.status=value; }
    else if (field==="description")   { payload.description=value||""; }
    else if (field==="notes")         { payload.notes=value||""; }

    try {
      await updateAllocation(allocId,payload);
      setSaveMsg("Saved ✓");
      setTimeout(()=>setSaveMsg(null),1500);
      load();
    } catch(e) {
      setSaveMsg("Error: "+e.message);
      setTimeout(()=>setSaveMsg(null),3000);
    }
  };

  const allocs = (data?.allocations||[]).filter(a=>{
    const ms = !search ||
      a.prefix?.includes(search) ||
      (a.customer_name||"").toLowerCase().includes(search.toLowerCase()) ||
      (a.description||"").toLowerCase().includes(search.toLowerCase()) ||
      String(a.vlan_id||"").includes(search);
    const mf = !statusFilter || a.status===statusFilter;
    return ms && mf;
  });

  const custNames = customers.map(c=>c.name);
  const vlanVids  = vlans.map(v=>String(v.vid));
  const statusOpts= ["active","available","reserved","deprecated"].map(s=>({value:s,label:s}));

  const activeCount    = (data?.allocations||[]).filter(a=>a.status==="active").length;
  const availableCount = (data?.allocations||[]).filter(a=>a.status==="available").length;
  const totalCount     = (data?.allocations||[]).length;
  const utilPct        = totalCount?Math.round(activeCount/totalCount*100):0;
  const utilColor      = utilPct>85?C.red:utilPct>60?C.amber:C.green;

  const isV6block = data?.prefix?.includes(":");

  const calcUsableRange = (prefix) => {
    if (!prefix) return "";
    try {
      if (prefix.includes(":")) return prefix; // IPv6 - show as-is
      const [addr, plenStr] = prefix.split("/");
      const plen = parseInt(plenStr);
      const parts = addr.split(".").map(Number);
      const toInt = p => ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0;
      const toIP = n => [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".");
      const base = toInt(parts);
      const size = Math.pow(2, 32 - plen);
      if (plen === 32) return addr;
      if (plen === 31) return `${addr} – ${toIP((base+1)>>>0)}`;
      const first = toIP((base+1)>>>0);
      const last  = toIP((base+size-2)>>>0);
      return `${first} – ${last}`;
    } catch { return ""; }
  };

  const V4_MASKS = [24,25,26,27,28,29,30,31];
  const V6_MASKS = [48,56,64,96,112,120,124,126,127];

  const changeMask = async (alloc, newPlen) => {
    const [addr] = alloc.prefix.split("/");
    const newPrefix = `${addr}/${newPlen}`;
    const payload = {
      prefix:      newPrefix,
      block_id:    blockId,
      customer_id: alloc.customer_id||null,
      vlan_id:     alloc.vlan_id||null,
      status:      alloc.status,
      description: alloc.description||"",
      notes:       alloc.notes||"",
    };
    try {
      await updateAllocation(alloc.id, payload);
      setSaveMsg("Saved ✓");
      setTimeout(()=>setSaveMsg(null),1500);
      load();
    } catch(e) {
      setSaveMsg("Error: "+e.message);
      setTimeout(()=>setSaveMsg(null),3000);
    }
  };

  const COLS = [
    { label:"#",           width:36,  render:(_,i)=><span style={{color:C.text2,fontFamily:C.mono,fontSize:10}}>{i+1}</span> },
    { label:"Customer ✎",  width:200, render:r=>(
      <InlineCell value={r.customer_name} placeholder="click to assign"
        suggestions={custNames} onCreate={v=>saveField(r.id,"customer_name",v)}
        onSave={v=>saveField(r.id,"customer_name",v)} />
    )},
    { label:"VLAN ✎",      width:80,  render:r=>(
      <InlineCell value={r.vlan_id?String(r.vlan_id):""} placeholder="—"
        suggestions={vlanVids} mono
        onSave={v=>saveField(r.id,"vlan_vid",v)} />
    )},
    { label:"Network IP",  width:150, render:r=><span style={{fontFamily:C.mono,fontSize:12,color:C.text0}}>{r.prefix?.split("/")?.[0]}</span> },
    { label:"/Mask ▼",     width:80,  render:r=>(
      <select value={r.prefix?.split("/")?.[1]||""}
        onChange={e=>changeMask(r, parseInt(e.target.value))}
        onClick={e=>e.stopPropagation()}
        style={{background:"transparent",border:`1px solid ${C.border}`,color:C.cyan,
          fontSize:11,fontFamily:C.mono,cursor:"pointer",outline:"none",
          borderRadius:4,padding:"2px 4px"
        }}>
        {(isV6block?V6_MASKS:V4_MASKS).map(p=>(
          <option key={p} value={p} style={{background:C.bg2,color:C.text0}}>/{p}</option>
        ))}
      </select>
    )},
    { label:"Usable Range", width:220, render:r=><span style={{fontFamily:C.mono,fontSize:11,color:C.text2}}>{calcUsableRange(r.prefix)}</span> },
    { label:"Description ✎",width:180, render:r=>(
      <InlineCell value={r.description} placeholder="add description"
        onSave={v=>saveField(r.id,"description",v)} />
    )},
    { label:"Notes ✎",     width:140, render:r=>(
      <InlineCell value={r.notes} placeholder="add notes"
        onSave={v=>saveField(r.id,"notes",v)} />
    )},
    { label:"Status ▼",    width:120, render:r=>(
      <select value={r.status}
        onChange={e=>saveField(r.id,"status",e.target.value)}
        onClick={e=>e.stopPropagation()}
        style={{background:"transparent",border:"none",color:
          r.status==="active"?C.green:r.status==="available"?C.cyan:
          r.status==="reserved"?C.purple:C.amber,
          fontSize:11,fontFamily:C.mono,cursor:"pointer",outline:"none",
          textTransform:"uppercase",fontWeight:600,letterSpacing:"0.04em"
        }}>
        {statusOpts.map(o=><option key={o.value} value={o.value} style={{background:C.bg2,color:C.text0}}>{o.label}</option>)}
      </select>
    )},
    { label:"Del",          width:50,  render:r=>(
      <Btn size="sm" variant="danger" onClick={e=>{e.stopPropagation();setConfirm(r);}}>✕</Btn>
    )},
  ];

  if (loading) return <div style={{color:C.text2,padding:60,textAlign:"center"}}>Loading…</div>;
  if (err)     return <Alert type="error" message={err}/>;
  if (!data)   return null;

  return (
    <div>
      {saveMsg && (
        <div style={{
          position:"fixed",top:16,right:20,zIndex:999,
          background:saveMsg.startsWith("Error")?C.red+"22":"#052010",
          border:`1px solid ${saveMsg.startsWith("Error")?C.red:C.green}`,
          color:saveMsg.startsWith("Error")?C.red:C.green,
          padding:"8px 16px",borderRadius:6,fontSize:12,fontFamily:C.mono,
          boxShadow:"0 4px 12px #0006",
        }}>{saveMsg}</div>
      )}

      {/* Block header */}
      <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:18,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <VersionBadge v={data.ip_version}/>
            <Mono size={20} color={C.text0}>{data.prefix}</Mono>
            <StatusBadge status={data.status}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn size="sm" variant="ghost" onClick={()=>setEditModal(true)}>Edit Block</Btn>
            <Btn size="sm" onClick={()=>setAllocModal({})}>+ Add Allocation</Btn>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:12}}>
          {[["Name",data.name],["ASN",data.asn],["Router",data.router],["Operator",data.operator],["Site",data.site_name]].map(([k,v])=>(
            <div key={k} style={{background:C.bg1,borderRadius:5,padding:"8px 12px",border:`1px solid ${C.border}`}}>
              <div style={{color:C.text2,fontSize:9,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{k}</div>
              <div style={{color:C.text0,fontFamily:C.mono,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v||"—"}</div>
            </div>
          ))}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{flex:1,height:4,background:C.bg1,borderRadius:2,overflow:"hidden"}}>
            <div style={{width:`${utilPct}%`,height:"100%",background:utilColor,borderRadius:2,transition:"width 0.4s"}}/>
          </div>
          <span style={{color:utilColor,fontFamily:C.mono,fontSize:11,minWidth:36}}>{utilPct}%</span>
          {[["Total",totalCount,C.text1],["Active",activeCount,C.green],["Available",availableCount,C.cyan]].map(([l,v,c])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{color:C.text2,fontSize:11}}>{l}:</span>
              <span style={{color:c,fontFamily:C.mono,fontSize:12,fontWeight:600}}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Subnet calculator - always visible panel */}
      <SubnetCalculator
        blockPrefix={data.prefix}
        allocations={data.allocations||[]}
        onSelect={prefix=>{
          setAllocModal({prefix});
        }}
      />
      {/* Allocation table */}
      <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search prefix, customer, VLAN…" width={260}/>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
              style={{background:C.bg1,border:`1px solid ${C.border}`,color:C.text1,padding:"6px 10px",borderRadius:5,fontSize:11}}>
              <option value="">All Status</option>
              {["active","available","reserved","deprecated"].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <span style={{color:C.text2,fontSize:11}}>{allocs.length} rows</span>
          </div>
          <span style={{color:C.text2,fontSize:10,fontStyle:"italic"}}>✎ Click any cell to edit inline</span>
        </div>

        <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"calc(100vh - 360px)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead style={{position:"sticky",top:0,zIndex:10}}>
              <tr style={{background:C.bg1,borderBottom:`2px solid ${C.border2}`}}>
                {COLS.map((col,i)=>(
                  <th key={i} style={{
                    textAlign:"left",padding:"7px 10px",
                    color:C.text2,fontSize:10,fontWeight:600,
                    textTransform:"uppercase",letterSpacing:"0.07em",
                    whiteSpace:"nowrap",borderRight:`1px solid ${C.border}`,
                    minWidth:col.width||80,
                  }}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allocs.length===0
                ? <tr><td colSpan={COLS.length} style={{padding:"48px 0",textAlign:"center",color:C.text2}}>No allocations found.</td></tr>
                : allocs.map((row,i)=>(
                  <tr key={row.id}
                    style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.bg1:C.bg0}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.bg3}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2===0?C.bg1:C.bg0}
                  >
                    {COLS.map((col,j)=>(
                      <td key={j} style={{
                        padding:"4px 10px",borderRight:`1px solid ${C.border}`,
                        whiteSpace:"nowrap",maxWidth:col.width||240,
                        overflow:"hidden",
                      }}>
                        {col.render(row,i)}
                      </td>
                    ))}
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {editModal && (
        <BlockEditModal block={data} siteOpts={sites.map(s=>({value:s.id,label:s.name}))}
          onClose={()=>setEditModal(false)} onSaved={()=>{setEditModal(false);load();}}/>
      )}
      {allocModal!==null && (
        <AllocModal
          alloc={allocModal?.id?allocModal:null}
          blockId={blockId}
          blockPrefix={data.prefix}
          prefillPrefix={allocModal?.prefix}
          customers={customers} vlans={vlans}
          onClose={()=>setAllocModal(null)}
          onSaved={()=>{
            setAllocModal(null);
            load();
            getCustomers("",500).then(d=>setCustomers(d.items||[]));
            getVlans("","",500).then(d=>setVlans(d.items||[]));
          }}
        />
      )}
      {confirm && (
        <Confirm
          message={`Delete allocation ${confirm.prefix}?`}
          onConfirm={async()=>{ await deleteAllocation(confirm.id); setConfirm(null); load(); }}
          onCancel={()=>setConfirm(null)}
        />
      )}
    </div>
  );
}

function BlockEditModal({ block, siteOpts, onClose, onSaved }) {
  const [form, setForm] = useState({
    prefix:block.prefix||"", name:block.name||"", asn:block.asn||"",
    router:block.router||"", operator:block.operator||"",
    site_id:block.site_id||"", status:block.status||"active", description:block.description||"",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);
  const set = k => v => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    setSaving(true); setErr(null);
    try { await updateBlock(block.id,form); onSaved(); }
    catch(e) { setErr(e.message); }
    setSaving(false);
  };
  return (
    <Modal title="Edit IP Block" onClose={onClose}>
      {err && <Alert type="error" message={err}/>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Input label="Prefix" value={form.prefix} onChange={set("prefix")} mono required/>
        <Input label="Name" value={form.name} onChange={set("name")}/>
        <Input label="ASN" value={form.asn} onChange={set("asn")} mono/>
        <Input label="Router" value={form.router} onChange={set("router")} mono/>
        <div style={{gridColumn:"1/-1"}}><Input label="Operator" value={form.operator} onChange={set("operator")}/></div>
        <Select label="Site" value={form.site_id} onChange={set("site_id")} options={siteOpts}/>
        <Select label="Status" value={form.status} onChange={set("status")}
          options={["active","reserved","deprecated"].map(s=>({value:s,label:s}))}/>
        <div style={{gridColumn:"1/-1"}}><Input label="Description" value={form.description} onChange={set("description")}/></div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving?"Saving…":"Save"}</Btn>
      </div>
    </Modal>
  );
}
