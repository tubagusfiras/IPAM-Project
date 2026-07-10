import { useState, useEffect, useCallback } from "react";
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

export default function GlobalPing() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lastScan, setLastScan] = useState(null);

  const loadResults = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "200", offset: "0" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);

      const res = await authFetch(`/api/v1/ping/status?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setLastScan(data.last_scan);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [search, statusFilter]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await authFetch("/api/v1/ping/summary");
      setSummary(await res.json());
    } catch {}
  }, []);

  useEffect(() => { loadResults(); loadSummary(); }, []);

  const handleRunScan = async () => {
    setScanning(true);
    try {
      await authFetch("/api/v1/ping/run", { method: "POST" });
      // Poll for completion
      const poll = setInterval(async () => {
        const res = await authFetch("/api/v1/ping/status?limit=1");
        const data = await res.json();
        if (!data.running) {
          clearInterval(poll);
          loadResults();
          loadSummary();
          setScanning(false);
        }
      }, 2000);
    } catch (e) {
      console.error(e);
      setScanning(false);
    }
  };

  const running = scanning || items.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Global Ping Visibility">
        <Btn
          icon={scanning ? Icons.spinner : Icons.check}
          onClick={handleRunScan}
          disabled={scanning}
        >
          {scanning ? "Scanning..." : "Run Scan"}
        </Btn>
      </PageHeader>

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <Card accent="#3b82f6" padding={16}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Total Active IPs</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>{summary.total_active_ips}</div>
          </Card>
          <Card accent="#22c55e" padding={16}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Online</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--success)" }}>{summary.online}</div>
          </Card>
          <Card accent="#ef4444" padding={16}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Offline</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--danger)" }}>{summary.offline}</div>
          </Card>
          <Card accent="#f59e0b" padding={16}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Pending</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--warning)" }}>{summary.pending}</div>
          </Card>
        </div>
      )}

      {lastScan && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: -8 }}>
          Last scan: {formatTime(lastScan)}
        </div>
      )}

      {/* Search + Filter */}
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
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Status", "IP Address", "ICMP (Server)", "HTTP (Global)", "RTT", "Last Seen"].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><Loading message="Loading ping results..." /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6}>
                <EmptyState icon={<Icons.globe />} title="No results yet"
                  message="Run a scan to check IP visibility from global internet" />
              </td></tr>
            ) : items.map((row, i) => {
              const isOnline = row.icmp_status === "online";
              const isOffline = row.icmp_status === "offline";
              const statusColor = isOnline ? "var(--success)" : isOffline ? "var(--danger)" : "var(--text-dim)";
              const statusDot = isOnline ? "🟢" : isOffline ? "🔴" : "⚪";

              return (
                <tr key={row.id || i} className="table-row"
                  style={{ background: i % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)" }}>
                  <td className="table-cell">
                    <span style={{ fontSize: 13 }}>{statusDot}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: statusColor, marginLeft: 4, textTransform: "capitalize" }}>
                      {row.icmp_status || "pending"}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                      {row.ip || row.prefix?.split("/")?.[0] || "—"}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: row.icmp_status === "online" ? "var(--success)" : "var(--text-dim)",
                    }}>
                      {row.icmp_status === "online" ? "✅ Online" : row.icmp_status === "offline" ? "❌ Offline" : "—"}
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
                      {row.http_status === "online" ? "🌍 Online" : row.http_status === "offline" ? "🌍 Offline" : "—"}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
                      {row.icmp_rtt ? `${row.icmp_rtt.toFixed(1)}ms` : "—"}
                    </span>
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
