import { useEffect, useRef } from "react";

/**
 * Keyboard shortcuts for modals.
 * Escape → onClose, Enter → onSubmit
 */
export default function useModalKeys({ onClose, onSubmit, open = true }) {
  const onCloseRef = useRef(onClose);
  const onSubmitRef = useRef(onSubmit);
  onCloseRef.current = onClose;
  onSubmitRef.current = onSubmit;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tag = e.target.tagName;
        if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;
        if (onSubmitRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onSubmitRef.current();
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open]);
}
