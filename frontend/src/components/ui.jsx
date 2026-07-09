// ── TOKENS — CSS variables (auto-adapt ke light/dark) ────────
export const C = {
  bg0:     "var(--bg)",
  bg1:     "var(--bg-secondary)",
  bg2:     "var(--surface-1)",
  bg3:     "var(--surface-2)",
  border:  "var(--border-soft)",
  border2: "var(--border-medium)",
  text0:   "var(--text)",
  text1:   "var(--text-muted)",
  text2:   "var(--text-dim)",
  blue:    "var(--accent)",
  green:   "var(--success)",
  amber:   "var(--warning)",
  red:     "var(--danger)",
  purple:  "#a855f7",
  cyan:    "#06b6d4",
  mono:    "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
};

export const STATUS = {
  active:        { bg:"var(--success-surface)", text:"var(--success)", border:"var(--success-border)" },
  reserved:      { bg:"var(--info-surface)", text:"#818cf8", border:"#4f46e5" },
  available:     { bg:"var(--info-surface)", text:"var(--accent)", border:"var(--info-border)" },
  deprecated:    { bg:"var(--warning-surface)", text:"var(--warning)", border:"var(--warning-border)" },
  planned:       { bg:"var(--info-surface)", text:"#a78bfa", border:"#7c3aed" },
  decommissioned:{ bg:"var(--danger-surface)", text:"var(--danger)", border:"var(--danger-border)" },
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

// ── ICONS ────────────────────────────────────────────────────
export const Icons = {
  spinner: <svg className="animate-spin" viewBox="0 0 24 24" fill="none" width="14" height="14"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  filter: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  menu: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  arrowLeft: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  arrowRight: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
};

// ── BUTTON ───────────────────────────────────────────────────
export function Btn({ children, onClick, variant="primary", size="md", disabled, loading, icon, iconPosition="left", style={} }) {
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
  const pad = size==="sm" ? "3px 10px" : size==="lg" ? "10px 24px" : "6px 16px";
  const fs  = size==="sm" ? 11 : size==="lg" ? 14 : 12;

  const handleMouseEnter = (e) => {
    if (!disabled && !loading && v.hoverBg) e.currentTarget.style.background = v.hoverBg;
  };
  const handleMouseLeave = (e) => {
    if (!disabled && !loading) e.currentTarget.style.background = v.bg;
  };

  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      background:v.bg, color:v.text, border:v.border||"none",
      padding:pad, borderRadius:5, fontSize:fs, fontWeight:500,
      cursor:disabled||loading?"not-allowed":"pointer", opacity:disabled||loading?0.5:1,
      transition:"background 0.15s, transform 0.1s", whiteSpace:"nowrap",
      display:"inline-flex", alignItems:"center", justifyContent:"center", gap:"6px", ...style,
    }}
    onMouseEnter={handleMouseEnter}
    onMouseLeave={handleMouseLeave}
    onMouseDown={e=>{ if(!disabled && !loading) e.currentTarget.style.transform="scale(0.97)"; }}
    onMouseUp={e=>{ if(!disabled && !loading) e.currentTarget.style.transform="scale(1)"; }}
    >
      {loading && Icons.spinner}
      {!loading && icon && iconPosition==="left" && icon}
      {children}
      {!loading && icon && iconPosition==="right" && icon}
    </button>
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

// ── LOADING SKELETON ──────────────────────────────────────────
export function Skeleton({ width="100%", height=14, borderRadius=4 }) {
  return (
    <div style={{
      width, height, borderRadius,
      background:`linear-gradient(90deg, ${C.bg1} 25%, ${C.bg2} 50%, ${C.bg1} 75%)`,
      backgroundSize:"200% 100%",
      animation:"shimmer 1.5s infinite",
    }}/>
  );
}

export function SkeletonTable({ rows=5, cols=4 }) {
  return (
    <div style={{ padding:"8px 12px" }}>
      {Array.from({length:rows}).map((_, i) => (
        <div key={i} style={{ display:"flex", gap:"12px", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
          {Array.from({length:cols}).map((_, j) => (
            <Skeleton key={j} width={j===0 ? "40px" : `${100-cols*5}%`} height={12} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── CARD ────────────────────────────────────────────────────
export function Card({ children, title, icon, accent, padding=18, style={} }) {
  return (
    <div style={{
      background:C.bg2,
      border: accent ? `1px solid ${accent}30` : `1px solid ${C.border}`,
      borderRadius:8,
      padding,
      position:"relative",
      overflow:"hidden",
      ...style,
    }}>
      {accent && <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${accent},transparent)` }} />}
      {title && (
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom: title ? 12 : 0 }}>
          {icon && <span style={{ fontSize:16, opacity:0.6 }}>{icon}</span>}
          <span style={{ color:C.text0, fontWeight:600, fontSize:13 }}>{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

// ── EMPTY STATE ──────────────────────────────────────────────
export function EmptyState({ icon="📭", title, message, action, onAction }) {
  return (
    <div style={{ textAlign:"center", padding:"60px 20px", color:C.text2 }}>
      <div style={{ fontSize:48, marginBottom:16, opacity:0.3 }}>{icon}</div>
      {title && <div style={{ fontSize:15, fontWeight:600, color:C.text0, marginBottom:8 }}>{title}</div>}
      {message && <div style={{ fontSize:13, marginBottom: action ? 16 : 0 }}>{message}</div>}
      {action && onAction && <Btn variant="ghost" onClick={onAction}>{action}</Btn>}
    </div>
  );
}

// ── LOADING ──────────────────────────────────────────────────
export function Loading({ message="Loading…" }) {
  return (
    <div style={{ color:C.text2, padding:"48px 0", textAlign:"center", fontSize:13, display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
      <div style={{ width:24, height:24, border:`2px solid ${C.border}`, borderTopColor:C.blue, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      {message}
    </div>
  );
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
