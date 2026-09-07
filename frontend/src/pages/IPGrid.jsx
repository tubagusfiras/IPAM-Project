import { useState } from "react";
import { ipToInt, intToIp, calcUsable } from "../utils/ip.js";
import { ipv6ToBigIntBD, bigIntToIPv6BD } from "../utils/ipHelpers.js";

function getOwnerColors(dark) {
  if (dark) return {
    customer:       { bg:"rgba(148,163,184,0.25)", border:"#64748b", dot:"#94a3b8", label:"Allocated"     },
    internal:       { bg:"rgba(148,163,184,0.25)", border:"#64748b", dot:"#94a3b8", label:"Allocated"     },
    ptp:            { bg:"rgba(148,163,184,0.25)", border:"#64748b", dot:"#94a3b8", label:"Allocated"     },
    peering:        { bg:"rgba(148,163,184,0.25)", border:"#64748b", dot:"#94a3b8", label:"Allocated"     },
    management:     { bg:"rgba(148,163,184,0.25)", border:"#64748b", dot:"#94a3b8", label:"Allocated"     },
    reserved:       { bg:"rgba(100,116,139,0.35)", border:"#475569", dot:"#64748b", label:"Reserved"       },
    free:           { bg:"rgba(37,99,235,0.30)",   border:"#3b82f6", dot:"#60a5fa", label:"Free"           },
  };
  return {
    customer:       { bg:"rgba(100,116,139,0.15)", border:"#94a3b8", dot:"#64748b", label:"Allocated"     },
    internal:       { bg:"rgba(100,116,139,0.15)", border:"#94a3b8", dot:"#64748b", label:"Allocated"     },
    ptp:            { bg:"rgba(100,116,139,0.15)", border:"#94a3b8", dot:"#64748b", label:"Allocated"     },
    peering:        { bg:"rgba(100,116,139,0.15)", border:"#94a3b8", dot:"#64748b", label:"Allocated"     },
    management:     { bg:"rgba(100,116,139,0.15)", border:"#94a3b8", dot:"#64748b", label:"Allocated"     },
    reserved:       { bg:"rgba(148,163,184,0.25)", border:"#cbd5e1", dot:"#94a3b8", label:"Reserved"       },
    free:           { bg:"rgba(37,99,235,0.15)",   border:"#3b82f6", dot:"#2563eb", label:"Free"           },
  };
}

const V4_SLOT_SIZES = [
  { label:"/31", value:2   },
  { label:"/30", value:4   },
  { label:"/29", value:8   },
  { label:"/28", value:16  },
  { label:"/27", value:32  },
  { label:"/26", value:64  },
  { label:"/25", value:128 },
  { label:"/24", value:256 },
];

const V6_SLOT_SIZES = [
  { label:"/127", value:2   },
  { label:"/126", value:4   },
  { label:"/124", value:16  },
  { label:"/120", value:256 },
  { label:"/112", value:65536 },
];

const ZOOM_SIZES = [28, 38, 52, 70];
const V6_PAGE_SLOTS = 128;

function v6ShortAddr(bn) {
  const hex = bn.toString(16).padStart(32, "0");
  return hex.slice(-4);
}

export default function IPGrid({ blockPrefix, allocations, onAllocate, onEdit, dark }) {
  const [hover,    setHover]    = useState(null);
  const [slotSize, setSlotSize] = useState(4);
  const [zoom,     setZoom]     = useState(1);

  const OWNER_COLOR = getOwnerColors(dark);

  if (!blockPrefix) return null;

  const isV6 = blockPrefix.includes(":");
  const [bAddr, bPlenStr] = blockPrefix.split("/");
  const bPlenN = parseInt(bPlenStr);

  if (isV6) {
    return <IPv6Grid
      blockPrefix={blockPrefix} bAddr={bAddr} bPlenN={bPlenN}
      allocations={allocations} onAllocate={onAllocate} onEdit={onEdit}
      dark={dark} hover={hover} setHover={setHover}
      slotSize={slotSize} setSlotSize={setSlotSize}
      zoom={zoom} setZoom={setZoom}
      OWNER_COLOR={OWNER_COLOR}
    />;
  }

  return <IPv4Grid
    blockPrefix={blockPrefix} bAddr={bAddr} bPlenN={bPlenN}
    allocations={allocations} onAllocate={onAllocate} onEdit={onEdit}
    dark={dark} hover={hover} setHover={setHover}
    slotSize={slotSize} setSlotSize={setSlotSize}
    zoom={zoom} setZoom={setZoom}
    OWNER_COLOR={OWNER_COLOR}
  />;
}

function IPv4Grid({ blockPrefix, bAddr, bPlenN, allocations, onAllocate, onEdit, dark, hover, setHover, slotSize, setSlotSize, zoom, setZoom, OWNER_COLOR }) {
  const bStart  = ipToInt(bAddr);
  const bSize   = Math.pow(2, 32 - bPlenN);
  const step    = slotSize;
  const slotPlen = 32 - Math.log2(step);

  if (step > bSize) {
    return (
      <div style={{background:"var(--surface-1)",border:"1px solid var(--border-soft)",borderRadius:"var(--radius)",padding:24,textAlign:"center"}}>
        <span style={{fontSize:12,color:"var(--text-muted)"}}>Slot size is larger than the block. Choose a smaller slot.</span>
      </div>
    );
  }

  const allocList = (allocations || []).map(a => {
    const [aAddr, aPlen] = a.prefix.split("/");
    const aStart = ipToInt(aAddr);
    const aSize  = Math.pow(2, 32 - parseInt(aPlen));
    const aEnd   = (aStart + aSize - 1) >>> 0;
    return { ...a, aStart, aEnd };
  });

  const slots = [];
  for (let i = 0; i < bSize; i += step) {
    const slotStart = (bStart + i) >>> 0;
    const slotEnd   = (slotStart + step - 1) >>> 0;
    const alignOk = (slotStart % step) === 0;

    let match = null, partial = false;
    let bestMatchSize = Infinity;
    for (const a of allocList) {
      const aSize = a.aEnd - a.aStart + 1;
      if (a.aStart <= slotStart && a.aEnd >= slotEnd) {
        if (aSize < bestMatchSize) { match = a; bestMatchSize = aSize; }
      } else if (a.aStart <= slotEnd && a.aEnd >= slotStart) {
        if (!match) partial = true;
      }
    }

    if (!alignOk && !match) partial = true;

    const prefix = `${intToIp(slotStart)}/${slotPlen}`;
    slots.push({ prefix, slotStart, slotEnd, match, partial, idx: i/step });
  }

  return <GridUI
    slots={slots} allocList={allocList} blockPrefix={blockPrefix}
    isV6={false} onAllocate={onAllocate} onEdit={onEdit}
    dark={dark} hover={hover} setHover={setHover}
    slotSize={slotSize} setSlotSize={setSlotSize} slotSizes={V4_SLOT_SIZES}
    zoom={zoom} setZoom={setZoom}
    OWNER_COLOR={OWNER_COLOR}
    slotLabelFn={(s) => `.${(s.slotStart & 0xff)}`}
  />;
}

function IPv6Grid({ blockPrefix, bAddr, bPlenN, allocations, onAllocate, onEdit, dark, hover, setHover, slotSize, setSlotSize, zoom, setZoom, OWNER_COLOR }) {
  const [page, setPage] = useState(0);
  const gridSize = Math.pow(2, 128 - bPlenN);

  const v6Sizes = V6_SLOT_SIZES.filter(s => s.value <= gridSize);
  if (v6Sizes.length === 0) v6Sizes.push({ label:`/${bPlenN}`, value:1 });

  const effectiveSlot = v6Sizes.find(s => s.value === slotSize) ? slotSize : (v6Sizes[0]?.value || 2);
  if (slotSize !== effectiveSlot) setSlotSize(effectiveSlot);

  const bStart = ipv6ToBigIntBD(bAddr);
  const step   = BigInt(effectiveSlot);
  const slotPlen = 128 - Math.log2(Number(step));

  const totalSlots = gridSize / effectiveSlot;
  const pageCount  = Math.max(1, Math.ceil(totalSlots / V6_PAGE_SLOTS));
  const curPage    = Math.min(page, pageCount - 1);
  const pageStart  = BigInt(curPage) * BigInt(V6_PAGE_SLOTS);
  const pageEnd    = Math.min(totalSlots, (curPage + 1) * V6_PAGE_SLOTS);

  const allocList = (allocations || []).map(a => {
    try {
      const [aAddr, aPlen] = a.prefix.split("/");
      const aStart = ipv6ToBigIntBD(aAddr);
      const aSize  = BigInt(Math.pow(2, 128 - parseInt(aPlen)));
      const aEnd   = aStart + aSize - 1n;
      return { ...a, aStart, aEnd };
    } catch { return null; }
  }).filter(Boolean);

  const slots = [];
  for (let i = pageStart; i < BigInt(pageEnd); i += 1n) {
    const slotStart = bStart + i * step;
    const slotEnd   = slotStart + step - 1n;
    const idx = Number(i);

    let match = null, partial = false;
    let bestMatchSize = 0n;
    for (const a of allocList) {
      const aSize = a.aEnd - a.aStart + 1n;
      if (a.aStart <= slotStart && a.aEnd >= slotEnd) {
        if (bestMatchSize === 0n || aSize < bestMatchSize) { match = a; bestMatchSize = aSize; }
      } else if (a.aStart <= slotEnd && a.aEnd >= slotStart) {
        if (!match) partial = true;
      }
    }

    const prefix = `${bigIntToIPv6BD(slotStart)}/${slotPlen}`;
    slots.push({ prefix, slotStart, slotEnd, match, partial, idx });
  }

  return <GridUI
    slots={slots} allocList={allocList} blockPrefix={blockPrefix}
    isV6={true} onAllocate={onAllocate} onEdit={onEdit}
    dark={dark} hover={hover} setHover={setHover}
    slotSize={effectiveSlot} setSlotSize={setSlotSize} slotSizes={v6Sizes}
    zoom={zoom} setZoom={setZoom}
    OWNER_COLOR={OWNER_COLOR}
    slotLabelFn={(s) => v6ShortAddr(s.slotStart)}
    page={curPage} pageCount={pageCount} setPage={setPage}
  />;
}

function GridUI({ slots, allocList, blockPrefix, isV6, onAllocate, onEdit, dark, hover, setHover, slotSize, setSlotSize, slotSizes, zoom, setZoom, OWNER_COLOR, slotLabelFn, page, pageCount, setPage }) {
  const usedSlots = slots.filter(s => s.match).length;
  const freeSlots = slots.filter(s => !s.match && !s.partial).length;
  const tileSize  = ZOOM_SIZES[zoom];
  const showLabel = tileSize >= 38;

  return (
    <div style={{
      background:"var(--surface-1)",
      border:"1px solid var(--border-soft)",
      borderRadius:"var(--radius)",
      padding:16, marginBottom:12,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
        <span style={{fontSize:11,fontWeight:700,color:"var(--text)",letterSpacing:"0.08em",textTransform:"uppercase"}}>
          {isV6 ? "IPv6 Map" : "IP Map"}
        </span>
        <span style={{fontSize:11,color:"var(--text-muted)"}}>
          {usedSlots}/{slots.length} used ·{" "}
          <span style={{color:"var(--success)"}}>{freeSlots} free</span>
        </span>

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          <select value={slotSize} onChange={e=>setSlotSize(Number(e.target.value))}
            style={{fontSize:11,padding:"2px 6px",borderRadius:4,border:"1px solid var(--border-soft)",background:"var(--surface-2)",color:"var(--text)",fontFamily:"var(--font-mono)"}}>
            {slotSizes.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div style={{display:"flex",gap:2}}>
            <button onClick={()=>setZoom(z=>Math.max(0,z-1))} disabled={zoom===0}
              style={{
                width:24,height:24,borderRadius:4,border:"1px solid var(--border-soft)",
                background:"var(--surface-2)",color:"var(--text-muted)",
                cursor:zoom===0?"not-allowed":"pointer",fontSize:14,
                display:"flex",alignItems:"center",justifyContent:"center",
                opacity:zoom===0?0.4:1,
              }}>−</button>
            <button onClick={()=>setZoom(z=>Math.min(ZOOM_SIZES.length-1,z+1))} disabled={zoom===ZOOM_SIZES.length-1}
              style={{
                width:24,height:24,borderRadius:4,border:"1px solid var(--border-soft)",
                background:"var(--surface-2)",color:"var(--text-muted)",
                cursor:zoom===ZOOM_SIZES.length-1?"not-allowed":"pointer",fontSize:14,
                display:"flex",alignItems:"center",justifyContent:"center",
                opacity:zoom===ZOOM_SIZES.length-1?0.4:1,
              }}>+</button>
          </div>

          {isV6 && pageCount > 1 && (
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
              <button onClick={()=>setPage(Math.max(0,page-1))} disabled={page===0}
                style={{
                  width:24,height:24,borderRadius:4,border:"1px solid var(--border-soft)",
                  background:"var(--surface-2)",color:"var(--text-muted)",
                  cursor:page===0?"not-allowed":"pointer",fontSize:13,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  opacity:page===0?0.4:1,
                }}>‹</button>
              <span style={{fontFamily:"var(--font-mono)",color:"var(--text-muted)",whiteSpace:"nowrap"}}>
                {page+1}<span style={{opacity:0.5}}>/{pageCount}</span>
              </span>
              <button onClick={()=>setPage(Math.min(pageCount-1,page+1))} disabled={page>=pageCount-1}
                style={{
                  width:24,height:24,borderRadius:4,border:"1px solid var(--border-soft)",
                  background:"var(--surface-2)",color:"var(--text-muted)",
                  cursor:page>=pageCount-1?"not-allowed":"pointer",fontSize:13,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  opacity:page>=pageCount-1?0.4:1,
                }}>›</button>
              <input type="number" min={1} max={pageCount} value={page+1}
                onChange={e=>{
                  const v = parseInt(e.target.value);
                  if (!isNaN(v)) setPage(Math.max(0,Math.min(pageCount-1,v-1)));
                }}
                onKeyDown={e=>{ if(e.key==="Enter") e.currentTarget.blur(); }}
                style={{width:64,fontSize:11,padding:"2px 6px",borderRadius:4,border:"1px solid var(--border-soft)",background:"var(--surface-2)",color:"var(--text)",fontFamily:"var(--font-mono)"}}/>
            </div>
          )}
        </div>

        <div style={{display:"flex",gap:10,flexWrap:"wrap",width:"100%",marginTop:2}}>
          {Object.entries(OWNER_COLOR).map(([k,v])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:8,height:8,borderRadius:2,background:v.dot}}/>
              <span style={{fontSize:10,color:"var(--text-muted)"}}>{v.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        display:"grid",
        gridTemplateColumns:`repeat(auto-fill, minmax(${tileSize}px, 1fr))`,
        gap:3,
      }}>
        {slots.map((slot,i)=>{
          const isHovered = hover === i;
          const c = (slot.match && slot.match.status !== "available")
            ? (OWNER_COLOR[slot.match.owner_type] || OWNER_COLOR.reserved)
            : slot.partial ? OWNER_COLOR.reserved : OWNER_COLOR.free;
          const isFree = (!slot.match && !slot.partial) || slot.match?.status === "available";
          const label = slotLabelFn(slot);

          return (
            <div key={i} style={{position:"relative"}}>
              <div
                onClick={()=>{
                  if (isFree) onAllocate(slot.prefix);
                  else if (slot.match) onEdit && onEdit(slot.match);
                }}
                onMouseEnter={()=>setHover(i)}
                onMouseLeave={()=>setHover(null)}
                style={{
                  height: tileSize < 38 ? 26 : 34,
                  background: isHovered
                    ? (isFree ? "rgba(99,179,237,0.15)" : c.bg)
                    : c.bg,
                  border:`1px solid ${isHovered ? c.dot : c.border}`,
                  borderRadius:4,
                  cursor:"pointer",
                  display:"flex",flexDirection:"column",
                  alignItems:"center",justifyContent:"center",
                  transition:"all 0.12s",
                  outline: isHovered ? `1px solid ${c.dot}` : "none",
                  outlineOffset:1,
                }}>
                {showLabel && (
                  <span style={{
                    fontSize: tileSize >= 52 ? 10 : 9,
                    fontFamily:"var(--font-mono)",
                    color: slot.match
                      ? (dark ? "#475569" : "#94a3b8")
                      : (dark ? "#93c5fd" : "#1d4ed8"),
                    fontWeight: slot.match ? 600 : 500,
                    lineHeight:1,
                  }}>
                    {isV6 ? label : `.${label}`}
                  </span>
                )}
                {slot.match && !showLabel && (
                  <div style={{width:4,height:4,borderRadius:"50%",background:"#64748b",marginTop:0}}/>
                )}
                {isFree && isHovered && showLabel && (
                  <span style={{fontSize:8,color:"var(--accent)",marginTop:1,fontWeight:700}}>+</span>
                )}
              </div>

              {isHovered && (
                <div style={{
                  position:"absolute",
                  bottom:"calc(100% + 8px)",
                  left:"50%",transform:"translateX(-50%)",
                  background:"var(--surface-3)",
                  border:"1px solid var(--border-soft)",
                  borderRadius:"var(--radius-sm)",
                  padding:"8px 12px",
                  zIndex:200,
                  whiteSpace:"nowrap",
                  pointerEvents:"none",
                  boxShadow:"0 8px 24px rgba(0,0,0,0.5)",
                  minWidth:180,
                }}>
                  <div style={{fontSize:12,fontFamily:"var(--font-mono)",fontWeight:700,color:"var(--text)",marginBottom:4}}>
                    {slot.prefix}
                    {slot.match && slot.match.prefix !== slot.prefix && (
                      <span style={{fontSize:10,color:"var(--text-dim)",marginLeft:6}}>← in {slot.match.prefix}</span>
                    )}
                  </div>
                  {slot.match ? (
                    <>
                      <div style={{fontSize:10,color:c.dot,fontWeight:600,marginBottom:3}}>{c.label.toUpperCase()}</div>
                      {slot.match.customer_name && <div style={{fontSize:11,color:"var(--text)",marginBottom:1}}>{slot.match.customer_name}</div>}
                      {slot.match.description   && <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:1}}>{slot.match.description}</div>}
                      {slot.match.vlan_vid      && <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:1}}>VLAN {slot.match.vlan_vid}</div>}
                      <div style={{fontSize:10,color:"var(--text-muted)",marginTop:2}}>{isV6 ? `${Math.log2(Number(slot.prefix.split("/")[1] ? 2n ** BigInt(128 - parseInt(slot.prefix.split("/")[1])) : 1n))} IPs` : calcUsable(slot.prefix)}</div>
                      <div style={{fontSize:9,color:"var(--text-dim)",marginTop:4,opacity:0.7}}>click to edit</div>
                    </>
                  ) : slot.partial ? (
                    <div style={{fontSize:10,color:"var(--text-muted)"}}>Partially allocated — not available</div>
                  ) : (
                    <>
                      <div style={{fontSize:10,color:"var(--success)",marginBottom:2}}>Free — available</div>
                      <div style={{fontSize:9,color:"var(--text-dim)",opacity:0.7}}>click to allocate</div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
