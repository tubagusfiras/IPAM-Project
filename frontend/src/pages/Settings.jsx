import { useState, useEffect } from "react";
import { authFetch, getStoredUser } from "../api.js";

const ROLE_STYLE = {
  admin: { color:"var(--accent)", bg:"var(--accent-dim)", label:"Admin" },
  user:  { color:"var(--text-muted)", bg:"var(--surface-3)", label:"User" },
};

function UserModal({ user, onClose, onSaved, isNew }) {
  const [form, setForm] = useState({
    username: user?.username || "",
    email: user?.email || "",
    password: "",
    role: user?.role || "user",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = k => v => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if (isNew && (!form.username.trim() || !form.email.trim() || !form.password)) {
      return setErr("Username, email, dan password wajib diisi");
    }
    setSaving(true); setErr(null);
    try {
      if (isNew) {
        const res = await authFetch("/api/v1/users", {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error((await res.json()).detail || "Failed to create user");
      } else {
        const res = await authFetch(`/api/v1/users/${user.id}`, {
          method: "PUT", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ email: form.email, role: form.role }),
        });
        if (!res.ok) throw new Error((await res.json()).detail || "Failed to update user");
      }
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:420}}>
        <div className="modal-header">
          <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>
            {isNew ? "Add User" : `Edit ${user.username}`}
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
            color:"var(--text-muted)",fontSize:18,padding:4}}>✕</button>
        </div>
        <div className="modal-body" style={{display:"flex",flexDirection:"column",gap:14}}>
          {err && (
            <div style={{background:"var(--danger-surface)",border:"1px solid var(--danger-border)",
              borderRadius:"var(--radius-sm)",padding:"10px 14px",color:"var(--danger)",fontSize:13}}>{err}</div>
          )}
          <div>
            <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
              letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Username</label>
            <input value={form.username} onChange={e=>set("username")(e.target.value)}
              className="input" disabled={!isNew} placeholder="e.g. john"/>
          </div>
          <div>
            <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
              letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Email</label>
            <input type="email" value={form.email} onChange={e=>set("email")(e.target.value)}
              className="input" placeholder="e.g. john@sdi"/>
          </div>
          {isNew && (
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
                letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Password</label>
              <input type="password" value={form.password} onChange={e=>set("password")(e.target.value)}
                className="input" placeholder="••••••••"/>
            </div>
          )}
          <div>
            <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
              letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Role</label>
            <select value={form.role} onChange={e=>set("role")(e.target.value)} className="select">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : isNew ? "Create User" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onSaved }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!password || password.length < 4) return setErr("Password minimal 4 karakter");
    setSaving(true); setErr(null);
    try {
      const res = await authFetch(`/api/v1/users/${user.id}/reset-password`, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ new_password: password }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed to reset password");
      onSaved();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:380}}>
        <div className="modal-header">
          <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>Reset Password</div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
            color:"var(--text-muted)",fontSize:18,padding:4}}>✕</button>
        </div>
        <div className="modal-body" style={{display:"flex",flexDirection:"column",gap:14}}>
          {err && (
            <div style={{background:"var(--danger-surface)",border:"1px solid var(--danger-border)",
              borderRadius:"var(--radius-sm)",padding:"10px 14px",color:"var(--danger)",fontSize:13}}>{err}</div>
          )}
          <p style={{fontSize:13,color:"var(--text-muted)",margin:0}}>
            Set new password untuk <strong style={{color:"var(--text)"}}>{user.username}</strong>
          </p>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
            className="input" placeholder="New password" autoFocus/>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Resetting…" : "Reset Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal" style={{maxWidth:380}}>
        <div className="modal-header">
          <div style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>Confirm Delete</div>
          <button onClick={onCancel} style={{background:"none",border:"none",cursor:"pointer",
            color:"var(--text-muted)",fontSize:18,padding:4}}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{fontSize:13,color:"var(--text-muted)",lineHeight:1.6,margin:0}}>{message}</p>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn btn-secondary">Cancel</button>
          <button onClick={onConfirm} className="btn btn-danger">Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function Settings({ dark, onToggleDark }) {
  const currentUser = getStoredUser();
  const isAdmin = currentUser?.role === "admin";

  const [tab, setTab] = useState("profile");
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userModal, setUserModal] = useState(null);
  const [resetModal, setResetModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  // Profile change password
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  const loadUsers = () => {
    setLoadingUsers(true);
    authFetch("/api/v1/users")
      .then(r=>r.json())
      .then(d=>setUsers(d.items||[]))
      .catch(console.error)
      .finally(()=>setLoadingUsers(false));
  };

  useEffect(() => { if (tab==="users" && isAdmin) loadUsers(); }, [tab]);

  const handleChangePassword = async () => {
    if (!oldPw || !newPw) return setPwMsg({type:"error", text:"Isi password lama dan baru"});
    if (newPw.length < 4) return setPwMsg({type:"error", text:"Password baru minimal 4 karakter"});
    setPwSaving(true); setPwMsg(null);
    try {
      const res = await authFetch("/api/v1/auth/change-password", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      setPwMsg({type:"success", text:"Password berhasil diubah"});
      setOldPw(""); setNewPw("");
    } catch(e) {
      setPwMsg({type:"error", text: e.message});
    }
    setPwSaving(false);
  };

  const handleDeleteUser = async (u) => {
    try {
      const res = await authFetch(`/api/v1/users/${u.id}`, { method:"DELETE" });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      setActionMsg({type:"success", text:`User ${u.username} dihapus`});
      loadUsers();
    } catch(e) {
      setActionMsg({type:"error", text: e.message});
    }
    setConfirmDel(null);
    setTimeout(()=>setActionMsg(null), 3000);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <h1 style={{margin:0,fontSize:20,fontWeight:700,color:"var(--text)"}}>Settings</h1>

      {/* Tabs */}
      <div style={{display:"flex",gap:2,background:"var(--surface-2)",borderRadius:"var(--radius-sm)",padding:3,width:"fit-content"}}>
        {[
          ["profile","Profile"],
          ...(isAdmin ? [["users","User Management"]] : []),
          ["appearance","Appearance"],
        ].map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)}
            style={{
              padding:"7px 16px",fontSize:13,fontWeight:600,borderRadius:5,border:"none",cursor:"pointer",
              background: tab===key ? "var(--accent)" : "transparent",
              color: tab===key ? "#fff" : "var(--text-muted)",
            }}>{label}</button>
        ))}
      </div>

      {actionMsg && (
        <div style={{
          padding:"10px 16px",borderRadius:"var(--radius)",fontSize:13,
          background: actionMsg.type==="error" ? "var(--danger-surface)" : "var(--success-surface)",
          color: actionMsg.type==="error" ? "var(--danger)" : "var(--success)",
          border: `1px solid ${actionMsg.type==="error" ? "var(--danger-border)" : "var(--success-border)"}`,
        }}>{actionMsg.text}</div>
      )}

      {/* Profile tab */}
      {tab === "profile" && (
        <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:480}}>
          <div className="card" style={{padding:20}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:16}}>Account Information</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{background:"var(--surface-2)",borderRadius:"var(--radius-sm)",padding:"10px 14px",border:"1px solid var(--border-soft)"}}>
                <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:4}}>Username</div>
                <div style={{fontSize:13,color:"var(--text)",fontFamily:"var(--font-mono)"}}>{currentUser?.username}</div>
              </div>
              <div style={{background:"var(--surface-2)",borderRadius:"var(--radius-sm)",padding:"10px 14px",border:"1px solid var(--border-soft)"}}>
                <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:4}}>Email</div>
                <div style={{fontSize:13,color:"var(--text)"}}>{currentUser?.email}</div>
              </div>
              <div style={{background:"var(--surface-2)",borderRadius:"var(--radius-sm)",padding:"10px 14px",border:"1px solid var(--border-soft)",gridColumn:"1/-1"}}>
                <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:4}}>Role</div>
                <span style={{
                  fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:99,
                  background: ROLE_STYLE[currentUser?.role]?.bg, color: ROLE_STYLE[currentUser?.role]?.color,
                }}>{ROLE_STYLE[currentUser?.role]?.label}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{padding:20}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:4}}>Change Password</div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:16}}>Session akan berakhir 8 jam setelah login</div>

            {pwMsg && (
              <div style={{
                marginBottom:14,padding:"8px 12px",borderRadius:"var(--radius-sm)",fontSize:12,
                background: pwMsg.type==="error" ? "var(--danger-surface)" : "var(--success-surface)",
                color: pwMsg.type==="error" ? "var(--danger)" : "var(--success)",
                border: `1px solid ${pwMsg.type==="error" ? "var(--danger-border)" : "var(--success-border)"}`,
              }}>{pwMsg.text}</div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
                  letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>Current Password</label>
                <input type="password" value={oldPw} onChange={e=>setOldPw(e.target.value)} className="input"/>
              </div>
              <div>
                <label style={{display:"block",fontSize:10,fontWeight:700,textTransform:"uppercase",
                  letterSpacing:"0.08em",color:"var(--text-dim)",marginBottom:6}}>New Password</label>
                <input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} className="input"/>
              </div>
              <button onClick={handleChangePassword} disabled={pwSaving}
                className="btn btn-primary" style={{alignSelf:"flex-start"}}>
                {pwSaving ? "Updating…" : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User management tab */}
      {tab === "users" && isAdmin && (
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border-medium)",
            display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Users</span>
            <button onClick={()=>setUserModal("new")} className="btn btn-primary btn-sm">+ Add User</button>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>{["Username","Email","Role","Status","Last Login",""].map(h=>(
                <th key={h} className="table-header">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                Array.from({length:3}).map((_,i)=>(
                  <tr key={i}>{Array.from({length:6}).map((_,j)=>(
                    <td key={j} className="table-cell"><div className="skeleton" style={{height:13,width:100,borderRadius:4}}/></td>
                  ))}</tr>
                ))
              ) : users.map((u,i)=>(
                <tr key={u.id} className="table-row" style={{background:i%2===0?"var(--surface-1)":"var(--surface-2)"}}>
                  <td className="table-cell">
                    <span style={{fontFamily:"var(--font-mono)",fontSize:13,fontWeight:600,color:"var(--text)"}}>{u.username}</span>
                  </td>
                  <td className="table-cell">
                    <span style={{fontSize:12,color:"var(--text-muted)"}}>{u.email}</span>
                  </td>
                  <td className="table-cell">
                    <span style={{fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:99,
                      background: ROLE_STYLE[u.role]?.bg, color: ROLE_STYLE[u.role]?.color}}>
                      {ROLE_STYLE[u.role]?.label}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span style={{
                      fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:99,
                      background: u.is_active ? "var(--success-surface)" : "var(--surface-3)",
                      color: u.is_active ? "var(--success)" : "var(--text-dim)",
                    }}>{u.is_active ? "ACTIVE" : "INACTIVE"}</span>
                  </td>
                  <td className="table-cell">
                    <span style={{fontSize:11,color:"var(--text-dim)"}}>
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleString("id-ID", {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : "Never"}
                    </span>
                  </td>
                  <td className="table-cell" onClick={e=>e.stopPropagation()}>
                    <div style={{display:"flex",gap:4,justifyContent:"flex-end"}}>
                      <button onClick={()=>setUserModal(u)} className="btn btn-ghost btn-sm" style={{fontSize:11,padding:"3px 8px"}}>Edit</button>
                      <button onClick={()=>setResetModal(u)} className="btn btn-ghost btn-sm" style={{fontSize:11,padding:"3px 8px"}}>Reset PW</button>
                      {u.id !== currentUser?.id && (
                        <button onClick={()=>setConfirmDel(u)} className="btn btn-sm"
                          style={{fontSize:11,padding:"3px 8px",background:"var(--danger-surface)",
                            color:"var(--danger)",border:"1px solid var(--danger-border)"}}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Appearance tab */}
      {tab === "appearance" && (
        <div className="card" style={{padding:20,maxWidth:480}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:4}}>Theme</div>
          <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:16}}>Pilih tampilan terang atau gelap</div>
          <div style={{display:"flex",gap:10}}>
            {[["light","Light"],["dark","Dark"]].map(([key,label])=>(
              <button key={key} onClick={()=>{ if ((key==="dark")!==dark) onToggleDark(); }}
                style={{
                  flex:1,padding:"14px",borderRadius:"var(--radius-sm)",cursor:"pointer",
                  border: `2px solid ${((key==="dark")===dark) ? "var(--accent)" : "var(--border-soft)"}`,
                  background: ((key==="dark")===dark) ? "var(--accent-dim)" : "var(--surface-2)",
                  fontSize:13,fontWeight:600,
                  color: ((key==="dark")===dark) ? "var(--accent)" : "var(--text-muted)",
                }}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {userModal && (
        <UserModal user={userModal==="new"?null:userModal} isNew={userModal==="new"}
          onClose={()=>setUserModal(null)} onSaved={()=>{ setUserModal(null); loadUsers(); }}/>
      )}
      {resetModal && (
        <ResetPasswordModal user={resetModal} onClose={()=>setResetModal(null)}
          onSaved={()=>{ setResetModal(null); setActionMsg({type:"success",text:"Password reset"}); setTimeout(()=>setActionMsg(null),3000); }}/>
      )}
      {confirmDel && (
        <ConfirmModal message={`Hapus user "${confirmDel.username}"? Tindakan ini tidak dapat dibatalkan.`}
          onConfirm={()=>handleDeleteUser(confirmDel)} onCancel={()=>setConfirmDel(null)}/>
      )}
    </div>
  );
}
