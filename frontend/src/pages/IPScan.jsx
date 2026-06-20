import { useState, useEffect, useRef, useCallback } from "react";
import { getBlocks } from "../api.js";

function formatEta(sec) {
  if (!sec || sec <= 0) return "";
  if (sec < 60) return `~${sec}s left`;
  return `~${Math.ceil(sec/60)}m left`;
}

function formatElapsed(sec) {
  if (!sec) return "0s";
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec/60)}m ${sec%60}s`;
}

export default function IPScan() {
  const [blocks,      setBlocks]      = useState([]);
  const [blockId,     setBlockId]     = useState("");
  const [scanData,    setScanData]    = useState(null);
  const [polling,     setPolling]     = useState(false);
  const [actionMsg,   setActionMsg]   = useState(null);
  const [filterType,  setFilterType]  = useState("all");
  const [confirmDel,  setConfirmDel]  = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("ipscan_data");
    if (saved) { try { setScanData(JSON.parse(saved)); } catch {} }
    const savedBlock = sessionStorage.getItem("ipscan_block");

    getBlocks({limit:100}).then(d => {
      const ipv4 = (d.items||[]).filter(b => b.ip_version === "IPv4");
      setBlocks(ipv4);
      if (savedBlock && ipv4.find(b => b.id === savedBlock)) setBlockId(savedBlock);
      else if (ipv4.length) setBlockId(ipv4[0].id);
    });

    if (saved) {
      try {
        const d = JSON.parse(saved);
        if (d.status === "running" && d.scan_id) {
          setPolling(true);
          pollRef.current = setInterval(() => pollStatus(d.scan_id), 1500);
        }
      } catch {}
    }

    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, []);

  useEffect(() => {
    if (scanData) sessionStorage.setItem("ipscan_data", JSON.stringify(scanData));
  }, [scanData]);

  useEffect(() => {
    if (blockId) sessionStorage.setItem("ipscan_block", blockId);
  }, [blockId]);

  const pollStatus = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/v1/scan/status/${id}`);
      const d   = await res.json();
      setScanData(d);
      if (d.status === "done" || d.status === "cancelled") {
        setPolling(false);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    } catch(e) { console.error(e); }
  }, []);

  const startScan = async () => {
    if (!blockId) return;
    const saved = sessionStorage.getItem("ipscan_data");
    if (saved) {
      try {
        const old = JSON.parse(saved);
        if (old.scan_id !== blockId) sessionStorage.removeItem("ipscan_data");
      } catch {}
    }
    setScanData(null);
    setPolling(true);
    try {
      const res = await fetch("/api/v1/scan/start", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({block_id: blockId}),
      });
      const d = await res.json();
      if (d.status === "started" || d.status === "already_running") {
        pollRef.current = setInterval(() => pollStatus(blockId), 1500);
        pollStatus(blockId);
      }
    } catch(e) { console.error(e); setPolling(false); }
  };

  const cancelScan = async () => {
    if (!scanData) return;
    await fetch(`/api/v1/scan/cancel/${scanData.scan_id}`, {method:"POST"});
    setPolling(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    pollStatus(scanData.scan_id);
  };

  const doAction = async (action, alloc_id, prefix) => {
    try {
      await fetch("/api/v1/scan/action", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({action, alloc_id}),
      });
      setActionMsg({type: action === "delete" ? "delete" : "deprecate", text:
        `${action === "delete" ? "Deleted" : "Marked deprecated"}: ${prefix}`});
      setTimeout(() => setActionMsg(null), 3500);
      pollStatus(scanData.scan_id);
    } catch(e) {
      setActionMsg({type:"error", text:"Error: " + e.message});
    }
    setConfirmDel(null);
  };

  const ghosts        = scanData?.ghost_allocs || [];
  const unregistered  = scanData?.unregistered_ips || [];
  const responding    = (scanData?.results || []).filter(r => r.responding && !r.discrepancy);
  const selectedBlock = blocks.find(b => b.id === blockId);
  const pct = scanData?.pct || 0;
  const isRunning = scanData?.status === "running" || polling;
  const isDone    = scanData?.status === "done";
  const hasData   = !!scanData;

  const filteredGhosts = filterType==="all"||filterType==="ghost" ? ghosts : [];
  const filteredUnreg  = filterType==="all"||filterType==="unregistered" ? unregistered : [];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div>
          <h1 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text)"}}>IP Scan</h1>
          <p style={{margin:"4px 0 0",fontSize:13,color:"var(--text-muted)"}}>
            Network reconciliation — temukan discrepancy antara kondisi real dan data IPAM
          </p>
        </div>
      </div>

      {/* Scan control card */}
      <div className="card" style={{padding:20}}>
        <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <div style={{
            width:44,height:44,borderRadius:10,flexShrink:0,
            background:"var(--accent-dim)",border:"1px solid var(--border-soft)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,
          }}>📡</div>

          <div style={{flex:1,minWidth:220}}>
            <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
              letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Target Block (IPv4)</label>
            <select value={blockId} onChange={e=>setBlockId(e.target.value)}
              className="select" disabled={isRunning} style={{height:38,fontSize:13,fontWeight:500}}>
              {blocks.map(b=>{
                const pct = b.total_ips ? Math.round((b.used_ips/b.total_ips)*100) : 0;
                return (
                  <option key={b.id} value={b.id}>
                    {b.prefix} — {b.name||b.site_name||"—"} ({pct}% utilized)
                  </option>
                );
              })}
            </select>
          </div>

          <div style={{display:"flex",gap:8,alignSelf:"flex-end"}}>
            {!isRunning ? (
              <button onClick={startScan} className="btn btn-primary" style={{height:38,paddingLeft:18,paddingRight:18}} disabled={!blockId}>
                🔍 Start Scan
              </button>
            ) : (
              <button onClick={cancelScan} className="btn btn-secondary"
                style={{height:38,color:"var(--danger)",borderColor:"var(--danger-border)"}}>
                ✕ Cancel
              </button>
            )}
            {isDone && (
              <button onClick={()=>{ sessionStorage.removeItem("ipscan_data"); setScanData(null); }}
                className="btn btn-ghost" style={{height:38}}>
                🗑 Clear
              </button>
            )}
          </div>
        </div>

        {/* Progress section */}
        {hasData && (
          <div style={{marginTop:20,paddingTop:18,borderTop:"1px solid var(--border-soft)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{
                  width:8,height:8,borderRadius:"50%",
                  background: isRunning?"var(--accent)":isDone?"var(--success)":"var(--text-dim)",
                  animation: isRunning ? "pulse-scan 1.2s ease-in-out infinite" : "none",
                }}/>
                <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>
                  {isRunning ? "Scanning network..." : scanData.status === "cancelled" ? "Scan cancelled" : "Scan complete"}
                </span>
                <span style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--text-muted)"}}>
                  {scanData.scanned}/{scanData.total} IPs
                </span>
              </div>
              <div style={{display:"flex",gap:14,alignItems:"center"}}>
                {isRunning && scanData.eta_seconds && (
                  <span style={{fontSize:11,color:"var(--text-dim)"}}>{formatEta(scanData.eta_seconds)}</span>
                )}
                <span style={{fontSize:11,color:"var(--text-dim)"}}>Elapsed {formatElapsed(scanData.elapsed)}</span>
                <span style={{fontFamily:"var(--font-mono)",fontSize:16,fontWeight:700,
                  color: isDone?"var(--success)":"var(--accent)"}}>{pct}%</span>
              </div>
            </div>

            <div style={{height:8,background:"var(--surface-3)",borderRadius:99,overflow:"hidden",position:"relative"}}>
              <div style={{
                height:"100%",borderRadius:99,width:`${pct}%`,transition:"width 0.6s ease",
                background: isDone
                  ? "linear-gradient(90deg, #16a34a, #22c55e)"
                  : isRunning
                    ? "linear-gradient(90deg, #2563eb, #60a5fa)"
                    : "var(--text-dim)",
              }}/>
            </div>

            {/* Summary cards */}
            {(isDone || scanData.scanned > 0) && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginTop:16}}>
                {[
                  {key:"responding",   label:"Responding",   val:scanData.responding_count,   icon:"✓", color:"var(--success)", bg:"var(--success-surface)", border:"var(--success-border)"},
                  {key:"ghost",        label:"Ghost",         val:scanData.ghost_count,         icon:"👻", color:"#ef4444",         bg:"rgba(239,68,68,0.08)",   border:"rgba(239,68,68,0.22)"},
                  {key:"unregistered", label:"Unregistered",  val:scanData.unregistered_count,  icon:"⚠",  color:"#f59e0b",         bg:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.22)"},
                ].map(s=>(
                  <div key={s.key}
                    onClick={()=>setFilterType(filterType===s.key ? "all" : s.key)}
                    style={{
                      padding:"12px 14px",borderRadius:"var(--radius-sm)",cursor:"pointer",
                      background: filterType===s.key ? s.bg : "var(--surface-2)",
                      border:`1px solid ${filterType===s.key ? s.border : "var(--border-soft)"}`,
                      transition:"all 0.15s",
                    }}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:16}}>{s.icon}</span>
                      <span style={{fontFamily:"var(--font-mono)",fontSize:22,fontWeight:700,color:s.color}}>{s.val}</span>
                    </div>
                    <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:500}}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state inline hint */}
        {!hasData && (
          <div style={{
            marginTop:18,paddingTop:18,borderTop:"1px solid var(--border-soft)",
            display:"flex",alignItems:"center",gap:14,
          }}>
            <div style={{fontSize:13,color:"var(--text-muted)",lineHeight:1.6}}>
              Setiap IP dalam block akan dicek lewat ping dan TCP probe, lalu dibandingkan dengan data alokasi yang ada.
              Klik <strong style={{color:"var(--text)"}}>Start Scan</strong> untuk mulai.
            </div>
          </div>
        )}
      </div>

      {/* Action message toast */}
      {actionMsg && (
        <div style={{
          padding:"10px 16px",borderRadius:"var(--radius)",fontSize:13,display:"flex",alignItems:"center",gap:8,
          background: actionMsg.type==="error" ? "var(--danger-surface)" : actionMsg.type==="delete" ? "var(--danger-surface)" : "var(--success-surface)",
          color: actionMsg.type==="error" || actionMsg.type==="delete" ? "var(--danger)" : "var(--success)",
          border: `1px solid ${actionMsg.type==="error" || actionMsg.type==="delete" ? "var(--danger-border)" : "var(--success-border)"}`,
        }}>
          <span>{actionMsg.type==="error" ? "✕" : "✓"}</span>
          {actionMsg.text}
        </div>
      )}

      {/* No scan yet — full empty state */}
      {!hasData && (
        <div className="card" style={{padding:"60px 40px",textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:16,opacity:0.5}}>🛰️</div>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:8}}>
            Belum ada scan dijalankan
          </div>
          <div style={{fontSize:13,color:"var(--text-muted)",maxWidth:440,margin:"0 auto",lineHeight:1.7}}>
            Pilih block di atas, lalu jalankan scan untuk melihat IP mana yang masih aktif
            dan mana yang sudah tidak terpakai — data IPAM akan disandingkan langsung dengan kondisi network sebenarnya.
          </div>
        </div>
      )}

      {/* Results */}
      {isDone && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Ghost allocations */}
          {filteredGhosts.length>0 && (
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border-medium)",
                display:"flex",alignItems:"center",gap:10,background:"var(--surface-2)"}}>
                <span style={{fontSize:16}}>👻</span>
                <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Ghost Allocations</span>
                <span style={{fontSize:11,color:"#ef4444",background:"rgba(239,68,68,0.1)",
                  border:"1px solid rgba(239,68,68,0.25)",padding:"2px 8px",borderRadius:99,fontWeight:600}}>
                  {ghosts.length}
                </span>
                <span style={{fontSize:11,color:"var(--text-dim)",marginLeft:4}}>
                  Terdaftar di IPAM, tidak ada IP yang respond
                </span>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr>
                    {["Prefix","Owner Type","Customer","Status","Action"].map(h=>(
                      <th key={h} className="table-header">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ghosts.map((g,i)=>(
                    <tr key={g.alloc_id||i} className="table-row"
                      style={{background:i%2===0?"var(--surface-1)":"var(--surface-2)"}}>
                      <td className="table-cell">
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:3,height:24,borderRadius:2,
                            background: g.likely_firewall ? "var(--text-dim)" : "#ef4444",flexShrink:0}}/>
                          <span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:600,color:"var(--accent)"}}>
                            {g.alloc_prefix}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:11,color:"var(--text-muted)",textTransform:"capitalize"}}>{g.owner_type}</span>
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:12,color:g.customer_name?"var(--text)":"var(--text-dim)"}}>
                          {g.customer_name||"—"}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span style={{
                          fontSize:10,fontWeight:600,padding:"3px 9px",borderRadius:99,
                          background: g.likely_firewall ? "var(--surface-3)" : "rgba(239,68,68,0.1)",
                          color: g.likely_firewall ? "var(--text-dim)" : "#ef4444",
                          border: `1px solid ${g.likely_firewall ? "var(--border-soft)" : "rgba(239,68,68,0.25)"}`,
                        }}>
                          {g.likely_firewall ? "LIKELY FIREWALL" : "GHOST"}
                        </span>
                      </td>
                      <td className="table-cell" onClick={e=>e.stopPropagation()}>
                        {g.alloc_id && (
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={()=>doAction("mark_deprecated", g.alloc_id, g.alloc_prefix)}
                              className="btn btn-ghost btn-sm" style={{fontSize:11,padding:"3px 8px"}}>
                              Mark Deprecated
                            </button>
                            <button onClick={()=>setConfirmDel(g)} className="btn btn-sm"
                              style={{fontSize:11,padding:"3px 8px",background:"var(--danger-surface)",
                                color:"var(--danger)",border:"1px solid var(--danger-border)"}}>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Unregistered devices */}
          {filteredUnreg.length>0 && (
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border-medium)",
                display:"flex",alignItems:"center",gap:10,background:"var(--surface-2)"}}>
                <span style={{fontSize:16}}>⚠️</span>
                <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Unregistered Devices</span>
                <span style={{fontSize:11,color:"#f59e0b",background:"rgba(245,158,11,0.1)",
                  border:"1px solid rgba(245,158,11,0.25)",padding:"2px 8px",borderRadius:99,fontWeight:600}}>
                  {unregistered.length}
                </span>
                <span style={{fontSize:11,color:"var(--text-dim)",marginLeft:4}}>
                  Respond tapi tidak terdaftar di IPAM
                </span>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr>{["IP Address","Method","Block","Note"].map(h=>(
                    <th key={h} className="table-header">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {unregistered.map((r,i)=>(
                    <tr key={r.ip} className="table-row" style={{background:i%2===0?"var(--surface-1)":"var(--surface-2)"}}>
                      <td className="table-cell">
                        <span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:600,color:"#f59e0b"}}>{r.ip}</span>
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:11,color:"var(--text-muted)",textTransform:"uppercase",fontFamily:"var(--font-mono)"}}>{r.method}</span>
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:11,color:"var(--text-muted)",fontFamily:"var(--font-mono)"}}>{selectedBlock?.prefix||"—"}</span>
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:11,color:"var(--text-dim)"}}>Perlu investigasi manual</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Responding clean list */}
          {filterType==="responding" && responding.length>0 && (
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border-medium)",
                display:"flex",alignItems:"center",gap:10,background:"var(--surface-2)"}}>
                <span style={{fontSize:16}}>✓</span>
                <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Responding IPs</span>
                <span style={{fontSize:11,color:"var(--success)",background:"var(--success-surface)",
                  border:"1px solid var(--success-border)",padding:"2px 8px",borderRadius:99,fontWeight:600}}>
                  {responding.length}
                </span>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["IP","Method","Allocation","Customer"].map(h=>(
                  <th key={h} className="table-header">{h}</th>
                ))}</tr></thead>
                <tbody>
                  {responding.map((r,i)=>(
                    <tr key={r.ip} className="table-row" style={{background:i%2===0?"var(--surface-1)":"var(--surface-2)"}}>
                      <td className="table-cell"><span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:600,color:"var(--success)"}}>{r.ip}</span></td>
                      <td className="table-cell"><span style={{fontSize:11,color:"var(--text-muted)",fontFamily:"var(--font-mono)",textTransform:"uppercase"}}>{r.method}</span></td>
                      <td className="table-cell"><span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--accent)"}}>{r.alloc_prefix||"—"}</span></td>
                      <td className="table-cell"><span style={{fontSize:12,color:"var(--text-muted)"}}>{r.customer_name||"—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* All clean */}
          {ghosts.length===0 && unregistered.length===0 && (
            <div className="card" style={{padding:48,textAlign:"center"}}>
              <div style={{fontSize:40,marginBottom:10}}>✅</div>
              <div style={{fontSize:15,fontWeight:600,color:"var(--text)",marginBottom:4}}>
                Tidak ada discrepancy ditemukan
              </div>
              <div style={{fontSize:12,color:"var(--text-muted)"}}>
                Semua alokasi dalam block <span style={{fontFamily:"var(--font-mono)",color:"var(--accent)"}}>{scanData.prefix}</span> sesuai kondisi real network
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDel && (
        <div className="modal-overlay" onClick={()=>setConfirmDel(null)}>
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-header">
              <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>Confirm Delete</div>
              <button onClick={()=>setConfirmDel(null)}
                style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",fontSize:18}}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{fontSize:13,color:"var(--text-muted)",lineHeight:1.6,margin:0}}>
                Hapus alokasi <strong style={{fontFamily:"var(--font-mono)",color:"var(--accent)"}}>{confirmDel.alloc_prefix}</strong>
                {confirmDel.customer_name && ` (${confirmDel.customer_name})`} dari IPAM?
                <br/><br/>Tindakan ini tidak dapat dibatalkan dan akan tercatat di Audit Logs.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={()=>setConfirmDel(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={()=>doAction("delete", confirmDel.alloc_id, confirmDel.alloc_prefix)} className="btn btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-scan {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}
