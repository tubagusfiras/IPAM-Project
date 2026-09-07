import { useState, useEffect } from "react";
import { getSites, getVlans } from "../api.js";
import { PageHeader, Loading, Icons } from "../components/ui.jsx";

export default function VlanCalc({ onNavigate }) {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(4094);
  const [usedVlans, setUsedVlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [calculated, setCalculated] = useState(false);

  useEffect(() => {
    getSites("").then(d => setSites(Array.isArray(d) ? d : (d.items || [])));
  }, []);

  const calculate = async () => {
    setLoading(true);
    setCalculated(false);
    try {
      // Fetch all VLANs with pagination (max 500 per request)
      let allVlans = [];
      let offset = 0;
      const limit = 500;
      while (true) {
        const d = await getVlans("", siteId, limit, offset, "");
        if (!d.items || d.items.length === 0) break;
        allVlans = allVlans.concat(d.items);
        if (d.items.length < limit) break;
        offset += limit;
      }
      const used = allVlans.map(v => v.vid).filter(v => v >= rangeStart && v <= rangeEnd);
      setUsedVlans(used.sort((a, b) => a - b));
      setCalculated(true);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const allVlans = [];
  for (let i = rangeStart; i <= rangeEnd; i++) allVlans.push(i);
  const freeVlans = allVlans.filter(v => !usedVlans.includes(v));
  const usedCount = usedVlans.length;
  const freeCount = freeVlans.length;
  const totalCount = allVlans.length;
  const usedPct = totalCount > 0 ? ((usedCount / totalCount) * 100).toFixed(1) : 0;
  const freePct = totalCount > 0 ? ((freeCount / totalCount) * 100).toFixed(1) : 0;

  const nextFree = freeVlans[0] || null;

  const exportCSV = () => {
    const rows = [["VLAN ID", "Status"]];
    freeVlans.forEach(v => rows.push([v, "Available"]));
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vlan-available-${siteId || "all"}-${Date.now()}.csv`;
    a.click();
  };

  const chunks = [];
  let chunkStart = null;
  for (let i = 0; i < freeVlans.length; i++) {
    const curr = freeVlans[i];
    const next = freeVlans[i + 1];
    if (chunkStart === null) chunkStart = curr;
    if (next !== curr + 1) {
      chunks.push(chunkStart === curr ? `${curr}` : `${chunkStart}-${curr}`);
      chunkStart = null;
    }
  }

  const siteName = siteId ? sites.find(s => s.id === siteId)?.name || "Unknown" : "All Sites";

  return (
    <div className="main-content">
      <PageHeader
        title="VLAN Calculator"
        subtitle="Find available VLAN IDs and analyze VLAN usage across sites"
        icon={Icons.Calculator}
      />

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 6 }}>
              Site
            </label>
            <select value={siteId} onChange={e => setSiteId(e.target.value)} className="select">
              <option value="">All Sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 6 }}>
              Range Start
            </label>
            <input type="number" min="1" max="4094" value={rangeStart} onChange={e => setRangeStart(parseInt(e.target.value) || 1)} className="input" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 6 }}>
              Range End
            </label>
            <input type="number" min="1" max="4094" value={rangeEnd} onChange={e => setRangeEnd(parseInt(e.target.value) || 4094)} className="input" />
          </div>
          <button onClick={calculate} disabled={loading || rangeStart > rangeEnd} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
            {loading ? "Calculating..." : "Calculate"}
          </button>
        </div>
      </div>

      {calculated && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
            <div className="card" style={{ background: "var(--success-surface)", border: "1px solid var(--success-border)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--success)", marginBottom: 6 }}>Available</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--success)" }}>{freeCount.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{freePct}% of range</div>
            </div>
            <div className="card" style={{ background: "var(--warning-surface)", border: "1px solid var(--warning-border)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--warning)", marginBottom: 6 }}>In Use</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--warning)" }}>{usedCount.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{usedPct}% of range</div>
            </div>
            <div className="card" style={{ background: "var(--info-surface)", border: "1px solid var(--info-border)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--info)", marginBottom: 6 }}>Next Free</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--info)" }}>{nextFree !== null ? nextFree : "—"}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Lowest available</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 6 }}>Total Range</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>{totalCount.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{rangeStart}-{rangeEnd}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Usage Timeline</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{siteName}</div>
            </div>
            <div style={{ position: "relative", height: 40, background: "var(--surface-2)", borderRadius: 8, overflow: "hidden" }}>
              {allVlans.map(v => {
                const isUsed = usedVlans.includes(v);
                const left = ((v - rangeStart) / totalCount) * 100;
                const width = (1 / totalCount) * 100;
                return (
                  <div
                    key={v}
                    title={`VLAN ${v} - ${isUsed ? "In Use" : "Available"}`}
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      width: `${width}%`,
                      height: "100%",
                      background: isUsed ? "var(--warning)" : "var(--success)",
                      opacity: 0.9,
                      transition: "opacity 0.2s",
                      cursor: "pointer"
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "0.9"}
                  />
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "var(--text-dim)" }}>
              <span>VLAN {rangeStart}</span>
              <span>VLAN {rangeEnd}</span>
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Available VLAN IDs</div>
              <button onClick={exportCSV} className="btn btn-secondary btn-sm">
                {Icons.Download} Export CSV
              </button>
            </div>
            {freeVlans.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
                No available VLANs in this range
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                  {chunks.length} range{chunks.length === 1 ? "" : "s"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {chunks.map((chunk, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "6px 10px",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-soft)",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text)",
                        fontFamily: "var(--font-mono)"
                      }}
                    >
                      {chunk}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {!calculated && !loading && (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{Icons.Calculator}</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Ready to Calculate</div>
          <div style={{ fontSize: 12 }}>Select a site and range, then click Calculate</div>
        </div>
      )}

      {loading && <Loading />}
    </div>
  );
}
