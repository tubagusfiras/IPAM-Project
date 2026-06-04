import { useState, useEffect } from "react";
import { previewImport, confirmImport, getSites } from "../api.js";
import { C, Mono, StatusBadge, Btn, Input, Select, Alert, PageHeader } from "../components/ui.jsx";

export default function Import({ onImported }) {
  const [file, setFile]         = useState(null);
  const [sites, setSites]       = useState([]);
  const [siteId, setSiteId]     = useState("");
  const [preview, setPreview]   = useState(null);
  const [editMeta, setEditMeta] = useState({});
  const [editAllocs, setEditAllocs] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [err, setErr]           = useState(null);

  useEffect(()=>{ getSites().then(setSites); },[]);

  const doPreview = async () => {
    if (!file) return;
    setLoading(true); setPreview(null); setResult(null); setErr(null);
    try {
      const d = await previewImport(file);
      setPreview(d);
      setEditMeta({
        prefix:   d.meta.prefix||"",
        name:     d.meta.name||d.meta.prefix||"",
        asn:      d.meta.asn||"",
        router:   d.meta.router||"",
        operator: d.meta.operator||"",
      });
      setEditAllocs(d.allocations.map(a=>({
        prefix:      a.prefix||"",
        customer:    a.customer||null,
        vlan:        a.vlan||null,
        description: a.description||"",
        notes:       a.notes||"",
        status:      a.status||"active",
        _include:    true,
      })));
    } catch(e) { setErr(e.message); }
    setLoading(false);
  };

  const doImport = async () => {
    setLoading(true); setErr(null);
    try {
      const allocs = editAllocs
        .filter(a=>a._include)
        .map(({_include,...rest})=>({
          prefix:      rest.prefix,
          customer:    rest.customer||null,
          vlan:        rest.vlan||null,
          description: rest.description||"",
          notes:       rest.notes||"",
          status:      rest.status||"active",
        }));
      const d = await confirmImport({
        meta: {
          prefix:   editMeta.prefix,
          name:     editMeta.name||editMeta.prefix,
          asn:      editMeta.asn||null,
          router:   editMeta.router||null,
          operator: editMeta.operator||null,
        },
        allocations: allocs,
        site_id: siteId||null
      });
      setResult(d); setPreview(null); setFile(null);
      if (onImported) setTimeout(onImported, 1500);
    } catch(e) { setErr(e.message); }
    setLoading(false);
  };

  const setMeta   = k => v => setEditMeta(m=>({...m,[k]:v}));
  const toggleAll = v => setEditAllocs(a=>a.map(x=>({...x,_include:v})));
  const toggleRow = i => setEditAllocs(a=>a.map((x,idx)=>idx===i?{...x,_include:!x._include}:x));
  const setAllocField = (i,k) => v => setEditAllocs(a=>a.map((x,idx)=>idx===i?{...x,[k]:v}:x));

  const selectedCount = editAllocs.filter(a=>a._include).length;

  return (
    <div style={{maxWidth:960}}>
      <PageHeader title="Import CSV" icon="⇪" />

      {/* Upload panel */}
      <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:20,marginBottom:16}}>
        <div style={{color:C.text0,fontWeight:600,fontSize:13,marginBottom:14}}>Upload Google Sheets Export (CSV)</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          <div>
            <div style={{color:C.text2,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>CSV File</div>
            <input type="file" accept=".csv"
              onChange={e=>{ setFile(e.target.files[0]); setPreview(null); setResult(null); setErr(null); }}
              style={{color:C.text1,fontSize:12,width:"100%"}}
            />
            {file && <div style={{color:C.text2,fontSize:11,marginTop:4}}>📄 {file.name}</div>}
          </div>
          <Select label="Assign to Site" value={siteId} onChange={setSiteId}
            options={sites.map(s=>({value:s.id,label:s.name}))} />
        </div>
        <Btn onClick={doPreview} disabled={!file||loading}>
          {loading&&!preview ? "Parsing CSV…" : "Preview CSV"}
        </Btn>
      </div>

      {err && <Alert type="error" message={err}/>}

      {/* Success result */}
      {result && (
        <div style={{background:"#051a0a",border:`1px solid ${C.green}44`,borderRadius:8,padding:18,marginBottom:16}}>
          <div style={{color:C.green,fontWeight:600,fontSize:14,marginBottom:8}}>✓ Import Successful</div>
          <div style={{fontFamily:C.mono,fontSize:13,color:C.text1}}>
            Block: <span style={{color:C.blue}}>{editMeta.prefix}</span> &nbsp;|&nbsp;
            Imported: <span style={{color:C.green}}>{result.imported}</span> &nbsp;|&nbsp;
            Skipped: <span style={{color:C.amber}}>{result.skipped}</span>
          </div>
          <div style={{marginTop:10}}>
            <Btn size="sm" variant="ghost" onClick={()=>{ setResult(null); setFile(null); }}>Import Another</Btn>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <>
          {/* Meta editor */}
          <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:20,marginBottom:12}}>
            <div style={{color:C.text0,fontWeight:600,fontSize:13,marginBottom:14}}>
              Block Metadata
              <span style={{color:C.text2,fontWeight:400,fontSize:11,marginLeft:8}}>— review & edit before import</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0 16px"}}>
              <Input label="Parent Prefix *" value={editMeta.prefix} onChange={setMeta("prefix")} mono required />
              <Input label="Block Name"      value={editMeta.name}   onChange={setMeta("name")} />
              <Input label="ASN"             value={editMeta.asn}    onChange={setMeta("asn")} mono />
              <Input label="Router"          value={editMeta.router} onChange={setMeta("router")} mono />
              <div style={{gridColumn:"2/-1"}}>
                <Input label="Operator" value={editMeta.operator} onChange={setMeta("operator")} />
              </div>
            </div>
          </div>

          {/* Allocations table */}
          <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:20,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{color:C.text0,fontWeight:600,fontSize:13}}>
                Allocations Preview
                <span style={{color:C.text2,fontWeight:400,fontSize:11,marginLeft:8}}>
                  {selectedCount} of {editAllocs.length} selected
                </span>
              </div>
              <div style={{display:"flex",gap:6}}>
                <Btn size="sm" variant="ghost" onClick={()=>toggleAll(true)}>Select All</Btn>
                <Btn size="sm" variant="ghost" onClick={()=>toggleAll(false)}>Deselect All</Btn>
              </div>
            </div>

            <div style={{overflowX:"auto",overflowY:"auto",maxHeight:440}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead style={{position:"sticky",top:0,zIndex:10}}>
                  <tr style={{background:C.bg1,borderBottom:`2px solid ${C.border}`}}>
                    {["✓","#","Prefix","Customer / Description","VLAN","Notes","Status"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"6px 10px",color:C.text2,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap",borderRight:`1px solid ${C.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editAllocs.map((a,i)=>(
                    <tr key={i}
                      style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.bg1:C.bg0,opacity:a._include?1:0.35,transition:"opacity 0.1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background=C.bg3}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===0?C.bg1:C.bg0}
                    >
                      <td style={{padding:"5px 10px",borderRight:`1px solid ${C.border}`}}>
                        <input type="checkbox" checked={a._include} onChange={()=>toggleRow(i)}
                          style={{accentColor:C.blue,cursor:"pointer"}}/>
                      </td>
                      <td style={{padding:"5px 10px",borderRight:`1px solid ${C.border}`,color:C.text2,fontFamily:C.mono,fontSize:10}}>{i+1}</td>
                      <td style={{padding:"5px 10px",borderRight:`1px solid ${C.border}`}}>
                        <Mono size={12}>{a.prefix}</Mono>
                      </td>
                      <td style={{padding:"5px 10px",borderRight:`1px solid ${C.border}`,minWidth:180}}>
                        <input value={a.customer||""}
                          onChange={e=>setAllocField(i,"customer")(e.target.value)}
                          placeholder="— available —"
                          style={{background:"transparent",border:"none",color:a.customer?C.text0:C.text2,fontSize:12,width:"100%",outline:"none",fontFamily:"inherit",cursor:"text"}}
                        />
                      </td>
                      <td style={{padding:"5px 10px",borderRight:`1px solid ${C.border}`}}>
                        <Mono color={C.purple} size={11}>{a.vlan||"—"}</Mono>
                      </td>
                      <td style={{padding:"5px 10px",borderRight:`1px solid ${C.border}`,color:C.text2,fontSize:11}}>{a.notes||"—"}</td>
                      <td style={{padding:"5px 10px"}}><StatusBadge status={a.status}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action bar */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:C.text2,fontSize:12}}>
              {selectedCount} allocations will be imported into block <Mono size={12}>{editMeta.prefix}</Mono>
            </span>
            <div style={{display:"flex",gap:8}}>
              <Btn variant="ghost" onClick={()=>setPreview(null)}>Cancel</Btn>
              <Btn variant="success" onClick={doImport} disabled={loading||selectedCount===0}>
                {loading ? "Importing…" : `Import ${selectedCount} Allocations`}
              </Btn>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
