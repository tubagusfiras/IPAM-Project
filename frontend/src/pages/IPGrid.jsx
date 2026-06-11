import { useState } from "react";

const OWNER_COLOR = {
  customer:   { bg:"#1e40af22", border:"#3b82f6", dot:"#3b82f6", label:"Customer" },
  internal:   { bg:"#14532d22", border:"#22c55e", dot:"#22c55e", label:"Internal" },
  ptp:        { bg:"#78350f22", border:"#f59e0b", dot:"#f59e0b", label:"PTP" },
  peering:    { bg:"#4c1d9522", border:"#a855f7", dot:"#a855f7", label:"Peering" },
  management: { bg:"#0c4a6e22", border:"#0ea5e9", dot:"#0ea5e9", label:"Mgmt" },
  reserved:   { bg:"#3f3f4622", border:"#71717a", dot:"#71717a", label:"Reserved" },
  free:       { bg:"transparent", border:"#ffffff0f", dot:"#ffffff18", label:"Free" },
};

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
    const p = parseInt(plen);
    const base = ipToInt(addr);
    const size = Math.pow(2, 32-p);
    if (size <= 2) return `${intToIp(base)} — ${intToIp((base+size-1)>>>0)}`;
    return `${intToIp((base+1)>>>0)} — ${intToIp((base+size-2)>>>0)}`;
  } catch { return ""; }
}

const SLOT_SIZES = [
  { label:"/31", value:2  },
  { label:"/30", value:4  },
  { label:"/29", value:8  },
  { label:"/28", value:16 },
  { label:"/27", value:32 },
  { label:"/26", value:64 },
  { label:"/25", value:128},
  { label:"/24", value:256},
];

// Zoom levels: tile min-width in px
const ZOOM_SIZES = [28, 38, 52, 70];

export default function IPGrid({ blockPrefix, allocations, onAllocate, onEdit }) {
  const [hover,    setHover]    = useState(null);
  const [slotSize, setSlotSize] = useState(4);
  const [zoom,     setZoom]     = useState(1); // index into ZOOM_SIZES

  if (!blockPrefix || blockPrefix.includes(":")) return null;

  const [bAddr, bPlen] = blockPrefix.split("/");
  const bStart = ipToInt(bAddr);
  const bSize  = Math.pow(2, 32 - parseInt(bPlen));
  const step   = slotSize;

  const slots = [];
  for (let i = 0; i < bSize; i += step) {
    const slotStart = (bStart + i) >>> 0;
    const slotEnd   = (slotStart + step - 1) >>> 0;
    const plen      = 32 - Math.log2(step);
    const prefix    = `${intToIp(slotStart)}/${plen}`;

    let match = null, partial = false;
    for (const a of (allocations||[])) {
      const [aAddr, aPlen] = a.prefix.split("/");
      const aStart = ipToInt(aAddr);
      const aSize  = Math.pow(2, 32 - parseInt(aPlen));
      const aEnd   = (aStart + aSize - 1) >>> 0;
      if (aStart <= slotStart && aEnd >= slotEnd) { match = a; break; }
      if (aStart <= slotEnd && aEnd >= slotStart) { partial = true; }
    }
    slots.push({ prefix, slotStart, slotEnd, match, partial, idx: i/step });
  }

  const usedSlots = slots.filter(s => s.match && s.match.status !== "available").length;
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
        <span style={{fontSize:11,color:"var(--text-dim)"}}>
          {usedSlots}/{slots.length} used · <span style={{color:"var(--success)"}}>{freeSlots} free</span>
        </span>

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          {/* Slot size */}
          <div style={{display:"flex",gap:2}}>
            {SLOT_SIZES.map(s=>(
              <button key={s.value} onClick={()=>setSlotSize(s.value)}
                style={{
                  padding:"2px 7px",fontSize:10,borderRadius:4,cursor:"pointer",
                  fontFamily:"var(--font-mono)",fontWeight:600,
                  background: slotSize===s.value ? "var(--accent)" : "var(--surface-2)",
                  color: slotSize===s.value ? "#fff" : "var(--text-dim)",
                  border: slotSize===s.value ? "1px solid var(--accent)" : "1px solid var(--border-soft)",
                  transition:"all 0.15s",
                }}>
                {s.label}
              </button>
            ))}
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
              <div style={{width:8,height:8,borderRadius:2,background:v.dot,border:`1px solid ${v.border}`}}/>
              <span style={{fontSize:10,color:"var(--text-dim)"}}>{v.label}</span>
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
          const c = slot.match
            ? (OWNER_COLOR[slot.match.owner_type] || OWNER_COLOR.reserved)
            : slot.partial ? OWNER_COLOR.reserved : OWNER_COLOR.free;
          const isFree = !slot.match && !slot.partial;
          const label  = slot.prefix.split("/")[0].split(".").slice(-1)[0];

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
                    ? (isFree ? "rgba(99,179,237,0.15)" : c.bg.replace("22","44"))
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
                    color: slot.match ? c.dot : "var(--text-dim)",
                    fontWeight: slot.match ? 600 : 400,
                    lineHeight:1,
                  }}>
                    .{label}
                  </span>
                )}
                {slot.match && (
                  <div style={{width:4,height:4,borderRadius:"50%",background:c.dot,marginTop:showLabel?2:0}}/>
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
                    {slot.match ? slot.match.prefix : slot.prefix}
                  </div>
                  {slot.match ? (
                    <>
                      <div style={{fontSize:10,color:c.dot,fontWeight:600,marginBottom:3}}>{c.label.toUpperCase()}</div>
                      {slot.match.customer_name && <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:1}}>{slot.match.customer_name}</div>}
                      {slot.match.description   && <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:1}}>{slot.match.description}</div>}
                      {slot.match.vlan_vid      && <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:1}}>VLAN {slot.match.vlan_vid}</div>}
                      <div style={{fontSize:10,color:"var(--text-dim)",marginTop:2}}>
                        {calcUsable(slot.match.prefix)}
                      </div>
                      <div style={{fontSize:9,color:"var(--text-dim)",marginTop:4,opacity:0.6}}>click to edit</div>
                    </>
                  ) : slot.partial ? (
                    <div style={{fontSize:10,color:"var(--text-dim)"}}>Part of larger allocation</div>
                  ) : (
                    <>
                      <div style={{fontSize:10,color:"var(--success)",marginBottom:2}}>Free — available</div>
                      <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:2}}>{calcUsable(slot.prefix)}</div>
                      <div style={{fontSize:9,color:"var(--accent)",marginTop:4,opacity:0.8}}>click to allocate</div>
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
