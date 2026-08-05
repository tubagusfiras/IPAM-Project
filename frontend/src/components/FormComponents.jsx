import { useState, useEffect, useRef } from "react";

export function AutoInput({ value, onChange, suggestions=[], placeholder, mono, onCreate, onBlur }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState(value||"");
  const ref = useRef();
  const blurTimer = useRef(null);

  useEffect(()=>{ setQuery(value||""); },[value]);
  useEffect(()=>()=>{ if(blurTimer.current) clearTimeout(blurTimer.current); },[]);

  const filtered = query
    ? suggestions.filter(s=>s.toLowerCase().includes(query.toLowerCase())).slice(0,8)
    : suggestions.slice(0,8);

  const select = v => {
    if(blurTimer.current) clearTimeout(blurTimer.current);
    setQuery(v);
    onChange(v);
    setOpen(false);
    if(onBlur) onBlur(v);
  };

  return (
    <div ref={ref} style={{position:"relative",width:"100%"}}>
      <input value={query}
        onChange={e=>{ setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={()=>setOpen(true)}
        onBlur={()=>{
          blurTimer.current = setTimeout(()=>{
            setOpen(false);
            if(onBlur) onBlur(query);
          },150);
        }}
        onKeyDown={e=>{
          if(e.key==="Enter") {
            e.preventDefault();
            if(blurTimer.current) clearTimeout(blurTimer.current);
            setOpen(false);
            onChange(query);
            if(onBlur) onBlur(query);
          }
          if(e.key==="Escape") { setOpen(false); setQuery(value||""); }
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
              borderBottom:"1px solid var(--border-soft)",
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

export function InlineCell({ value, onSave, mono, placeholder, suggestions=[], onCreate, type="text" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value||"");
  const ref = useRef();

  useEffect(()=>{ if(!editing) setVal(value||""); },[value, editing]);
  useEffect(()=>{ if(editing && ref.current) ref.current.focus(); },[editing]);

  const commit = async (v) => {
    const final = v !== undefined ? v : val;
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

  if (suggestions.length>0) {
    const listId = `ac-${Math.random().toString(36).slice(2)}`;
    return (
      <>
        <input ref={ref} value={val} autoFocus type={type}
          list={listId}
          onChange={e=>{
            const v = e.target.value;
            setVal(v);
          }}
          onBlur={()=>commit(undefined)}
          onKeyDown={e=>{
            if(e.key==="Enter") {
              e.preventDefault();
              commit(undefined);
            }
            if(e.key==="Escape"){ setEditing(false); setVal(value||""); }
          }}
          className="input"
          style={{fontSize:12,padding:"3px 8px",fontFamily:mono?"var(--font-mono)":"inherit",minWidth:80}}
          placeholder={placeholder}
        />
        <datalist id={listId}>
          {suggestions.slice(0,50).map(s=><option key={s} value={s} />)}
        </datalist>
      </>
    );
  }

  return (
    <input ref={ref} value={val} autoFocus type={type}
      onChange={e=>setVal(e.target.value)}
      onBlur={()=>commit(undefined)}
      onKeyDown={e=>{ if(e.key==="Enter") commit(undefined); if(e.key==="Escape"){ setEditing(false); setVal(value||""); }}}
      className="input"
      style={{fontSize:12,padding:"3px 8px",fontFamily:mono?"var(--font-mono)":"inherit",minWidth:80}}
    />
  );
}
