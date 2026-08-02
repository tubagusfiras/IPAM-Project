import { useState, useEffect, useRef, useCallback } from "react";
import { getBlocks, authFetch} from "../api.js";
import { Btn, Loading, EmptyState, PageHeader, Icons, Badge, Alert, Card, Toolbar } from "../components/ui.jsx";

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

function getRowStatus(r) {
  if (r.discrepancy === "ghost") return "ghost";
  if (r.discrepancy === "unregistered") return "unregistered";
  if (r.responding && r.alloc_prefix) return "active";
  return "idle";
}

const ROW_STATUS_STYLE = {
  active:        { label: "Active",       color: "var(--success)", bg: "var(--success-surface)", border: "var(--success-border)" },
  ghost:         { label: "Ghost",        color: "#ef4444",        bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.22)" },
  unregistered:  { label: "Unregistered", color: "#f59e0b",        bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.22)" },
  idle:          { label: "Idle",         color: "var(--text-dim)", bg: "var(--surface-2)",      border: "var(--border-soft)" },
};

// IP sort helper: numeric last-octet order, not string order
function ipSortKey(ip) {
  return ip.split(".").map(Number).reduce((acc,o)=>acc*256+o, 0);
}

export default function IPScan() {
  const [blocks,      setBlocks]      = useState([]);
  const [blockId,     setBlockId]     = useState("");
  const [scanData,    setScanData]    = useState(null);
  const [polling,     setPolling]     = useState(false);
  const [actionMsg,   setActionMsg]   = useState(null);
  const [filterType,  setFilterType]  = useState("all");
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [bulkDel,     setBulkDel]     = useState([]);
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
      const res = await authFetch(`/api/v1/scan/status/${id}`);
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
      const res = await authFetch("/api/v1/scan/start", {
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
    await authFetch(`/api/v1/scan/cancel/${scanData.scan_id}`, {method:"POST"});
    setPolling(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    pollStatus(scanData.scan_id);
  };

  const doAction = async (action, alloc_id, prefix) => {
    try {
      await authFetch("/api/v1/scan/action", {
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

  // Bulk delete helpers — only active when filterType==="ghost"
  const toggleGhostAlloc = (prefix) => {
    setBulkDel(prev => {
      const s = new Set(prev);
      if (s.has(prefix)) s.delete(prefix); else s.add(prefix);
      return Array.from(s);
    });
  };

  const toggleGhostPrefix = (prefix) => {
    toggleGhostAlloc(prefix);
  };

  const selectAllGhosts = () => {
    const allPrefixes = [...new Set(ghosts.map(g => g.alloc_prefix))];
    setBulkDel(prev => {
      const s = new Set(prev);
      const allSelected = allPrefixes.every(p => s.has(p));
      if (allSelected) allPrefixes.forEach(p => s.delete(p));
      else allPrefixes.forEach(p => s.add(p));
      return Array.from(s);
    });
  };

  const doBulkDelete = async () => {
    if (!bulkDel.length) return;
    if (!confirm(`Delete ${bulkDel.length} ghost allocation(s)? This cannot be undone.`)) return;
    for (const prefix of bulkDel) {
      const allocs = ghosts.filter(g => g.alloc_prefix === prefix);
      for (const alloc of allocs) {
        try {
          await authFetch("/api/v1/scan/action", {
            method: "POST", headers: {"Content-Type":"application/json"},
            body: JSON.stringify({action:"delete", alloc_id: alloc.alloc_id}),
          });
        } catch(e) { console.error(e); }
      }
    }
    setActionMsg({type:"delete", text:`Deleted ${bulkDel.length} allocation(s)`});
    setTimeout(() => setActionMsg(null), 3500);
    setBulkDel([]);
    pollStatus(scanData.scan_id);
  };

  const ghosts        = scanData?.ghost_allocs || [];
  const unregistered  = scanData?.unregistered_ips || [];
  const allResults     = scanData?.results || [];
  const responding    = allResults.filter(r => r.responding && !r.discrepancy);
  const selectedBlock = blocks.find(b => b.id === blockId);
  const pct = scanData?.pct || 0;
  const isRunning = scanData?.status === "running" || polling;
  const isDone    = scanData?.status === "done";
  const hasData   = !!scanData;

  // Unified per-IP table, sorted numerically, filtered by the selected status card.
  // "idle" (empty, no allocation, no response) is hidden unless explicitly selected.
  const sortedResults = [...allResults].sort((a,b)=>ipSortKey(a.ip)-ipSortKey(b.ip));
  const visibleRows = sortedResults.filter(r => {
    const status = getRowStatus(r);
    if (filterType === "all") return status !== "idle";
    return status === filterType;
  });
  const idleCount = allResults.filter(r=>getRowStatus(r)==="idle").length;
  const allUniquePrefixes = [...new Set(ghosts.map(g => g.alloc_prefix).filter(Boolean))];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div>
          <h1 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text)"}}>IP Scan</h1>
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
                Start Scan
              </button>
            ) : (
              <button onClick={cancelScan} className="btn btn-secondary"
                style={{height:38,color:"var(--danger)",borderColor:"var(--danger-border)"}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" style={{marginRight:4}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel
              </button>
            )}
            {isDone && (
              <button onClick={()=>{ sessionStorage.removeItem("ipscan_data"); setScanData(null); }}
                className="btn btn-ghost" style={{height:38}}>
                Clear
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
                backgroundSize: isRunning ? "200% 100%" : undefined,
                animation: isRunning ? "shimmer 2s linear infinite" : undefined,
              }}/>
            </div>

            {/* Summary cards */}
            {(isDone || scanData.scanned > 0) && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginTop:16}}>
                {[
                  {key:"active",       label:"Responding",    val:scanData.responding_count,   icon:"check", color:"var(--success)", bg:"var(--success-surface)", border:"var(--success-border)"},
                  {key:"ghost",        label:"Ghost",         val:scanData.ghost_count,         icon:"ghost", color:"#ef4444",         bg:"rgba(239,68,68,0.08)",   border:"rgba(239,68,68,0.22)"},
                  {key:"unregistered", label:"Unregistered",  val:scanData.unregistered_count,  icon:"warn",  color:"#f59e0b",         bg:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.22)"},
                  {key:"idle",         label:"Idle",          val:idleCount,                    icon:"○",   color:"var(--text-dim)", bg:"var(--surface-2)",      border:"var(--border-soft)"},
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

      </div>

      {/* Action message toast */}
      {actionMsg && (
        <div style={{
          padding:"10px 16px",borderRadius:"var(--radius)",fontSize:13,display:"flex",alignItems:"center",gap:8,
          background: actionMsg.type==="error" ? "var(--danger-surface)" : actionMsg.type==="delete" ? "var(--danger-surface)" : "var(--success-surface)",
          color: actionMsg.type==="error" || actionMsg.type==="delete" ? "var(--danger)" : "var(--success)",
          border: `1px solid ${actionMsg.type==="error" || actionMsg.type==="delete" ? "var(--danger-border)" : "var(--success-border)"}`,
        }}>
          <span>{actionMsg.type==="error" ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>}</span>
          {actionMsg.text}
        </div>
      )}

      {!hasData && (
        <div className="card" style={{padding:"48px 0",textAlign:"center"}}>
          <div style={{fontSize:13,color:"var(--text-dim)"}}>No scan results</div>
        </div>
      )}

      {/* Results */}
      {isDone && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Unified per-IP results table */}
            {visibleRows.length>0 && (
              <div className="card" style={{overflow:"hidden"}}>
                <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border-medium)",
                  display:"flex",alignItems:"center",gap:10,background:"var(--surface-2)"}}>
                  <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>IP Results</span>
                  <span style={{fontSize:11,color:"var(--text-muted)"}}>
                    {selectedBlock?.prefix||""}
                  </span>
                  <span style={{fontSize:11,color:"var(--text-dim)",background:"var(--surface-3)",
                    border:"1px solid var(--border-soft)",padding:"2px 8px",borderRadius:99,fontWeight:600}}>
                    {visibleRows.length}
                  </span>
                  {filterType!=="all" && (
                    <button onClick={()=>setFilterType("all")} className="btn btn-ghost btn-sm"
                      style={{fontSize:11,padding:"3px 8px",marginLeft:"auto"}}>
                      Clear filter
                    </button>
                  )}
                </div>
                {filterType==="ghost" && bulkDel.length > 0 && (
                  <div style={{padding:"8px 12px",background:"rgba(239,68,68,0.08)",borderTop:"1px solid var(--danger-border)",display:"flex",alignItems:"center",gap:10,fontSize:12}}>
                    <span style={{color:"var(--danger)",fontWeight:600}}>{bulkDel.length} selected</span>
                    <button onClick={selectAllGhosts} className="btn btn-ghost btn-sm" style={{fontSize:11}}>
                      {bulkDel.length === [...new Set(ghosts.map(g=>g.alloc_prefix))].length ? "Deselect All" : "Select All"}
                    </button>
                    <button onClick={doBulkDelete} className="btn btn-sm"
                      style={{background:"rgba(239,68,68,0.15)",color:"rgb(239,68,68)",border:"1px solid rgba(239,68,68,0.3)",padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                      Delete {bulkDel.length > 1 ? `(${bulkDel.length})` : ""}
                    </button>
                  </div>
                )}
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr>
                      {filterType==="ghost" && (
                        <th className="table-header" style={{width:36,textAlign:"center"}}>
                          <input type="checkbox" checked={bulkDel.length===allUniquePrefixes.length && allUniquePrefixes.length>0}
                            onChange={selectAllGhosts}
                            style={{cursor:"pointer",accentColor:"var(--accent)",width:13,height:13}}/>
                        </th>
                      )}
                      {["IP","Status","Owner Type","Customer","Action"].map(h=>(
                        <th key={h} className="table-header">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r,i)=>{
                      const status = getRowStatus(r);
                      const style = ROW_STATUS_STYLE[status];
                      const ghostPrefix = r.alloc_prefix;
                      const ghostItem = status==="ghost" && ghostPrefix ? ghosts.find(g=>g.alloc_prefix===ghostPrefix) : null;
                      const isChecked = ghostPrefix ? bulkDel.includes(ghostPrefix) : false;
                      return (
                        <tr key={r.ip} className="table-row"
                          style={{background:i%2===0?"var(--surface-1)":"var(--surface-2)"}}>
                          {filterType==="ghost" && (
                            <td className="table-cell" style={{width:36,textAlign:"center"}}>
                              <input type="checkbox" checked={isChecked}
                                onChange={()=>{if(ghostPrefix)toggleGhostAlloc(ghostPrefix)}}
                                style={{cursor:"pointer",accentColor:"var(--accent)",width:13,height:13}}/>
                            </td>
                          )}
                          <td className="table-cell">
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{width:3,height:24,borderRadius:2,background:style.color,flexShrink:0}}/>
                              <span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:600,color:"var(--text)",
                                textDecoration:isChecked?"line-through":"none",
                                opacity:isChecked?0.5:1}}>
                                {r.ip}
                              </span>
                            </div>
                          </td>
                          <td className="table-cell">
                            <span style={{
                              fontSize:10,fontWeight:600,padding:"3px 9px",borderRadius:99,
                              background:style.bg, color:style.color,
                              border:`1px solid ${style.border}`,
                            }}>
                              {status==="ghost" && ghostItem?.likely_firewall ? "LIKELY FIREWALL" : style.label.toUpperCase()}
                            </span>
                          </td>
                          <td className="table-cell">
                            <span style={{fontSize:11,color:"var(--text-muted)",textTransform:"capitalize"}}>
                              {r.owner_type||"—"}
                            </span>
                          </td>
                          <td className="table-cell">
                            <span style={{fontSize:12,color:r.customer_name?"var(--text)":"var(--text-dim)"}}>
                              {r.customer_name||"—"}
                            </span>
                          </td>
                          <td className="table-cell" onClick={e=>e.stopPropagation()}>
                            {status==="ghost" && ghostItem && (
                              <div style={{display:"flex",gap:4}}>
                                <button onClick={()=>doAction("mark_deprecated", ghostItem.alloc_id, ghostItem.alloc_prefix)}
                                  className="btn btn-ghost btn-sm" style={{fontSize:11,padding:"3px 8px"}}>
                                  Mark Deprecated
                                </button>
                                <button onClick={()=>setConfirmDel(ghostItem)} className="btn btn-sm"
                                  style={{fontSize:11,padding:"3px 8px",background:"var(--danger-surface)",
                                    color:"var(--danger)",border:"1px solid var(--danger-border)"}}>
                                  Delete
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {visibleRows.length===0 && filterType!=="all" && (
              <div className="card" style={{padding:32,textAlign:"center"}}>
                <div style={{fontSize:13,color:"var(--text-dim)"}}>No IPs match this filter</div>
                <button onClick={()=>setFilterType("all")} className="btn btn-ghost btn-sm" style={{marginTop:10}}>
                  Clear filter
                </button>
              </div>
            )}

            {/* All clean */}
          {ghosts.length===0 && unregistered.length===0 && (
            <div className="card" style={{padding:48,textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:700}}>OK</div>
              <div style={{fontSize:15,fontWeight:600,color:"var(--text)",marginBottom:4}}>
                No discrepancies found
              </div>
              <div style={{fontSize:12,color:"var(--text-muted)"}}>
                All allocations in block <span style={{fontFamily:"var(--font-mono)",color:"var(--accent)"}}>{scanData.prefix}</span> match the live network state
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
                style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",fontSize:18}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div className="modal-body">
              <p style={{fontSize:13,color:"var(--text-muted)",lineHeight:1.6,margin:0}}>
                Delete allocation <strong style={{fontFamily:"var(--font-mono)",color:"var(--accent)"}}>{confirmDel.alloc_prefix}</strong>
                {confirmDel.customer_name && ` (${confirmDel.customer_name})`} from IPAM?
                <br/><br/>This action cannot be undone and will be recorded in Audit Logs.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={()=>setConfirmDel(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={()=>doAction("delete", confirmDel.alloc_id, confirmDel.alloc_prefix)} className="btn btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
