import { authFetch } from "../api.js";
import { useState, useRef, useCallback, useEffect } from "react";

const IP_REGEX = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/;
const TARGET_REGEX = /^[a-zA-Z0-9._-]+$/;
const MAX_MTR_CYCLES = 60;

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

function buildTraceSvg(hops, target, isDark) {
  const bg = isDark ? "#0d1117" : "#ffffff";
  const mu = isDark ? "#8b949e" : "#718096";
  const bo = isDark ? "#30363d" : "#e2e8f0";
  const od = isDark ? "#161b22" : "#f7fafc";
  const ac = isDark ? "#58a6ff" : "#3182ce";
  const ok = hops.filter(h => h.ip || h.timeout);
  const rowH = 26, headerH = 40, padX = 20;
  const colW = [44, 140, 210, 80];
  const totalW = colW.reduce((a, b) => a + b, 0) + padX * 2;
  const totalH = headerH + rowH * ok.length + padX;
  const hdrLabels = ["#", "IP Address", "Hostname", "RTT"];
  let hdrSvg = "", hx = padX;
  for (let j = 0; j < hdrLabels.length; j++) {
    hdrSvg += `<text x="${hx + 6}" y="26" font-family="monospace" font-size="10" font-weight="bold" fill="${mu}">${hdrLabels[j]}</text>`;
    hx += colW[j];
  }
  let rowsSvg = "";
  for (let i = 0; i < ok.length; i++) {
    const h = ok[i];
    const y = headerH + i * rowH;
    if (i % 2 === 1) rowsSvg += `<rect x="${padX}" y="${y}" width="${totalW - padX * 2}" height="${rowH}" fill="${od}" />`;
    let rx = padX;
    rowsSvg += `<text x="${rx + colW[0] / 2}" y="${y + 17}" text-anchor="middle" font-family="monospace" font-size="12" fill="${mu}">${h.hop}</text>`;
    rx += colW[0];
    rowsSvg += h.timeout
      ? `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="#ef4444">* * *</text>`
      : `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${ac}">${h.ip}</text>`;
    rx += colW[1];
    rowsSvg += `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${mu}">${h.hostname || "-"}</text>`;
    rx += colW[2];
    rowsSvg += `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${mu}">-</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`
    + `<rect width="${totalW}" height="${totalH}" fill="${bg}" />`
    + `<rect x="${padX}" y="8" width="${totalW - padX * 2}" height="${headerH - 8}" fill="${od}" rx="4" />`
    + hdrSvg
    + `<line x1="${padX}" y1="${headerH}" x2="${totalW - padX}" y2="${headerH}" stroke="${bo}" stroke-width="1" />`
    + rowsSvg + `</svg>`;
}

function buildMtrSvg(mtrHops, target, isDark) {
  const bg = isDark ? "#0d1117" : "#ffffff";
  const mu = isDark ? "#8b949e" : "#718096";
  const bo = isDark ? "#30363d" : "#e2e8f0";
  const od = isDark ? "#161b22" : "#f7fafc";
  const ac = isDark ? "#58a6ff" : "#3182ce";
  const green = "#22c55e", yellow = "#f59e0b", red = "#ef4444";
  const rttC = v => v < 50 ? green : v < 150 ? yellow : red;
  const lossC = v => v === 0 ? green : v < 50 ? yellow : red;
  const rowH = 26, headerH = 40, padX = 20;
  const colW = [36, 180, 64, 44, 56, 56, 56, 56, 56];
  const hdrLabels = ["#", "Host", "Loss%", "Snt", "Last", "Avg", "Best", "Worst", "StDev"];
  const totalW = colW.reduce((a, b) => a + b, 0) + padX * 2;
  const totalH = headerH + rowH * mtrHops.length + padX;
  let hdrSvg = "", hx = padX;
  for (let j = 0; j < hdrLabels.length; j++) {
    hdrSvg += `<text x="${hx + 6}" y="26" font-family="monospace" font-size="10" font-weight="bold" fill="${mu}">${hdrLabels[j]}</text>`;
    hx += colW[j];
  }
  let rowsSvg = "";
  for (let i = 0; i < mtrHops.length; i++) {
    const h = mtrHops[i];
    const isTimeout = h.host === "???" || h["Loss%"] === 100;
    const y = headerH + i * rowH;
    if (i % 2 === 1) rowsSvg += `<rect x="${padX}" y="${y}" width="${totalW - padX * 2}" height="${rowH}" fill="${od}" />`;
    let rx = padX;
    rowsSvg += `<text x="${rx + colW[0] / 2}" y="${y + 17}" text-anchor="middle" font-family="monospace" font-size="12" fill="${mu}">${h.count}</text>`;
    rx += colW[0];
    rowsSvg += `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${isTimeout ? red : ac}">${isTimeout ? "* * *" : h.host}</text>`;
    rx += colW[1];
    rowsSvg += `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${lossC(h['Loss%'])}">${h['Loss%'].toFixed(1)}%</text>`;
    rx += colW[2];
    rowsSvg += `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${mu}">${h.Snt}</text>`;
    rx += colW[3];
    const vals = [h.Last, h.Avg, h.Best, h.Wrst, h.StDev];
    const vCols = [colW[4], colW[5], colW[6], colW[7], colW[8]];
    for (let k = 0; k < vals.length; k++) {
      const color = isTimeout ? mu : (k < 4 ? rttC(vals[k]) : mu);
      rowsSvg += `<text x="${rx + 6}" y="${y + 17}" font-family="monospace" font-size="12" fill="${color}">${isTimeout ? "-" : vals[k].toFixed(1)}</text>`;
      rx += vCols[k];
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`
    + `<rect width="${totalW}" height="${totalH}" fill="${bg}" />`
    + `<rect x="${padX}" y="8" width="${totalW - padX * 2}" height="${headerH - 8}" fill="${od}" rx="4" />`
    + hdrSvg
    + `<line x1="${padX}" y1="${headerH}" x2="${totalW - padX}" y2="${headerH}" stroke="${bo}" stroke-width="1" />`
    + rowsSvg + `</svg>`;
}

function openSvgInTab(svgStr, title, bg, mu) {
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const html = `<!DOCTYPE html><html><head><title>${title}</title>`
    + `<style>*{margin:0;padding:0;box-sizing:border-box}body{background:${bg};display:flex;flex-direction:column;align-items:center;padding:20px;font-family:monospace;gap:12px}`
    + `img{max-width:100%;display:block;cursor:default}`
    + `.toolbar{display:flex;gap:10px;align-items:center}`
    + `.btn{padding:6px 16px;font-size:12px;font-family:monospace;border-radius:6px;border:1px solid ${mu};background:transparent;color:${mu};cursor:pointer}`
    + `.btn:hover{border-color:${mu};opacity:0.8}`
    + `.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:8px 18px;border-radius:8px;font-size:12px;opacity:0;transition:opacity 0.3s;pointer-events:none}`
    + `.toast.show{opacity:1}`
    + `.hint{font-size:11px;color:${mu};opacity:0.6}</style></head><body>`
    + `<img id="img" src="${url}" />`
    + `<div class="toolbar">`
    + `<button class="btn" onclick="copyImg()">Copy Image</button>`
    + `<span class="hint">or right-click image → Copy Image</span>`
    + `</div>`
    + `<div class="toast" id="toast">Image copied!</div>`
    + `<script>
function copyImg(){
  var img=document.getElementById('img');
  var canvas=document.createElement('canvas');
  canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
  var ctx=canvas.getContext('2d');
  ctx.drawImage(img,0,0);
  canvas.toBlob(function(blob){
    try{
      navigator.clipboard.write([new ClipboardItem({'image/png':blob})]).then(function(){showToast();}).catch(function(){showToast('Copy failed — try right-click');});
    }catch(e){showToast('Copy failed — try right-click');}
  },'image/png');
}
function showToast(msg){
  var t=document.getElementById('toast');
  t.textContent=msg||'Image copied!';
  t.className='toast show';
  setTimeout(function(){t.className='toast';},2500);
}
</script></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

export default function PingTrace() {
  const [target, setTarget] = useState("");
  const [targetError, setTargetError] = useState(null);
  const [mode, setMode] = useState("ping");
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState([]);
  const [hops, setHops] = useState([]);
  const [ipamCache, setIpamCache] = useState({});
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [pingStats, setPingStats] = useState(null);
  const [useMtr, setUseMtr] = useState(false);
  const [mtrHops, setMtrHops] = useState([]);
  const [mtrCycle, setMtrCycle] = useState(0);
  const [mtrLastUpdate, setMtrLastUpdate] = useState(null);
  const [mtrLastUpdateAgo, setMtrLastUpdateAgo] = useState(null);
  const esRef = useRef(null);
  const outputRef = useRef(null);
  const mtrCycleRef = useRef(0);

  useEffect(() => {
    const saved = sessionStorage.getItem("pingtrace_history");
    if (saved) { try { setHistory(JSON.parse(saved)); } catch {} }
    return () => { if (esRef.current) esRef.current.close(); };
  }, []);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [lines]);

  // "X ago" timer
  useEffect(() => {
    if (!mtrLastUpdate) return;
    const iv = setInterval(() => {
      const secs = Math.floor((Date.now() - mtrLastUpdate) / 1000);
      setMtrLastUpdateAgo(secs < 2 ? "just now" : `${secs}s ago`);
    }, 1000);
    return () => clearInterval(iv);
  }, [mtrLastUpdate]);

  // Keyboard shortcut: Escape to stop
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && running) stop(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [running]);

  const ipamCacheRef = useRef({});
  const lookupIp = useCallback(async (ip) => {
    if (!ip || ipamCacheRef.current[ip] !== undefined) return;
    ipamCacheRef.current[ip] = null;
    setIpamCache(prev => ({ ...prev, [ip]: null }));
    try {
      const token = localStorage.getItem("ipam_token");
      const res = await fetch(`/api/v1/ping-trace/lookup?target=${ip}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const d = await res.json();
      ipamCacheRef.current[ip] = d.ipam_info || false;
      setIpamCache(prev => ({ ...prev, [ip]: d.ipam_info || false }));
    } catch {
      ipamCacheRef.current[ip] = false;
      setIpamCache(prev => ({ ...prev, [ip]: false }));
    }
  }, []);

  const saveHistory = (t) => {
    const next = [t, ...history.filter(h => h !== t)].slice(0, 8);
    setHistory(next);
    sessionStorage.setItem("pingtrace_history", JSON.stringify(next));
  };

  const validateTarget = (t) => {
    if (!t) { setTargetError("Target is required"); return false; }
    if (!TARGET_REGEX.test(t)) { setTargetError("Invalid characters in target"); return false; }
    setTargetError(null);
    return true;
  };

  const showToast = (msg, type) => {
    try { window.dispatchEvent(new CustomEvent("app-toast", { detail: { msg, type } })); } catch {}
  };

  const run = (overrideTarget) => {
    const t = (overrideTarget || target).trim();
    if (!validateTarget(t)) return;
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
          if (mode === "ping") {
            const p = parsePingLine(d.text);
            if (p && p.time !== null) setPingStats(prev => ({ ...prev, last: p.time, count: (prev?.count || 0) + 1 }));
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

  const runMtr = (overrideTarget) => {
    const t = (overrideTarget || target).trim();
    if (!validateTarget(t)) return;
    setTarget(t); saveHistory(t);
    setMtrHops([]); setMtrCycle(0); setMtrLastUpdate(null); setError(null); setRunning(true);
    mtrCycleRef.current = 0;
    if (esRef.current) esRef.current.close();
    const url = `/api/v1/ping-trace/mtr?target=${encodeURIComponent(t)}&max_hops=30&interval=2`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data);
        if (d.type === "mtr") {
          mtrCycleRef.current = d.cycle;
          setMtrCycle(d.cycle);
          setMtrHops(d.hubs || []);
          setMtrLastUpdate(Date.now());
          d.hubs && d.hubs.forEach(h => {
            if (h.host && h.host !== "???" && !/^\s*$/.test(h.host)) lookupIp(h.host);
          });
          // auto-stop setelah MAX_MTR_CYCLES
          if (d.cycle >= MAX_MTR_CYCLES) {
            es.close(); setRunning(false);
            showToast(`MTR stopped after ${MAX_MTR_CYCLES} cycles`, "info");
          }
        } else if (d.type === "error") {
          setError(d.msg);
        }
      } catch {}
    };
    es.onerror = () => { setError("MTR connection lost"); setRunning(false); es.close(); };
  };

  const stop = () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setRunning(false);
  };

  const clear = () => {
    setLines([]); setHops([]); setMtrHops([]); setMtrCycle(0);
    setMtrLastUpdate(null); setError(null); setPingStats(null); setTargetError(null);
  };

  // ── Copy Text: traceroute ──
  const copyAsText = () => {
    const ok = hops.filter(h => h.ip || h.timeout);
    if (ok.length === 0) { showToast("No hops to copy", "error"); return; }
    let text = "Hop\tIP\tHostname\tRTT";
    ok.forEach(h => {
      text += h.timeout
        ? `\n${h.hop}\t* * *\t-\t-`
        : `\n${h.hop}\t${h.ip}\t${h.hostname || "-"}\t-`;
    });
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = 0;
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("Text copied!", "success");
    } catch { showToast("Copy failed", "error"); }
  };

  // ── Copy Text: MTR ──
  const copyMtrAsText = () => {
    if (mtrHops.length === 0) { showToast("No MTR data to copy", "error"); return; }
    let text = "Hop\tHost\tLoss%\tSnt\tLast\tAvg\tBest\tWorst\tStDev";
    mtrHops.forEach(h => {
      const isTimeout = h.host === "???" || h["Loss%"] === 100;
      text += isTimeout
        ? `\n${h.count}\t* * *\t100.0\t${h.Snt}\t-\t-\t-\t-\t-`
        : `\n${h.count}\t${h.host}\t${h["Loss%"].toFixed(1)}\t${h.Snt}\t${h.Last.toFixed(1)}\t${h.Avg.toFixed(1)}\t${h.Best.toFixed(1)}\t${h.Wrst.toFixed(1)}\t${h.StDev.toFixed(1)}`;
    });
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = 0;
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("MTR text copied!", "success");
    } catch { showToast("Copy failed", "error"); }
  };

  // ── Open Image: traceroute ──
  const openTraceImage = () => {
    const ok = hops.filter(h => h.ip || h.timeout);
    if (ok.length === 0) { showToast("No hops to export", "error"); return; }
    const isDark = document.documentElement.classList.contains("dark");
    const bg = isDark ? "#0d1117" : "#ffffff";
    const mu = isDark ? "#8b949e" : "#718096";
    const svg = buildTraceSvg(hops, target, isDark);
    openSvgInTab(svg, `Traceroute ${target}`, bg, mu);
  };

  // ── Open Image: MTR ──
  const openMtrImage = () => {
    if (mtrHops.length === 0) { showToast("No MTR data to export", "error"); return; }
    const isDark = document.documentElement.classList.contains("dark");
    const bg = isDark ? "#0d1117" : "#ffffff";
    const mu = isDark ? "#8b949e" : "#718096";
    const svg = buildMtrSvg(mtrHops, target, isDark);
    openSvgInTab(svg, `MTR ${target} — cycle #${mtrCycle}`, bg, mu);
  };

  // ── MTR Stats ──
  const mtrStats = (() => {
    if (mtrHops.length === 0) return null;
    const valid = mtrHops.filter(h => h.host !== "???" && h["Loss%"] < 100);
    if (valid.length === 0) return null;
    const totalLoss = mtrHops.reduce((a, h) => a + h["Loss%"], 0) / mtrHops.length;
    const allAvgs = valid.map(h => h.Avg);
    const worstHop = [...mtrHops].sort((a, b) => b["Loss%"] - a["Loss%"] || b.Avg - a.Avg)[0];
    return {
      totalHops: mtrHops.length,
      avgLoss: totalLoss.toFixed(1),
      bestRtt: Math.min(...valid.map(h => h.Best)).toFixed(1),
      worstRtt: Math.max(...valid.map(h => h.Wrst)).toFixed(1),
      avgRtt: (allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length).toFixed(1),
      worstHop: worstHop,
    };
  })();

  // ── worst hop index ──
  const worstHopIdx = mtrHops.length > 0
    ? mtrHops.indexOf([...mtrHops].sort((a, b) => b["Loss%"] - a["Loss%"] || b.Avg - a.Avg)[0])
    : -1;

  const statCard = (label, val, color) => val !== undefined && val !== null ? (
    <div style={{ textAlign: "center", padding: "8px 14px", background: "var(--surface-2)", borderRadius: 8, minWidth: 80 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || "var(--text)", fontVariantNumeric: "tabular-nums" }}>{val}</div>
      <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
    </div>
  ) : null;

  const timeoutCount = hops.filter(h => h.timeout).length;
  const validHops = hops.filter(h => !h.timeout);

  const btnStyle = { padding: "2px 8px", fontSize: 10, borderRadius: 4, border: "1px solid var(--border-soft)", background: "var(--surface-2)", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" };
  const btnHover = (e, on) => {
    e.currentTarget.style.borderColor = on ? "var(--accent)" : "var(--border-soft)";
    e.currentTarget.style.color = on ? "var(--accent)" : "var(--text-muted)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "Inter,system-ui,sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>Ping & Trace</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Network diagnostics tool</div>
        </div>
        {running && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Press <kbd style={{ background: "var(--surface-2)", border: "1px solid var(--border-soft)", borderRadius: 3, padding: "1px 5px", fontFamily: "monospace" }}>Esc</kbd> to stop</div>}
      </div>

      {/* ── Control Panel ── */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 6, display: "block" }}>Mode</label>
            <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", borderRadius: 6, padding: 3 }}>
              {["ping", "traceroute"].map(m => (
                <button key={m} onClick={() => { setMode(m); if (m === "ping") setUseMtr(false); }} disabled={running}
                  style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 4, border: "none", cursor: running ? "not-allowed" : "pointer", background: mode === m ? "var(--accent)" : "transparent", color: mode === m ? "#fff" : "var(--text-muted)", textTransform: "capitalize", transition: "all 0.12s" }}>{m}</button>
              ))}
            </div>
          </div>

          {mode === "traceroute" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 2 }}>
              <div onClick={() => { if (!running) { setUseMtr(!useMtr); setMtrHops([]); setMtrCycle(0); } }}
                style={{ width: 36, height: 20, borderRadius: 10, background: useMtr ? "var(--accent)" : "var(--surface-3)", cursor: running ? "not-allowed" : "pointer", position: "relative", transition: "background 0.2s", border: "1px solid var(--border-soft)" }}>
                <div style={{ position: "absolute", top: 2, left: useMtr ? 17 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: useMtr ? "var(--accent)" : "var(--text-muted)" }}>MTR Realtime</span>
              {useMtr && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>updates every 2s · auto-stop at {MAX_MTR_CYCLES} cycles</span>}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 6, display: "block" }}>Target</label>
            <input value={target}
              onChange={e => { setTarget(e.target.value); if (targetError) setTargetError(null); }}
              onKeyDown={e => { if (e.key === "Enter" && !running) useMtr ? runMtr() : run(); }}
              placeholder="IP address or hostname" className="input"
              style={{ height: 36, fontSize: 13, fontFamily: "var(--font-mono)", borderColor: targetError ? "var(--danger)" : undefined }}
              disabled={running} />
            {targetError && <div style={{ fontSize: 10, color: "var(--danger)", marginTop: 3 }}>{targetError}</div>}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            {!running ? (
              <button onClick={() => useMtr ? runMtr() : run()} className="btn btn-primary" style={{ height: 36, fontSize: 12 }} disabled={!target.trim()}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /></svg> Run
              </button>
            ) : (
              <button onClick={stop} className="btn btn-secondary" style={{ height: 36, fontSize: 12, color: "var(--danger)", border: "1px solid var(--danger-border)" }}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2" /></svg> Stop
              </button>
            )}
            <button onClick={clear} className="btn btn-ghost" style={{ height: 36, fontSize: 12 }} disabled={running || (lines.length === 0 && hops.length === 0 && mtrHops.length === 0)}>Clear</button>
          </div>
        </div>

        {history.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Recent:</span>
            {history.map(h => (
              <button key={h} onClick={() => useMtr ? runMtr(h) : run(h)} disabled={running}
                style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: "2px 10px", borderRadius: 99, background: "var(--surface-2)", border: "1px solid var(--border-soft)", color: "var(--text-muted)", cursor: running ? "not-allowed" : "pointer" }}>{h}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ padding: "10px 16px", borderRadius: 8, fontSize: 13, background: "var(--danger-surface)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}>
          <span style={{ display: "inline-flex", marginRight: 6 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </span>
          {error}
        </div>
      )}

      {/* ── Ping Output ── */}
      {mode === "ping" ? (
        <>
          {pingStats && (
            <div style={{ display: "flex", gap: 10 }}>
              {statCard("Responses", `${pingStats.count || 0}/4`, STATUS_COLOR.active)}
              {statCard("Last RTT", pingStats.last ? `${pingStats.last.toFixed(1)} ms` : "-", pingStats.last < 50 ? STATUS_COLOR.active : pingStats.last < 150 ? "#f59e0b" : STATUS_COLOR.timeout)}
              {statCard("Packet Loss", lines.some(l => l.includes("100%")) ? "100%" : lines.some(l => l.includes("0%")) ? "0%" : "—",
                lines.some(l => l.includes("100%")) ? STATUS_COLOR.timeout : STATUS_COLOR.active)}
            </div>
          )}
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-medium)", background: "var(--surface-2)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: running ? "var(--accent)" : lines.length ? "var(--success)" : "var(--text-dim)", animation: running ? "pt-pulse 1.2s ease-in-out infinite" : "none", flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1 }}>
                {running ? "Running..." : lines.length ? "Complete" : "Terminal Output"}
              </span>
              {lines.length > 0 && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{lines.length} lines</span>}
            </div>
            <div ref={outputRef} style={{ padding: 16, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.8, maxHeight: "50vh", overflowY: "auto", background: "var(--surface-2)" }}>
              {lines.length === 0 && !running && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-dim)" }}>
                  <span style={{ opacity: 0.5 }}>$</span><span>waiting for input...</span>
                </div>
              )}
              {lines.map((line, i) => {
                const p = parsePingLine(line);
                const color = line.includes("0% packet loss") ? "var(--success)" : line.includes("100% packet loss") ? "var(--danger)"
                  : p?.time !== null ? (p?.time < 50 ? "var(--success)" : p?.time < 150 ? "var(--warning)" : "var(--danger)") : "var(--text-muted)";
                return <div key={i} style={{ color }}>{line || " "}</div>;
              })}
              {running && <div style={{ color: "var(--accent)" }}>▋</div>}
            </div>
          </div>
        </>
      ) : (
        /* ── Traceroute Output ── */
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-medium)", background: "var(--surface-2)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: running ? "var(--accent)" : hops.length ? "var(--success)" : "var(--text-dim)", animation: running ? "pt-pulse 1.2s ease-in-out infinite" : "none", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1 }}>
              {running ? "Tracing route..." : hops.length ? `${hops.length} hops (${timeoutCount} timeout, ${validHops.length} reached)` : "Traceroute Output"}
            </span>
            {hops.length > 0 && (
              <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
                <span style={{ color: STATUS_COLOR.active }}>{validHops.length} ok</span>
                {timeoutCount > 0 && <span style={{ color: STATUS_COLOR.timeout }}>{timeoutCount} timeout</span>}
              </div>
            )}
            {hops.length > 0 && (
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={openTraceImage} style={btnStyle} onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}>Open Image</button>
                <button onClick={copyAsText} style={btnStyle} onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}>Copy Text</button>
              </div>
            )}
          </div>
          {hops.length === 0 && !running ? (
            <div style={{ padding: "50px 0", textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>No trace data yet — enter a target to begin</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["#", "IP Address", "Hostname", "IPAM Info"].map(h => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: "var(--text-dim)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border-medium)", background: "var(--surface-2)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hops.map((hop, i) => {
                    const info = hop.ip ? ipamCache[hop.ip] : undefined;
                    return (
                      <tr key={i} style={{ borderBottom: i < hops.length - 1 ? "1px solid var(--border-subtle)" : "none", transition: "background 0.12s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "8px 14px", fontWeight: 600, color: hop.timeout ? "var(--text-dim)" : "var(--text)", fontFamily: "var(--font-mono)" }}>{hop.hop}</td>
                        <td style={{ padding: "8px 14px" }}>
                          {hop.timeout ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 10, fontWeight: 600 }}>
                              <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg> Timeout
                            </span>
                          ) : (
                            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--accent)" }}>{hop.ip || "—"}</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 14px", color: hop.hostname ? "var(--text-muted)" : "var(--text-dim)" }}>{hop.hostname || "—"}</td>
                        <td style={{ padding: "8px 14px" }}>
                          {hop.timeout ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 9, fontWeight: 600 }}>HOP NOT REGISTERED ON IPAM</span>
                          ) : info === null ? (
                            <div style={{ height: 10, width: 80, background: "var(--surface-3)", borderRadius: 99, animation: "pt-shimmer 1.5s infinite" }} />
                          ) : info ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 99, background: "var(--accent-dim)", color: "var(--accent)", textTransform: "uppercase" }}>{info.owner_type}</span>
                                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{info.customer_name || info.block_name || "—"}</span>
                              </div>
                              {info.router && <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{info.router}{info.site_name ? ` · ${info.site_name}` : ""}</span>}
                            </div>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, background: "rgba(245,158,11,0.1)", color: "#f59e0b", fontSize: 9, fontWeight: 600 }}>NOT REGISTERED</span>
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

      {/* ── MTR Realtime ── */}
      {mode === "traceroute" && useMtr && (mtrHops.length > 0 || running) && (
        <>
          {/* MTR Stats Cards */}
          {mtrStats && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {statCard("Total Hops", mtrStats.totalHops, "var(--text)")}
              {statCard("Avg Loss", `${mtrStats.avgLoss}%`, parseFloat(mtrStats.avgLoss) === 0 ? STATUS_COLOR.active : parseFloat(mtrStats.avgLoss) < 10 ? "#f59e0b" : STATUS_COLOR.timeout)}
              {statCard("Best RTT", `${mtrStats.bestRtt} ms`, STATUS_COLOR.active)}
              {statCard("Avg RTT", `${mtrStats.avgRtt} ms`, parseFloat(mtrStats.avgRtt) < 50 ? STATUS_COLOR.active : parseFloat(mtrStats.avgRtt) < 150 ? "#f59e0b" : STATUS_COLOR.timeout)}
              {statCard("Worst RTT", `${mtrStats.worstRtt} ms`, parseFloat(mtrStats.worstRtt) < 150 ? "#f59e0b" : STATUS_COLOR.timeout)}
              {mtrStats.worstHop && mtrStats.worstHop["Loss%"] > 0 && (
                <div style={{ textAlign: "center", padding: "8px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 8, minWidth: 80, border: "1px solid rgba(239,68,68,0.2)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", fontFamily: "var(--font-mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>{mtrStats.worstHop.host}</div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Worst Hop ({mtrStats.worstHop["Loss%"].toFixed(0)}% loss)</div>
                </div>
              )}
            </div>
          )}

          {/* MTR Table */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-medium)", background: "var(--surface-2)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: running ? "var(--accent)" : "var(--success)", animation: running ? "pt-pulse 1.2s ease-in-out infinite" : "none", flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1 }}>
                MTR Realtime
                {mtrCycle > 0 && <span style={{ fontWeight: 400, color: "var(--text-dim)" }}> — cycle #{mtrCycle}/{MAX_MTR_CYCLES}</span>}
                {mtrLastUpdateAgo && <span style={{ fontWeight: 400, color: "var(--text-dim)", fontSize: 10, marginLeft: 8 }}>· updated {mtrLastUpdateAgo}</span>}
              </span>
              {mtrHops.length > 0 && (
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={openMtrImage} style={btnStyle} onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}>Open Image</button>
                  <button onClick={copyMtrAsText} style={btnStyle} onMouseEnter={e => btnHover(e, true)} onMouseLeave={e => btnHover(e, false)}>Copy Text</button>
                </div>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["#", "Host", "Loss%", "Snt", "Last", "Avg", "Best", "Worst", "StDev", "IPAM"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-dim)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border-medium)", background: "var(--surface-2)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mtrHops.map((hop, i) => {
                    const isTimeout = hop.host === "???" || hop["Loss%"] === 100;
                    const isWorst = i === worstHopIdx && hop["Loss%"] > 0;
                    const lossColor = hop["Loss%"] === 0 ? "var(--success)" : hop["Loss%"] < 50 ? "var(--warning)" : "var(--danger)";
                    const rttColor = v => v < 50 ? "var(--success)" : v < 150 ? "var(--warning)" : "var(--danger)";
                    const info = hop.host ? ipamCache[hop.host] : undefined;
                    const prevHop = i > 0 ? mtrHops[i - 1] : null;
                    const delta = (!isTimeout && prevHop && prevHop["Loss%"] < 100) ? (hop.Avg - prevHop.Avg) : null;
                    return (
                      <tr key={i}
                        style={{ borderBottom: i < mtrHops.length - 1 ? "1px solid var(--border-subtle)" : "none", transition: "background 0.12s", background: isWorst ? "rgba(239,68,68,0.06)" : "transparent" }}
                        onMouseEnter={e => e.currentTarget.style.background = isWorst ? "rgba(239,68,68,0.1)" : "var(--surface-2)"}
                        onMouseLeave={e => e.currentTarget.style.background = isWorst ? "rgba(239,68,68,0.06)" : "transparent"}>
                        <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-dim)" }}>
                          {hop.count}
                          {isWorst && <span style={{ marginLeft: 4, fontSize: 9, color: "#ef4444" }}>▲</span>}
                        </td>
                        <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", color: isTimeout ? "var(--danger)" : "var(--accent)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {isTimeout ? "* * *" : hop.host}
                        </td>
                        <td style={{ padding: "7px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: lossColor, minWidth: 38 }}>{hop["Loss%"].toFixed(1)}%</span>
                            <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--surface-3)", minWidth: 40, maxWidth: 60 }}>
                              <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(hop["Loss%"], 100)}%`, background: hop["Loss%"] === 0 ? "#22c55e" : hop["Loss%"] < 50 ? "#f59e0b" : "#ef4444", transition: "width 0.4s" }} />
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{hop.Snt}</td>
                        <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", color: isTimeout ? "var(--text-dim)" : rttColor(hop.Last) }}>{isTimeout ? "-" : hop.Last.toFixed(1)}</td>
                        <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", color: isTimeout ? "var(--text-dim)" : rttColor(hop.Avg) }}>
                          {isTimeout ? "-" : hop.Avg.toFixed(1)}
                          {delta !== null && (
                            <span style={{ marginLeft: 4, fontSize: 9, color: delta > 5 ? "#ef4444" : delta < -5 ? "#22c55e" : "var(--text-dim)" }}>
                              {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", color: isTimeout ? "var(--text-dim)" : rttColor(hop.Best) }}>{isTimeout ? "-" : hop.Best.toFixed(1)}</td>
                        <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", color: isTimeout ? "var(--text-dim)" : rttColor(hop.Wrst) }}>{isTimeout ? "-" : hop.Wrst.toFixed(1)}</td>
                        <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>{isTimeout ? "-" : hop.StDev.toFixed(1)}</td>
                        <td style={{ padding: "7px 12px" }}>
                          {isTimeout ? (
                            <span style={{ fontSize: 9, fontWeight: 600, color: "#ef4444" }}>—</span>
                          ) : info === null ? (
                            <div style={{ height: 10, width: 80, background: "var(--surface-3)", borderRadius: 99, animation: "pt-shimmer 1.5s infinite" }} />
                          ) : info ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 99, background: "var(--accent-dim)", color: "var(--accent)", textTransform: "uppercase" }}>{info.owner_type}</span>
                                <span style={{ fontSize: 11, color: "var(--text)" }}>{info.customer_name || info.block_name || "—"}</span>
                              </div>
                              {info.router && <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{info.router}{info.site_name ? ` · ${info.site_name}` : ""}</span>}
                            </div>
                          ) : (
                            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>NOT REGISTERED</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes pt-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }
        @keyframes pt-shimmer { 0%{opacity:0.3} 50%{opacity:1} 100%{opacity:0.3} }
      `}</style>
    </div>
  );
}
