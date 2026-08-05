export function ipToInt(ip) {
  const p = ip.split(".").map(Number);
  return ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3])>>>0;
}

export function intToIp(n) {
  return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".");
}

export function isAligned(ip, plen) {
  // Check if IP is aligned to prefix boundary
  const size = Math.pow(2, 32-plen);
  const ipInt = ipToInt(ip);
  return (ipInt % size) === 0;
}

export function snapToBoundary(ip, plen) {
  // Snap IP down to nearest aligned boundary for given plen
  const size = Math.pow(2, 32-plen);
  const ipInt = ipToInt(ip);
  const aligned = Math.floor(ipInt / size) * size;
  return intToIp(aligned>>>0);
}

export function nextValidBoundary(ip, plen, allocations) {
  // Find next aligned boundary that doesn't overlap existing allocations
  const size = Math.pow(2, 32-plen);
  let ipInt = ipToInt(ip);
  // Align up
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

export function validateSubnet(prefix, allocations, blockPrefix) {
  // Returns { valid, errors[], warnings[] }
  const errors   = [];
  const warnings = [];

  if (!prefix || !prefix.includes("/")) return { valid:false, errors:["Invalid prefix format"], warnings };

  try {
    const [ip, plenStr] = prefix.split("/");
    const plen = parseInt(plenStr);
    const parts = ip.split(".").map(Number);

    if (parts.length !== 4 || parts.some(p=>isNaN(p)||p<0||p>255))
      return { valid:false, errors:["Invalid IP address"], warnings };

    if (isNaN(plen) || plen<0 || plen>32)
      return { valid:false, errors:["Prefix length must be 0-32"], warnings };

    // Check alignment
    if (!isAligned(ip, plen)) {
      const correct = snapToBoundary(ip, plen);
      return { valid:false, errors:[`IP not aligned. Use ${correct}/${plen} instead.`], warnings };
    }

    // Check block containment if blockPrefix given
    if (blockPrefix && blockPrefix.includes("/")) {
      const [bAddr, bPlenStr] = blockPrefix.split("/");
      const bPlen = parseInt(bPlenStr);
      if (plen < bPlen) {
        return { valid:false, errors:["Subnet must be smaller than the parent block"], warnings };
      }

      const ipInt = ipToInt(ip);
      const bIntStart = ipToInt(bAddr);
      const bIntEnd   = bIntStart + Math.pow(2, 32-bPlen) - 1;
      if (ipInt < bIntStart || ipInt > bIntEnd) {
        return { valid:false, errors:["Subnet must be within the parent block"], warnings };
      }

      const subnetEnd = ipInt + Math.pow(2,32-plen) - 1;
      if (subnetEnd > bIntEnd) {
        return { valid:false, errors:["Subnet extends beyond the parent block"], warnings };
      }
    }

    // Check overlap with existing allocations
    for (const a of allocations) {
      try {
        const [aAddr, aPlenStr] = a.prefix.split("/");
        const aPlen = parseInt(aPlenStr);

        const ipInt = ipToInt(ip);
        const ipEnd = ipInt + Math.pow(2, 32-plen) - 1;

        const aInt = ipToInt(aAddr);
        const aEnd = aInt + Math.pow(2, 32-aPlen) - 1;

        if (ipInt <= aEnd && ipEnd >= aInt) {
          return { valid:false, errors:[`Overlaps with existing ${a.prefix}`], warnings };
        }
      } catch {}
    }

    return { valid:true, errors, warnings };

  } catch (e) {
    return { valid:false, errors:[e.message||"Invalid"], warnings };
  }
}

export function changeMaskAligned(ip, oldPlen, newPlen) {
  // Only works for IPv4 right now
  if (!ip.includes(".")) return null;
  const oldSize = Math.pow(2, 32-oldPlen);
  const newSize = Math.pow(2, 32-newPlen);
  if (newSize > oldSize) return null; // must be smaller or equal

  const ipInt = ipToInt(ip);
  const aligned = Math.floor(ipInt / newSize) * newSize;
  return intToIp(aligned>>>0);
}

export function ipv6ToBigIntBD(addr) {
  try {
    const hex = addr.split(":").map(p => p||"0").join("");
    return BigInt("0x" + hex);
  } catch {
    return 0n;
  }
}

export function bigIntToIPv6BD(bn) {
  try {
    const hex = bn.toString(16).padStart(32, "0");
    const parts = [];
    for (let i=0; i<32; i+=4) {
      parts.push(hex.slice(i,i+4));
    }
    return parts.join(":");
  } catch {
    return "::";
  }
}

export function calcUsableRange(prefix) {
  if (!prefix) return "";
  try {
    const [addr, plenStr] = prefix.split("/");
    const plen = parseInt(plenStr);

    if (addr.includes(":")) {
      // IPv6
      if (plen === 128) return `${addr} (single)`;
      if (plen === 127) {
        const start = ipv6ToBigIntBD(addr);
        const end   = start + 1n;
        return `${addr} - ${bigIntToIPv6BD(end)}`;
      }
      const start = ipv6ToBigIntBD(addr) + 1n;
      const end   = start + (1n << BigInt(128-plen)) - 3n;
      return `${bigIntToIPv6BD(start)} - ${bigIntToIPv6BD(end)}`;
    }

    // IPv4
    if (plen === 32) return `${addr} (single)`;
    if (plen === 31) {
      const ipInt = ipToInt(addr);
      return `${addr} - ${intToIp(ipInt+1)}`;
    }

    const ipInt = ipToInt(addr);
    const start = ipInt + 1;
    const end   = ipInt + Math.pow(2, 32-plen) - 2;
    return `${intToIp(start)} - ${intToIp(end)}`;
  } catch { return ""; }
}

export function calcUsableCount(prefix) {
  if (!prefix) return 0;
  try {
    const [addr, plenStr] = prefix.split("/");
    const plen = parseInt(plenStr);

    if (addr.includes(":")) {
      if (plen === 128) return 1;
      if (plen === 127) return 2;
      const usable = (1n << BigInt(128-plen)) - 2n;
      return usable > BigInt(Number.MAX_SAFE_INTEGER) ? usable.toString() : Number(usable);
    }

    if (plen === 32) return 1;
    if (plen === 31) return 2;
    return Math.pow(2, 32-plen) - 2;
  } catch { return 0; }
}

export function ownerInfo(type, OWNER_TYPES) {
  return OWNER_TYPES.find(o=>o.value===type) || OWNER_TYPES[0];
}
