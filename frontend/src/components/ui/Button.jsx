// Reusable Button Component
export function Button({ onClick, disabled, className, children, ...props }) {
  const base = "btn";
  const cn = [base, className].filter(Boolean).join(" ");
  return (
    <button onClick={onClick} disabled={disabled} className={cn} {...props}>
      {children}
    </button>
  );
}