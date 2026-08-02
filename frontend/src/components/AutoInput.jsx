import { useState, useEffect, useRef } from "react";

// ── AUTOCOMPLETE INPUT ───────────────────────────────────────────────────────
export default function AutoInput({ value, onChange, suggestions=[], placeholder, mono, onCreate }) {
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
