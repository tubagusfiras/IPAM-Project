import useModalKeys from "../hooks/useModalKeys.js";

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
  primary: { bg:"var(--accent)", text:"#fff",     hoverBg:"var(--accent-hover, var(--accent))" },
  success: { bg:"var(--success)", text:"#fff",     hoverBg:"var(--success-hover, var(--success))" },
  danger:  { bg:"var(--danger)", text:"#fff",  hoverBg:"var(--danger-hover, var(--danger))" },
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
  network: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4M12 11l-5.5 6M12 11l5.5 6"/></svg>,
  location: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>,
  chart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>,
  globe: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z"/></svg>,
  file: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  wireless: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>,
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

// ── FORM FIELD (with validation) ────────────────────────────
export function FormField({ label, value, onChange, placeholder, error, type="text", required, mono, small, maxLength }) {
  const hasError = !!error;
  return (
    <div style={{ marginBottom:small?8:14 }}>
      {label && (
        <div style={{ color:hasError?C.red:C.text2, fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>
          {label}{required&&<span style={{color:C.red}}> *</span>}
        </div>
      )}
      <input type={type} value={value||""} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} maxLength={maxLength}
        style={{
          width:"100%", boxSizing:"border-box",
          background:C.bg1, border:`1px solid ${hasError?C.red:C.border}`, color:C.text0,
          padding:small?"5px 9px":"7px 11px", borderRadius:5,
          fontSize:small?12:13, outline:"none",
          fontFamily: mono?C.mono:"inherit",
          transition:"border-color 0.15s",
        }}
        onFocus={e=>e.target.style.borderColor=hasError?C.red:C.blue}
        onBlur={e=>e.target.style.borderColor=hasError?C.red:C.border}
      />
      {hasError && (
        <div style={{ color:C.red, fontSize:10, marginTop:3, display:"flex", alignItems:"center", gap:3 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}
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
  useModalKeys({ onClose, open: true });
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
export function Confirm({ message, onConfirm, onCancel, title="Confirm Delete", cancelLabel="Cancel", confirmLabel="Delete", zIndex }) {
  useModalKeys({ onClose: onCancel, onSubmit: onConfirm, open: true });
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onCancel()} style={zIndex ? {zIndex} : undefined}>
      <div className="modal" style={{maxWidth:380}}>
        <div className="modal-header">
          <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>{title}</div>
          <button onClick={onCancel} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",fontSize:18,padding:4}}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{fontSize:13,color:"var(--text-muted)",lineHeight:1.6,margin:0}}>{message}</p>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel}  className="btn btn-secondary">{cancelLabel}</button>
          <button onClick={onConfirm} className="btn btn-danger">{confirmLabel}</button>
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
export function EmptyState({ icon, title, message, action, onAction }) {
  return (
    <div style={{ textAlign:"center", padding:"60px 20px", color:C.text2 }}>
      {icon ? (
        <div style={{ marginBottom:16, opacity:0.4, display:"flex", justifyContent:"center", transform:"scale(1.1)" }}>{icon}</div>
      ) : (
        <svg viewBox="0 0 80 80" fill="none" width="80" height="80" style={{marginBottom:16,opacity:0.25}}>
          <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4"/>
          <circle cx="40" cy="40" r="12" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M40 28v24M28 40h24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
        </svg>
      )}
      {title && <div style={{ fontSize:15, fontWeight:600, color:C.text0, marginBottom:8 }}>{title}</div>}
      {message && <div style={{ fontSize:13, marginBottom: action ? 16 : 0, color:C.text1, lineHeight:1.5 }}>{message}</div>}
      {action && onAction && <Btn variant="ghost" onClick={onAction} style={{marginTop:4}}>{action}</Btn>}
    </div>
  );
}

// ── LOADING ──────────────────────────────────────────────────
export function Loading({ message="Loading…" }) {
  return (
    <div style={{ color:C.text2, padding:"48px 0", textAlign:"center", fontSize:13, display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
      <div style={{ width:28, height:28, border:`2.5px solid ${C.border}`, borderTopColor:C.blue, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <span style={{color:C.text1}}>{message}</span>
    </div>
  );
}

// ── ALERT ────────────────────────────────────────────────────
export function Alert({ type="error", message }) {
  const icons = {
    error:   <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M10 6v5M10 13.5v.5" strokeLinecap="round"/></svg>,
    success: <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M7 10l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    info:    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M10 9v4M10 7v.5" strokeLinecap="round"/></svg>,
  };
  const colors = {
    error:   { bg:"rgba(239,68,68,0.08)", border:"#ef4444", text:"#fca5a5" },
    success: { bg:"rgba(34,197,94,0.08)", border:"#22c55e", text:"#86efac" },
    info:    { bg:"rgba(59,130,246,0.08)", border:"#3b82f6", text:"#93c5fd" },
  };
  const c = colors[type];
  return (
    <div style={{ background:c.bg, border:`1px solid ${c.border}33`, borderRadius:8, padding:"10px 14px", color:c.text, fontSize:13, marginBottom:12, display:"flex", alignItems:"center", gap:8, animation:"fadeUp 0.3s ease" }}>
      <span style={{flexShrink:0,opacity:0.8}}>{icons[type]}</span>
      <span style={{lineHeight:1.5}}>{message}</span>
    </div>
  );
}
