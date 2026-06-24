// Reusable Input Component
export function Input({ value, onChange, ...props }) {
  return <input value={value} onChange={onChange} className="input" {...props} />
}