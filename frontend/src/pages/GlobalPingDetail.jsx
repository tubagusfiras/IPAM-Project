import { useState, useEffect } from "react";
import { authFetch } from "../api.js";
import { Btn, Loading, EmptyState, PageHeader, Icons, Card } from "../components/ui.jsx";

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function GlobalPingDetail({ onNavigate }) {
  // Parse IP from hash: #global-ping-detail/1.2.3.4
  const ip = window.location.hash.replace("#global-ping-detail/", "").split("/")[0];
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch(`/api/v1/ping/status?search=${ip}&limit=1`);
        const d = await res.json();
        if (d.items?.length) setData(d.items[0]);

        const hres = await authFetch(`/api/v1/ping/history/${ip}?days=7`);
        const hd = await hres.json();
        setHistory(hd.items || []);
      } catch {}
      setLoading(false);
    };
    if (ip) load();
  }, [ip]);

  if (loading) return <Loading message="Loading..." />;
  if (!data) return <EmptyState icon={Icons.globe} title="IP not found" message={`No ping data for ${ip}`} />;

  const icmpHistory = history.filter(h => h.source === "icmp_local");
  const httpHistory = history.filter(h => h.source === "http_global");

  const formatRtt = v => v ? `${v.toFixed(1)}ms` : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, margin: "0 auto" }}>
      <PageHeader title={`IP: ${data.ip || ip}`}>
        <Btn variant="secondary" size="sm" icon={Icons.arrowLeft} onClick={() => onNavigate?.("global-ping")}>Back</Btn>
      </PageHeader>

      {/* Status Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Card accent={data.icmp_status === "online" ? "#22c55e" : "#ef4444"} padding={16}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>ICMP (Server)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: data.icmp_status === "online" ? "var(--success)" : "var(--danger)" }}>
            {data.icmp_status === "online" ? <span style={{display:"inline-flex",alignItems:"center",gap:4}}><svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>Online</span> : <span style={{display:"inline-flex",alignItems:"center",gap:4}}><svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Offline</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{formatRtt(data.icmp_rtt)}</div>
        </Card>
        <Card accent={data.http_status === "online" ? "#22c55e" : data.http_status === "offline" ? "#ef4444" : "#f59e0b"} padding={16}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>HTTP (Singapore)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: data.http_status === "online" ? "var(--success)" : data.http_status === "offline" ? "var(--danger)" : "var(--text-dim)" }}>
            {data.http_status === "online" ? <span style={{display:"inline-flex",alignItems:"center",gap:4}}><svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.8" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>Online</span> : data.http_status === "offline" ? <span style={{display:"inline-flex",alignItems:"center",gap:4}}><svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Offline</span> : "— Pending"}
          </div>
          {data.http_rtt && <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{data.http_rtt}ms</div>}
        </Card>
        <Card accent="#3b82f6" padding={16}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Customer</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{data.customer_name || "—"}</div>
          {data.block_name && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{data.block_name}{data.site_name ? ` · ${data.site_name}` : ""}</div>}
        </Card>
        <Card accent="#f59e0b" padding={16}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Last Scan</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{formatTime(data.scanned_at)}</div>
        </Card>
      </div>

      {/* History */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>History (7 days)</div>
        {history.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-dim)", padding: 20, textAlign: "center" }}>No history yet. Will populate after multiple scans.</div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>ICMP (Server) — {icmpHistory.filter(h => h.status === "online").length}/{icmpHistory.length} online</div>
              <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 32 }}>
                {icmpHistory.slice(-30).map((h, i) => (
                  <div key={i} style={{ width: 8, height: h.status === "online" ? 28 : 6, borderRadius: 2, background: h.status === "online" ? "var(--success)" : "var(--danger)", opacity: 0.7 }} title={`${h.status} - ${formatTime(h.checked_at)}`} />
                ))}
                {icmpHistory.length === 0 && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>No ICMP history</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>HTTP (Singapore) — {httpHistory.filter(h => h.status === "online").length}/{httpHistory.length} online</div>
              <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 32 }}>
                {httpHistory.slice(-30).map((h, i) => (
                  <div key={i} style={{ width: 8, height: h.status === "online" ? 28 : 6, borderRadius: 2, background: h.status === "online" ? "var(--success)" : "var(--danger)", opacity: 0.7 }} title={`${h.status} - ${formatTime(h.checked_at)}`} />
                ))}
                {httpHistory.length === 0 && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>No HTTP history</span>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Details Table */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Details</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 4, fontSize: 12 }}>
          {[
            ["IP Address", data.ip || ip],
            ["Prefix", data.prefix || "—"],
            ["Customer", data.customer_name || "—"],
            ["Block", data.block_name || "—"],
            ["Site", data.site_name || "—"],
            ["ICMP Status", data.icmp_status || "—"],
            ["ICMP RTT", formatRtt(data.icmp_rtt)],
            ["HTTP Status", data.http_status || "—"],
            ["HTTP RTT", formatRtt(data.http_rtt)],
            ["Last Scanned", formatTime(data.scanned_at)],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "contents" }}>
              <div style={{ padding: "6px 0", color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>{l}</div>
              <div style={{ padding: "6px 0", color: "var(--text)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
