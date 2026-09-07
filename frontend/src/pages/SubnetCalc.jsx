import { useState } from "react";

// ── IPv4 helpers ──
function ipToInt(ip){return ip.split(".").reduce((a,b)=>(a<<8)+parseInt(b),0)>>>0}
function intToIp(n){return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".")}
function toBin32(n){return n.toString(2).padStart(32,"0")}

const V4_MASKS={0:"0.0.0.0",1:"128.0.0.0",2:"192.0.0.0",3:"224.0.0.0",4:"240.0.0.0",5:"248.0.0.0",6:"252.0.0.0",7:"254.0.0.0",8:"255.0.0.0",9:"255.128.0.0",10:"255.192.0.0",11:"255.224.0.0",12:"255.240.0.0",13:"255.248.0.0",14:"255.252.0.0",15:"255.254.0.0",16:"255.255.0.0",17:"255.255.128.0",18:"255.255.192.0",19:"255.255.224.0",20:"255.255.240.0",21:"255.255.248.0",22:"255.255.252.0",23:"255.255.254.0",24:"255.255.255.0",25:"255.255.255.128",26:"255.255.255.192",27:"255.255.255.224",28:"255.255.255.240",29:"255.255.255.248",30:"255.255.255.252",31:"255.255.255.254",32:"255.255.255.255"};

function maskToCidr(mask){const n=ipToInt(mask);let b=0,v=n;while(v&0x80000000){b++;v=(v<<1)>>>0}return b}
function parseV4Prefix(input){
  const t=input.trim().replace(/^\/+/,"");
  if(/^\d{1,2}$/.test(t)){const n=parseInt(t);if(n>=1&&n<=32)return n}
  if(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(t))return maskToCidr(t);
  return null;
}
function detectClass(ip){const f=(ipToInt(ip)>>>24)&0xff;if(f===0||f===127)return"";if(f>=1&&f<=126)return"Class A";if(f>=128&&f<=191)return"Class B";if(f>=192&&f<=223)return"Class C";if(f>=224&&f<=239)return"Class D (Multicast)";return"Class E (Reserved)"}
function isRFC1918(ip){const n=ipToInt(ip),f=(n>>>24)&0xff,s=(n>>>16)&0xff;if(f===10)return true;if(f===172&&s>=16&&s<=31)return true;if(f===192&&s===168)return true;return false}

function calcV4(ipStr,prefixStr){
  if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipStr))return{error:"Invalid IPv4 address"};
  const cidr=parseV4Prefix(prefixStr);
  if(cidr===null)return{error:"Invalid prefix. Use /8–32 or dotted netmask."};
  const ip=ipToInt(ipStr),maskI=(0xFFFFFFFF<<(32-cidr))>>>0,wc=(~maskI)>>>0;
  const net=(ip&maskI)>>>0,bc=(net|wc)>>>0;
  const hb=32-cidr,total=hb===0?1:Math.pow(2,hb);
  const usable=cidr>=31?(cidr===32?1:2):total-2;
  const hMin=cidr===32?intToIp(net):cidr===31?intToIp(net):intToIp(net+1);
  const hMax=cidr===32?intToIp(net):cidr===31?intToIp(bc):intToIp(bc-1);
  const isNet=ip===net,isBc=ip===bc;
  return{version:"IPv4",ip:ipStr,netmask:V4_MASKS[cidr],cidr,wildcard:intToIp(wc),network:intToIp(net),broadcast:intToIp(bc),hostMin:hMin,hostMax:hMax,usable:String(usable),total:String(total),cls:detectClass(ipStr),priv:isRFC1918(ipStr),addrType:isNet?"Network":isBc?"Broadcast":"Host (Unicast)",binIp:toBin32(ip),binMask:toBin32(maskI),binNet:toBin32(net),binBc:toBin32(bc),binWc:toBin32(wc)};
}

// ── IPv6 helpers ──
function ipv6ToBigInt(addr){
  let s=addr.toLowerCase();
  if(s.includes("::")){const[l,r]=s.split("::");const lp=l?l.split(":"):[];const rp=r?r.split(":"):[];s=[...lp,...Array(8-lp.length-rp.length).fill("0"),...rp].join(":")}
  const groups=s.split(":");
  if(groups.length!==8)return null;
  let acc=0n;for(const g of groups){const v=parseInt(g,16);if(isNaN(v))return null;acc=(acc<<16n)|BigInt(v)}
  return acc;
}
function bigIntToIPv6(bn){
  const h=bn.toString(16).padStart(32,"0");
  const parts=[];for(let i=0;i<32;i+=4)parts.push(h.slice(i,i+4));
  const hex=parts.map(p=>parseInt(p,16).toString(16));
  let best={start:-1,len:0},cur={start:-1,len:0};
  for(let i=0;i<8;i++){if(hex[i]==="0"){if(cur.start===-1)cur.start=i;cur.len++}else{if(cur.len>best.len)best={...cur};cur={start:-1,len:0}}}
  if(cur.len>best.len)best=cur;
  if(best.len>1){return hex.slice(0,best.start).join(":")+"::"+hex.slice(best.start+best.len).join(":")}
  return hex.join(":");
}
function bigIntToBin128(bn){return bn.toString(2).padStart(128,"0")}

function calcV6(ipStr,prefixStr){
  const clean=ipStr.trim();
  if(!clean.includes(":"))return{error:"Invalid IPv6 address"};
  const t=prefixStr.trim().replace(/^\/+/,"");
  const cidr=/^\d{1,3}$/.test(t)?parseInt(t):null;
  if(cidr===null||cidr<1||cidr>128)return{error:"Invalid prefix. Use /1–128."};
  const ip=ipv6ToBigInt(clean);
  if(ip===null)return{error:"Invalid IPv6 address format"};
  const shift=128n-BigInt(cidr);
  const mask=cidr===0?0n:(1n<<128n)-(1n<<shift);
  const wc=(~mask)&((1n<<128n)-1n);
  const net=ip&mask;
  const bc=net|wc;
  const hb=128-cidr;
  const total=hb===0?1n:2n**BigInt(hb);
  const usable=total>2n?total-2n:total;
  const hMin=net+1n;
  const hMax=bc-1n;
  const isNet=ip===net;
  return{version:"IPv6",ip:bigIntToIPv6(ip),cidr,netmask:`/${cidr}`,wildcard:bigIntToIPv6(wc),network:bigIntToIPv6(net),broadcast:bigIntToIPv6(bc),hostMin:bigIntToIPv6(hMin),hostMax:bigIntToIPv6(hMax),usable:usable.toString(),total:total.toString(),addrType:isNet?"Network":"Host (Unicast)",priv:false,cls:"",binIp:bigIntToBin128(ip),binMask:bigIntToBin128(mask),binNet:bigIntToBin128(net),binBc:bigIntToBin128(bc),binWc:bigIntToBin128(wc)};
}

// ── UI ──
const V4_EXAMPLES=[{ip:"10.0.0.0",prefix:"/8"},{ip:"172.16.0.0",prefix:"/12"},{ip:"192.168.1.0",prefix:"/24"},{ip:"203.0.113.40",prefix:"/28"}];
const V6_EXAMPLES=[{ip:"2001:db8::",prefix:"/32"},{ip:"fe80::1",prefix:"/64"},{ip:"2001:db8:abcd::",prefix:"/48"},{ip:"::1",prefix:"/128"}];

function BinBits({binary,cidr}){
  const net=binary.slice(0,cidr),host=binary.slice(cidr);
  return(
    <span style={{display:"inline-flex",flexWrap:"wrap",gap:0,fontFamily:"var(--font-mono)",fontSize:cidr>64?9:11,lineHeight:1}}>
      {net.split("").map((b,i)=>(
        <span key={`n${i}`} style={{display:"inline-flex",width:cidr>64?11:15,height:18,alignItems:"center",justifyContent:"center",background:"var(--accent)",color:"#fff",borderRadius:2,fontWeight:700,marginRight:((i+1)%8===0&&i<cidr-1)?4:0}}>{b}</span>
      ))}
      {host.split("").map((b,i)=>(
        <span key={`h${i}`} style={{display:"inline-flex",width:cidr>64?11:15,height:18,alignItems:"center",justifyContent:"center",background:"var(--surface-3)",color:"var(--text-dim)",borderRadius:2,border:"1px solid var(--border-soft)",marginRight:(((cidr+i+1)%8===0)?4:0)}}>{b}</span>
      ))}
    </span>
  );
}

export default function SubnetCalc(){
  const[ver,setVer]=useState("IPv4");
  const[ip,setIp]=useState("");
  const[prefix,setPrefix]=useState("");
  const[result,setResult]=useState(null);
  const[showBin,setShowBin]=useState(true);
  const isV4=ver==="IPv4";

  const go=()=>{const r=isV4?calcV4(ip,prefix):calcV6(ip,prefix);setResult(r.error?{error:r.error}:r)};
  const examples=isV4?V4_EXAMPLES:V6_EXAMPLES;
  const placeholder=isV4?"192.168.1.100":"2001:db8::1";
  const prefixPh=isV4?"/24":"/64";

  const tabBtn=(v,label)=>(
    <button key={v} className="btn btn-sm" onClick={()=>{setVer(v);setIp("");setPrefix("");setResult(null)}}
      style={ver===v?{background:"var(--accent)",color:"#fff",border:"none"}:{background:"transparent",color:"var(--text-muted)",border:"1px solid var(--border-soft)"}}>
      {label}
    </button>
  );

  return(
    <div style={{padding:"0 0 32px"}}>

      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:20,fontWeight:700,color:"var(--text)",margin:0}}>IP Calculator</h1>
        <p style={{fontSize:13,color:"var(--text-muted)",marginTop:4}}>
          Calculate network, broadcast, wildcard, host range &amp; binary from an IP address and CIDR prefix.
        </p>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {tabBtn("IPv4","IPv4")}
        {tabBtn("IPv6","IPv6")}
      </div>

      <div className="card" style={{padding:20,marginBottom:16}}>
        <form onSubmit={e=>{e.preventDefault();go()}} style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"flex-end"}}>
          <div style={{flex:"1 1 200px",minWidth:160}}>
            <label className="label">Address (Host or Network)</label>
            <input className="input" value={ip} onChange={e=>{setIp(e.target.value);setResult(null)}} placeholder={placeholder} autoFocus/>
          </div>
          <div style={{width:120}}>
            <label className="label">CIDR Prefix</label>
            <input className="input" value={prefix} onChange={e=>{setPrefix(e.target.value);setResult(null)}} placeholder={prefixPh} style={{fontFamily:"var(--font-mono)"}}/>
          </div>
          <button type="submit" className="btn btn-primary">Calculate</button>
        </form>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:14}}>
          {examples.map(ex=>(
            <button key={ex.ip+ex.prefix} className="btn btn-ghost btn-sm" onClick={()=>{setIp(ex.ip);setPrefix(ex.prefix);setResult(null);setTimeout(go,0)}}
              style={{fontFamily:"var(--font-mono)",fontSize:11}}>
              {ex.ip} {ex.prefix}
            </button>
          ))}
        </div>
      </div>

      {result?.error&&(
        <div style={{padding:"10px 14px",background:"var(--danger-surface)",border:"1px solid var(--danger-border)",borderRadius:"var(--radius-sm)",color:"var(--danger)",fontSize:13,marginBottom:16}}>
          {result.error}
        </div>
      )}

      {result&&!result.error&&(
        <div style={{display:"flex",flexDirection:"column",gap:16,animation:"fadeIn 0.25s ease-out"}}>

          {result.priv&&(
            <div style={{padding:"8px 14px",background:"var(--warning-surface)",border:"1px solid var(--warning-border)",borderRadius:"var(--radius-sm)",color:"var(--warning)",fontSize:12,fontWeight:500}}>
              Private internet (RFC 1918)
            </div>
          )}

          <div className="card" style={{padding:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <h3 style={{fontSize:13,fontWeight:700,color:"var(--text)",margin:0}}>Network Information</h3>
              <span style={{fontSize:11,color:"var(--text-dim)",fontFamily:"var(--font-mono)",background:"var(--surface-2)",padding:"2px 8px",borderRadius:99}}>
                {result.version} /{result.cidr} · {result.netmask}
              </span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:0}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <tbody>
                  {[
                    {l:"Address",v:`${result.ip}/${result.cidr}`,c:"var(--accent)"},
                    {l:"Netmask",v:result.netmask},
                    {l:"Wildcard Mask",v:result.wildcard},
                    {l:"Network Address",v:result.network,c:"var(--success)"},
                    {l:"Broadcast Address",v:result.broadcast,c:"var(--danger)"},
                  ].map(r=>(
                    <tr key={r.l}>
                      <td style={{padding:"5px 12px 5px 0",fontSize:12,color:"var(--text-muted)",textAlign:"right",fontFamily:"var(--font-mono)",whiteSpace:"nowrap",width:150,borderRight:"1px solid var(--border-subtle)"}}>{r.l}</td>
                      <td style={{padding:"5px 0 5px 12px",fontSize:13,fontWeight:600,color:r.c||"var(--text)",fontFamily:"var(--font-mono)",wordBreak:"break-all"}}>{r.v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <tbody>
                  {[
                    {l:"Host min",v:result.hostMin},
                    {l:"Host max",v:result.hostMax},
                    {l:"Hosts/Net",v:`${Number(result.usable).toLocaleString()} usable (${Number(result.total).toLocaleString()} total)`,c:"var(--success)"},
                    {l:"Type",v:result.addrType},
                    ...(result.cls?[{l:"Class",v:result.cls}]:[]),
                  ].map(r=>(
                    <tr key={r.l}>
                      <td style={{padding:"5px 12px 5px 0",fontSize:12,color:"var(--text-muted)",textAlign:"right",fontFamily:"var(--font-mono)",whiteSpace:"nowrap",width:150,borderRight:"1px solid var(--border-subtle)"}}>{r.l}</td>
                      <td style={{padding:"5px 0 5px 12px",fontSize:13,fontWeight:600,color:r.c||"var(--text)",fontFamily:"var(--font-mono)"}}>{r.v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{padding:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <h3 style={{fontSize:13,fontWeight:700,color:"var(--text)",margin:0}}>Binary Representation</h3>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowBin(!showBin)}>{showBin?"Hide":"Show"}</button>
            </div>
            {showBin&&(
              <div>
                <div style={{display:"flex",gap:14,marginBottom:10,fontSize:11,color:"var(--text-dim)"}}>
                  <span style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"var(--accent)"}}/> Network
                  </span>
                  <span style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"var(--surface-3)",border:"1px solid var(--border-soft)"}}/> Host
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,background:"var(--surface-2)",borderRadius:"var(--radius-sm)",padding:12}}>
                  {[
                    {l:"Addr",b:result.binIp},
                    {l:"Mask",b:result.binMask},
                    {l:"Net",b:result.binNet},
                    {l:"Bcast",b:result.binBc},
                    {l:"Wc",b:result.binWc},
                  ].map(r=>(
                    <div key={r.l} style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{width:36,fontSize:11,color:"var(--text-dim)",textAlign:"right",fontFamily:"var(--font-mono)",flexShrink:0}}>{r.l}</span>
                      <BinBits binary={r.b} cidr={result.cidr}/>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
    </div>
  );
}
