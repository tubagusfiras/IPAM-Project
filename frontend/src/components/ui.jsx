// ── TOKENS ───────────────────────────────────────────────────
export const C = {
  bg0:     "#010d18",
  bg1:     "#061422",
  bg2:     "#0d1f33",
  bg3:     "#142840",
  border:  "#1a3350",
  border2: "#234060",
  text0:   "#f0f6ff",
  text1:   "#94a3b8",
  text2:   "#4a6080",
  blue:    "#3b82f6",
  green:   "#22c55e",
  amber:   "#f59e0b",
  red:     "#ef4444",
  purple:  "#a855f7",
  cyan:    "#06b6d4",
  mono:    "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
};

export const STATUS = {
  active:        { bg:"#052010", text:"#22c55e", border:"#16a34a" },
  reserved:      { bg:"#0d0d2e", text:"#818cf8", border:"#4f46e5" },
  available:     { bg:"#051520", text:"#38bdf8", border:"#0284c7" },
  deprecated:    { bg:"#1a0800", text:"#fb923c", border:"#c2410c" },
  planned:       { bg:"#0d0d2e", text:"#a78bfa", border:"#7c3aed" },
  decommissioned:{ bg:"#1a0505", text:"#f87171", border:"#dc2626" },
};

// ── BADGE ────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.available;
  return (
    <span style={{
      background:s.bg, color:s.text, border:`1px solid ${s.border}`,
      padding:"1px 7px", borderRadius:3, fontSize:10, fontWeight:700,
      textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:C.mono,
      whiteSpace:"nowrap",
    }}>{status}</span>
  );
}

export function VersionBadge({ v }) {
  const color = v === "IPv4" ? C.green : C.purple;
  return (
    <span style={{
      color, background:color+"15", border:`1px solid ${color}30`,
      padding:"1px 6px", borderRadius:3, fontSize:10, fontWeight:700,
      fontFamily:C.mono,
    }}>{v}</span>
  );
}

export function Tag({ children, color=C.cyan }) {
  return (
    <span style={{
      background:color+"15", color, border:`1px solid ${color}30`,
      padding:"1px 6px", borderRadius:3, fontSize:10, fontFamily:C.mono,
    }}>{children}</span>
  );
}

// ── MONO TEXT ────────────────────────────────────────────────
export function Mono({ children, color=C.blue, size=13 }) {
  return <span style={{ fontFamily:C.mono, color, fontSize:size }}>{children}</span>;
}

// ── BUTTON ───────────────────────────────────────────────────
const BTN_VARIANTS = {
  primary: { bg:"#1d4ed8", text:"#fff",     hoverBg:"#2563eb" },
  success: { bg:"#15803d", text:"#fff",     hoverBg:"#16a34a" },
  danger:  { bg:"#991b1b", text:"#fca5a5",  hoverBg:"#dc2626" },
  ghost:   { bg:C.bg3,     text:C.text1,    hoverBg:"#1e3a5f" },
  outline: { bg:"transparent", text:C.blue, hoverBg:C.bg2, border:`1px solid ${C.blue}` },
};

export function Btn({ children, onClick, variant="primary", size="md", disabled, style={} }) {
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
  const pad = size==="sm" ? "3px 10px" : size==="lg" ? "10px 24px" : "6px 16px";
  const fs  = size==="sm" ? 11 : size==="lg" ? 14 : 12;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background:v.bg, color:v.text, border:v.border||"none",
      padding:pad, borderRadius:5, fontSize:fs, fontWeight:500,
      cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.45:1,
      transition:"background 0.12s", whiteSpace:"nowrap", ...style,
    }}
    onMouseEnter={e=>{ if(!disabled) e.currentTarget.style.background=v.hoverBg; }}
    onMouseLeave={e=>{ e.currentTarget.style.background=v.bg; }}
    >{children}</button>
  );
}

// ── INPUT ────────────────────────────────────────────────────
export function Input({ label, value, onChange, placeholder, type="text", required, mono, small }) {
  return (
    <div style={{ marginBottom:small?8:14 }}>
      {label && (
        <div style={{ color:C.text2, fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>
          {label}{required&&<span style={{color:C.red}}> *</span>}
        </div>
      )}
      <input type={type} value={value||""} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width:"100%", boxSizing:"border-box",
          background:C.bg1, border:`1px solid ${C.border}`, color:C.text0,
          padding:small?"5px 9px":"7px 11px", borderRadius:5,
          fontSize:small?12:13, outline:"none",
          fontFamily: mono?C.mono:"inherit",
          transition:"border-color 0.15s",
        }}
        onFocus={e=>e.target.style.borderColor=C.blue}
        onBlur={e=>e.target.style.borderColor=C.border}
      />
    </div>
  );
}

export function Select({ label, value, onChange, options, required, small }) {
  return (
    <div style={{ marginBottom:small?8:14 }}>
      {label && (
        <div style={{ color:C.text2, fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>
          {label}{required&&<span style={{color:C.red}}> *</span>}
        </div>
      )}
      <select value={value||""} onChange={e=>onChange(e.target.value)}
        style={{
          width:"100%", boxSizing:"border-box",
          background:C.bg1, border:`1px solid ${C.border}`, color:C.text0,
          padding:small?"5px 9px":"7px 11px", borderRadius:5,
          fontSize:small?12:13, outline:"none",
        }}
        onFocus={e=>e.target.style.borderColor=C.blue}
        onBlur={e=>e.target.style.borderColor=C.border}
      >
        <option value="">— Select —</option>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── SEARCH BAR ───────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder, width=260 }) {
  return (
    <div style={{ position:"relative", width }}>
      <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:C.text2, fontSize:13, pointerEvents:"none" }}>⌕</span>
      <input value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder||"Search…"}
        style={{
          width:"100%", boxSizing:"border-box",
          background:C.bg2, border:`1px solid ${C.border}`, color:C.text0,
          padding:"6px 10px 6px 28px", borderRadius:5, fontSize:12,
          outline:"none", fontFamily:C.mono,
        }}
        onFocus={e=>e.target.style.borderColor=C.blue}
        onBlur={e=>e.target.style.borderColor=C.border}
      />
    </div>
  );
}

// ── MODAL ────────────────────────────────────────────────────
export function Modal({ title, onClose, children, width=520 }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"#000c", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{
        background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:10,
        width:"100%", maxWidth:width, maxHeight:"92vh", overflow:"auto",
        boxShadow:"0 30px 80px #0009",
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 22px", borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, background:C.bg2, zIndex:1 }}>
          <span style={{ color:C.text0, fontWeight:600, fontSize:14 }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.text2, fontSize:18, cursor:"pointer", lineHeight:1, padding:"2px 6px", borderRadius:4 }}>✕</button>
        </div>
        <div style={{ padding:22 }}>{children}</div>
      </div>
    </div>
  );
}

// ── CONFIRM DIALOG ───────────────────────────────────────────
export function Confirm({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"#000c", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:C.bg2, border:`1px solid ${C.red}44`, borderRadius:8, padding:28, maxWidth:360, textAlign:"center" }}>
        <div style={{ color:C.text0, marginBottom:20, fontSize:14, lineHeight:1.6 }}>{message}</div>
        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant="danger" onClick={onConfirm}>Delete</Btn>
        </div>
      </div>
    </div>
  );
}

// ── SPREADSHEET TABLE ────────────────────────────────────────
export function SpreadTable({ columns, rows, onRowClick, loading, empty="No data." }) {
  if (loading) return <div style={{ color:C.text2, padding:"48px 0", textAlign:"center", fontSize:13 }}>Loading…</div>;
  return (
    <div style={{ overflowX:"auto", overflowY:"auto", maxHeight:"calc(100vh - 220px)", position:"relative" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, tableLayout:"auto" }}>
        <thead style={{ position:"sticky", top:0, zIndex:10 }}>
          <tr style={{ background:C.bg1, borderBottom:`2px solid ${C.border2}` }}>
            {columns.map((col,i) => (
              <th key={i} style={{
                textAlign:"left", padding:"8px 12px",
                color:C.text2, fontSize:10, fontWeight:600,
                textTransform:"uppercase", letterSpacing:"0.08em",
                whiteSpace:"nowrap", borderRight:`1px solid ${C.border}`,
                minWidth:col.width||100,
              }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={columns.length} style={{ padding:"48px 0", textAlign:"center", color:C.text2 }}>{empty}</td></tr>
            : rows.map((row, i) => (
              <tr key={row._key||i}
                onClick={() => onRowClick && onRowClick(row)}
                style={{
                  borderBottom:`1px solid ${C.border}`,
                  background: i%2===0 ? C.bg1 : C.bg0,
                  cursor: onRowClick?"pointer":"default",
                  transition:"background 0.1s",
                }}
                onMouseEnter={e=>e.currentTarget.style.background=C.bg3}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?C.bg1:C.bg0}
              >
                {columns.map((col,j) => (
                  <td key={j} style={{
                    padding:"6px 12px", borderRight:`1px solid ${C.border}`,
                    whiteSpace: col.wrap?"normal":"nowrap",
                    maxWidth: col.maxWidth||240,
                    overflow:"hidden", textOverflow:"ellipsis",
                  }}>
                    {col.render ? col.render(row) : <span style={{color:C.text1}}>{row[col.key]??""}</span>}
                  </td>
                ))}
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}

// ── PAGE HEADER ──────────────────────────────────────────────
export function PageHeader({ title, icon, count, children }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ color:C.blue, fontSize:16 }}>{icon}</span>
        <span style={{ color:C.text0, fontWeight:600, fontSize:15 }}>{title}</span>
        {count!=null && <span style={{ background:C.bg3, color:C.text2, fontSize:11, padding:"1px 8px", borderRadius:10, fontFamily:C.mono }}>{count}</span>}
      </div>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>{children}</div>
    </div>
  );
}

// ── STAT CARD ────────────────────────────────────────────────
export function StatCard({ label, value, accent, sub, icon }) {
  return (
    <div style={{
      background:C.bg2, border:`1px solid ${accent}25`, borderRadius:8,
      padding:"16px 18px", position:"relative", overflow:"hidden",
    }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${accent},transparent)` }}/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ color:C.text2, fontSize:10, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>{label}</div>
          <div style={{ color:C.text0, fontSize:26, fontWeight:700, fontFamily:C.mono }}>{(value??0).toLocaleString()}</div>
          {sub && <div style={{ color:C.text2, fontSize:10, marginTop:4, fontFamily:C.mono }}>{sub}</div>}
        </div>
        {icon && <span style={{ fontSize:22, opacity:0.3 }}>{icon}</span>}
      </div>
    </div>
  );
}

// ── TOOLBAR ──────────────────────────────────────────────────
export function Toolbar({ children }) {
  return (
    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
      {children}
    </div>
  );
}

// ── DIVIDER ──────────────────────────────────────────────────
export function Divider() {
  return <div style={{ height:1, background:C.border, margin:"16px 0" }}/>;
}

// ── EMPTY STATE ──────────────────────────────────────────────
export function Empty({ icon="📭", message }) {
  return (
    <div style={{ textAlign:"center", padding:"60px 20px", color:C.text2 }}>
      <div style={{ fontSize:36, marginBottom:12, opacity:0.4 }}>{icon}</div>
      <div style={{ fontSize:13 }}>{message}</div>
    </div>
  );
}

// ── LOADING ──────────────────────────────────────────────────
export function Loading() {
  return <div style={{ color:C.text2, padding:"48px 0", textAlign:"center", fontSize:13 }}>Loading…</div>;
}

// ── ALERT ────────────────────────────────────────────────────
export function Alert({ type="error", message }) {
  const colors = {
    error:   { bg:"#1a0505", border:C.red,   text:"#fca5a5" },
    success: { bg:"#051a0a", border:C.green,  text:"#86efac" },
    info:    { bg:"#05101a", border:C.blue,   text:"#93c5fd" },
  };
  const c = colors[type];
  return (
    <div style={{ background:c.bg, border:`1px solid ${c.border}44`, borderRadius:6, padding:"10px 14px", color:c.text, fontSize:13, marginBottom:12 }}>
      {message}
    </div>
  );
}
