import { useState, useRef, useCallback, useEffect } from "react";

const IP_REGEX = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/;

function parseTracerouteLine(line) {
  // Format: " 1  hostname (1.2.3.4)  0.182 ms  0.054 ms  0.057 ms"
  // atau: " 5  * * *"
  const hopMatch = line.match(/^\s*(\d+)\s+(.+)$/);
  if (!hopMatch) return null;
  const hopNum = hopMatch[1];
  const rest = hopMatch[2];
  if (rest.trim() === "* * *") {
    return { hop: hopNum, ip: null, hostname: null, timeout: true, raw: line };
  }
  const ipMatch = rest.match(IP_REGEX);
  const hostMatch = rest.match(/^([^\s(]+)\s*\(/);
  return {
    hop: hopNum,
    ip: ipMatch ? ipMatch[1] : null,
    hostname: hostMatch ? hostMatch[1] : null,
    timeout: false,
    raw: line,
  };
}

function parsePingLine(line) {
  // "64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=0.586 ms"
  const m = line.match(/time=([\d.]+)\s*ms/);
  const seq = line.match(/icmp_seq=(\d+)/);
  return { time: m ? parseFloat(m[1]) : null, seq: seq ? seq[1] : null };
}

export default function PingTrace() {
  const [target,     setTarget]     = useState("");
  const [mode,        setMode]      = useState("ping"); // ping | traceroute
  const [running,     setRunning]   = useState(false);
  const [lines,       setLines]     = useState([]);
  const [hops,         setHops]     = useState([]); // parsed traceroute hops
  const [ipamCache,   setIpamCache] = useState({}); // ip -> info
  const [history,     setHistory]   = useState([]);
  const [error,       setError]     = useState(null);
  const esRef = useRef(null);
  const outputRef = useRef(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("pingtrace_history");
    if (saved) { try { setHistory(JSON.parse(saved)); } catch {} }
    return () => { if (esRef.current) esRef.current.close(); };
  }, []);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [lines]);

  const lookupIp = useCallback(async (ip) => {
    if (!ip || ipamCache[ip] !== undefined) return;
    setIpamCache(prev => ({...prev, [ip]: null})); // mark as loading
    try {
      const res = await fetch(`/api/v1/ping-trace/lookup?target=${ip}`);
      const d = await res.json();
      setIpamCache(prev => ({...prev, [ip]: d.ipam_info}));
    } catch {
      setIpamCache(prev => ({...prev, [ip]: false}));
    }
  }, [ipamCache]);

  const saveHistory = (t) => {
    const next = [t, ...history.filter(h => h !== t)].slice(0, 8);
    setHistory(next);
    sessionStorage.setItem("pingtrace_history", JSON.stringify(next));
  };

  const run = (overrideTarget) => {
    const t = (overrideTarget || target).trim();
    if (!t) return;
    setTarget(t);
    saveHistory(t);
    setLines([]);
    setHops([]);
    setError(null);
    setRunning(true);

    if (esRef.current) esRef.current.close();

    const url = mode === "ping"
      ? `/api/v1/ping-trace/ping?target=${encodeURIComponent(t)}&count=4`
      : `/api/v1/ping-trace/traceroute?target=${encodeURIComponent(t)}&max_hops=30`;

    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data);
        if (d.type === "line") {
          setLines(prev => [...prev, d.text]);
          if (mode === "traceroute") {
            const parsed = parseTracerouteLine(d.text);
            if (parsed) {
              setHops(prev => [...prev, parsed]);
              if (parsed.ip) lookupIp(parsed.ip);
            }
          }
        } else if (d.type === "done") {
          setRunning(false);
          es.close();
        }
      } catch {}
    };

    es.onerror = () => {
      setError("Koneksi terputus atau target tidak valid");
      setRunning(false);
      es.close();
    };
  };

  const stop = () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setRunning(false);
  };

  const clear = () => {
    setLines([]);
    setHops([]);
    setError(null);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Header */}
      <h1 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text)"}}>Ping &amp; Trace</h1>

      {/* Control panel */}
      <div className="card" style={{padding:16}}>
        <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
          {/* Mode toggle */}
          <div>
            <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
              letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Mode</label>
            <div style={{display:"flex",gap:2,background:"var(--surface-2)",borderRadius:"var(--radius-sm)",padding:3}}>
              {["ping","traceroute"].map(m=>(
                <button key={m} onClick={()=>setMode(m)} disabled={running}
                  style={{
                    padding:"7px 16px",fontSize:12,fontWeight:600,borderRadius:5,border:"none",
                    cursor: running ? "not-allowed" : "pointer",
                    background: mode===m ? "var(--accent)" : "transparent",
                    color: mode===m ? "#fff" : "var(--text-muted)",
                    textTransform:"capitalize",
                  }}>{m}</button>
              ))}
            </div>
          </div>

          {/* Target input */}
          <div style={{flex:1,minWidth:240}}>
            <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
              letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Target (IP / Hostname)</label>
            <input value={target} onChange={e=>setTarget(e.target.value)}
              onKeyDown={e=>{ if (e.key==="Enter" && !running) run(); }}
              placeholder="e.g. 8.8.8.8 atau google.com"
              className="input" style={{height:38,fontSize:13,fontFamily:"var(--font-mono)"}}
              disabled={running}/>
          </div>

          <div style={{display:"flex",gap:8}}>
            {!running ? (
              <button onClick={()=>run()} className="btn btn-primary" style={{height:38}} disabled={!target.trim()}>
                ▶ Run
              </button>
            ) : (
              <button onClick={stop} className="btn btn-secondary"
                style={{height:38,color:"var(--danger)",borderColor:"var(--danger-border)"}}>
                ■ Stop
              </button>
            )}
            <button onClick={clear} className="btn btn-ghost" style={{height:38}} disabled={running}>
              Clear
            </button>
          </div>
        </div>

        {/* History chips */}
        {history.length>0 && (
          <div style={{display:"flex",gap:6,marginTop:12,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:10,color:"var(--text-dim)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Recent:</span>
            {history.map(h=>(
              <button key={h} onClick={()=>run(h)} disabled={running}
                style={{
                  fontFamily:"var(--font-mono)",fontSize:11,padding:"3px 10px",borderRadius:99,
                  background:"var(--surface-2)",border:"1px solid var(--border-soft)",
                  color:"var(--text-muted)",cursor: running?"not-allowed":"pointer",
                }}>{h}</button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{padding:"10px 16px",borderRadius:"var(--radius)",fontSize:13,
          background:"var(--danger-surface)",color:"var(--danger)",border:"1px solid var(--danger-border)"}}>
          ✕ {error}
        </div>
      )}

      {/* Output */}
      {mode === "ping" ? (
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"10px 16px",borderBottom:"1px solid var(--border-medium)",
            background:"var(--surface-2)",display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:8,height:8,borderRadius:"50%",
              background: running ? "var(--accent)" : lines.length ? "var(--success)" : "var(--text-dim)",
              animation: running ? "pulse-pt 1.2s ease-in-out infinite" : "none"}}/>
            <span style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>
              {running ? "Running..." : lines.length ? "Complete" : "Terminal Output"}
            </span>
          </div>
          <div ref={outputRef} style={{
            padding:16,fontFamily:"var(--font-mono)",fontSize:12,lineHeight:1.8,
            maxHeight:"50vh",overflowY:"auto",background: "var(--surface-2)",
          }}>
            {lines.length===0 && !running && (
              <div style={{display:"flex",alignItems:"center",gap:8,color:"var(--text-dim)"}}>
                <span style={{opacity:0.5}}>$</span>
                <span>waiting for input...</span>
              </div>
            )}
            {lines.map((line,i)=>{
              const ping = parsePingLine(line);
              const color = line.includes("0% packet loss") ? "var(--success)"
                : line.includes("100% packet loss") ? "var(--danger)"
                : ping.time !== null
                  ? (ping.time < 50 ? "var(--success)" : ping.time < 150 ? "var(--warning)" : "var(--danger)")
                  : "var(--text-muted)";
              return (
                <div key={i} style={{color}}>{line || "\u00A0"}</div>
              );
            })}
            {running && <div style={{color:"var(--accent)"}}>▋</div>}
          </div>
        </div>
      ) : (
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"10px 16px",borderBottom:"1px solid var(--border-medium)",
            background:"var(--surface-2)",display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:8,height:8,borderRadius:"50%",
              background: running ? "var(--accent)" : hops.length ? "var(--success)" : "var(--text-dim)",
              animation: running ? "pulse-pt 1.2s ease-in-out infinite" : "none"}}/>
            <span style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>
              {running ? "Tracing route..." : hops.length ? `${hops.length} hops` : "Traceroute Output"}
            </span>
          </div>

          {hops.length===0 && !running ? (
            <div style={{padding:"40px 0",textAlign:"center"}}>
              <div style={{fontSize:24,marginBottom:8,opacity:0.4}}>◌</div>
              <div style={{color:"var(--text-dim)",fontSize:12}}>No trace data</div>
            </div>
          ) : (
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr>
                  {["Hop","IP Address","Hostname","IPAM Info"].map(h=>(
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hops.map((hop,i)=>{
                  const info = hop.ip ? ipamCache[hop.ip] : undefined;
                  return (
                    <tr key={i} className="table-row" style={{background:i%2===0?"var(--surface-1)":"var(--surface-2)"}}>
                      <td className="table-cell">
                        <span style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--text-dim)"}}>{hop.hop}</span>
                      </td>
                      <td className="table-cell">
                        {hop.timeout ? (
                          <span style={{color:"var(--text-dim)",fontStyle:"italic",fontSize:12}}>* * * (timeout)</span>
                        ) : (
                          <span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:600,color:"var(--accent)"}}>
                            {hop.ip || "—"}
                          </span>
                        )}
                      </td>
                      <td className="table-cell">
                        <span style={{fontSize:11,color:"var(--text-muted)"}}>{hop.hostname || "—"}</span>
                      </td>
                      <td className="table-cell">
                        {hop.timeout ? (
                          <span style={{fontSize:11,color:"var(--text-dim)"}}>—</span>
                        ) : info === null ? (
                          <div className="skeleton" style={{height:12,width:100,borderRadius:4}}/>
                        ) : info ? (
                          <div style={{display:"flex",flexDirection:"column",gap:2}}>
                            <div style={{display:"flex",gap:6,alignItems:"center"}}>
                              <span style={{fontSize:9,fontWeight:600,padding:"1px 6px",borderRadius:99,
                                background:"var(--accent-dim)",color:"var(--accent)",textTransform:"uppercase"}}>
                                {info.owner_type}
                              </span>
                              <span style={{fontSize:12,color:"var(--text)",fontWeight:500}}>
                                {info.customer_name || info.block_name || "—"}
                              </span>
                            </div>
                            {info.router && (
                              <span style={{fontSize:10,color:"var(--text-dim)",fontFamily:"var(--font-mono)"}}>
                                via {info.router}{info.site_name ? ` · ${info.site_name}` : ""}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{
                            fontSize:10,fontWeight:500,padding:"2px 8px",borderRadius:99,
                            background:"var(--surface-3)",color:"var(--text-dim)",
                            border:"1px solid var(--border-soft)",
                          }}>
                            not registered
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse-pt {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}
