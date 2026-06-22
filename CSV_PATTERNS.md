# CSV IMPORT PATTERNS ANALYSIS

**Analysis Date:** 2026-06-22  
**Sample Files:** 4 CSV files from `/opt/database-ipaddresses/data/csv/`  
**Status:** ⚠️ Format varies significantly - not suitable for generic upload endpoint

---

## 🎯 Executive Summary

**Finding:** CSV formats are **NOT uniform** across files. Two distinct patterns exist (IPv4 vs IPv6), and even within IPv4 files there are structural variations.

**Recommendation:** CSV upload endpoint is **not practical** without format detection and multiple parsers. Current parser functions (`parse_ipv4_csv`, `parse_ipv6_csv` in `backend/main.py`) handle the patterns but require manual format selection.

**Why non-uniform:**
1. **Legacy format evolution** - Different operators/teams created different formats over time
2. **IPv4 vs IPv6 complexity** - IPv4 uses complex subnet matrix, IPv6 uses simple list
3. **Manual spreadsheet origins** - Originally managed in Google Sheets with varying structures
4. **Missing standardization** - No enforced schema when data was initially created

---

## 📊 Pattern Analysis

### Pattern 1: IPv4 Complex Matrix Format

**Files:**
- `SDI_IP_ADDRESS_UP_TO_DATE_-_163_61_201_0_24___ASIANA.csv`
- `SDI_IP_ADDRESS_UP_TO_DATE_-_114_198_245_0_24_-_LS-Dist-MR.csv`
- `SDI_IP_ADDRESS_UP_TO_DATE_-_114_198_242_0_24_-_KEDIRI.csv`

**Structure:**
```
Line 1-4:   Metadata (optional flag, parent block, ASN, operator, router)
Line 5-6:   Column headers (subnet mask references: /30, /29, /28, /27, /26, /25, /24)
Line 7+:    Data rows
```

**Data Row Format:**
```
Customer Name, VLAN, Net1, Bcast1, Net2, Bcast2, Net3, Bcast3, ..., [Optional Notes]
              ^^^^^  ^^^^  ^^^^^^  ^^^^  ^^^^^^  ^^^^  ^^^^^^
              Col 1  Col 2  Col 3  Col 4  Col 5  Col 6  Col 7  (repeating pattern)
```

**Example:**
```csv
163.61.201.0/24 | 153816,,,,,,,,,,,,,,,
Mask (Dec) :,,0.252,,0.248,,0.24,,0.224,,0.192,,0.128,,0,
,,/30,,/29,,/28,,/27,,/26,,/25,,/24,
,,2,,3,,4,,5,,6,,7,,8,
Alokasi,Vlan,Network,Broadcast,Network,Broadcast,Network,Broadcast,...
SERVER PUBLIK RK 15,,0,3,0,,0,,0,,0,,0,,0,
,,4,7,,7,,,,,,,,,,
Server OPUNG KE JKT,662,8,11,8,,,,,,,,,,,
```

**Key characteristics:**
1. **Parent block:** First line contains prefix (e.g., `163.61.201.0/24`) and ASN separated by `|`
2. **Metadata rows:** ASN, Router, IP Name (operator) extracted from first 3-4 lines
3. **Grouping logic:** 
   - Empty customer name = continuation of previous allocation
   - Consecutive rows with same/empty customer = one logical allocation
   - Group spans from min network octet to max broadcast octet
4. **Subnet calculation:**
   - Only last octet is stored (e.g., `8,11` means `.8` to `.11`)
   - Calculate prefix length from IP count: `to_plen(size)` function
   - Reconstruct full prefix: `base_ip.{min_octet}/{calculated_plen}`
5. **VLAN parsing:** May include text like `/31` or `/30` in VLAN column
6. **Trailing columns:** Optional notes/remarks in columns 17+ (e.g., "IP Atas nama...")

**Parsing challenges:**
- Multi-row grouping requires state machine
- VLAN column contains mixed data (VID, subnet notation, text)
- Need to distinguish between network/broadcast pairs across multiple subnet sizes
- Empty cells vs zeros have different meanings

---

### Pattern 2: IPv6 Simple List Format

**Files:**
- `SDI_IPV6_UP_TO_DATE_SDI_-_2404_fd00_36___48_-_Zetta_Connect_Plus.csv`

**Structure:**
```
Line 1-2:   Empty
Line 3:     Parent block with description
Line 4-5:   Empty
Line 6+:    Data rows
```

**Data Row Format:**
```
, Full IPv6 Address/Prefix, Customer Name
^ Empty column              ^^^^^^^^^^^^^^^
                            May include side indicator in parentheses
```

**Example:**
```csv
,,
,,
,2404:fd00:36::/48  - LS ZETTA Connect Plus,
,,
,,
,2404:fd00:36::0/127,equinix
,2404:fd00:36::1/127,equinix
,2404:fd00:36::2/127,MRO-Equinix
,2404:fd00:36::14/127(SDI),Cipta-TP-AS153646
,2404:fd00:36::15/127(CTP),Cipta-TP-AS153646
```

**Key characteristics:**
1. **Parent block:** Line 3 contains full IPv6 prefix and description separated by ` - `
2. **Simple 3-column CSV:** Empty first column, full address with prefix, customer/description
3. **Side indicators:** Some entries have `(SDI)`, `(CTP)`, `(IDTEL)` in column 1 to indicate "side" of peering
4. **No grouping:** One row = one allocation (much simpler than IPv4)
5. **Status detection:** Empty customer name = `available`, otherwise `active`
6. **Notes extraction:** Side indicator becomes note field

**Parsing advantages:**
- Simple row-by-row processing
- No multi-row grouping needed
- Full address provided (no reconstruction)
- Minimal state tracking

---

## 🔧 Current Parser Implementation

### Location
`backend/main.py` lines 593-760:
- `parse_ipv4_csv(content: str)` - Lines 593-689 (~97 lines)
- `parse_ipv6_csv(content: str)` - Lines 691-760 (~70 lines)

### IPv4 Parser Logic (`parse_ipv4_csv`)

**Step 1: Extract metadata**
```python
# Detect parent block with pipe separator
if "|" in raw and not meta["prefix"]:
    parts = raw.split("|")
    net = ipaddress.ip_network(parts[0].strip())
    meta["prefix"] = str(net)
    meta["asn"] = parts[1].strip()

# Extract ASN Origin, Router, IP Name from header lines
if raw.startswith("ASN Origin"):
    meta["asn"] = line.split(":",1)[1].strip()
elif raw.startswith("Router"):
    meta["router"] = line.split(":",1)[1].strip()
elif raw.startswith("IP Name"):
    meta["operator"] = line.split(":",1)[1].strip()
```

**Step 2: Detect data section**
```python
if raw == "Alokasi":
    in_data = True
    continue
```

**Step 3: Parse data rows**
```python
# Skip header rows and rows with text subnet masks
if cols[2] in ("Network","/30","/29","/28","") or not cols[2].isdigit():
    continue

data_rows.append({
    "name": cols[0],      # Customer name
    "vlan": cols[1],      # VLAN ID (may contain text)
    "net": int(cols[2]),  # Network octet
    "bcast": int(cols[3]), # Broadcast octet
    "notes": cols[17] if len(cols) > 17 else ""
})
```

**Step 4: Group consecutive rows**
```python
# Empty name AND empty vlan = continuation of previous group
for r in data_rows:
    if r["name"] or r["vlan"]:
        if cur: groups.append(cur)
        cur = {"name": r["name"], "vlan": r["vlan"], "rows": [r]}
    else:
        if cur:
            cur["rows"].append(r)
```

**Step 5: Calculate allocations**
```python
for g in groups:
    min_net = min(r["net"] for r in g["rows"])
    max_bcast = max(r["bcast"] for r in g["rows"])
    size = max_bcast - min_net + 1
    plen = to_plen(size)  # Calculate prefix length from size
    prefix = f"{base_ip}.{min_net}/{plen}"
```

**Helper function:**
```python
def to_plen(size):
    """Convert IP count to prefix length"""
    if size <= 0: return 30
    b = 1
    while b < size: b <<= 1
    return 32 - int(math.log2(b))
```

### IPv6 Parser Logic (`parse_ipv6_csv`)

**Step 1: Extract parent block**
```python
# Line contains prefix and optional name after " - "
if meta["prefix"] is None:
    parts = col1.split(None, 1)  # Split on whitespace
    col1_addr = parts[0].split("(")[0].strip()
    try:
        net = ipaddress.ip_network(col1_addr)
        if net.version == 6 and net.prefixlen <= 48:
            meta["prefix"] = str(net)
            if " - " in col1:
                meta["name"] = col1.split(" - ", 1)[1].strip()
    except ValueError:
        pass
```

**Step 2: Parse allocation rows**
```python
# Column 1 = prefix (may have side indicator)
col1_clean = col1.split("(")[0].strip()
side = None
if "(" in col1 and ")" in col1:
    side = col1[col1.index("(")+1:col1.index(")")]

# Parse as ip_interface to preserve host address
iface = ipaddress.ip_interface(col1_clean)
prefix = f"{iface.ip}/{iface.network.prefixlen}"

customer = cols[2].strip() if len(cols) > 2 else None
status = "active" if customer else "available"

desc = customer or ""
if side:
    desc = f"{customer} [{side}]" if customer else f"[{side}]"
```

---

## ⚠️ Why Generic Upload Is Problematic

### Format Detection Challenges
1. **No magic bytes or headers** - Can't reliably detect format from first line
2. **Both use .csv extension** - No filename-based detection possible
3. **Structure varies within same type** - IPv4 files have different metadata patterns

### Required Upload Flow (if implemented)
```
User uploads CSV
    ↓
Detect format (IPv4 vs IPv6)
    ↓
Select appropriate parser
    ↓
Parse and preview
    ↓
User confirms
    ↓
Import to database
```

**Detection heuristics needed:**
```python
def detect_csv_format(content: str) -> str:
    lines = content.splitlines()[:10]
    
    # Check for IPv6 indicators
    if any(":" in line and "::" in line for line in lines):
        return "ipv6"
    
    # Check for IPv4 matrix headers
    if any("/30" in line and "/29" in line for line in lines):
        return "ipv4"
    
    # Check for "Alokasi" keyword
    if any("Alokasi" in line for line in lines):
        return "ipv4"
    
    return "unknown"  # Require manual selection
```

### Data Quality Issues
1. **Inconsistent VLAN formatting** - Digits, text, or mixed
2. **Optional notes in variable columns** - Column 17+ not standardized
3. **Manual data entry errors** - Typos in customer names, invalid octets
4. **Empty rows vs missing data** - Ambiguous meaning in different contexts

---

## 💡 Recommendations

### Short-term (Current State)
✅ **Keep current approach:** Manual parser selection, no upload endpoint
- Users copy-paste CSV content to backend developer
- Developer runs parser directly via Python REPL or API test
- Preview results before import
- **Rationale:** Low volume (~4-5 imports per year), formats too variable

### Medium-term (If upload needed)
**Option A: Format selector in UI**
```jsx
<CSVUpload>
  <FormatSelector>
    <option value="ipv4">IPv4 Matrix Format (163.x.x.x)</option>
    <option value="ipv6">IPv6 List Format (2404:fd00:36::)</option>
  </FormatSelector>
  <FileInput accept=".csv" />
  <PreviewButton /> {/* Show parsed results before import */}
</CSVUpload>
```

**Option B: Multi-parser with confidence scoring**
- Try both parsers, return results with confidence score
- Show user both interpretations if ambiguous
- User selects correct parsing

### Long-term (Ideal Solution)
**Replace CSV with structured web form:**
```
Block Creation Form:
  - Parent prefix (validated)
  - ASN, Router, Operator (metadata)
  - Allocations: Add rows dynamically
    - Customer (autocomplete)
    - VLAN (dropdown)
    - Prefix (validated)
    - Notes (optional)
```

**Benefits:**
- Real-time validation
- No parsing ambiguity
- Better UX
- Immediate database feedback

---

## 📁 Sample Files Reference

**IPv4 Complex Matrix:**
```
data/csv/SDI_IP_ADDRESS_UP_TO_DATE_-_163_61_201_0_24___ASIANA.csv
data/csv/SDI_IP_ADDRESS_UP_TO_DATE_-_114_198_245_0_24_-_LS-Dist-MR.csv
data/csv/SDI_IP_ADDRESS_UP_TO_DATE_-_114_198_242_0_24_-_KEDIRI.csv
```

**IPv6 Simple List:**
```
data/csv/SDI_IPV6_UP_TO_DATE_SDI_-_2404_fd00_36___48_-_Zetta_Connect_Plus.csv
```

**Parser code:** `backend/main.py` lines 586-760

---

## 🧪 Testing Parsers

```python
# Test IPv4 parser
with open('data/csv/SDI_IP_ADDRESS_UP_TO_DATE_-_163_61_201_0_24___ASIANA.csv') as f:
    content = f.read()
    meta, allocs = parse_ipv4_csv(content)
    print(f"Block: {meta['prefix']}, ASN: {meta['asn']}")
    print(f"Allocations: {len(allocs)}")
    for a in allocs[:5]:
        print(f"  {a['prefix']} - {a['customer']} (VLAN {a['vlan']})")

# Test IPv6 parser
with open('data/csv/SDI_IPV6_UP_TO_DATE_SDI_-_2404_fd00_36___48_-_Zetta_Connect_Plus.csv') as f:
    content = f.read()
    meta, allocs = parse_ipv6_csv(content)
    print(f"Block: {meta['prefix']}")
    print(f"Allocations: {len(allocs)}")
    for a in allocs[:5]:
        print(f"  {a['prefix']} - {a['customer']}")
```

---

## 📚 Related Documentation

- **Parser implementation:** `backend/main.py:586-760`
- **Improvement suggestion:** `IMPROVEMENTS.md` #1 (marked as SKIPPED due to format variability)
- **User note:** "format csv yg tidak selalu seragam" (CSV format not uniform)

---

**Analysis by:** AI Assistant (Claude)  
**Conclusion:** CSV upload endpoint not recommended - format too variable, manual import workflow more reliable
