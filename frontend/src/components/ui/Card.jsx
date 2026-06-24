// Reusable Card Component
export function Card({ children, className, ...props }) {
  const base = "card";
  const cn = [base, className].filter(Boolean).join(" ");
  return (
    <div className={cn} {...props}>
      {children}
    </div>
  );
}