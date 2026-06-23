import { useState } from "react";

// Theme-aware colors — dark=true: redup gelap, light: redup soft
function getOwnerColors(dark) {
  if (dark) return {
    customer:       { bg:"rgba(71,85,105,0.35)",  border:"#475569", dot:"#94a3b8", label:"Customer"       },
    infrastructure: { bg:"rgba(71,85,105,0.35)",  border:"#475569", dot:"#94a3b8", label:"Infrastructure" },
    ptp:            { bg:"rgba(71,85,105,0.35)",  border:"#475569", dot:"#94a3b8", label:"PTP"            },
    peering:        { bg:"rgba(71,85,105,0.35)",  border:"#475569", dot:"#94a3b8", label:"Peering"        },
    management:     { bg:"rgba(71,85,105,0.35)",  border:"#475569", dot:"#94a3b8", label:"Mgmt"           },
    reserved:       { bg:"rgba(51,65,85,0.50)",   border:"#334155", dot:"#64748b", label:"Reserved"       },
    free:           { bg:"rgba(37,99,235,0.15)",  border:"#3b82f6", dot:"#60a5fa", label:"Free"           },
  };
  // Light theme: used=abu muda, free=biru soft tapi tetap visible
  return {
    customer:       { bg:"rgba(100,116,139,0.12)", border:"#94a3b8", dot:"#64748b", label:"Customer"       },
    infrastructure: { bg:"rgba(100,116,139,0.12)", border:"#94a3b8", dot:"#64748b", label:"Infrastructure" },
    ptp:            { bg:"rgba(100,116,139,0.12)", border:"#94a3b8", dot:"#64748b", label:"PTP"            },
    peering:        { bg:"rgba(100,116,139,0.12)", border:"#94a3b8", dot:"#64748b", label:"Peering"        },
    management:     { bg:"rgba(100,116,139,0.12)", border:"#94a3b8", dot:"#64748b", label:"Mgmt"           },
    reserved:       { bg:"rgba(148,163,184,0.20)", border:"#cbd5e1", dot:"#94a3b8", label:"Reserved"       },
    free:           { bg:"rgba(59,130,246,0.10)",  border:"#3b82f6", dot:"#2563eb", label:"Free"           },
  };
}

function ipToInt(ip) {
  const p = ip.split(".").map(Number);
  return ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0;
}
function intToIp(n) {
  return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".");
}
function calcUsable(prefix) {
  try {
    const [addr, plen] = prefix.split("/");
    const p    = parseInt(plen);
    const base = ipToInt(addr);
    const size = Math.pow(2, 32-p);
    if (size <= 2) return `${intToIp(base)} — ${intToIp((base+size-1)>>>0)}`;
    return `${intToIp((base+1)>>>0)} — ${intToIp((base+size-2)>>>0)}`;
  } catch { return ""; }
}

const SLOT_SIZES = [
  { label:"/31", value:2   },
  { label:"/30", value:4   },
  { label:"/29", value:8   },
  { label:"/28", value:16  },
  { label:"/27", value:32  },
  { label:"/26", value:64  },
  { label:"/25", value:128 },
  { label:"/24", value:256 },
];

const ZOOM_SIZES = [28, 38, 52, 70];

export default function IPGrid({ blockPrefix, allocations, onAllocate, onEdit, dark }) {
  const [hover,    setHover]    = useState(null);
  const [slotSize, setSlotSize] = useState(4);
  const [zoom,     setZoom]     = useState(1);

  const OWNER_COLOR = getOwnerColors(dark);

  if (!blockPrefix || blockPrefix.includes(":")) return null;

  const [bAddr, bPlen] = blockPrefix.split("/");
  const bStart  = ipToInt(bAddr);
  const bPlenN  = parseInt(bPlen);
  const bSize   = Math.pow(2, 32 - bPlenN);
  const step    = slotSize;
  const slotPlen = 32 - Math.log2(step);

  // Jika slotSize lebih besar dari block, disable
  if (step > bSize) {
    return (
      <div style={{background:"var(--surface-1)",border:"1px solid var(--border-soft)",borderRadius:"var(--radius)",padding:24,textAlign:"center"}}>
        <span style={{fontSize:12,color:"var(--text-muted)"}}>Slot size lebih besar dari block. Pilih slot yang lebih kecil.</span>
      </div>
    );
  }

  // Build allocation index: range → alloc
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

    // Pastikan slot align dengan boundary slotSize
    // (skip slot yang tidak align — misal /25 harus mulai di kelipatan 128)
    const alignOk = (slotStart % step) === 0;

    let match = null, partial = false;
    let bestMatchSize = Infinity;
    for (const a of allocList) {
      const aSize = a.aEnd - a.aStart + 1;
      // Full cover: alokasi mencakup seluruh slot
      if (a.aStart <= slotStart && a.aEnd >= slotEnd) {
        // Pilih alokasi terkecil (paling spesifik)
        if (aSize < bestMatchSize) { match = a; bestMatchSize = aSize; }
      } else if (a.aStart <= slotEnd && a.aEnd >= slotStart) {
        // Partial: overlap tapi tidak wrap penuh
        if (!match) partial = true;
      }
    }

    // Jika slot tidak align → paksa partial (tidak available)
    if (!alignOk && !match) partial = true;

    const prefix = `${intToIp(slotStart)}/${slotPlen}`;
    slots.push({ prefix, slotStart, slotEnd, match, partial, idx: i/step });
  }

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
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
        <span style={{fontSize:11,fontWeight:700,color:"var(--text)",letterSpacing:"0.08em",textTransform:"uppercase"}}>IP Map</span>
        <span style={{fontSize:11,color:"var(--text-muted)"}}>
          {usedSlots}/{slots.length} used ·{" "}
          <span style={{color:"var(--success)"}}>{freeSlots} free</span>
        </span>

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          {/* Slot size selector */}
          <div style={{display:"flex",gap:2}}>
            {SLOT_SIZES.map(s => {
              const active = slotSize === s.value;
              const tooLarge = s.value > bSize;
              return (
                <button key={s.value}
                  onClick={() => !tooLarge && setSlotSize(s.value)}
                  disabled={tooLarge}
                  style={{
                    padding:"2px 7px", fontSize:10, borderRadius:4,
                    cursor: tooLarge ? "not-allowed" : "pointer",
                    fontFamily:"var(--font-mono)", fontWeight:600,
                    background: active ? "var(--accent)" : "var(--surface-2)",
                    color: active ? "#fff" : tooLarge ? "var(--text-dim)" : "var(--text-muted)",
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border-soft)",
                    opacity: tooLarge ? 0.35 : 1,
                    transition:"all 0.15s",
                  }}>
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Zoom */}
          <div style={{display:"flex",gap:2,alignItems:"center"}}>
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
        </div>

        {/* Legend */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap",width:"100%",marginTop:2}}>
          {Object.entries(OWNER_COLOR).map(([k,v])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:8,height:8,borderRadius:2,background:v.dot}}/>
              <span style={{fontSize:10,color:"var(--text-muted)"}}>{v.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid */}
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
          const isAvailable = slot.match?.status === "available";
          const isFree = (!slot.match && !slot.partial) || isAvailable;
          // Ambil octet terakhir dari slotStart
          const lastOctet = (slot.slotStart & 0xff).toString();

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
                      ? (dark ? "#94a3b8" : "#475569")
                      : slot.partial
                        ? (dark ? "#475569" : "#94a3b8")
                        : (dark ? "#93c5fd" : "#1d4ed8"),
                    fontWeight: slot.match ? 600 : 500,
                    lineHeight:1,
                  }}>
                    .{lastOctet}
                  </span>
                )}
                {slot.match && !showLabel && (
                  <div style={{width:4,height:4,borderRadius:"50%",background:"#64748b",marginTop:0}}/>
                )}
                {isFree && isHovered && showLabel && (
                  <span style={{fontSize:8,color:"var(--accent)",marginTop:1,fontWeight:700}}>+</span>
                )}
              </div>

              {/* Tooltip */}
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
                      <div style={{fontSize:10,color:"var(--text-muted)",marginTop:2}}>{calcUsable(slot.prefix)}</div>
                      <div style={{fontSize:9,color:"var(--text-dim)",marginTop:4,opacity:0.7}}>click to edit</div>
                    </>
                  ) : slot.partial ? (
                    <div style={{fontSize:10,color:"var(--text-muted)"}}>Partially allocated — not available</div>
                  ) : (
                    <>
                      {isAvailable && (
                        <div style={{fontSize:10,color:"var(--warning)",marginBottom:4,fontWeight:600}}>
                          ! Status: available (belum dialokasikan)
                        </div>
                      )}
                      <div style={{fontSize:10,color:"var(--success)",marginBottom:2}}>Free — available</div>
                      <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:2}}>{calcUsable(slot.prefix)}</div>
                      <div style={{fontSize:9,color:"var(--accent)",marginTop:4,opacity:0.9}}>click to allocate</div>
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
