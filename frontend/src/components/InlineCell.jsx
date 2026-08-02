import { useState, useEffect, useRef } from "react";
import AutoInput from "./AutoInput.jsx";

export default function InlineCell({ value, onSave, mono, placeholder, suggestions=[], onCreate, type="text" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value||"");
  const ref = useRef();

  useEffect(()=>{ if(!editing) setVal(value||""); },[value, editing]);
  useEffect(()=>{ if(editing && ref.current) ref.current.focus(); },[editing]);

  const commit = async v => {
    const final = v!==undefined ? v : val;
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

  if (suggestions.length>0) return (
    <AutoInput value={val} onChange={v=>setVal(v)}
      suggestions={suggestions} mono={mono}
      placeholder={placeholder} onCreate={onCreate}
      onBlur={()=>commit()}
    />
  );

  return (
    <input ref={ref} value={val} autoFocus type={type}
      onChange={e=>setVal(e.target.value)}
      onBlur={()=>commit()}
      onKeyDown={e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape"){ setEditing(false); setVal(value||""); }}}
      className="input"
      style={{fontSize:12,padding:"3px 8px",fontFamily:mono?"var(--font-mono)":"inherit",minWidth:80}}
    />
  );
}
