// Reusable Modal Component
export function Modal({ children, onClose, ...props }) {
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" {...props}>
        {children}
      </div>
    </div>
  );
}