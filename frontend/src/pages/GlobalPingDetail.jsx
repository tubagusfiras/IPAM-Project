import { useState, useEffect } from "react";
import { authFetch } from "../api.js";
import { Btn, Loading, EmptyState, PageHeader, Icons, Card } from "../components/ui.jsx";

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const FLAGS = {
  sg:"\u{1F1F8}\u{1F1EC}",jp:"\u{1F1EF}\u{1F1F5}",hk:"\u{1F1ED}\u{1F1F0}",tw:"\u{1F1F9}\u{1F1FC}",
  kr:"\u{1F1F0}\u{1F1F7}",id:"\u{1F1EE}\u{1F1E9}",my:"\u{1F1F2}\u{1F1FE}",th:"\u{1F1F9}\u{1F1ED}",
  ph:"\u{1F1F5}\u{1F1ED}",vn:"\u{1F1FB}\u{1F1F3}",in:"\u{1F1EE}\u{1F1F3}",au:"\u{1F1E6}\u{1F1FA}",
  nz:"\u{1F1F3}\u{1F1FF}",us:"\u{1F1FA}\u{1F1F8}",ca:"\u{1F1E8}\u{1F1E6}",gb:"\u{1F1EC}\u{1F1E7}",
  de:"\u{1F1E9}\u{1F1EA}",fr:"\u{1F1EB}\u{1F1F7}",nl:"\u{1F1F3}\u{1F1F1}",it:"\u{1F1EE}\u{1F1F9}",
  es:"\u{1F1EA}\u{1F1F8}",pt:"\u{1F1F5}\u{1F1F9}",se:"\u{1F1F8}\u{1F1EA}",no:"\u{1F1F3}\u{1F1F4}",
  fi:"\u{1F1EB}\u{1F1EE}",dk:"\u{1F1E9}\u{1F1F0}",pl:"\u{1F1F5}\u{1F1F1}",cz:"\u{1F1E8}\u{1F1FF}",
  at:"\u{1F1E6}\u{1F1F9}",ch:"\u{1F1E8}\u{1F1ED}",be:"\u{1F1E7}\u{1F1EA}",ie:"\u{1F1EE}\u{1F1EA}",
  ru:"\u{1F1F7}\u{1F1FA}",ua:"\u{1F1FA}\u{1F1E6}",tr:"\u{1F1F9}\u{1F1F7}",il:"\u{1F1EE}\u{1F1F1}",
  ae:"\u{1F1E6}\u{1F1EA}",sa:"\u{1F1F8}\u{1F1E6}",br:"\u{1F1E7}\u{1F1F7}",mx:"\u{1F1F2}\u{1F1FD}",
  ar:"\u{1F1E6}\u{1F1F7}",za:"\u{1F1FF}\u{1F1E6}",ir:"\u{1F1EE}\u{1F1F7}",pk:"\u{1F1F5}\u{1F1F0}",
  bd:"\u{1F1E7}\u{1F1E9}",ro:"\u{1F1F7}\u{1F1F4}",bg:"\u{1F1E7}\u{1F1EC}",hu:"\u{1F1ED}\u{1F1FA}",
  rs:"\u{1F1F7}\u{1F1F8}",hr:"\u{1F1ED}\u{1F1F7}",si:"\u{1F1F8}\u{1F1EE}",lt:"\u{1F1F1}\u{1F1F9}",
  lv:"\u{1F1F1}\u{1F1FB}",ee:"\u{1F1EA}\u{1F1EA}",md:"\u{1F1F2}\u{1F1E9}",kz:"\u{1F1F0}\u{1F1FF}",
  cy:"\u{1F1E8}\u{1F1FE}",mt:"\u{1F1F2}\u{1F1F9}",lu:"\u{1F1F1}\u{1F1FA}",is:"\u{1F1EE}\u{1F1F8}",
  by:"\u{1F1E7}\u{1F1FE}",ng:"\u{1F1F3}\u{1F1EC}",ke:"\u{1F1F0}\u{1F1EA}",eg:"\u{1F1EA}\u{1F1EC}",
  np:"\u{1F1F3}\u{1F1F5}",lk:"\u{1F1F1}\u{1F1F0}",cl:"\u{1F1E8}\u{1F1F1}",co:"\u{1F1E8}\u{1F1F4}",
};

function StatusCard({ label, status, accent }) {
  const isOnline = status === "online";
  const isOffline = status === "offline";
  const isPending = !status || status === "pending";
  const color = isOnline ? "#22c55e" : isOffline ? "#ef4444" : "#64748b";
  return (
    <Card accent={color} padding={16}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: isOnline ? "var(--success)" : isOffline ? "var(--danger)" : "var(--text-dim)" }}>
        {isOnline ? "Online" : isOffline ? "Offline" : "N/A"}
      </div>
      {isPending && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>Agent not reporting</div>}
    </Card>
  );
}

function HistoryBars({ data, label }) {
  const online = data.filter(h => h.status === "online").length;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
        {label} — {online}/{data.length} online
      </div>
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 32 }}>
        {data.slice(-30).map((h, i) => (
          <div key={i} style={{
            width: 8, height: h.status === "online" ? 28 : 6,
            borderRadius: 2,
            background: h.status === "online" ? "var(--success)" : "var(--danger)",
            opacity: 0.7,
          }} title={`${h.status} - ${formatTime(h.checked_at)}`} />
        ))}
        {data.length === 0 && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>No data</span>}
      </div>
    </div>
  );
}

export default function GlobalPingDetail({ ip: ipProp, onNavigate }) {
  const ip = ipProp || window.location.hash.replace("#global-ping-detail/", "").split("/")[0] || "";
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [regionDetails, setRegionDetails] = useState([]);
  const [regionLoading, setRegionLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ip) { setLoading(false); return; }
    const load = async () => {
      try {
        const sRes = await authFetch(`/api/v1/ping/status?search=${ip}&limit=1`);
        const sData = await sRes.json();
        if (sData.items?.length) {
          // Match exact IP, not substring
          const exact = sData.items.find(r => r.ip === ip || r.ip === ip + "/32");
          if (exact) setData(exact);
          else setData(sData.items[0]);
        }

        const hRes = await authFetch(`/api/v1/ping/history/${ip}?days=7`);
        const hData = await hRes.json();
        setHistory(hData.items || []);

        const rRes = await authFetch(`/api/v1/ping/region-details/${ip}`);
        const rData = await rRes.json();
        setRegionDetails(rData.regions || []);
      } catch (e) { console.error("[GlobalPingDetail]", e); }
      setLoading(false);
    };
    load();
  }, [ip]);

  if (loading) return <Loading message="Loading..." />;
  if (!ip) return <EmptyState icon={Icons.globe} title="No IP specified" message="Navigate from the Global Ping list" />;
  if (!data) return <EmptyState icon={Icons.globe} title="IP not found" message={`No ping data for ${ip}`} />;

  const onlineRegions = regionDetails.filter(r => r.status === "online");
  const offlineRegions = regionDetails.filter(r => r.status !== "online");

  const refreshRegions = async () => {
    setRegionLoading(true);
    try {
      const rRes = await authFetch(`/api/v1/ping/region-details/${ip}?force=true`);
      const rData = await rRes.json();
      setRegionDetails(rData.regions || []);
    } catch (e) { console.error("[refreshRegions]", e); }
    setRegionLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, margin: "0 auto" }}>
      <PageHeader title={`IP: ${data.ip || ip}`}>
        <Btn variant="secondary" size="sm" icon={Icons.arrowLeft} onClick={() => onNavigate?.("global-ping")}>Back</Btn>
      </PageHeader>

      {/* Status Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <StatusCard label="ICMP" status={data.icmp_status} />
        <StatusCard label="HTTP" status={data.http_status} />
        <Card accent={onlineRegions.length > 0 ? "#22c55e" : "#64748b"} padding={16}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Check-Host Regions</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: onlineRegions.length > 0 ? "var(--success)" : "var(--danger)" }}>
            {regionDetails.length > 0 ? `${onlineRegions.length}/${regionDetails.length}` : "—"}
          </div>
          {regionDetails.length > 0 && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{onlineRegions.length > 0 ? "regions online" : "all regions offline"}</div>}
        </Card>
      </div>

      {/* Region scan trigger when no data */}
      {regionDetails.length === 0 && !regionLoading && (
        <div className="card" style={{ padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>No region data yet</div>
          <button onClick={refreshRegions}
            style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", background: "var(--accent-dim)", border: "1px solid var(--accent-border)", borderRadius: 6, padding: "6px 16px", cursor: "pointer" }}>
            Scan via Check-Host.net
          </button>
        </div>
      )}

      {/* Region scan loading */}
      {regionLoading && (
        <div className="card" style={{ padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Scanning regions via Check-Host.net...</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>This may take 15-30 seconds</div>
        </div>
      )}

      {/* Region Details */}
      {regionDetails.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              Multi-Region Ping Results
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-dim)", marginLeft: 8 }}>
                ({onlineRegions.length} online / {offlineRegions.length} offline)
              </span>
            </div>
            <button onClick={refreshRegions} disabled={regionLoading}
              style={{ 
                fontSize: 11, 
                color: "var(--accent)", 
                background: "rgba(59,130,246,0.1)", 
                border: "1px solid rgba(59,130,246,0.2)", 
                borderRadius: 6,
                padding: "4px 12px",
                cursor: regionLoading ? "wait" : "pointer", 
                fontWeight: 600, 
                opacity: regionLoading ? 0.5 : 1 
              }}>
              {regionLoading ? "Checking..." : "🔄 Refresh"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {regionDetails.sort((a, b) => {
              // Sort: online first, then alphabetically
              if (a.status !== b.status) return a.status === "online" ? -1 : 1;
              return a.country_code.localeCompare(b.country_code);
            }).map((r, i) => {
              const flag = FLAGS[r.country_code] || "🏳️";
              const isOnline = r.status === "online";
              return (
                <div key={i} style={{
                  display: "flex", 
                  alignItems: "center", 
                  gap: 8,
                  padding: "8px 12px", 
                  borderRadius: 8, 
                  background: isOnline ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  border: `1.5px solid ${isOnline ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
                  transition: "all 0.15s ease",
                }}>
                  <span style={{ fontSize: 20 }}>{flag}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      fontSize: 12, 
                      fontWeight: 600, 
                      color: isOnline ? "var(--success)" : "var(--danger)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px"
                    }}>
                      {r.country_code}
                    </div>
                    <div style={{ 
                      fontSize: 11, 
                      color: "var(--text-dim)", 
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      {r.country_name}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: isOnline ? "var(--success)" : "var(--danger)",
                    textTransform: "uppercase",
                    opacity: 0.7
                  }}>
                    {isOnline ? "✓" : "✗"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Ping History (7 Days)</div>
        {history.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>No history data</div>}
      </div>

      {/* Metadata */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Details</div>
        <table style={{ fontSize: 12, color: "var(--text-dim)" }}>
          <tbody>
            <tr><td style={{ paddingRight: 16, paddingBottom: 4 }}>Customer</td><td style={{ color: "var(--text)", paddingBottom: 4 }}>{data.customer_name || "—"}</td></tr>
            <tr><td style={{ paddingRight: 16, paddingBottom: 4 }}>Block</td><td style={{ color: "var(--text)", paddingBottom: 4 }}>{data.block_name || "—"}</td></tr>
            <tr><td style={{ paddingRight: 16, paddingBottom: 4 }}>Site</td><td style={{ color: "var(--text)", paddingBottom: 4 }}>{data.site_name || "—"}</td></tr>
            <tr><td style={{ paddingRight: 16, paddingBottom: 4 }}>IP Range</td><td style={{ color: "var(--text)", paddingBottom: 4 }}>{data.alloc_prefix || "—"}</td></tr>
            <tr><td style={{ paddingRight: 16, paddingBottom: 4 }}>Total IPs in Block</td><td style={{ color: "var(--text)", paddingBottom: 4 }}>{data.block_total_ips || "—"}</td></tr>
            <tr><td style={{ paddingRight: 16, paddingBottom: 4 }}>Last Check</td><td style={{ color: "var(--text)", paddingBottom: 4 }}>{formatTime(data.scanned_at)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
