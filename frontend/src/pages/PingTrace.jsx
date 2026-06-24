import { authFetch } from "../api.js";
import { useState, useRef, useCallback, useEffect } from "react";

const IP_REGEX = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/;

function parseTracerouteLine(line) {
  const hopMatch = line.match(/^\s*(\d+)\s+(.+)$/);
  if (!hopMatch) return null;
  const hopNum = hopMatch[1];
  const rest = hopMatch[2];
  if (rest.trim() === "* * *") return { hop: hopNum, ip: null, hostname: null, timeout: true, raw: line };
  const ipMatch = rest.match(IP_REGEX);
  const hostMatch = rest.match(/^([^\s(]+)\s*\(/);
  return { hop: hopNum, ip: ipMatch ? ipMatch[1] : null, hostname: hostMatch ? hostMatch[1] : null, timeout: false, raw: line };
}

function parsePingLine(line) {
  const m = line.match(/time=([\d.]+)\s*ms/);
  const seq = line.match(/icmp_seq=(\d+)/);
  return { time: m ? parseFloat(m[1]) : null, seq: seq ? seq[1] : null };
}

const STATUS_COLOR = { active: "#22c55e", timeout: "#ef4444", unregistered: "#f59e0b" };

export default function PingTrace() {
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState("ping");
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState([]);
  const [hops, setHops] = useState([]);
  const [ipamCache, setIpamCache] = useState({});
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [pingStats, setPingStats] = useState(null);
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

  const ipamCacheRef = useRef({});
  const lookupIp = useCallback(async (ip) => {
    if (!ip || ipamCacheRef.current[ip] !== undefined) return;
    ipamCacheRef.current[ip] = null;
    setIpamCache(prev => ({...prev, [ip]: null}));
    try {
      const token = localStorage.getItem("ipam_token");
      const res = await fetch(`/api/v1/ping-trace/lookup?target=${ip}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const d = await res.json();
      ipamCacheRef.current[ip] = d.ipam_info || false;
      setIpamCache(prev => ({...prev, [ip]: d.ipam_info || false}));
    } catch {
      ipamCacheRef.current[ip] = false;
      setIpamCache(prev => ({...prev, [ip]: false}));
    }
  }, []);

  const saveHistory = (t) => {
    const next = [t, ...history.filter(h => h !== t)].slice(0, 8);
    setHistory(next);
    sessionStorage.setItem("pingtrace_history", JSON.stringify(next));
  };

  const run = (overrideTarget) => {
    const t = (overrideTarget || target).trim();
    if (!t) return;
    setTarget(t); saveHistory(t);
    setLines([]); setHops([]); setError(null); setPingStats(null); setRunning(true);
    if (esRef.current) esRef.current.close();

    const url = mode === "ping"
      ? `/api/v1/ping-trace/ping?target=${encodeURIComponent(t)}&count=4`
      : `/api/v1/ping-trace/traceroute?target=${encodeURIComponent(t)}&max_hops=30`;

    const es = new EventSource(url);
    esRef.current = es;

    let tmr = setTimeout(() => { es.close(); setRunning(false); setError("Timeout—No response in 30 seconds"); }, 30000);

    es.onmessage = (event) => {
      clearTimeout(tmr);
      tmr = setTimeout(() => { es.close(); setRunning(false); setError("Timeout—No response in 30 seconds"); }, 30000);
      try {
        const d = JSON.parse(event.data);
        if (d.type === "line") {
          setLines(prev => [...prev, d.text]);
          // Collect ping stats
          if (mode === "ping") {
            const p = parsePingLine(d.text);
            if (p && p.time !== null) setPingStats(prev => ({ ...prev, last: p.time, count: (prev?.count||0)+1 }));
          }
          if (mode === "traceroute") {
            const parsed = parseTracerouteLine(d.text);
            if (parsed) { setHops(prev => [...prev, parsed]); if (parsed.ip) lookupIp(parsed.ip); }
          }
        } else if (d.type === "done") { clearTimeout(tmr); setRunning(false); es.close(); }
      } catch {}
    };

    es.onerror = () => { clearTimeout(tmr); setError("Connection lost"); setRunning(false); es.close(); };
  };

  const stop = () => { if (esRef.current) { esRef.current.close(); esRef.current = null; } setRunning(false); };
  const clear = () => { setLines([]); setHops([]); setError(null); setPingStats(null); };

  const statCard = (label, val, color) => val !== undefined && val !== null ? (
    <div style={{textAlign:"center",padding:"8px 14px",background:"var(--surface-2)",borderRadius:8,minWidth:80}}>
      <div style={{fontSize:20,fontWeight:700,color:color||"var(--text)",fontVariantNumeric:"tabular-nums"}}>{val}</div>
      <div style={{fontSize:10,color:"var(--text-dim)",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>{label}</div>
    </div>
  ) : null;

  const timeoutCount = hops.filter(h => h.timeout).length;
  const validHops = hops.filter(h => !h.timeout);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20,fontFamily:"Inter,system-ui,sans-serif"}}>

      {/* ── Header ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:18,fontWeight:600,color:"var(--text)"}}>Ping & Trace</div>
          <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>Network diagnostics tool</div>
        </div>
      </div>

      {/* ── Control Panel ── */}
      <div className="card" style={{padding:16}}>
        <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
          <div>
            <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6,display:"block"}}>Mode</label>
            <div style={{display:"flex",gap:2,background:"var(--surface-2)",borderRadius:6,padding:3}}>
              {["ping","traceroute"].map(m => (
                <button key={m} onClick={()=>setMode(m)} disabled={running}
                  style={{padding:"6px 14px",fontSize:12,fontWeight:600,borderRadius:4,border:"none",cursor:running?"not-allowed":"pointer",
                    background:mode===m?"var(--accent)":"transparent",color:mode===m?"#fff":"var(--text-muted)",textTransform:"capitalize",transition:"all 0.12s"}}>{m}</button>
              ))}
            </div>
          </div>

          <div style={{flex:1,minWidth:200}}>
            <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6,display:"block"}}>Target</label>
            <input value={target} onChange={e=>setTarget(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!running)run();}}
              placeholder="IP address or hostname" className="input" style={{height:36,fontSize:13,fontFamily:"var(--font-mono)"}} disabled={running}/>
          </div>

          <div style={{display:"flex",gap:6}}>
            {!running ? (
              <button onClick={()=>run()} className="btn btn-primary" style={{height:36,fontSize:12}} disabled={!target.trim()}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run
              </button>
            ) : (
              <button onClick={stop} className="btn btn-secondary" style={{height:36,fontSize:12,color:"var(--danger)",border:"1px solid var(--danger-border)"}}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> Stop
              </button>
            )}
            <button onClick={clear} className="btn btn-ghost" style={{height:36,fontSize:12}} disabled={running || (lines.length===0 && hops.length===0)}>Clear</button>
          </div>
        </div>

        {history.length > 0 && (
          <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:10,color:"var(--text-dim)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Recent:</span>
            {history.map(h => (
              <button key={h} onClick={()=>run(h)} disabled={running}
                style={{fontFamily:"var(--font-mono)",fontSize:11,padding:"2px 10px",borderRadius:99,
                  background:"var(--surface-2)",border:"1px solid var(--border-soft)",color:"var(--text-muted)",cursor:running?"not-allowed":"pointer"}}>{h}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{padding:"10px 16px",borderRadius:8,fontSize:13,background:"var(--danger-surface)",color:"var(--danger)",border:"1px solid var(--danger-border)"}}>
          <span style={{display:"inline-flex",marginRight:6}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </span>
          {error}
        </div>
      )}

      {/* ── Ping Output ── */}
      {mode === "ping" ? (
        <>
          {pingStats && (
            <div style={{display:"flex",gap:10}}>
              {statCard("Responses", `${pingStats.count||0}/4`, STATUS_COLOR.active)}
              {statCard("Last RTT", pingStats.last ? `${pingStats.last.toFixed(1)} ms` : "-", pingStats.last < 50 ? STATUS_COLOR.active : pingStats.last < 150 ? "#f59e0b" : STATUS_COLOR.timeout)}
              {statCard("Packet Loss", lines.some(l=>l.includes("100%")) ? "100%" : lines.some(l=>l.includes("0%")) ? "0%" : "—",
                lines.some(l=>l.includes("100%")) ? STATUS_COLOR.timeout : STATUS_COLOR.active)}
            </div>
          )}
          <div className="card" style={{overflow:"hidden"}}>
            <div style={{padding:"10px 16px",borderBottom:"1px solid var(--border-medium)",background:"var(--surface-2)",
              display:"flex",alignItems:"center",gap:10}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:running?"var(--accent)":lines.length?"var(--success)":"var(--text-dim)",
                animation:running?"pt-pulse 1.2s ease-in-out infinite":"none",flexShrink:0}}/>
              <span style={{fontSize:12,fontWeight:600,color:"var(--text)",flex:1}}>
                {running ? "Running..." : lines.length ? "Complete" : "Terminal Output"}
              </span>
              {lines.length > 0 && <span style={{fontSize:10,color:"var(--text-dim)"}}>{lines.length} lines</span>}
            </div>
            <div ref={outputRef} style={{padding:16,fontFamily:"var(--font-mono)",fontSize:12,lineHeight:1.8,
              maxHeight:"50vh",overflowY:"auto",background:"var(--surface-2)"}}>
              {lines.length===0 && !running && (
                <div style={{display:"flex",alignItems:"center",gap:8,color:"var(--text-dim)"}}>
                  <span style={{opacity:0.5}}>$</span>
                  <span>waiting for input...</span>
                </div>
              )}
              {lines.map((line,i)=>{
                const p = parsePingLine(line);
                const color = line.includes("0% packet loss") ? "var(--success)" : line.includes("100% packet loss") ? "var(--danger)"
                  : p?.time !== null ? (p?.time < 50 ? "var(--success)" : p?.time < 150 ? "var(--warning)" : "var(--danger)") : "var(--text-muted)";
                return <div key={i} style={{color}}>{line || " "}</div>;
              })}
              {running && <div style={{color:"var(--accent)"}}>▋</div>}
            </div>
          </div>
        </>
      ) : (
        /* ── Traceroute Output ── */
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"10px 16px",borderBottom:"1px solid var(--border-medium)",background:"var(--surface-2)",
            display:"flex",alignItems:"center",gap:10}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:running?"var(--accent)":hops.length?"var(--success)":"var(--text-dim)",
              animation:running?"pt-pulse 1.2s ease-in-out infinite":"none",flexShrink:0}}/>
            <span style={{fontSize:12,fontWeight:600,color:"var(--text)",flex:1}}>
              {running ? "Tracing route..." : hops.length ? `${hops.length} hops (${timeoutCount} timeout, ${validHops.length} reached)` : "Traceroute Output"}
            </span>
            {hops.length > 0 && (
              <div style={{display:"flex",gap:8,fontSize:10}}>
                <span style={{color:STATUS_COLOR.active}}>{validHops.length} ok</span>
                {timeoutCount > 0 && <span style={{color:STATUS_COLOR.timeout}}>{timeoutCount} timeout</span>}
              </div>
            )}
          </div>
          {hops.length === 0 && !running ? (
            <div style={{padding:"50px 0",textAlign:"center",color:"var(--text-dim)",fontSize:13}}>No trace data yet — enter a target to begin</div>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr>
                    {["#","IP Address","Hostname","IPAM Info"].map(h => (
                      <th key={h} style={{padding:"8px 14px",textAlign:"left",color:"var(--text-dim)",fontWeight:600,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid var(--border-medium)",background:"var(--surface-2)"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hops.map((hop,i) => {
                    const info = hop.ip ? ipamCache[hop.ip] : undefined;
                    return (
                      <tr key={i} style={{borderBottom:i < hops.length-1 ? "1px solid var(--border-subtle)" : "none",transition:"background 0.12s"}}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <td style={{padding:"8px 14px",fontWeight:600,color:hop.timeout?"var(--text-dim)":"var(--text)",fontFamily:"var(--font-mono)"}}>{hop.hop}</td>
                        <td style={{padding:"8px 14px"}}>
                          {hop.timeout ? (
                            <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:99,background:"rgba(239,68,68,0.1)",color:"#ef4444",fontSize:10,fontWeight:600}}>
                              <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                              Timeout
                            </span>
                          ) : (
                            <span style={{fontFamily:"var(--font-mono)",fontWeight:600,color:"var(--accent)"}}>{hop.ip || "—"}</span>
                          )}
                        </td>
                        <td style={{padding:"8px 14px",color:hop.hostname?"var(--text-muted)":"var(--text-dim)"}}>{hop.hostname || "—"}</td>
                        <td style={{padding:"8px 14px"}}>
                          {hop.timeout ? (
                            <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:99,background:"rgba(239,68,68,0.1)",color:"#ef4444",fontSize:9,fontWeight:600}}>HOP NOT REGISTERED ON IPAM</span>
                          ) : info === null ? (
                            <div style={{height:10,width:80,background:"var(--surface-3)",borderRadius:99,animation:"pt-shimmer 1.5s infinite"}}/>
                          ) : info ? (
                            <div style={{display:"flex",flexDirection:"column",gap:2}}>
                              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                <span style={{fontSize:9,fontWeight:600,padding:"1px 6px",borderRadius:99,background:"var(--accent-dim)",color:"var(--accent)",textTransform:"uppercase"}}>{info.owner_type}</span>
                                <span style={{fontSize:12,fontWeight:500,color:"var(--text)"}}>{info.customer_name || info.block_name || "—"}</span>
                              </div>
                              {info.router && <span style={{fontSize:10,color:"var(--text-dim)",fontFamily:"var(--font-mono)"}}>{info.router}{info.site_name ? ` · ${info.site_name}` : ""}</span>}
                            </div>
                          ) : (
                            <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:99,background:"rgba(245,158,11,0.1)",color:"#f59e0b",fontSize:9,fontWeight:600}}>NOT REGISTERED</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pt-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }
        @keyframes pt-shimmer { 0%{opacity:0.3} 50%{opacity:1} 100%{opacity:0.3} }
      `}</style>
    </div>
  );
}
