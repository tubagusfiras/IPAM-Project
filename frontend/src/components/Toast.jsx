import { createContext, useContext, useState, useCallback, useEffect } from "react";

// ── CONTEXT ──────────────────────────────────────────────
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((msg, type="info", duration=4000) => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, msg, type, duration }]);
    if (duration > 0) setTimeout(() => removeToast(id), duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(p => p.filter(t => t.id !== id));
  }, []);

  const TYPES = {
    success: { bg:"#1a3a2a", border:"#22c55e", icon:"✓", color:"#22c55e" },
    error:   { bg:"#3a1a1a", border:"#ef4444", icon:"✕", color:"#ef4444" },
    info:    { bg:"#1a2a3a", border:"#3b82f6", icon:"ℹ", color:"#3b82f6" },
    warning: { bg:"#3a2a1a", border:"#f59e0b", icon:"⚠", color:"#f59e0b" },
  };

  const TOAST_STYLE = {
    position:"fixed", bottom:24, right:24, zIndex:9999,
    display:"flex", flexDirection:"column-reverse", gap:8,
  };
  const T_STYLE = (t) => ({
    background:TYPES[t.type]?.bg||TYPES.info.bg, color:"#e2e8f0",
    border:`1px solid ${TYPES[t.type]?.border||TYPES.info.border}`,
    borderRadius:8, padding:"10px 14px", minWidth:280, maxWidth:400,
    display:"flex", alignItems:"center", gap:10,
    boxShadow:"0 4px 20px rgba(0,0,0,0.3)", cursor:"pointer",
    fontSize:13, fontWeight:500, lineHeight:"1.4",
    animation:"slideInRight 0.3s ease",
    backdropFilter:"blur(8px)",
  });

  return (
    <ToastCtx.Provider value={addToast}>
      {children}
      {toasts.length > 0 && (
        <>
          <style>{STYLES}</style>
          <div style={TOAST_STYLE}>
            {toasts.map(t => (
              <div key={t.id} style={T_STYLE(t)} onClick={() => removeToast(t.id)}>
                <span style={{color:TYPES[t.type]?.color||TYPES.info.color, fontWeight:700, fontSize:15, flexShrink:0}}>
                  {TYPES[t.type]?.icon||"ℹ"}
                </span>
                <span style={{flex:1}}>{t.msg}</span>
                <span style={{color:"#64748b", fontSize:11, cursor:"pointer", flexShrink:0}}>✕</span>
              </div>
            ))}
          </div>
        </>
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

const STYLES = `
@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
`;
