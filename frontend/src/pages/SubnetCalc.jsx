import { useState } from "react";

const ACCENT = "var(--accent)";
const CARD = "var(--surface-1)";
const BORDER = "var(--border-medium)";
const TEXT = "var(--text)";
const MUTED = "var(--text-muted)";
const DIM = "var(--text-dim)";
const SUCCESS = "var(--success)";
const DANGER = "var(--danger)";

const MASK_BITS = {
  0:"0.0.0.0",1:"128.0.0.0",2:"192.0.0.0",3:"224.0.0.0",4:"240.0.0.0",
  5:"248.0.0.0",6:"252.0.0.0",7:"254.0.0.0",8:"255.0.0.0",
  9:"255.128.0.0",10:"255.192.0.0",11:"255.224.0.0",12:"255.240.0.0",
  13:"255.248.0.0",14:"255.252.0.0",15:"255.254.0.0",16:"255.255.0.0",
  17:"255.255.128.0",18:"255.255.192.0",19:"255.255.224.0",20:"255.255.240.0",
  21:"255.255.248.0",22:"255.255.252.0",23:"255.255.254.0",24:"255.255.255.0",
  25:"255.255.255.128",26:"255.255.255.192",27:"255.255.255.224",
  28:"255.255.255.240",29:"255.255.255.248",30:"255.255.255.252",
  31:"255.255.255.254",32:"255.255.255.255"
};

function calcSubnet(prefix, splitPrefix) {
  const parts = prefix.split("/");
  const ip = parts[0];
  const origBits = parseInt(parts[1]);
  const newBits = parseInt(splitPrefix);
  if (newBits <= origBits) return { error: "Split prefix must be larger than original" };

  const ipNum = ip.split(".").reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
  const origMask = ~((1 << (32 - origBits)) - 1) >>> 0;
  const network = (ipNum & origMask) >>> 0;
  const count = 1 << (newBits - origBits);
  const step = 1 << (32 - newBits);
  const totalIps = 1 << (32 - newBits);
  const usableIps = Math.max(0, totalIps - 2);

  const subnets = [];
  for (let i = 0; i < count; i++) {
    const subnet = network + i * step;
    const o1 = (subnet >>> 24) & 255;
    const o2 = (subnet >>> 16) & 255;
    const o3 = (subnet >>> 8) & 255;
    const o4 = subnet & 255;
    const bc = subnet + step - 1;
    const b1 = (bc >>> 24) & 255;
    const b2 = (bc >>> 16) & 255;
    const b3 = (bc >>> 8) & 255;
    const b4 = bc & 255;
    subnets.push({
      idx: i + 1,
      network: `${o1}.${o2}.${o3}.${o4}/${newBits}`,
      broadcast: `${b1}.${b2}.${b3}.${b4}`,
      range: `${o1}.${o2}.${o3}.${o4 + 1} - ${b1}.${b2}.${b3}.${b4 - 1}`,
      usable: usableIps > 0 ? totalIps - 2 : totalIps,
      total: totalIps,
      mask: MASK_BITS[newBits] || "—"
    });
  }
  return { subnets, count, step, origMask: MASK_BITS[origBits], newMask: MASK_BITS[newBits] };
}

export default function SubnetCalc() {
  const [prefix, setPrefix] = useState("");
  const [splitPrefix, setSplitPrefix] = useState("24");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleCalc = () => {
    try {
      const r = calcSubnet(prefix, splitPrefix);
      setResult(r);
    } catch {}
  };

  const copyAll = () => {
    if (!result) return;
    const text = result.subnets.map(s =>
      `${s.idx}. ${s.network} | Broadcast: ${s.broadcast} | Range: ${s.range} | Usable: ${s.usable} | Mask: ${s.mask}`
    ).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const totalIps = result ? 1 << (32 - parseInt(splitPrefix)) : 0;

  return (
    <div style={{fontFamily:"Inter,system-ui,sans-serif",display:"flex",flexDirection:"column",gap:16}}>

      <div>
        <div style={{fontSize:16,fontWeight:700,color:TEXT,letterSpacing:"-0.02em"}}>Subnet Calculator</div>
        <div style={{fontSize:12,color:MUTED,marginTop:2}}>Split IPv4 block into smaller subnets</div>
      </div>

      <div className="card" style={{padding:16,display:"flex",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
        <div>
          <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:DIM,marginBottom:6,display:"block"}}>Network Prefix</label>
          <input value={prefix} onChange={e=>setPrefix(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleCalc()}
            placeholder="e.g. 192.168.1.0/24" className="input" style={{height:36,fontSize:13,fontFamily:"var(--font-mono)",width:200}}/>
        </div>
        <div>
          <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:DIM,marginBottom:6,display:"block"}}>Split into</label>
          <select value={splitPrefix} onChange={e=>setSplitPrefix(e.target.value)} className="select" style={{height:36,fontSize:13,fontFamily:"var(--font-mono)",width:100}}>
            {Array.from({length:31},(_,i)=>i+1).slice(3).map(n=><option key={n} value={n}>/{n}</option>)}
          </select>
        </div>
        <button onClick={handleCalc} disabled={!prefix} className="btn btn-primary" style={{height:36,fontSize:12}} disabled={!prefix}>Calculate</button>
      </div>

      {result?.error && (
        <div className="card" style={{padding:16,color:DANGER,background:"var(--danger-surface)",border:"1px solid var(--danger-border)",fontSize:13}}>{result.error}</div>
      )}

      {result?.subnets && (
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8}}>
            <div className="card" style={{padding:"10px 14px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:ACCENT,fontVariantNumeric:"tabular-nums"}}>{result.count}</div>
              <div style={{fontSize:10,color:DIM,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>Subnets</div>
            </div>
            <div className="card" style={{padding:"10px 14px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:SUCCESS,fontVariantNumeric:"tabular-nums"}}>{totalIps.toLocaleString()}</div>
              <div style={{fontSize:10,color:DIM,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>Total IPs</div>
            </div>
            <div className="card" style={{padding:"10px 14px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:result.subnets[0].usable > 0 ? SUCCESS : DANGER,fontVariantNumeric:"tabular-nums"}}>{result.subnets[0].usable.toLocaleString()}</div>
              <div style={{fontSize:10,color:DIM,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>Usable / subnet</div>
            </div>
            <div className="card" style={{padding:"10px 14px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:ACCENT,fontVariantNumeric:"tabular-nums"}}>/{splitPrefix}</div>
              <div style={{fontSize:10,color:DIM,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>New Prefix</div>
            </div>
            <div className="card" style={{padding:"10px 14px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:TEXT,fontVariantNumeric:"tabular-nums"}}>{result.origMask}</div>
              <div style={{fontSize:10,color:DIM,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>Subnet Mask</div>
            </div>
          </div>

          <div className="card" style={{overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:`1px solid ${BORDER}`}}>
              <div style={{fontSize:13,fontWeight:600,color:TEXT}}>Subnets ({result.subnets.length})</div>
              <button onClick={copyAll} className="btn btn-ghost btn-sm" style={{fontSize:11}}>
                {copied ? "Copied!" : "Copy All"}
              </button>
            </div>
            <div style={{overflowX:"auto",maxHeight:400,overflowY:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr>
                    {["#","Network","Broadcast","Usable Range","Hosts","Mask"].map(h => (
                      <th key={h} style={{padding:"6px 10px",textAlign:"left",color:DIM,fontWeight:600,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:`1px solid ${BORDER}`,background:"var(--surface-2)",position:"sticky",top:0,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.subnets.map((s,i) => (
                    <tr key={i} style={{borderBottom:`1px solid var(--border-subtle)`}}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"5px 10px",color:DIM,fontFamily:"var(--font-mono)",fontSize:11}}>{s.idx}</td>
                      <td style={{padding:"5px 10px",fontFamily:"var(--font-mono)",fontWeight:600,color:ACCENT}}>{s.network}</td>
                      <td style={{padding:"5px 10px",fontFamily:"var(--font-mono)",color:MUTED}}>{s.broadcast}</td>
                      <td style={{padding:"5px 10px",fontFamily:"var(--font-mono)",fontSize:11,color:MUTED}}>{s.range}</td>
                      <td style={{padding:"5px 10px",color:TEXT}}>{s.usable}</td>
                      <td style={{padding:"5px 10px",fontFamily:"var(--font-mono)",fontSize:11,color:DIM}}>{s.mask}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
