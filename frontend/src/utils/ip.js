// ── IP Address Utilities ──────────────────────────────
// Single source of truth for ipToInt, intToIp, calcUsable

export function ipToInt(ip) {
  const p = ip.split(".").map(Number);
  return ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0;
}

export function intToIp(n) {
  return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".");
}

export function ipv6ToBigIntIP(addr) {
  try {
    let s = addr;
    if (s.includes("::")) {
      const sides = s.split("::");
      const left  = sides[0] ? sides[0].split(":") : [];
      const right = sides[1] ? sides[1].split(":") : [];
      const missing = 8 - left.length - right.length;
      const mid = Array(missing).fill("0");
      s = [...left, ...mid, ...right].join(":");
    }
    const groups = s.split(":").map(g => parseInt(g || "0", 16));
    return groups.reduce((acc, g) => (acc << 16n) | BigInt(g), 0n);
  } catch { return 0n; }
}

export function bigIntToIPv6IP(bn) {
  try {
    const hex = bn.toString(16).padStart(32, "0");
    const parts = [];
    for (let i = 0; i < 32; i += 4) {
      parts.push(hex.slice(i, i + 4));
    }
    let best = { start: -1, len: 0 }, cur = { start: -1, len: 0 };
    parts.forEach((g, i) => {
      if (g === "0000") {
        if (cur.start < 0) cur = { start: i, len: 1 }; else cur.len++;
        if (cur.len > best.len) best = { ...cur };
      } else { cur = { start: -1, len: 0 }; }
    });
    if (best.len > 1) {
      const left  = parts.slice(0, best.start).join(":");
      const right = parts.slice(best.start + best.len).join(":");
      return (left ? left + ":" : "") + "::" + (right ? right : "");
    }
    return parts.join(":");
  } catch { return "::"; }
}

export function calcUsable(prefix) {
  try {
    const [addr, plen] = prefix.split("/");
    const p = parseInt(plen);
    if (addr.includes(":")) {
      const base = ipv6ToBigIntIP(addr);
      const shift = BigInt(128 - p);
      const size = 1n << shift;
      if (size <= 2n) return `${addr} — ${bigIntToIPv6IP(base + size - 1n)}`;
      return `${bigIntToIPv6IP(base + 1n)} — ${bigIntToIPv6IP(base + size - 2n)}`;
    }
    const base = ipToInt(addr);
    const size = Math.pow(2, 32-p);
    if (size <= 2) return `${intToIp(base)} — ${intToIp((base+size-1)>>>0)}`;
    return `${intToIp((base+1)>>>0)} — ${intToIp((base+size-2)>>>0)}`;
  } catch { return ""; }
}
