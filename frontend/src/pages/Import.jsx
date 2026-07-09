import { useState, useEffect } from "react";
import { getSites, authFetch } from "../api.js";
import { Btn, SearchBar, Loading, PageHeader, Icons, Alert, ProgressBar } from "../components/ui.jsx";

const ACCENT = "var(--accent)";
const CARD = "var(--surface-1)";
const BORDER = "var(--border-medium)";
const TEXT = "var(--text)";
const MUTED = "var(--text-muted)";
const DIM = "var(--text-dim)";
const SUCCESS = "var(--success)";
const DANGER = "var(--danger)";
const WARN = "var(--warning)";

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
  const [step, setStep] = useState("upload"); // upload | preview | done

  useEffect(() => { getSites().then(setSites).catch(() => {}); }, []);

  const doPreview = async () => {
    if (!file) return;
    setLoading(true); setErr(null); setResult(null);
    try {
      const token = localStorage.getItem("ipam_token");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/v1/import/preview", {
        method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Preview failed");
      const d = await res.json();
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
      if (!res.ok) throw new Error((await res.json()).detail || "Import failed");
      const d = await res.json();
      setResult(d); setStep("done");
      try { window.dispatchEvent(new CustomEvent("app-toast", { detail: { msg: `${d.imported} allocations imported`, type: "success" } })); } catch {}
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const selCount = editAllocs.filter(a => a._include).length;
  const setMeta = k => v => setEditMeta(m => ({ ...m, [k]: v }));
  const toggleAll = v => setEditAllocs(a => a.map(x => ({ ...x, _include: v })));
  const toggleRow = i => setEditAllocs(a => a.map((x, idx) => idx === i ? { ...x, _include: !x._include } : x));

  const handleReset = () => { setFile(null); setPreview(null); setResult(null); setErr(null); setStep("upload"); };

  return (
    <div>
      <PageHeader title="Import CSV" count={result?.imported || null} />

      {err && (
        <div style={{ padding: "10px 16px", borderRadius: 8, fontSize: 13, background: "var(--danger-surface)", color: DANGER, border: "1px solid var(--danger-border)", marginBottom: 16 }}>
          <span style={{ display: "inline-flex", marginRight: 6 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </span>
          {err}
        </div>
      )}

      {/* ── UPLOAD STEP ── */}
      {step === "upload" && (
        <div className="card" style={{ padding: 24, maxWidth: 600 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 16 }}>Upload File</div>
          <div style={{ border: `2px dashed ${BORDER}`, borderRadius: 8, padding: 40, textAlign: "center", marginBottom: 16, background: "var(--surface-2)", cursor: "pointer" }}
            onClick={() => document.getElementById("csvInput").click()}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.borderColor = ACCENT; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = BORDER; }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.borderColor = BORDER; const f = e.dataTransfer.files[0]; if (f) { setFile(f); setPreview(null); setResult(null); setErr(null); } }}>
            {file ? (
              <div>
                <div style={{ fontSize: 32, marginBottom: 8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.8" width="32" height="32"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: TEXT }}>{file.name}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 32, marginBottom: 8, color: MUTED }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="32" height="32"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: MUTED }}>Drop CSV file here or click to browse</div>
                <div style={{ fontSize: 10, color: DIM, marginTop: 4 }}>Supports IPv4 & IPv6 Google Sheets exports</div>
              </div>
            )}
            <input id="csvInput" type="file" accept=".csv" style={{ display: "none" }}
              onChange={e => { setFile(e.target.files[0]); }} />
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: DIM, marginBottom: 6, display: "block" }}>Assign to Site</label>
              <select value={siteId} onChange={e => setSiteId(e.target.value)} className="input" style={{ height: 36, fontSize: 12 }}>
                <option value="">— No site —</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={doPreview} disabled={!file || loading} className="btn btn-primary" style={{ fontSize: 12 }}>
              {loading ? "Parsing..." : "Preview CSV"}
            </button>
            {loading && (
              <div style={{ flex:1, height:4, background:"var(--surface-3)", borderRadius:99, overflow:"hidden" }}>
                <div style={{ width:"60%", height:"100%", background:"var(--accent)", borderRadius:99, animation:"shimmer 1.5s infinite" }}/>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PREVIEW STEP ── */}
      {step === "preview" && preview && (
        <>
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
                    {["", "#", "Prefix", "Customer", "VLAN", "Notes", "Status"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: DIM, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${BORDER}`, background: "var(--surface-2)", position: "sticky", top: 0 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editAllocs.map((a, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid var(--border-subtle)`, opacity: a._include ? 1 : 0.35, transition: "opacity 0.1s", background: i % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface-3)"}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)"}>
                      <td style={{ padding: "5px 10px" }}><input type="checkbox" checked={a._include} onChange={() => toggleRow(i)} style={{ accentColor: ACCENT, cursor: "pointer" }} /></td>
                      <td style={{ padding: "5px 10px", color: DIM, fontFamily: "var(--font-mono)", fontSize: 10 }}>{i + 1}</td>
                      <td style={{ padding: "5px 10px", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: ACCENT }}>{a.prefix}</td>
                      <td style={{ padding: "5px 10px", color: a.customer ? TEXT : DIM, fontSize: 12 }}>{a.customer || "— available —"}</td>
                      <td style={{ padding: "5px 10px", color: DIM, fontFamily: "var(--font-mono)", fontSize: 11 }}>{a.vlan || "—"}</td>
                      <td style={{ padding: "5px 10px", color: DIM, fontSize: 11 }}>{a.notes || "—"}</td>
                      <td style={{ padding: "5px 10px" }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 99, background: a.status === "active" ? "var(--success-surface)" : "var(--surface-3)", color: a.status === "active" ? SUCCESS : MUTED, border: `1px solid ${a.status === "active" ? "var(--success-border)" : "var(--border-soft)"}` }}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: MUTED }}>{selCount} allocations into <span style={{ fontFamily: "var(--font-mono)", color: TEXT }}>{editMeta.prefix}</span></span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep("upload")} className="btn btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
              <button onClick={doImport} disabled={loading || selCount === 0} className="btn btn-primary" style={{ fontSize: 12 }}>
                {loading ? "Importing..." : `Import ${selCount} Allocations`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── DONE STEP ── */}
      {step === "done" && result && (
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--success-surface)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={SUCCESS} strokeWidth="2.5" width="22" height="22"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Import Successful</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>{result.imported} allocations imported · {result.skipped} skipped</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: ACCENT, marginBottom: 20 }}>{editMeta.prefix}</div>
          <button onClick={handleReset} className="btn btn-primary" style={{ fontSize: 12 }}>Import Another</button>
        </div>
      )}
    </div>
  );
}
