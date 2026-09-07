import { useState, useEffect, useCallback, useRef } from "react";
import { authFetch } from "../api.js";
import { Btn, Loading, EmptyState, PageHeader, Icons, Card } from "../components/ui.jsx";

function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatEta(sec) {
  if (!sec || sec <= 0) return "";
  if (sec < 60) return `~${sec}s remaining`;
  return `~${Math.ceil(sec / 60)}m ${sec % 60}s`;
}

function HistorySparkline({ data }) {
  if (!data?.length) return <span style={{ fontSize: 10, color: "var(--text-dim)" }}>—</span>;
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

export default function GlobalPing({ onNavigate }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [autoLoad, setAutoLoad] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lastScan, setLastScan] = useState(null);
  const [page, setPage] = useState(0);
  const LIMIT = 100;
  const [sortBy, setSortBy] = useState("regions_online");
  const [sortDir, setSortDir] = useState("ASC");
  const pollRef = useRef(null);
  const scanStartRef = useRef(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        setItems(data.items || []);
        setTotal(data.total || 0);
        setLastScan(data.lastScan);
        if (data.scanProgress && data.scanProgress.since) {
          const age = Date.now() - data.scanProgress.since;
          if (age < 300000) {
            setScanProgress(data.scanProgress);
            setScanning(true);
          }
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (items.length > 0 || scanProgress) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        items, total, lastScan,
        scanProgress: scanProgress ? { ...scanProgress, since: Date.now() } : null,
      }));
    }
  }, [items, total, lastScan, scanProgress]);

  const loadResults = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(page * LIMIT) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
      const res = await authFetch(`/api/v1/ping/status?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setLastScan(data.last_scan);
      if (data.running && data.scan_progress) {
        setScanning(true);
        setScanProgress(data.scan_progress);
      } else if (data.total > 0 && !data.running && !data.scan_progress) {
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
  }, [search, statusFilter, page, sortBy, sortDir]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await authFetch("/api/v1/ping/summary");
      setSummary(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (autoLoad) { loadResults(); loadSummary(); }
  }, [autoLoad, search, statusFilter, page, sortBy, sortDir]);

  useEffect(() => {
    if (scanning) {
      loadResults();
      loadSummary();
      pollRef.current = setInterval(() => { loadResults(); loadSummary(); }, 5000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [scanning]);

  const toggleSort = (col) => {
    if (sortBy === col) { setSortDir(sortDir === "ASC" ? "DESC" : "ASC"); }
    else { setSortBy(col); setSortDir("ASC"); }
    setPage(0);
  };

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

  const handleCancelScan = async () => {
    try {
      await authFetch("/api/v1/ping/cancel", { method: "POST" });
      setScanning(false);
      setScanProgress(null);
      loadResults();
      loadSummary();
    } catch (e) { console.error(e); }
  };

  const pct = scanProgress && scanProgress.total > 0
    ? Math.min(100, Math.round((scanProgress.scanned / scanProgress.total) * 100))
    : 0;

  const renderStatus = (status, label) => {
    if (status === null || status === undefined) {
      return <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)", fontStyle: "italic" }} title={`${label}: not scanned yet`}>N/A</span>;
    }
    if (status === "pending") {
      return <span style={{ fontSize: 11, fontWeight: 500, color: "var(--warning)", fontStyle: "italic" }} title={`${label}: scan in progress`}>Pending</span>;
    }
    if (status === "online") {
      return <span style={{ fontSize: 11, fontWeight: 600, color: "var(--success)", display: "inline-flex", alignItems: "center", gap: 4 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>Online</span>;
    }
    return <span style={{ fontSize: 11, fontWeight: 600, color: "var(--danger)", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Offline</span>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Global Ping">
        {scanning ? (
          <Btn variant="danger" icon={Icons.x} onClick={handleCancelScan}>Cancel Scan</Btn>
        ) : (
          <Btn icon={Icons.globe} onClick={handleRunScan}>Run Scan</Btn>
        )}
      </PageHeader>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Card accent="#3b82f6" padding={16}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Total Active IPs</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>{summary?.total_active_ips ?? 0}</div>
        </Card>
        <div onClick={() => { setStatusFilter("online"); setPage(0); }} style={{ cursor: "pointer" }}><Card accent="#22c55e" padding={16}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Online</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--success)" }}>{summary?.online ?? "—"}</div>
        </Card></div>
        <div onClick={() => { setStatusFilter("offline"); setPage(0); }} style={{ cursor: "pointer" }}><Card accent="#ef4444" padding={16}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Offline</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--danger)" }}>{summary?.offline ?? "—"}</div>
        </Card></div>
        <div onClick={() => { setStatusFilter("pending"); setPage(0); }} style={{ cursor: "pointer" }}><Card accent="#f59e0b" padding={16}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Pending</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--warning)" }}>{summary?.pending ?? "—"}</div>
        </Card></div>
      </div>

      {/* Scanning Progress */}
      {scanning && scanProgress && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: "var(--text)" }}>Scanning IPs...</span>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{formatEta(scanProgress.eta)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8, color: "var(--text-dim)" }}>
            <span>{scanProgress.scanned} / {scanProgress.total} IPs scanned</span>
            <span style={{ fontWeight: 600, color: "var(--accent)" }}>{pct}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 4, background: "linear-gradient(90deg, #2563eb, #60a5fa)", transition: "width 0.5s ease" }} />
          </div>
        </div>
      )}

      {lastScan && !scanning && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: -8 }}>
          Last scan: {formatTime(lastScan)} · {total} IPs checked
        </div>
      )}

      {/* Search + Filter */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search IP address..."
            className="input" style={{ paddingLeft: 32, height: 36, fontSize: 13 }} />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
          className="select" style={{ height: 36, fontSize: 13, minWidth: 120 }}>
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Results Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
  { label: "IP", key: "ip", sortable: true },
  { label: "Customer", key: "customer_name", sortable: true },
  { label: "Block / Site", key: "block", sortable: false },
  { label: "ICMP", key: "icmp_status", sortable: true },
  { label: "Regions", key: "regions_online", sortable: true },
  { label: "Last Check", key: "scanned_at", sortable: true }
].map(h => (
  <th key={h.label} className="table-header" 
      onClick={() => h.sortable ? toggleSort(h.key) : null}
      style={{ cursor: h.sortable ? "pointer" : "default", userSelect: "none" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {h.label}
      {h.sortable && sortBy === h.key && (
        <span style={{ fontSize: 10, opacity: 0.7 }}>{sortDir === "ASC" ? "▲" : "▼"}</span>
      )}
      {h.sortable && sortBy !== h.key && (
        <span style={{ fontSize: 10, opacity: 0.2 }}>↕</span>
      )}
    </div>
  </th>
))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 0 }}><Loading message="Loading..." /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7}>
                <EmptyState icon={Icons.globe} title="No results yet" message="Run a scan to check IP reachability" />
              </td></tr>
            ) : items.map((row, i) => {
              return (
                <tr key={row.host_ip || row.ip || i} className="table-row"
                  style={{ background: i % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)" }}>
                  <td className="table-cell">
                    <span onClick={() => onNavigate?.("global-ping-detail", { id: row.host_ip || row.ip, from: "global-ping" })}
                      style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--accent)", cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--accent-dim)" }}>
                      {row.host_ip || row.ip || "—"}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.customer_name || "—"}
                    </div>
                  </td>
                  <td className="table-cell">
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
                      {row.block_name || "—"}
                    </span>
                    {row.site_name && <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 4 }}>· {row.site_name}</span>}
                  </td>
                  <td className="table-cell">{renderStatus(row.icmp_status, "ICMP")}</td>
                  <td className="table-cell">
                    {row.regions_online > 0 ? (
                      <span style={{ fontSize: 11 }}>
                        <span style={{ color: "var(--success)", fontWeight: 600 }}>{row.regions_online}</span>
                        <span style={{ color: "var(--text-dim)" }}>/{row.regions_total}</span>
                      </span>
                    ) : row.regions_total > 0 ? (
                      <span style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600 }}>0/{row.regions_total}</span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>—</span>
                    )}
                  </td>
                  <td className="table-cell">
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{formatTime(row.scanned_at)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {total > LIMIT && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid var(--border-soft)", flexWrap: "wrap", gap: "10px" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
              </span>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn btn-secondary btn-sm" style={{ padding: "4px 10px" }}>Prev</button>
                {Array.from({ length: Math.ceil(total / LIMIT) }).map((_, idx) => {
                  const totalPages = Math.ceil(total / LIMIT);
                  if (totalPages > 7) {
                    if (idx === 0 || idx === totalPages - 1 || (idx >= page - 1 && idx <= page + 1)) {
                      return <button key={idx} onClick={() => setPage(idx)} className="btn btn-sm" style={{ padding: "4px 10px", background: page === idx ? "var(--accent)" : "transparent", color: page === idx ? "#fff" : "var(--text)", border: "1px solid var(--border)", borderRadius: "4px", cursor: "pointer" }}>{idx + 1}</button>;
                    } else if (idx === page - 2 || idx === page + 2) {
                      return <span key={idx} style={{ padding: "4px 4px", color: "var(--text-muted)" }}>...</span>;
                    }
                    return null;
                  }
                  return (
                    <button key={idx} onClick={() => setPage(idx)} className="btn btn-sm" style={{ padding: "4px 10px", background: page === idx ? "var(--accent)" : "transparent", color: page === idx ? "#fff" : "var(--text)", border: "1px solid var(--border)", borderRadius: "4px", cursor: "pointer" }}>{idx + 1}</button>
                  );
                })}
                <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * LIMIT >= total} className="btn btn-secondary btn-sm" style={{ padding: "4px 10px" }}>Next</button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
