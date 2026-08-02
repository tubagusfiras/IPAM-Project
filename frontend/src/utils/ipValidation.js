import { ipToInt, intToIp } from "./ip.js";
import { OWNER_TYPES as OWNER_TYPE_VALUES } from "../constants.js";

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const OWNER_TYPE_STYLE = {
  customer:   { color:"var(--accent)",   icon:"👤" },
  internal:   { color:"var(--accent2)",  icon:"🖥️" },
  ptp:        { color:"var(--warning)",  icon:"ptp" },
  peering:    { color:"#a855f7",         icon:"peering" },
  management: { color:"var(--info)",     icon:"⚙️" },
  reserved:   { color:"var(--text-dim)", icon:"🔒" },
};
const OWNER_TYPES = OWNER_TYPE_VALUES.map(o => ({ ...o, ...OWNER_TYPE_STYLE[o.value] }));

// ── SUBNET VALIDATION ───────────────────────────────────────────────────────
function isAligned(ip, plen) {
  const size = Math.pow(2, 32-plen);
  const ipInt = ipToInt(ip);
  return (ipInt % size) === 0;
}

function snapToBoundary(ip, plen) {
  const size = Math.pow(2, 32-plen);
  const ipInt = ipToInt(ip);
  const aligned = Math.floor(ipInt / size) * size;
  return intToIp(aligned>>>0);
}

function nextValidBoundary(ip, plen, allocations) {
  const size = Math.pow(2, 32-plen);
  let ipInt = ipToInt(ip);
  if (ipInt % size !== 0) ipInt = (Math.floor(ipInt/size)+1)*size;

  for (let attempt=0; attempt<256; attempt++) {
    const candidate = ipInt + (attempt * size);
    const candEnd   = candidate + size - 1;
    let overlaps = false;
    for (const a of allocations) {
      try {
        const [addr, p] = a.prefix.split("/");
        const aStart = ipToInt(addr);
        const aEnd   = aStart + Math.pow(2, 32-parseInt(p)) - 1;
        if (candidate <= aEnd && candEnd >= aStart) { overlaps=true; break; }
      } catch {}
    }
    if (!overlaps) return intToIp(candidate>>>0);
  }
  return null;
}

// ─── IPv6 helpers ───────────────────────────────────────────────
function expandIPv6(addr) {
  let s = addr;
  if (s.includes("::")) {
    const sides = s.split("::");
    const left  = sides[0] ? sides[0].split(":") : [];
    const right = sides[1] ? sides[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    const mid = Array(missing).fill("0");
    s = [...left, ...mid, ...right].join(":");
  }
  return s.split(":").map(g => parseInt(g||"0", 16));
}

function ipv6ToBigInt(addr) {
  const groups = expandIPv6(addr);
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(g), 0n);
}

function isValidIPv6(addr) {
  try {
    if (!addr || addr.includes(":::")) return false;
    const dcCount = (addr.match(/::/g)||[]).length;
    if (dcCount > 1) return false;
    const groups = expandIPv6(addr);
    if (groups.length !== 8) return false;
    return groups.every(g => g >= 0 && g <= 65535 && !isNaN(g));
  } catch { return false; }
}

function ipv6InBlock(addr, blockAddr, blockPlen) {
  try {
    const ip    = ipv6ToBigInt(addr);
    const bBase = ipv6ToBigInt(blockAddr);
    const mask  = blockPlen === 0 ? 0n : (~0n << BigInt(128 - blockPlen)) & ((1n << 128n) - 1n);
    const bEnd  = bBase | (~mask & ((1n << 128n) - 1n));
    return ip >= bBase && ip <= bEnd;
  } catch { return false; }
}

function ipv6Overlaps(addr1, plen1, addr2, plen2) {
  try {
    const makeRange = (addr, plen) => {
      const base = ipv6ToBigInt(addr);
      const mask = plen === 0 ? 0n : (~0n << BigInt(128 - plen)) & ((1n << 128n) - 1n);
      const start = base & mask;
      const end   = start | (~mask & ((1n << 128n) - 1n));
      return [start, end];
    };
    const [s1, e1] = makeRange(addr1, plen1);
    const [s2, e2] = makeRange(addr2, plen2);
    return s1 <= e2 && e1 >= s2;
  } catch { return false; }
}

function validateSubnet(prefix, allocations, blockPrefix) {
  const errors   = [];
  const warnings = [];

  if (!prefix || !prefix.includes("/"))
    return { valid:false, errors:["Invalid prefix format (use CIDR notation)"], warnings };

  const [ip, plenStr] = prefix.split("/");
  const plen = parseInt(plenStr);
  const isV6 = ip.includes(":");

  try {
    if (isV6) {
      if (!isValidIPv6(ip))
        return { valid:false, errors:["Invalid IPv6 address"], warnings };
      if (isNaN(plen) || plen < 1 || plen > 128)
        return { valid:false, errors:["Invalid prefix length (1-128)"], warnings };

      if (blockPrefix) {
        const [bAddr, bPlenStr] = blockPrefix.split("/");
        if (!ipv6InBlock(ip, bAddr, parseInt(bPlenStr)))
          errors.push(`Prefix is outside block ${blockPrefix}`);
      }

      for (const a of (allocations||[])) {
        if (a.status === "available") continue;
        if (!a.prefix.includes(":")) continue;
        try {
          const [aAddr, aPlenStr] = a.prefix.split("/");
          const aPlen = parseInt(aPlenStr);
          if (ipv6Overlaps(ip, plen, aAddr, aPlen)) {
            if (ip === aAddr && plen === aPlen)
              warnings.push(`Prefix already exists as ${a.prefix}`);
            else
              errors.push(`Overlaps with ${a.prefix} (${a.description||a.customer_name||"allocated"})`);
          }
        } catch {}
      }

    } else {
      const parts = ip.split(".").map(Number);
      if (parts.length !== 4 || parts.some(p=>isNaN(p)||p<0||p>255))
        return { valid:false, errors:["Invalid IPv4 address"], warnings };
      if (isNaN(plen) || plen < 1 || plen > 32)
        return { valid:false, errors:["Invalid prefix length (1-32)"], warnings };

      const ipInt = ipToInt(ip);
      const size  = Math.pow(2, 32-plen);
      const ipEnd = (ipInt + size - 1)>>>0;

      if (blockPrefix) {
        const [bAddr, bPlen] = blockPrefix.split("/");
        const bStart = ipToInt(bAddr);
        const bSize  = Math.pow(2, 32-parseInt(bPlen));
        const bEnd   = (bStart+bSize-1)>>>0;
        if (ipInt < bStart || ipEnd > bEnd)
          errors.push(`Prefix is outside block ${blockPrefix}`);
      }

      if (!isAligned(ip, plen)) {
        const snapped = snapToBoundary(ip, plen);
        errors.push(`Not aligned — should start at ${snapped}/${plen}`);
      }

      for (const a of (allocations||[])) {
        if (a.status === "available") continue;
        if (a.prefix.includes(":")) continue;
        try {
          const [aAddr, aPlen] = a.prefix.split("/");
          const aStart = ipToInt(aAddr);
          const aSize  = Math.pow(2, 32-parseInt(aPlen));
          const aEnd   = (aStart+aSize-1)>>>0;
          if (ipInt <= aEnd && ipEnd >= aStart) {
            if (ipInt===aStart && ipEnd===aEnd)
              warnings.push(`Prefix already exists as ${a.prefix}`);
            else
              errors.push(`Overlaps with ${a.prefix} (${a.description||a.customer_name||"allocated"})`);
          }
        } catch {}
      }
    }

  } catch(e) {
    errors.push("Validation error: " + e.message);
  }

  return { valid: errors.length===0, errors, warnings };
}

function changeMaskAligned(currentPrefix, newPlen, allocations) {
  if (!currentPrefix) return `0.0.0.0/${newPlen}`;
  try {
    const [ip] = currentPrefix.split("/");
    const snapped = snapToBoundary(ip, newPlen);
    const size   = Math.pow(2, 32-newPlen);
    const ipInt  = ipToInt(snapped);
    const ipEnd  = (ipInt+size-1)>>>0;
    let overlaps = false;
    for (const a of (allocations||[])) {
      if (a.status === "available") continue;
      try {
        const [aAddr,aPlen] = a.prefix.split("/");
        const aStart = ipToInt(aAddr);
        const aEnd   = (aStart+Math.pow(2,32-parseInt(aPlen))-1)>>>0;
        if (ipInt<=aEnd && ipEnd>=aStart) { overlaps=true; break; }
      } catch {}
    }
    if (!overlaps) return `${snapped}/${newPlen}`;
    const next = nextValidBoundary(snapped, newPlen, allocations);
    return next ? `${next}/${newPlen}` : `${snapped}/${newPlen}`;
  } catch {
    return `0.0.0.0/${newPlen}`;
  }
}

function bigIntToIPv6(n) {
  const groups = [];
  for (let i = 0; i < 8; i++) {
    groups.unshift((n & 0xffffn).toString(16));
    n >>= 16n;
  }
  let best = {start:-1,len:0}, cur = {start:-1,len:0};
  groups.forEach((g,i) => {
    if (g==="0") {
      if (cur.start<0) cur={start:i,len:1}; else cur.len++;
      if (cur.len>best.len) best={...cur};
    } else { cur={start:-1,len:0}; }
  });
  if (best.len > 1) {
    const left  = groups.slice(0,best.start).join(":");
    const right = groups.slice(best.start+best.len).join(":");
    return (left?left+":":"") + ":" + (right?right:"");
  }
  return groups.join(":");
}

function calcUsableRange(prefix) {
  if (!prefix) return "";
  try {
    const [addr, plenStr] = prefix.split("/");
    const plen = parseInt(plenStr);
    if (addr.includes(":")) {
      const base = ipv6ToBigInt(addr);
      const mask = plen === 0 ? 0n : (~0n << BigInt(128-plen)) & ((1n<<128n)-1n);
      const network = base & mask;
      const bcast   = network | (~mask & ((1n<<128n)-1n));
      if (plen === 128) return addr;
      if (plen === 127) return `${bigIntToIPv6(network)} — ${bigIntToIPv6(bcast)}`;
      return `${bigIntToIPv6(network+1n)} — ${bigIntToIPv6(bcast-1n)}`;
    }
    const parts = addr.split(".").map(Number);
    const toInt = p => ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0;
    const toIP  = n => [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".");
    const base  = toInt(parts);
    const size  = Math.pow(2, 32-plen);
    if (plen === 32) return addr;
    if (plen === 31) return `${addr} — ${toIP((base+1)>>>0)}`;
    return `${toIP((base+1)>>>0)} — ${toIP((base+size-2)>>>0)}`;
  } catch { return ""; }
}

function calcUsableCount(prefix) {
  if (!prefix) return 0;
  try {
    const [addr, plenStr] = prefix.split("/");
    const plen = parseInt(plenStr);
    if (addr.includes(":")) {
      if (plen === 128) return 1;
      if (plen === 127) return 2;
      const total = 1n << BigInt(128-plen);
      const usable = total - 2n;
      return usable > BigInt(Number.MAX_SAFE_INTEGER) ? usable.toString() : Number(usable);
    }
    if (plen === 32) return 1;
    if (plen === 31) return 2;
    return Math.pow(2, 32-plen) - 2;
  } catch { return 0; }
}

function ownerInfo(type) {
  return OWNER_TYPES.find(o=>o.value===type) || OWNER_TYPES[0];
}

export {
  isAligned,
  snapToBoundary,
  nextValidBoundary,
  expandIPv6,
  ipv6ToBigInt,
  isValidIPv6,
  ipv6InBlock,
  ipv6Overlaps,
  validateSubnet,
  changeMaskAligned,
  bigIntToIPv6,
  calcUsableRange,
  calcUsableCount,
  ownerInfo,
  OWNER_TYPES,
};
