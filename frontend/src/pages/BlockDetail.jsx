import { useState, useEffect, useCallback, useRef, memo } from "react";
import AllocModal, { BlockEditModal, SubnetCalc } from "./AllocModal.jsx";
import { Confirm } from "../components/ui.jsx";
import { AutoInput, InlineCell } from "../components/FormComponents.jsx";
import { OWNER_TYPES as OWNER_TYPE_VALUES, ALLOC_STATUS_OPTS } from "../constants.js";
import IPGrid from "./IPGrid.jsx";
import { createPortal } from "react-dom";
import { getBlock, updateBlock, getSites, getCustomers, getVlans,
         createAllocation, updateAllocation, deleteAllocation, createCustomer, createVlan, authFetch} from "../api.js";
import { ipToInt, intToIp, isAligned, snapToBoundary, nextValidBoundary,
         validateSubnet, changeMaskAligned, ipv6ToBigIntBD, bigIntToIPv6BD,
         calcUsableRange, calcUsableCount, ownerInfo as ownerInfoHelper } from "../utils/ipHelpers.js";

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const OWNER_TYPE_LABEL_OVERRIDE = { internal: "Infrastructure" };
const OWNER_TYPES = OWNER_TYPE_VALUES.map(o => ({
  ...o,
  label: OWNER_TYPE_LABEL_OVERRIDE[o.value] || o.label,
  color: o.value === "reserved" ? "var(--text-dim)" : "var(--text-muted)",
  icon: "",
}));

const STATUS_OPTS = ALLOC_STATUS_OPTS;

const STATUS_STYLE = {
  active:     { color:"var(--success)",  bg:"var(--success-surface)", border:"var(--success-border)", label:"Active" },
  available:  { color:"var(--text-muted)", bg:"transparent",          border:"var(--border-soft)", label:"Free" },
  reserved:   { color:"var(--text-dim)",   bg:"transparent",          border:"var(--border-soft)", label:"Reserved" },
  deprecated: { color:"var(--warning)",  bg:"var(--warning-surface)", border:"var(--warning-border)", label:"Deprecated" },
};

const V4_MASKS = [24,25,26,27,28,29,30,31];
const V6_MASKS = [48,56,64,96,112,120,124,126,127];

// ── HELPERS ──────────────────────────────────────────────────────────────────
function ownerInfo(type) {
  return ownerInfoHelper(type, OWNER_TYPES);
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
  const [showFullTable, setShowFullTable] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [saveMsg,   setSaveMsg]   = useState(null);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const allocs = data?.allocations?.filter(a => (!statusFilter || a.status===statusFilter) && (!ownerFilter || a.owner_type===ownerFilter)) || [];
    if (selected.size === allocs.length && allocs.length > 0) setSelected(new Set());
    else setSelected(new Set(allocs.map(a => a.id)));
  };
  const bulkDelete = async () => {
    if (selected.size === 0) return;
    const msg = `Delete ${selected.size} allocation${selected.size>1?'s':''}?`;
    setConfirm({bulk: true, message: msg, ids: [...selected]});
  };

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
        // If this allocation is already linked to a customer, RENAME that
        // same customer instead of searching by name. Searching by exact
        // string match was creating a brand-new (duplicate) customer any
        // time the name changed even slightly, leaving the old customer
        // row orphaned with zero allocations.
        let cust = alloc.customer_id ? customers.find(c=>c.id===alloc.customer_id) : null;
        if (cust) {
          if (cust.name !== value) {
            await authFetch(`/api/v1/customers/${cust.id}`, {method:"PUT",
              headers:{"Content-Type":"application/json"},
              body:JSON.stringify({name:value,is_active:cust.is_active,source:cust.source||"dynamic"})});
            cust = { ...cust, name: value };
            setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, name: value } : c));
          }
        } else {
          // No customer linked yet on this allocation: match an existing
          // customer by exact name (user picked from suggestions), or
          // create a new one if none matches.
          cust=customers.find(c=>c.name.toLowerCase().replace(/["'']/g,'').trim()===value.toLowerCase().replace(/["'']/g,'').trim());
          if (!cust) {
            const r=await authFetch("/api/v1/customers",{method:"POST",
              headers:{"Content-Type":"application/json"},
              body:JSON.stringify({name:value,is_active:true,source:"dynamic"})});
            cust=await r.json();
            setCustomers(prev=>[...prev,cust]);
          }
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
          const r=await authFetch("/api/v1/vlans",{method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({vid,name:`VLAN ${vid}`,status:"active",source:"dynamic"})});
          if(r.ok){vlan=await r.json();setVlans(prev=>[...prev,vlan]);}
        } else if (vlan.source === "dynamic" && (!vlan.name || vlan.name.startsWith("VLAN "))) {
          // Auto-sync: update vlan name dari allocation description
          const desc = data?.allocations?.find(a => a.vlan_id === vlan.id)?.description || vlan.name;
          if (desc !== vlan.name) {
            await authFetch(`/api/v1/vlans/${vlan.id}`, {method:"PUT",
              headers:{"Content-Type":"application/json"},
              body:JSON.stringify({name:desc,source:"dynamic"})});
            setVlans(prev => prev.map(v => v.id === vlan.id ? { ...v, name: desc } : v));
          }
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
      // optimistic update dengan recalculate stats - NO rough reload!
      setData(prev => {
        if (!prev) return prev;
        const updatedAllocations = prev.allocations.map(a =>
          a.id === allocId ? {
            ...a,
            ...payload,
            customer_name: field==="customer_name" ? value : a.customer_name,
            vlan_vid: field==="vlan_vid" ? (value?parseInt(value):null) : a.vlan_vid
          } : a
        );

        // Recalculate block stats dari allocations (fix utilization not updating)
        const activeCount = updatedAllocations.filter(a => a.status === "active").length;
        const usedIps = updatedAllocations
          .filter(a => a.status === "active")
          .reduce((sum, a) => {
            try {
              const [, plen] = a.prefix.split("/");
              const size = Math.pow(2, 32 - parseInt(plen));
              return sum + size;
            } catch { return sum; }
          }, 0);

        return {
          ...prev,
          allocations: updatedAllocations,
          used_ips: String(usedIps), // update utilization
          active_allocations: activeCount
        };
      });
      // NO setTimeout load() - smooth UX! ✨
    } catch(e) {
      setSaveMsg("Error: "+e.message); setTimeout(()=>setSaveMsg(null),3000);
    }
  };

  // Optimistic update for description - update state immediately, API in background
  const saveFieldOptimistic = async (allocId, field, value) => {
    setData(prev => {
      if (!prev) return prev;
      const updatedAllocs = prev.allocations.map(a =>
        a.id === allocId ? { ...a, [field]: value } : a
      );
      return { ...prev, allocations: updatedAllocs };
    });
    setSaveMsg("Saved ✓"); setTimeout(()=>setSaveMsg(null),1500);
    try {
      await saveField(allocId, field, value);
    } catch(e) {
      setSaveMsg("Error: "+e.message); setTimeout(()=>setSaveMsg(null),3000);
      load();
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
  const usedIps   = parseFloat(data?.used_ips||0);
  const totalIps  = parseFloat(data?.total_ips||1);
  // IPv6: total_ips is astronomical, use alloc count for display
  const v6AllocCount  = isV6 ? (data?.allocations||[]).length : 0;
  const v6ActiveCount = isV6 ? (data?.allocations||[]).filter(a=>a.status==="active").length : 0;
  const utilPct   = isV6 ? 0 : (totalIps ? Math.round(usedIps/totalIps*100) : 0);
  const utilColor = utilPct>85?"var(--danger)":utilPct>60?"var(--warning)":"var(--success)";

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
            }}>{STATUS_STYLE[data.status]?.label || data.status}</span>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowGrid(v=>!v)}
              className={`btn ${showGrid?"btn-primary":"btn-secondary"} btn-sm`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14" style={{marginRight:4}}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg> IP Map
            </button>
            <button onClick={()=>setShowCalc(v=>!v)}
              className={`btn ${showCalc?"btn-primary":"btn-secondary"} btn-sm`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14" style={{marginRight:4}}><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="16" y2="18"/></svg> Subnet Calc
            </button>
            <button onClick={()=>setEditModal(true)} className="btn btn-secondary btn-sm">
              Edit Block
            </button>
            <button onClick={()=>setAllocModal(isV6?{prefix:data.prefix.replace(/\/\d+$/,"") + "/127"}:{})} className="btn btn-primary btn-sm">
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
              background:"var(--surface-2)",borderRadius:"var(--radius-sm)",
              padding:"10px 14px",border:"1px solid var(--border-soft)",
              boxShadow:"inset 0 1px 0 rgba(255,255,255,0.5)",
            }}>
              <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:4}}>{k}</div>
              <div style={{fontSize:12,fontFamily:"var(--font-mono)",color:"var(--text)",
                fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {v||"—"}
              </div>
            </div>
          ))}
        </div>

        {/* Utilization bar */}
        {isV6 ? (
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:12,
            padding:"8px 12px",background:"var(--surface-2)",borderRadius:"var(--radius-sm)",
            border:"1px solid var(--border-soft)"}}>
            <span style={{fontSize:12,color:"var(--text-muted)"}}>
              <span style={{fontWeight:700,color:"var(--accent)",fontFamily:"var(--font-mono)"}}>{v6ActiveCount}</span>
              <span style={{color:"var(--text-dim)"}}> active</span>
              <span style={{margin:"0 6px",color:"var(--border-medium)"}}>·</span>
              <span style={{fontWeight:700,color:"var(--text)",fontFamily:"var(--font-mono)"}}>{v6AllocCount}</span>
              <span style={{color:"var(--text-dim)"}}> total prefixes allocated</span>
            </span>
            <span style={{marginLeft:"auto",fontSize:11,color:"var(--text-dim)"}}>IPv6 — utilization by prefix count</span>
          </div>
        ) : (
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <div style={{flex:1,height:6,background:"var(--surface-3)",borderRadius:99,overflow:"hidden"}}>
              <div style={{width:`${utilPct}%`,height:"100%",background:utilColor,
                borderRadius:99,transition:"width 0.5s"}}/>
            </div>
            <span style={{fontFamily:"var(--font-mono)",fontSize:12,color:utilColor,
              fontWeight:700,minWidth:36,textAlign:"right"}}>{utilPct}%</span>
          </div>
        )}

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

      {/* IP Map / IPv6 Allocation View */}
      {showGrid && (
        isV6 ? (
          <div style={{
            background:"var(--surface-1)",border:"1px solid var(--border-medium)",
            borderRadius:"var(--radius)",padding:16,marginBottom:12,
          }}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <span style={{fontSize:11,fontWeight:700,color:"var(--text)",letterSpacing:"0.08em",textTransform:"uppercase"}}>IPv6 Allocations</span>
              <span style={{fontSize:11,color:"var(--text-muted)"}}>
                {(data.allocations||[]).length} prefix{(data.allocations||[]).length!==1?"es":""}
              </span>
            </div>
            {(data.allocations||[]).length === 0 ? (
              <div style={{textAlign:"center",padding:"32px 0",color:"var(--text-dim)",fontSize:13}}>
                No allocations yet — click + Add Allocation to get started
                (prefix will be pre-filled with block address)
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {(data.allocations||[]).sort((a,b)=>a.prefix.localeCompare(b.prefix)).map(a=>{
                  const typeColors = {
                    customer:"#3b82f6",infrastructure:"#8b5cf6",
                    ptp:"#f59e0b",peering:"#a855f7",
                    management:"#0ea5e9",reserved:"#71717a",
                  };
                  const tc = typeColors[a.owner_type]||"#71717a";
                  const isActive = a.status==="active";
                  return (
                    <div key={a.id}
                      onClick={()=>setAllocModal(a)}
                      style={{
                        display:"flex",alignItems:"center",gap:12,
                        padding:"10px 14px",borderRadius:"var(--radius-sm)",
                        border:"1px solid var(--border-soft)",
                        background:"var(--surface-2)",
                        cursor:"pointer",transition:"all 0.12s",
                      }}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
                      onMouseLeave={e=>e.currentTarget.style.background="var(--surface-2)"}
                    >
                      <div style={{width:3,height:36,borderRadius:2,background:tc,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"var(--font-mono)",fontSize:13,fontWeight:600,color:"var(--accent)",marginBottom:2}}>
                          {a.prefix}
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <span style={{fontSize:10,color:tc,fontWeight:600,textTransform:"uppercase"}}>{a.owner_type}</span>
                          {a.customer_name && <span style={{fontSize:11,color:"var(--text-muted)"}}>{a.customer_name}</span>}
                          {a.vlan_vid && <span style={{fontSize:10,color:"var(--text-dim)",fontFamily:"var(--font-mono)"}}>VLAN {a.vlan_vid}</span>}
                        </div>
                      </div>
                      <span style={{
                        padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:600,
                        background: isActive?"var(--success-surface)":"var(--surface-3)",
                        color: isActive?"var(--success)":"var(--text-dim)",
                        border:`1px solid ${isActive?"var(--success-border)":"var(--border-soft)"}`,
                      }}>{STATUS_STYLE[a.status]?.label || a.status}</span>
                      <span style={{fontSize:11,color:"var(--text-dim)",opacity:0.6}}>click to edit →</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <IPGrid
            blockPrefix={data.prefix}
            allocations={data.allocations||[]}
            onAllocate={prefix=>{ setAllocModal({prefix}); }}
            onEdit={row=>setAllocModal(row)}
            dark={dark}
          />
        )
      )}

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
          borderBottom:"1px solid var(--border-soft)",flexWrap:"wrap"}}>
          {/* Search */}
          <div style={{position:"relative",flex:1,minWidth:200,maxWidth:300}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
              color:"var(--text-dim)",pointerEvents:"none",fontSize:13}}>S</span>
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

          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,color:"var(--text-dim)"}}>{allocs.length}/{totalAllocs} rows</span>
            <button onClick={()=>setShowFullTable(true)} title="Fullscreen table"
              style={{display:"flex",alignItems:"center",justifyContent:"center",width:28,height:28,
                borderRadius:"var(--radius-sm)",border:"1px solid var(--border-soft)",
                background:"var(--surface-2)",cursor:"pointer",color:"var(--text-muted)",transition:"all 0.12s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--accent)";e.currentTarget.style.color="var(--accent)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border-soft)";e.currentTarget.style.color="var(--text-muted)";}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            </button>
          </div>
          <span style={{fontSize:10,color:"var(--text-dim)",fontStyle:"italic"}}>✎ click cell to edit</span>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",background:"var(--danger-surface)",border:"1px solid var(--danger-border)",borderRadius:"var(--radius-sm)",marginBottom:8}}>
            <span style={{fontSize:12,color:"var(--danger)",fontWeight:600}}>{selected.size} selected</span>
            <button onClick={()=>setSelected(new Set())} style={{padding:"3px 8px",fontSize:11,background:"transparent",border:"1px solid var(--danger-border)",color:"var(--text-muted)",borderRadius:4,cursor:"pointer"}}>Clear</button>
            <button onClick={bulkDelete} style={{padding:"3px 8px",fontSize:11,background:"var(--danger)",border:"none",color:"#fff",borderRadius:4,cursor:"pointer",fontWeight:600}}>Delete Selected</button>
          </div>
        )}

        {/* Table */}
        <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"calc(100vh - 420px)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead style={{position:"sticky",top:0,zIndex:10}}>
              <tr style={{background:"var(--surface-2)",borderBottom:"2px solid var(--border-medium)"}}>
                {["","#","Type","Prefix","Usable Range","Owner / Customer","VLAN","End Device XC","Status",""].map((h,i)=>(
                  <th key={i} style={{
                    textAlign:"left",padding:"8px 10px",whiteSpace:"nowrap",
                    fontSize:10,fontWeight:600,textTransform:"uppercase",
                    letterSpacing:"0.07em",color:"var(--text-muted)",
                    borderRight:"1px solid var(--border-soft)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allocs.length===0 ? (
                <tr><td colSpan={11}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",
                    justifyContent:"center",padding:"48px 0",gap:8}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" width="32" height="32"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
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
                    <tr key={"gap-"+i} style={{borderBottom:"1px solid var(--border-soft)",opacity:0.6}}>
                      <td style={{padding:"5px 10px",width:28}}/>
                      <td style={{padding:"5px 10px",color:"var(--text-dim)",fontFamily:"var(--font-mono)",fontSize:10,borderRight:"1px solid var(--border-soft)"}}>—</td>
                      <td style={{padding:"5px 8px",borderRight:"1px solid var(--border-soft)"}}><span style={{fontSize:10,color:"var(--text-dim)",fontStyle:"italic"}}>free</span></td>
                      <td style={{padding:"5px 10px",borderRight:"1px solid var(--border-soft)"}}>
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
                    borderBottom:"1px solid var(--border-soft)",
                    background:rowBg,
                    transition:"background var(--transition)",
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
                  onMouseLeave={e=>e.currentTarget.style.background=rowBg}>

                    {/* Checkbox */}
                    <td style={{padding:"6px 8px",width:28}}>
                      <input type="checkbox" checked={selected.has(row.id)} onChange={()=>toggleSelect(row.id)}
                        style={{cursor:"pointer",accentColor:"var(--accent)",width:14,height:14}}/>
                    </td>
                    {/* # */}
                    <td style={{padding:"6px 10px",color:"var(--text-dim)",
                      fontFamily:"var(--font-mono)",fontSize:10,borderRight:"1px solid var(--border-soft)"}}>
                      {i+1}
                    </td>

                    {/* Type */}
                    <td style={{padding:"6px 8px",borderRight:"1px solid var(--border-soft)"}}>
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
                    <td style={{padding:"6px 10px",borderRight:"1px solid var(--border-soft)"}}>
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
                    <td style={{padding:"6px 10px",borderRight:"1px solid var(--border-soft)"}}>
                      <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-muted)"}}>
                        {calcUsableRange(row.prefix)}
                      </span>
                    </td>

                    {/* Owner / Customer */}
                    <td style={{padding:"4px 8px",borderRight:"1px solid var(--border-soft)",minWidth:160}}>
                      {row.owner_type==="customer" ? (
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          <InlineCell value={row.customer_name} placeholder="assign customer"
                            suggestions={custNames}
                            onCreate={v=>saveField(row.id,"customer_name",v)}
                            onSave={v=>saveField(row.id,"customer_name",v)}/>
                          {row.customer_name && row.customer_id && (
                            <a onClick={e=>{e.preventDefault();e.stopPropagation();onNavigate?.("customer-detail",{id:row.customer_id,from:"block-detail"});}}
                              href="#" title="View customer"
                              style={{fontSize:9,color:"var(--text-dim)",flexShrink:0,cursor:"pointer",
                                padding:"1px 2px",lineHeight:1,opacity:0.5,transition:"opacity 0.12s"}}
                              onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.color="var(--accent)";}}
                              onMouseLeave={e=>{e.currentTarget.style.opacity="0.5";e.currentTarget.style.color="var(--text-dim)";}}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                            </a>
                          )}
                        </div>
                      ) : (
                        <InlineCell value={row.description} placeholder="description"
                          onSave={v=>saveFieldOptimistic(row.id,"description",v)}/>
                      )}
                    </td>

                    {/* VLAN */}
                    <td style={{padding:"4px 8px",borderRight:"1px solid var(--border-soft)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <InlineCell value={row.vlan_vid?String(row.vlan_vid):""} placeholder="—"
                          suggestions={vlanVids} mono
                          onSave={v=>saveField(row.id,"vlan_vid",v)}/>
                        {row.vlan_vid && row.vlan_id && (
                          <a onClick={e=>{e.preventDefault();e.stopPropagation();onNavigate?.("vlan-detail",{id:row.vlan_id,from:"block-detail"});}}
                            href="#" title="View VLAN"
                            style={{fontSize:9,color:"var(--text-dim)",flexShrink:0,cursor:"pointer",
                              padding:"1px 2px",lineHeight:1,opacity:0.5,transition:"opacity 0.12s"}}
                            onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.color="var(--accent)";}}
                            onMouseLeave={e=>{e.currentTarget.style.opacity="0.5";e.currentTarget.style.color="var(--text-dim)";}}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                          </a>
                        )}
                      </div>
                    </td>

                    {/* End Device XC */}
                    <td style={{padding:"4px 8px",borderRight:"1px solid var(--border-soft)",maxWidth:160}}>
                      <InlineCell value={row.description} placeholder="—"
                        onSave={v=>saveFieldOptimistic(row.id,"description",v)}/>
                    </td>

                    {/* Status */}
                    <td style={{padding:"6px 8px",borderRight:"1px solid var(--border-soft)"}}>
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

      {/* Fullscreen Table Modal */}
      {showFullTable && createPortal(
        <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",flexDirection:"column",background:"var(--bg)"}}>
          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 20px",
            borderBottom:"1px solid var(--border-medium)",background:"var(--surface-1)",flexShrink:0}}>
            <span style={{fontFamily:"var(--font-mono)",fontSize:14,fontWeight:700,color:"var(--text)"}}>{data.prefix}</span>
            <span style={{fontSize:12,color:"var(--text-dim)"}}>— Allocation Table</span>
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,color:"var(--text-dim)"}}>{allocs.length}/{totalAllocs} rows</span>
              <button onClick={()=>setShowFullTable(false)} title="Exit fullscreen"
                style={{display:"flex",alignItems:"center",justifyContent:"center",width:28,height:28,
                  borderRadius:"var(--radius-sm)",border:"1px solid var(--border-soft)",
                  background:"var(--surface-2)",cursor:"pointer",color:"var(--text-muted)",transition:"all 0.12s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--danger)";e.currentTarget.style.color="var(--danger)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border-soft)";e.currentTarget.style.color="var(--text-muted)";}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                  <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
                </svg>
              </button>
            </div>
          </div>
          {/* Table full height */}
          <div style={{flex:1,overflowX:"auto",overflowY:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead style={{position:"sticky",top:0,zIndex:10}}>
                <tr style={{background:"var(--surface-2)",borderBottom:"2px solid var(--border-medium)"}}>
                  {["","#","Type","Prefix","Usable Range","Owner / Customer","VLAN","End Device XC","Status",""].map((h,i)=>(
                    <th key={i} style={{textAlign:"left",padding:"8px 10px",whiteSpace:"nowrap",
                      fontSize:10,fontWeight:600,textTransform:"uppercase",
                      letterSpacing:"0.07em",color:"var(--text-muted)",
                      borderRight:"1px solid var(--border-soft)"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allocs.length===0 ? (
                  <tr><td colSpan={9}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px 0",gap:8}}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" width="32" height="32"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      <div style={{fontSize:13,color:"var(--text-muted)"}}>No allocations found</div>
                    </div>
                  </td></tr>
                ) : (() => {
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
                      <tr key={"gap-fs-"+i} style={{borderBottom:"1px solid var(--border-soft)",opacity:0.6}}>
                        <td style={{padding:"5px 10px",color:"var(--text-dim)",fontFamily:"var(--font-mono)",fontSize:10,borderRight:"1px solid var(--border-soft)"}}>—</td>
                        <td style={{padding:"5px 8px",borderRight:"1px solid var(--border-soft)"}}><span style={{fontSize:10,color:"var(--text-dim)",fontStyle:"italic"}}>free</span></td>
                        <td style={{padding:"5px 10px",borderRight:"1px solid var(--border-soft)"}}>
                          <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-dim)"}}>{row.startIp} — {row.endIp}</span>
                          <span style={{fontSize:10,color:"var(--text-dim)",marginLeft:8}}>({row.size} IPs)</span>
                        </td>
                        <td colSpan={5} style={{padding:"5px 10px"}}>
                          <button onClick={()=>{setAllocModal({prefix:row.startIp+"/30"});setShowFullTable(false);}}
                            className="btn btn-ghost btn-sm" style={{fontSize:10,padding:"2px 8px",opacity:0.7}}>+ Allocate</button>
                        </td>
                      </tr>
                    );
                    const oi = ownerInfo(row.owner_type);
                    const ss = STATUS_STYLE[row.status]||STATUS_STYLE.available;
                    const rowBg = row.status==="available"?"rgba(56,232,198,0.03)":row.status==="reserved"?"rgba(168,85,247,0.03)":i%2===0?"var(--surface-1)":"transparent";
                    return (
                      <tr key={"fs-"+row.id} style={{borderBottom:"1px solid var(--border-soft)",background:rowBg,transition:"background var(--transition)"}}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
                        onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                        <td style={{padding:"6px 4px",width:28}}>
                      <input type="checkbox" checked={selected.has(row.id)} onChange={()=>toggleSelect(row.id)}
                        style={{cursor:"pointer",accentColor:"var(--accent)",width:14,height:14}}/>
                    </td>
                    <td style={{padding:"6px 10px",color:"var(--text-dim)",fontFamily:"var(--font-mono)",fontSize:10,borderRight:"1px solid var(--border-soft)"}}>{i+1}</td>
                        <td style={{padding:"6px 8px",borderRight:"1px solid var(--border-soft)"}}>
                          <select value={row.owner_type||"customer"} onChange={e=>saveField(row.id,"owner_type",e.target.value)} onClick={e=>e.stopPropagation()}
                            style={{background:"transparent",border:"none",color:oi.color,fontSize:11,fontWeight:600,cursor:"pointer",outline:"none"}}>
                            {OWNER_TYPES.map(o=>(<option key={o.value} value={o.value} style={{background:"var(--bg-secondary,var(--bg))",color:"var(--text)"}}>{o.icon} {o.label}</option>))}
                          </select>
                        </td>
                        <td style={{padding:"6px 10px",borderRight:"1px solid var(--border-soft)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:600,color:"var(--accent)"}}>{row.prefix?.split("/")?.[0]}</span>
                            <select value={row.prefix?.split("/")?.[1]||""} onClick={e=>e.stopPropagation()}
                              onChange={e=>{const newPlen=parseInt(e.target.value);const newPrefix=changeMaskAligned(row.prefix,newPlen,data?.allocations?.filter(a=>a.id!==row.id)||[]);saveField(row.id,"mask",newPrefix.split("/")[1]+"__"+newPrefix.split("/")[0]);}}
                              style={{background:"transparent",border:"1px solid var(--border-soft)",color:"var(--accent2)",fontSize:11,fontFamily:"var(--font-mono)",cursor:"pointer",outline:"none",borderRadius:"var(--radius-sm)",padding:"2px 4px"}}>
                              {(isV6?V6_MASKS:V4_MASKS).map(p=>(<option key={p} value={p} style={{background:"var(--bg-secondary,var(--bg))",color:"var(--text)"}}>/{p}</option>))}
                            </select>
                          </div>
                        </td>
                        <td style={{padding:"6px 10px",borderRight:"1px solid var(--border-soft)"}}><span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-muted)"}}>{calcUsableRange(row.prefix)}</span></td>
                        <td style={{padding:"4px 8px",borderRight:"1px solid var(--border-soft)",minWidth:160}}>
                          {row.owner_type==="customer"?(
                            <InlineCell value={row.customer_name} placeholder="assign customer" suggestions={custNames} onCreate={v=>saveFieldOptimisticOnCreate(row.id,"customer_name",v)} onSave={v=>saveFieldOptimistic(row.id,"customer_name",v)}/>
                          ):(
                            <InlineCell value={row.description} placeholder="description" onSave={v=>saveFieldOptimistic(row.id,"description",v)}/>
                          )}
                        </td>
                        <td style={{padding:"4px 8px",borderRight:"1px solid var(--border-soft)"}}><InlineCell value={row.vlan_vid?String(row.vlan_vid):""} placeholder="—" suggestions={vlanVids} mono onSave={v=>saveField(row.id,"vlan_vid",v)}/></td>
                        <td style={{padding:"4px 8px",borderRight:"1px solid var(--border-soft)",maxWidth:160}}><InlineCell value={row.description} placeholder="—" onSave={v=>saveFieldOptimistic(row.id,"description",v)}/></td>
                        <td style={{padding:"6px 8px",borderRight:"1px solid var(--border-soft)"}}>
                          <select value={row.status} onChange={e=>saveField(row.id,"status",e.target.value)} onClick={e=>e.stopPropagation()}
                            style={{background:"transparent",border:"none",color:ss.color,fontSize:11,fontFamily:"var(--font-mono)",cursor:"pointer",outline:"none",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>
                            {STATUS_OPTS.map(s=>(<option key={s} value={s} style={{background:"var(--bg-secondary,var(--bg))",color:"var(--text)"}}>{s}</option>))}
                          </select>
                        </td>
                        <td style={{padding:"4px 8px"}} onClick={e=>e.stopPropagation()}>
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={()=>{setAllocModal(row);setShowFullTable(false);}} className="btn btn-ghost btn-sm" style={{padding:"3px 8px",fontSize:11}}>Edit</button>
                            <button onClick={()=>setConfirm(row)} style={{padding:"3px 8px",fontSize:11,background:"var(--danger-surface)",color:"var(--danger)",border:"1px solid var(--danger-border)",borderRadius:"var(--radius-sm)",cursor:"pointer"}}>Del</button>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>,
        document.body
      )}

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
        <Confirm
          message={confirm.bulk ? confirm.message : `Delete allocation ${confirm.prefix}?`}
          onConfirm={async()=>{
            // Optimistic delete: remove from local state first, no page refresh
            setConfirm(null);
            if (confirm.bulk) {
              const ids = new Set(confirm.ids);
              setData(prev => prev ? {...prev, allocations: prev.allocations.filter(a => !ids.has(a.id))} : prev);
              setSelected(new Set());
              // Background: delete from API
              for (const id of confirm.ids) {
                try { await deleteAllocation(id); } catch(e) { console.error(e); }
              }
            } else {
              setData(prev => prev ? {...prev, allocations: prev.allocations.filter(a => a.id !== confirm.id)} : prev);
              // Background: delete from API
              try { await deleteAllocation(confirm.id); } catch(e) { console.error(e); }
            }
          }}
          onCancel={()=>setConfirm(null)}/>
      )}
    </div>
  );
}
