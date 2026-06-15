import { useState, useEffect, useRef, useCallback } from "react";
import { getBlocks } from "../api.js";

const STATUS_COLOR = {
  ghost:        { color:"#ef4444", bg:"rgba(239,68,68,0.1)",  border:"rgba(239,68,68,0.25)",  label:"Ghost"        },
  unregistered: { color:"#f59e0b", bg:"rgba(245,158,11,0.1)", border:"rgba(245,158,11,0.25)", label:"Unregistered" },
  firewall:     { color:"#6b7280", bg:"rgba(107,114,128,0.1)",border:"rgba(107,114,128,0.25)",label:"Likely Firewall"},
};

function formatEta(sec) {
  if (!sec || sec <= 0) return "";
  if (sec < 60) return `~${sec}s`;
  return `~${Math.ceil(sec/60)}m ${sec%60}s`;
}

function formatElapsed(sec) {
  if (!sec) return "0s";
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec/60)}m ${sec%60}s`;
}

export default function IPScan() {
  const [blocks,      setBlocks]      = useState([]);
  const [blockId,     setBlockId]     = useState("");
  const [scanData,    setScanData]    = useState(null);   // hasil scan
  const [polling,     setPolling]     = useState(false);
  const [actionMsg,   setActionMsg]   = useState(null);
  const [filterType,  setFilterType]  = useState("all"); // all | ghost | unregistered | responding
  const [confirmDel,  setConfirmDel]  = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    // Restore session scan jika ada
    const saved = sessionStorage.getItem("ipscan_data");
    if (saved) {
      try { setScanData(JSON.parse(saved)); } catch {}
    }
    // Restore block yang terakhir di-scan
    const savedBlock = sessionStorage.getItem("ipscan_block");

    getBlocks({limit:100}).then(d => {
      const ipv4 = (d.items||[]).filter(b => b.ip_version === "IPv4");
      setBlocks(ipv4);
      if (savedBlock && ipv4.find(b => b.id === savedBlock)) {
        setBlockId(savedBlock);
      } else if (ipv4.length) {
        setBlockId(ipv4[0].id);
      }
    });

    // Resume polling jika scan masih running
    if (saved) {
      try {
        const d = JSON.parse(saved);
        if (d.status === "running" && d.scan_id) {
          setPolling(true);
          pollRef.current = setInterval(() => pollStatus(d.scan_id), 1500);
        }
      } catch {}
    }

    // Cleanup polling saat unmount
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  // Save scan data ke sessionStorage agar tidak hilang saat pindah page
  useEffect(() => {
    if (scanData) sessionStorage.setItem("ipscan_data", JSON.stringify(scanData));
  }, [scanData]);

  // Save selected block
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
        clearInterval(pollRef.current);
      }
    } catch(e) { console.error(e); }
  }, []);

  const startScan = async () => {
    if (!blockId) return;
    // Clear session lama jika block berbeda
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
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({block_id: blockId}),
      });
      const d = await res.json();
      if (d.status === "started" || d.status === "already_running") {
        // Poll setiap 1.5 detik
        pollRef.current = setInterval(() => pollStatus(blockId), 1500);
        pollStatus(blockId);
      }
    } catch(e) {
      console.error(e);
      setPolling(false);
    }
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
      const res = await fetch("/api/v1/scan/action", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({action, alloc_id}),
      });
      const d = await res.json();
      setActionMsg(`${action === "delete" ? "Deleted" : "Marked deprecated"}: ${prefix}`);
      setTimeout(() => setActionMsg(null), 3000);
      // Refresh scan status
      pollStatus(scanData.scan_id);
    } catch(e) {
      setActionMsg("Error: " + e.message);
    }
    setConfirmDel(null);
  };

  // Filter results
  const ghosts        = scanData?.ghost_allocs || [];
  const unregistered  = scanData?.unregistered_ips || [];
  const responding    = (scanData?.results || []).filter(r => r.responding && !r.discrepancy);

  const selectedBlock = blocks.find(b => b.id === blockId);
  const pct = scanData?.pct || 0;
  const isRunning = scanData?.status === "running" || polling;
  const isDone    = scanData?.status === "done";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div>
          <h1 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text)"}}>IP Scan</h1>
          <p style={{margin:"4px 0 0",fontSize:13,color:"var(--text-muted)"}}>
            Scan jaringan untuk menemukan discrepancy antara kondisi real dan data IPAM
          </p>
        </div>
      </div>

      {/* Scan control */}
      <div className="card" style={{padding:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200}}>
            <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
              letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>IP Block (IPv4)</label>
            <select value={blockId} onChange={e=>setBlockId(e.target.value)}
              className="select" disabled={isRunning} style={{height:36,fontSize:13}}>
              {blocks.map(b=>(
                <option key={b.id} value={b.id}>{b.prefix} — {b.name||b.site_name||"—"}</option>
              ))}
            </select>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end",paddingBottom:0}}>
            {!isRunning ? (
              <button onClick={startScan} className="btn btn-primary"
                style={{height:36}} disabled={!blockId}>
                🔍 Start Scan
              </button>
            ) : (
              <button onClick={cancelScan} className="btn btn-secondary"
                style={{height:36,color:"var(--danger)",borderColor:"var(--danger-border)"}}>
                ✕ Cancel
              </button>
            )}
            {isDone && (
              <button onClick={()=>{
                sessionStorage.removeItem("ipscan_data");
                setScanData(null);
              }} className="btn btn-ghost" style={{height:36}}>
                🗑 Clear
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {scanData && (
          <div style={{marginTop:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:12,color:"var(--text-muted)"}}>
                {isRunning ? "Scanning..." : scanData.status === "cancelled" ? "Cancelled" : "Scan Complete"}
                <span style={{fontFamily:"var(--font-mono)",marginLeft:8,color:"var(--text)"}}>
                  {scanData.scanned}/{scanData.total} IPs
                </span>
              </span>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                {isRunning && scanData.eta_seconds && (
                  <span style={{fontSize:11,color:"var(--text-dim)"}}>
                    ETA: {formatEta(scanData.eta_seconds)}
                  </span>
                )}
                <span style={{fontSize:11,color:"var(--text-dim)"}}>
                  Elapsed: {formatElapsed(scanData.elapsed)}
                </span>
                <span style={{fontFamily:"var(--font-mono)",fontSize:13,fontWeight:700,
                  color: isDone?"var(--success)":"var(--accent)"}}>
                  {pct}%
                </span>
              </div>
            </div>
            <div style={{height:8,background:"var(--surface-3)",borderRadius:99,overflow:"hidden"}}>
              <div style={{
                height:"100%",borderRadius:99,
                background: isDone?"var(--success)":isRunning?"var(--accent)":"var(--text-dim)",
                width:`${pct}%`,transition:"width 0.5s",
              }}/>
            </div>
            {/* Summary badges */}
            {(isDone || scanData.scanned > 0) && (
              <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap"}}>
                {[
                  ["Responding",   scanData.responding_count,   "var(--success)",  "var(--success-surface)",  "var(--success-border)"],
                  ["Ghost",        scanData.ghost_count,         "#ef4444",         "rgba(239,68,68,0.1)",     "rgba(239,68,68,0.25)"],
                  ["Unregistered", scanData.unregistered_count,  "#f59e0b",         "rgba(245,158,11,0.1)",    "rgba(245,158,11,0.25)"],
                ].map(([label,val,c,bg,border])=>(
                  <div key={label} style={{
                    display:"flex",alignItems:"center",gap:6,
                    padding:"4px 12px",borderRadius:99,
                    background:bg,border:`1px solid ${border}`,
                    fontSize:12,fontWeight:500,cursor:"pointer",
                  }} onClick={()=>setFilterType(label.toLowerCase())}>
                    <span style={{color:c,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{val}</span>
                    <span style={{color:"var(--text-muted)"}}>{label}</span>
                  </div>
                ))}
                <div style={{
                  display:"flex",alignItems:"center",gap:6,
                  padding:"4px 12px",borderRadius:99,
                  background:"var(--surface-3)",border:"1px solid var(--border-soft)",
                  fontSize:12,fontWeight:500,cursor:"pointer",
                  opacity: filterType==="all"?1:0.6,
                }} onClick={()=>setFilterType("all")}>
                  <span style={{color:"var(--text-muted)"}}>Show All</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action message */}
      {actionMsg && (
        <div style={{
          padding:"10px 16px",borderRadius:"var(--radius)",fontSize:13,
          background:"var(--success-surface)",color:"var(--success)",
          border:"1px solid var(--success-border)",
        }}>{actionMsg}</div>
      )}

      {/* Results */}
      {isDone && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Ghost allocations */}
          {(filterType==="all" || filterType==="ghost") && ghosts.length>0 && (
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border-medium)",
                display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Ghost Allocations</span>
                <span style={{fontSize:11,color:"#ef4444",background:"rgba(239,68,68,0.1)",
                  border:"1px solid rgba(239,68,68,0.25)",padding:"2px 8px",borderRadius:99}}>
                  {ghosts.length} found
                </span>
                <span style={{fontSize:11,color:"var(--text-dim)",marginLeft:4}}>
                  — Terdaftar di IPAM tapi tidak ada IP yang respond
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
                        <span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:600,color:"var(--accent)"}}>
                          {g.alloc_prefix}
                        </span>
                        {g.likely_firewall && (
                          <span style={{fontSize:9,marginLeft:6,color:"var(--text-dim)",
                            background:"var(--surface-3)",padding:"1px 5px",borderRadius:3,
                            border:"1px solid var(--border-soft)"}}>
                            may be firewall
                          </span>
                        )}
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:11,color:"var(--text-muted)",textTransform:"capitalize"}}>
                          {g.owner_type}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:12,color:g.customer_name?"var(--text)":"var(--text-dim)"}}>
                          {g.customer_name||"—"}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span style={{
                          fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:99,
                          background:"rgba(239,68,68,0.1)",color:"#ef4444",
                          border:"1px solid rgba(239,68,68,0.25)",
                        }}>
                          {g.likely_firewall ? "LIKELY FIREWALL" : "GHOST"}
                        </span>
                      </td>
                      <td className="table-cell" onClick={e=>e.stopPropagation()}>
                        {g.alloc_id && (
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={()=>doAction("mark_deprecated", g.alloc_id, g.alloc_prefix)}
                              className="btn btn-ghost btn-sm"
                              style={{fontSize:11,padding:"3px 8px"}}>
                              Mark Deprecated
                            </button>
                            <button onClick={()=>setConfirmDel(g)}
                              className="btn btn-sm"
                              style={{fontSize:11,padding:"3px 8px",
                                background:"var(--danger-surface)",color:"var(--danger)",
                                border:"1px solid var(--danger-border)"}}>
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

          {/* Unregistered IPs */}
          {(filterType==="all" || filterType==="unregistered") && unregistered.length>0 && (
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border-medium)",
                display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Unregistered Devices</span>
                <span style={{fontSize:11,color:"#f59e0b",background:"rgba(245,158,11,0.1)",
                  border:"1px solid rgba(245,158,11,0.25)",padding:"2px 8px",borderRadius:99}}>
                  {unregistered.length} found
                </span>
                <span style={{fontSize:11,color:"var(--text-dim)",marginLeft:4}}>
                  — Respond tapi tidak terdaftar di IPAM
                </span>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr>
                    {["IP Address","Method","Block","Action"].map(h=>(
                      <th key={h} className="table-header">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unregistered.map((r,i)=>(
                    <tr key={r.ip} className="table-row"
                      style={{background:i%2===0?"var(--surface-1)":"var(--surface-2)"}}>
                      <td className="table-cell">
                        <span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:600,color:"#f59e0b"}}>
                          {r.ip}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:11,color:"var(--text-muted)",textTransform:"uppercase",
                          fontFamily:"var(--font-mono)"}}>
                          {r.method}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:11,color:"var(--text-muted)",fontFamily:"var(--font-mono)"}}>
                          {selectedBlock?.prefix||"—"}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:11,color:"var(--text-dim)"}}>
                          Perlu investigasi manual
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Responding (clean) */}
          {filterType==="responding" && (
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border-medium)",
                display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Responding IPs</span>
                <span style={{fontSize:11,color:"var(--success)",background:"var(--success-surface)",
                  border:"1px solid var(--success-border)",padding:"2px 8px",borderRadius:99}}>
                  {responding.length} found
                </span>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr>
                    {["IP","Method","Allocation","Customer"].map(h=>(
                      <th key={h} className="table-header">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {responding.map((r,i)=>(
                    <tr key={r.ip} className="table-row"
                      style={{background:i%2===0?"var(--surface-1)":"var(--surface-2)"}}>
                      <td className="table-cell">
                        <span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:600,color:"var(--success)"}}>
                          {r.ip}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:11,color:"var(--text-muted)",fontFamily:"var(--font-mono)",
                          textTransform:"uppercase"}}>{r.method}</span>
                      </td>
                      <td className="table-cell">
                        <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--accent)"}}>
                          {r.alloc_prefix||"—"}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:12,color:"var(--text-muted)"}}>
                          {r.customer_name||"—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty state */}
          {isDone && ghosts.length===0 && unregistered.length===0 && (
            <div className="card" style={{padding:48,textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:8}}>✅</div>
              <div style={{fontSize:15,fontWeight:600,color:"var(--text)",marginBottom:4}}>
                Tidak ada discrepancy ditemukan
              </div>
              <div style={{fontSize:12,color:"var(--text-muted)"}}>
                Semua alokasi dalam block {scanData.prefix} sesuai kondisi real network
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
                Hapus alokasi <strong style={{fontFamily:"var(--font-mono)",color:"var(--accent)"}}>
                {confirmDel.alloc_prefix}</strong>
                {confirmDel.customer_name && ` (${confirmDel.customer_name})`} dari IPAM?
                <br/><br/>
                Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={()=>setConfirmDel(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={()=>doAction("delete", confirmDel.alloc_id, confirmDel.alloc_prefix)}
                className="btn btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
