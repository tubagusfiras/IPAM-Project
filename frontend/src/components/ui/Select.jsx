// Reusable Select Component
export function Select({ value, onChange, children, ...props }) {
  return <select value={value} onChange={onChange} className="select" {...props}>{children}</select>
}