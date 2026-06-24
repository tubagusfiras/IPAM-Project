// Reusable Badge Component
export function Badge({ label, style }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", padding:"2px 8px",
      borderRadius:99, fontSize:10, fontWeight:600, border:"1px solid", ...style
    }}>{label}</span>
  );
}