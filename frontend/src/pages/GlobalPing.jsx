import { useState, useEffect, useCallback, useRef } from "react";
import { authFetch } from "../api.js";
import { Btn, Loading, EmptyState, PageHeader, Icons, Card, Badge } from "../components/ui.jsx";

function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatRtt(rtt) {
  if (rtt == null) return "—";
  return `${rtt.toFixed(1)}ms`;
}

function formatEta(sec) {
  if (!sec || sec <= 0) return "";
  if (sec < 60) return `~${sec}s remaining`;
  return `~${Math.ceil(sec / 60)}m ${sec % 60}s`;
}

function HistorySparkline({ data }) {
  if (!data?.length) return <span style={{ fontSize: 10, color: "var(--text-dim)" }}>No data</span>;
  const max = Math.max(...data.map(d => d.online), 1);
  const h = 24;
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: h }}>
      {data.slice(-14).map((d, i) => {
        const pct = d.online / max;
        const barH = Math.max(3, pct * h);
        const isOnline = d.online > 0;
        return (
          <div key={i} style={{
            width: 6, height: barH,
            borderRadius: "2px 2px 0 0",
            background: isOnline ? "var(--success)" : "var(--danger)",
            opacity: isOnline ? 0.8 : 0.5,
            transition: "height 0.3s",
          }} title={`${d.online}/${d.total} online`} />
        );
      })}
    </div>
  );
}

const STORAGE_KEY = "ipam_globalping_data";
const POLL_INTERVAL = 2000;

export default function GlobalPing({ onNavigate }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null); // {scanned, total, eta}
  const [autoLoad, setAutoLoad] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lastScan, setLastScan] = useState(null);
  const [sortBy, setSortBy] = useState("scanned_at");
  const [sortDir, setSortDir] = useState("DESC");
  const pollRef = useRef(null);
  const scanStartRef = useRef(null); // timestamp trigger scan

  // ── Load from sessionStorage on mount ──
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        setItems(data.items || []);
        setTotal(data.total || 0);
        setLastScan(data.last_scan);
        // Jangan restore scanProgress kalo udah lebih dari 5 menit
        if (data.scanProgress && data.scanProgress.since) {
          const age = Date.now() - data.scanProgress.since;
          if (age < 300000) { // 5 menit
            setScanProgress(data.scanProgress);
            setScanning(true);
          }
        }
      }
    } catch {}
  }, []);

  // ── Save to sessionStorage ──
  useEffect(() => {
    if (items.length > 0 || scanProgress) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        items, total, lastScan,
        scanProgress: scanProgress ? { ...scanProgress, since: Date.now() } : null,
      }));
    }
  }, [items, total, lastScan, scanProgress, scanning]);

  const loadResults = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "200", offset: "0", sort_by: sortBy, sort_dir: sortDir });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await authFetch(`/api/v1/ping/status?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setLastScan(data.last_scan);
      // Check if scan completed via results
      if (data.total > 0 && !data.running && !data.scan_progress) {
        setScanning(false);
        setScanProgress(null);
      } else if (data.scan_progress && data.scan_progress.scanned >= data.scan_progress.total) {
        setScanning(false);
        setScanProgress(null);
      } else if (data.scan_progress) {
        setScanProgress(data.scan_progress);
      } else if (data.total > 0 && scanStartRef.current && Date.now() - scanStartRef.current > 10000) {
        setScanning(false);
        setScanProgress(null);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [search, statusFilter]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await authFetch("/api/v1/ping/summary");
      setSummary(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (autoLoad) { loadResults(); loadSummary(); }
  }, [autoLoad]);

  // ── Polling background ──
  useEffect(() => {
    if (scanning) {
      // Langsung load sekali
      loadResults();
      loadSummary();
      // Lalu polling
      pollRef.current = setInterval(() => {
        loadResults();
        loadSummary();
      }, POLL_INTERVAL);
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [scanning]);

  const handleRunScan = async () => {
    scanStartRef.current = Date.now();
    setScanning(true);
    setScanProgress({ scanned: 0, total: 100, eta: null });
    try {
      const res = await authFetch("/api/v1/ping/run", { method: "POST" });
      const data = await res.json();
      const totalIps = data.total || 100;
      setScanProgress({ scanned: 0, total: totalIps, eta: totalIps * 3 });
    } catch (e) {
      console.error(e);
      setScanning(false);
      setScanProgress(null);
    }
  };

  const pct = scanProgress && scanProgress.total > 0
    ? Math.min(100, Math.round((scanProgress.scanned / scanProgress.total) * 100))
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Global Ping Visibility">
        {scanning ? (
          <Btn variant="danger" icon={Icons.x} onClick={() => {
            setScanning(false);
            setScanProgress(null);
            if (pollRef.current) clearInterval(pollRef.current);
            sessionStorage.removeItem(STORAGE_KEY);
          }}>Cancel</Btn>
        ) : (
          <Btn icon={Icons.globe} onClick={handleRunScan}>Run Scan</Btn>
        )}
      </PageHeader>

      {/* ── Summary Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Card accent="#3b82f6" padding={16}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Total Active IPs</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
            {summary?.total_active_ips ?? 0}
          </div>
        </Card>
        <div onClick={()=>setStatusFilter("online")} style={{cursor:"pointer"}}><Card accent="#22c55e" padding={16}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Online</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--success)" }}>
            {summary?.online ?? "—"}
          </div>
        </Card></div>
        <div onClick={()=>setStatusFilter("offline")} style={{cursor:"pointer"}}><Card accent="#ef4444" padding={16}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Offline</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--danger)" }}>
            {summary?.offline ?? "—"}
          </div>
        </Card></div>
        <div onClick={()=>setStatusFilter("pending")} style={{cursor:"pointer"}}><Card accent="#f59e0b" padding={16}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Pending</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--warning)" }}>
            {summary?.pending ?? "—"}
          </div>
        </Card></div>
      </div>

      {/* ── Progress Bar ── */}
      {scanning && scanProgress && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
              Scanning {scanProgress.scanned}/{scanProgress.total} IPs
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              {pct}% {scanProgress.eta ? formatEta(scanProgress.eta) : ""}
            </span>
          </div>
          <div style={{ height: 8, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99, width: `${pct}%`,
              transition: "width 0.5s ease",
              background: "linear-gradient(90deg, #2563eb, #60a5fa)",
              backgroundSize: "200% 100%",
              animation: "shimmer 2s linear infinite",
            }} />
          </div>
        </div>
      )}

      {/* ── Last Scan Info ── */}
      {lastScan && !scanning && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: -8 }}>
          Last scan: {formatTime(lastScan)} · {total} IPs checked
        </div>
      )}

      {/* ── Search + Filter ── */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search IP address..."
            className="input" style={{ paddingLeft: 32, height: 36, fontSize: 13 }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="select" style={{ height: 36, fontSize: 13, minWidth: 120 }}>
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="error">Error</option>
          <option value="pending">Pending</option>
        </select>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
          {total} result{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Status", "IP", "Customer / Desc", "Block / Site", "ICMP", "HTTP", "History", "Last Seen"].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 0 }}><Loading message="Loading ping results..." /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8}>
                <EmptyState icon={Icons.globe} title="No results yet"
                  message="Run a scan to check IP visibility from global internet" />
              </td></tr>
            ) : items.map((row, i) => {
              const status = row.icmp_status || "pending";
              const isOnline = status === "online";
              const isOffline = status === "offline";
              const statusColor = isOnline ? "var(--success)" : isOffline ? "var(--danger)" : "var(--text-dim)";
              const statusDot = isOnline ? "🟢" : isOffline ? "🔴" : "⚪";

              return (
                <tr key={row.id || i} className="table-row"
                  style={{ background: i % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)" }}>
                  <td className="table-cell">
                    <span style={{ fontSize: 13 }}>{statusDot}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: statusColor, marginLeft: 4, textTransform: "capitalize" }}>
                      {status}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span onClick={() => onNavigate?.("global-ping-detail", {id: row.ip || row.prefix?.split("/")?.[0]})}
                      style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--accent)", cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--accent-dim)" }}>
                      {row.ip || row.prefix?.split("/")?.[0] || "—"}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.customer_name || row.alloc_desc || "—"}
                    </div>
                  </td>
                  <td className="table-cell">
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
                      {row.block_name || row.prefix || "—"}
                    </span>
                    {row.site_name && <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 4 }}>· {row.site_name}</span>}
                  </td>
                  <td className="table-cell">
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: isOnline ? "var(--success)" : "var(--text-dim)",
                    }}>
                      {isOnline ? <span style={{display:"inline-flex",alignItems:"center",gap:4}}><svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>Online</span> : isOffline ? <span style={{display:"inline-flex",alignItems:"center",gap:4}}><svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Offline</span> : "—"}
                    </span>
                    {row.icmp_rtt != null && (
                      <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 4 }}>
                        ({formatRtt(row.icmp_rtt)})
                      </span>
                    )}
                  </td>
                  <td className="table-cell">
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: row.http_status === "online" ? "var(--success)" : row.http_status === "offline" ? "var(--danger)" : "var(--text-dim)",
                    }}>
                      {row.http_status === "online" ? <span style={{display:"inline-flex",alignItems:"center",gap:4}}><svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.8" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>Online</span> : row.http_status === "offline" ? <span style={{display:"inline-flex",alignItems:"center",gap:4}}><svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Offline</span> : "—"}
                    </span>
                  </td>
                  <td className="table-cell" style={{ minWidth: 100 }}>
                    <HistorySparkline data={row.history} />
                  </td>
                  <td className="table-cell">
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      {formatTime(row.scanned_at)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
