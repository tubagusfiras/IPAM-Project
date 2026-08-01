// ── IP Address Utilities ──────────────────────────────────────
// Single source of truth untuk ipToInt, intToIp, calcUsable

export function ipToInt(ip) {
  const p = ip.split(".").map(Number);
  return ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0;
}

export function intToIp(n) {
  return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".");
}

export function calcUsable(prefix) {
  try {
    const [addr, plen] = prefix.split("/");
    const p = parseInt(plen);
    const base = ipToInt(addr);
    const size = Math.pow(2, 32-p);
    if (size <= 2) return `${intToIp(base)} — ${intToIp((base+size-1)>>>0)}`;
    return `${intToIp((base+1)>>>0)} — ${intToIp((base+size-2)>>>0)}`;
  } catch { return ""; }
}
