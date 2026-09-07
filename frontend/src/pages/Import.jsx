import { useState, useEffect } from "react";
import { getSites, authFetch } from "../api.js";
import { PageHeader } from "../components/ui.jsx";

const ACCENT = "var(--accent)";
const BORDER = "var(--border-medium)";
const TEXT = "var(--text)";
const MUTED = "var(--text-muted)";
const DIM = "var(--text-dim)";
const SUCCESS = "var(--success)";
const DANGER = "var(--danger)";
const WARN = "var(--warning)";

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

const AlertIcon = ({ color }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" width="14" height="14" style={{ flexShrink: 0 }}>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ flexShrink: 0 }}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

function MessageBar({ type, children, onDismiss }) {
  const styles = {
    danger: { bg: "var(--danger-surface)", fg: DANGER, border: "var(--danger-border)" },
    warning: { bg: "var(--warning-surface)", fg: WARN, border: "var(--warning-border)" },
    success: { bg: "var(--success-surface)", fg: SUCCESS, border: "var(--success-border)" },
    info: { bg: "var(--surface-3)", fg: ACCENT, border: BORDER },
  };
  const s = styles[type] || styles.info;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 8, fontSize: 12, marginBottom: 12, background: s.bg, color: s.fg, border: `1px solid ${s.border}` }}>
      {type === "danger" || type === "warning" ? <AlertIcon color={s.fg} /> : type === "success" ? <CheckIcon /> : <InfoIcon />}
      <div style={{ flex: 1, lineHeight: 1.5 }}>{children}</div>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: "none", border: "none", color: s.fg, cursor: "pointer", padding: 2, opacity: 0.6, lineHeight: 0 }}><CloseIcon /></button>
      )}
    </div>
  );
}

export default function ImportPage() {
  const [file, setFile] = useState(null);
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const [preview, setPreview] = useState(null);
  const [editMeta, setEditMeta] = useState({});
  const [editAllocs, setEditAllocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [step, setStep] = useState("upload");
  const [dismissed, setDismissed] = useState({});
  const [ipVersion, setIpVersion] = useState("ipv4");

  useEffect(() => { getSites().then(setSites).catch(() => {}); }, []);

  const doPreview = async () => {
    if (!file) return;
    setLoading(true); setErr(null); setResult(null); setDismissed({});
    try {
      const token = localStorage.getItem("ipam_token");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/v1/import/preview", {
        method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Preview failed");
      if (!d.allocations?.length) throw new Error("No allocations found in CSV. Make sure the format matches the template.");
      setPreview(d);
      setEditMeta({
        prefix: d.meta.prefix || "", name: d.meta.name || d.meta.prefix || "",
        asn: d.meta.asn || "", router: d.meta.router || "", operator: d.meta.operator || "",
      });
      setEditAllocs(d.allocations.map(a => ({
        prefix: a.prefix || "", customer: a.customer || null, vlan: a.vlan || null,
        description: a.description || "", notes: a.notes || "", status: a.status || "active", _include: true,
      })));
      setStep("preview");
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const doImport = async () => {
    setLoading(true); setErr(null);
    try {
      const token = localStorage.getItem("ipam_token");
      const allocs = editAllocs.filter(a => a._include).map(({ _include, ...rest }) => rest);
      const res = await fetch("/api/v1/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          meta: { prefix: editMeta.prefix, name: editMeta.name || editMeta.prefix, asn: editMeta.asn || null, router: editMeta.router || null, operator: editMeta.operator || null },
          allocations: allocs, site_id: siteId || null,
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Import failed");
      setResult(d); setStep("done");
      try { window.dispatchEvent(new CustomEvent("app-toast", { detail: { msg: `${d.imported} allocations imported`, type: "success" } })); } catch {}
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const handleReset = () => { setFile(null); setPreview(null); setResult(null); setErr(null); setStep("upload"); setDismissed({}); };

  const selCount = editAllocs.filter(a => a._include).length;
  const setMeta = k => v => setEditMeta(m => ({ ...m, [k]: v }));
  const toggleAll = v => setEditAllocs(a => a.map(x => ({ ...x, _include: v })));

  const activeCount = editAllocs.filter(a => a.status === "active").length;
  const availCount = editAllocs.filter(a => a.status === "available").length;
  const outOfRangePrefixes = preview?.out_of_range || [];
  const outOfRangeSet = new Set(outOfRangePrefixes);

  return (
    <div className="page-enter">
      <PageHeader title="Import CSV" count={result?.imported || null} />

      {/* Global error */}
      {err && (
        <MessageBar type="danger" onDismiss={() => setErr(null)}>
          <strong>Error:</strong> {err}
        </MessageBar>
      )}

      {/* ── UPLOAD STEP ── */}
      {step === "upload" && (
        <div className="card" style={{ padding: 24, maxWidth: 600 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Upload File</div>
            <div style={{ display: "flex", gap: 2, background: "var(--surface-3)", borderRadius: 6, padding: 2 }}>
              {[
                { key: "ipv4", label: "IPv4" },
                { key: "ipv6", label: "IPv6" },
              ].map(t => (
                <button key={t.key} onClick={() => { setIpVersion(t.key); setFile(null); setPreview(null); setErr(null); }}
                  style={{
                    padding: "4px 14px", borderRadius: 5, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
                    background: ipVersion === t.key ? "var(--accent)" : "transparent",
                    color: ipVersion === t.key ? "#fff" : "var(--text-muted)",
                    transition: "all 0.15s",
                  }}>{t.label}</button>
              ))}
            </div>
          </div>
          {ipVersion === "ipv6" && (
            <MessageBar type="info">
              <strong>IPv6 import</strong> — Format CSV harus punya kolom prefix dengan notasi CIDR (contoh: <code style={{fontFamily:"var(--font-mono)"}}>2001:db8::/32</code>)
            </MessageBar>
          )}
          <div
            style={{ border: `2px dashed ${BORDER}`, borderRadius: 8, padding: 40, textAlign: "center", marginBottom: 16, background: "var(--surface-2)", cursor: "pointer", transition: "border-color 0.15s" }}
            onClick={() => document.getElementById("csvInput").click()}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.borderColor = ACCENT; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = BORDER; }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.borderColor = BORDER; const f = e.dataTransfer.files[0]; if (f) { setFile(f); setPreview(null); setResult(null); setErr(null); } }}>
            {file ? (
              <div>
                <div style={{ fontSize: 28, marginBottom: 8, color: ACCENT }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="32" height="32" style={{ display: "inline" }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{file.name}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{formatSize(file.size)}</div>
                <div style={{ fontSize: 11, color: ACCENT, marginTop: 8, cursor: "pointer" }}>Click or drop another file</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 28, marginBottom: 8, color: DIM }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="32" height="32" style={{ display: "inline" }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <div style={{ fontSize: 13, color: MUTED }}>Drag & drop CSV or <span style={{ color: ACCENT, fontWeight: 600 }}>browse</span></div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>Format: .csv, .txt — max 10MB</div>
              </div>
            )}
          </div>
          <input id="csvInput" type="file" accept=".csv,.txt,.xls,.xlsx" style={{ display: "none" }}
            onChange={e => { const f = e.target.files[0]; if (f) { setFile(f); setPreview(null); setResult(null); setErr(null); } }} />

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: DIM, marginBottom: 4, display: "block" }}>Site (optional)</label>
            <select value={siteId} onChange={e => setSiteId(e.target.value)} className="input" style={{ fontSize: 12, height: 34 }}>
              <option value="">— No Site —</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={doPreview} disabled={!file || loading} className="btn btn-primary" style={{ fontSize: 12 }}>
              {loading ? "Parsing..." : "Preview CSV"}
            </button>
            {loading && (
              <div style={{ flex: 1, height: 4, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: "60%", height: "100%", background: "var(--accent)", borderRadius: 99, animation: "shimmer 1.5s infinite" }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PREVIEW STEP ── */}
      {step === "preview" && preview && (
        <>
          {/* Summary stats */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { label: "Total", value: preview.total_count, fg: TEXT },
              { label: "Active", value: activeCount, fg: SUCCESS },
              { label: "Available", value: availCount, fg: MUTED },
              ...(preview.has_out_of_range ? [{ label: "Out of Range", value: preview.out_of_range.length, fg: DANGER }] : []),
              ...(preview.has_overlaps ? [{ label: "Overlaps", value: preview.overlaps.length, fg: WARN }] : []),
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border-subtle)", fontSize: 11 }}>
                <span style={{ fontWeight: 700, color: s.fg, fontFamily: "var(--font-mono)" }}>{s.value}</span>
                <span style={{ color: DIM }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Out of range warning */}
          {preview.has_out_of_range && !dismissed.out_of_range && (
            <MessageBar type="danger" onDismiss={() => setDismissed(d => ({ ...d, out_of_range: true }))}>
              <strong>{preview.out_of_range.length} allocation(s) out of range for block {editMeta.prefix}:</strong><br />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                {preview.out_of_range.slice(0, 8).join(", ")}{preview.out_of_range.length > 8 ? ` +${preview.out_of_range.length - 8} more` : ""}
              </span>
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>These allocations are automatically excluded from import. Edit the prefix in CSV to match the block range.</div>
            </MessageBar>
          )}

          {/* Block warnings */}
          {preview.has_block_warnings && !dismissed.block_warnings && (
            <MessageBar type="warning" onDismiss={() => setDismissed(d => ({ ...d, block_warnings: true }))}>
              {preview.block_warnings.map((w, i) => <div key={i}>{w}</div>)}
            </MessageBar>
          )}

          {/* Overlap warning */}
          {preview.has_overlaps && !dismissed.overlaps && (
            <MessageBar type="warning" onDismiss={() => setDismissed(d => ({ ...d, overlaps: true }))}>
              <strong>{preview.overlaps.length} overlap(s) found</strong> — overlapping allocations will not be imported.
              {preview.overlaps.slice(0, 3).map((o, i) => (
                <div key={i} style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>{o.a} &harr; {o.b}</div>
              ))}
            </MessageBar>
          )}

          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 16 }}>
              Block Metadata
              <span style={{ fontWeight: 400, fontSize: 11, color: MUTED, marginLeft: 8 }}>— review before import</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[{ k: "prefix", l: "Prefix", m: true, r: true }, { k: "name", l: "Block Name" }, { k: "asn", l: "ASN", m: true }, { k: "router", l: "Router", m: true }, { k: "operator", l: "Operator" }].map(f => (
                <div key={f.k} style={{ gridColumn: f.k === "operator" ? "2/-1" : "auto" }}>
                  <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: DIM, marginBottom: 4, display: "block" }}>{f.l}{f.r && " *"}</label>
                  <input value={editMeta[f.k] || ""} onChange={e => setMeta(f.k)(e.target.value)} className="input" style={{ fontSize: 12, fontFamily: f.m ? "var(--font-mono)" : "var(--font-main)", height: 34 }} />
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                Allocations
                <span style={{ fontWeight: 400, fontSize: 11, color: MUTED, marginLeft: 8 }}>{selCount} of {editAllocs.length} selected</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => toggleAll(true)} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Select All</button>
                <button onClick={() => toggleAll(false)} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Deselect All</button>
              </div>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["", "#", "Prefix", "Customer", ...(ipVersion === "ipv6" ? [] : ["VLAN"]), "Notes", "Status"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: DIM, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${BORDER}`, background: "var(--surface-2)", position: "sticky", top: 0 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editAllocs.map((a, i) => {
                    const isOOR = outOfRangeSet.has(a.prefix);
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid var(--border-subtle)`, opacity: a._include ? 1 : 0.35, transition: "opacity 0.1s", background: isOOR ? "var(--danger-surface)" : i % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)" }}
                        onMouseEnter={e => { if (a._include) e.currentTarget.style.background = "var(--surface-3)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isOOR ? "var(--danger-surface)" : i % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)"; }}>
                        <td style={{ padding: "5px 10px" }}>
                          <input type="checkbox" checked={a._include} disabled={isOOR}
                            onChange={e => { const v = e.target.checked; setEditAllocs(prev => prev.map((x, j) => j === i ? { ...x, _include: v } : x)); }}
                            style={{ accentColor: ACCENT, cursor: isOOR ? "not-allowed" : "pointer" }} />
                        </td>
                        <td style={{ padding: "5px 10px", color: DIM, fontSize: 11, fontFamily: "var(--font-mono)" }}>{i + 1}</td>
                        <td style={{ padding: "5px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: isOOR ? DANGER : TEXT, fontWeight: isOOR ? 600 : 400 }}>
                          {a.prefix}
                          {isOOR && <span style={{ fontSize: 9, color: DANGER, marginLeft: 4, fontWeight: 700 }}>OUT OF RANGE</span>}
                        </td>
                        <td style={{ padding: "5px 10px" }}>
                          <input value={a.customer || ""} placeholder="—" onChange={e => setEditAllocs(prev => prev.map((x, j) => j === i ? { ...x, customer: e.target.value || null } : x))}
                            style={{ background: "transparent", border: "none", color: a.customer ? TEXT : DIM, fontSize: 12, width: "100%", outline: "none" }} />
                        </td>
                        {ipVersion !== "ipv6" && (
                        <td style={{ padding: "5px 10px", color: DIM, fontFamily: "var(--font-mono)", fontSize: 11 }}>{a.vlan || "—"}</td>
                        )}
                        <td style={{ padding: "5px 10px", color: DIM, fontSize: 11 }}>{a.notes || "—"}</td>
                        <td style={{ padding: "5px 10px" }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 99, background: a.status === "active" ? "var(--success-surface)" : "var(--surface-3)", color: a.status === "active" ? SUCCESS : MUTED, border: `1px solid ${a.status === "active" ? "var(--success-border)" : "var(--border-soft)"}` }}>{a.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: MUTED }}>
              {selCount} allocations into <span style={{ fontFamily: "var(--font-mono)", color: TEXT }}>{editMeta.prefix}</span>
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep("upload")} className="btn btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
              <button onClick={doImport} disabled={loading || selCount === 0 || preview?.has_out_of_range} className="btn btn-primary" style={{ fontSize: 12 }}>
                {loading ? "Importing..." : `Import ${selCount} Allocations`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── DONE STEP ── */}
      {step === "done" && result && (
        <div className="card" style={{ padding: 32, maxWidth: 480, margin: "0 auto" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--success-surface)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={SUCCESS} strokeWidth="2.5" width="22" height="22"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 4, textAlign: "center" }}>Import Successful</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 16, textAlign: "center" }}>
            {result.imported} allocations imported · {result.skipped} skipped
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: ACCENT, marginBottom: 20, textAlign: "center" }}>{editMeta.prefix}</div>

          {result.skipped > 0 && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--warning-surface)", border: "1px solid var(--warning-border)", fontSize: 12, color: WARN, marginBottom: 16 }}>
              <strong>{result.skipped} allocation(s) skipped</strong> — likely already in database or status "available".
            </div>
          )}

          <div style={{ textAlign: "center" }}>
            <button onClick={handleReset} className="btn btn-primary" style={{ fontSize: 12 }}>Import Another</button>
          </div>
        </div>
      )}
    </div>
  );
}
