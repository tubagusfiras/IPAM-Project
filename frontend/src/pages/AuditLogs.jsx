import { useState, useEffect, useCallback } from "react";

const ACTION_STYLE = {
  create: { color:"var(--success)", bg:"var(--success-surface)", border:"var(--success-border)", label:"Created" },
  update: { color:"var(--warning)", bg:"var(--warning-surface)", border:"var(--warning-border)", label:"Updated" },
  delete: { color:"var(--danger)",  bg:"var(--danger-surface)",  border:"var(--danger-border)",  label:"Deleted" },
};

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("id-ID");
}

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString("id-ID", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit"
  });
}

export default function AuditLogs() {
  const [items,      setItems]      = useState([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [page,       setPage]       = useState(0);
  const LIMIT = 50;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: LIMIT, offset: page*LIMIT,
      ...(actionFilter && {action: actionFilter}),
      ...(entityFilter && {entity_type: entityFilter}),
    });
    fetch(`/api/v1/audit-logs?${params}`)
      .then(r=>r.json())
      .then(d=>{ setItems(d.items||[]); setTotal(d.total||0); })
      .catch(console.error)
      .finally(()=>setLoading(false));
  }, [actionFilter, entityFilter, page]);

  useEffect(()=>{ load(); },[load]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <h1 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text)"}}>Audit Logs</h1>
          {total>0 && (
            <span style={{
              fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:99,
              background:"var(--surface-3)",color:"var(--text-muted)",
              border:"1px solid var(--border-soft)",
            }}>{total}</span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <select value={actionFilter} onChange={e=>{setActionFilter(e.target.value);setPage(0);}}
          className="select" style={{height:34,fontSize:13,minWidth:130}}>
          <option value="">All Actions</option>
          <option value="create">Created</option>
          <option value="update">Updated</option>
          <option value="delete">Deleted</option>
        </select>
        <select value={entityFilter} onChange={e=>{setEntityFilter(e.target.value);setPage(0);}}
          className="select" style={{height:34,fontSize:13,minWidth:140}}>
          <option value="">All Entities</option>
          <option value="allocation">Allocation</option>
          <option value="block">Block</option>
          <option value="customer">Customer</option>
          <option value="vlan">VLAN</option>
        </select>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6,
            padding:"4px 12px",borderRadius:99,
            background:"var(--surface-3)",border:"1px solid var(--border-soft)",
            fontSize:12,fontWeight:500}}>
            <span style={{color:"var(--text)",fontWeight:700}}>{total}</span>
            <span style={{color:"var(--text-muted)"}}>Total</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card" style={{overflow:"hidden"}}>
        {loading ? (
          <div style={{padding:20,display:"flex",flexDirection:"column",gap:10}}>
            {Array.from({length:6}).map((_,i)=>(
              <div key={i} className="skeleton" style={{height:48,borderRadius:8}}/>
            ))}
          </div>
        ) : items.length===0 ? (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",
            justifyContent:"center",padding:"60px 0",gap:10}}>
            <div style={{fontSize:36}}>📋</div>
            <div style={{fontSize:13,color:"var(--text-dim)"}}>No logs yet</div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column"}}>
            {items.map((log,i) => {
              const style = ACTION_STYLE[log.action] || ACTION_STYLE.update;
              const isExpanded = expanded === log.id;
              return (
                <div key={log.id}
                  style={{
                    padding:"12px 16px",
                    borderBottom: i<items.length-1 ? "1px solid var(--border-soft)" : "none",
                    background: i%2===0 ? "var(--surface-1)" : "var(--surface-2)",
                    cursor: (log.old_data || log.new_data) ? "pointer" : "default",
                  }}
                  onClick={()=>{
                    if (log.old_data || log.new_data) {
                      setExpanded(isExpanded ? null : log.id);
                    }
                  }}
                >
                  <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                    {/* Action dot */}
                    <div style={{
                      width:8,height:8,borderRadius:"50%",background:style.color,
                      marginTop:5,flexShrink:0,
                    }}/>

                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:3}}>
                        <span style={{
                          fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:99,
                          background:style.bg,color:style.color,border:`1px solid ${style.border}`,
                          textTransform:"uppercase",
                        }}>{style.label}</span>
                        <span style={{fontSize:11,color:"var(--text-dim)",textTransform:"capitalize"}}>
                          {log.entity_type}
                        </span>
                        {log.entity_prefix && (
                          <span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:600,color:"var(--accent)"}}>
                            {log.entity_prefix}
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:13,color:"var(--text)",marginBottom:3}}>
                        {log.description || `${style.label} ${log.entity_type}`}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:11,color:"var(--text-dim)"}}>
                          by {log.changed_by || "system"}
                        </span>
                        <span style={{fontSize:11,color:"var(--text-dim)"}}>·</span>
                        <span style={{fontSize:11,color:"var(--text-dim)"}} title={formatDateTime(log.created_at)}>
                          {timeAgo(log.created_at)}
                        </span>
                        {(log.old_data || log.new_data) && (
                          <span style={{fontSize:10,color:"var(--accent)",marginLeft:4}}>
                            {isExpanded ? "▲ hide details" : "▼ show details"}
                          </span>
                        )}
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div style={{
                          marginTop:10,padding:"10px 12px",borderRadius:"var(--radius-sm)",
                          background:"var(--surface-3)",border:"1px solid var(--border-soft)",
                          fontSize:11,fontFamily:"var(--font-mono)",
                        }}>
                          {log.old_data && (
                            <div style={{marginBottom: log.new_data ? 8 : 0}}>
                              <div style={{color:"var(--text-dim)",marginBottom:4,fontWeight:600}}>BEFORE</div>
                              <div style={{color:"var(--text-muted)",whiteSpace:"pre-wrap",wordBreak:"break-all"}}>
                                {JSON.stringify(log.old_data, null, 2)}
                              </div>
                            </div>
                          )}
                          {log.new_data && (
                            <div>
                              <div style={{color:"var(--text-dim)",marginBottom:4,fontWeight:600}}>AFTER</div>
                              <div style={{color:"var(--text-muted)",whiteSpace:"pre-wrap",wordBreak:"break-all"}}>
                                {JSON.stringify(log.new_data, null, 2)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {total > LIMIT && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"12px 16px",borderTop:"1px solid var(--border-soft)"}}>
            <span style={{fontSize:12,color:"var(--text-muted)"}}>
              Showing {page*LIMIT+1}–{Math.min((page+1)*LIMIT,total)} of {total}
            </span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}
                className="btn btn-secondary btn-sm">← Prev</button>
              <button onClick={()=>setPage(p=>p+1)} disabled={(page+1)*LIMIT>=total}
                className="btn btn-secondary btn-sm">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
