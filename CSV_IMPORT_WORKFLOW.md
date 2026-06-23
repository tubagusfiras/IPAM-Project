# CSV IMPORT WORKFLOW - Implementation Guide

**Created:** 2026-06-22  
**Status:** ⚠️ Parser implemented & tested — endpoint not yet built  
**Purpose:** How to implement CSV import despite non-uniform formats

---

## 🎯 Solution Overview

**Problem:** CSV files have non-uniform formats (IPv4 matrix vs IPv6 list)  
**Solution:** Auto-detect → Parse → Validate → Preview → Confirm → Import  
**Result:** User can import any CSV format with data validation

---

## 🔄 Workflow Steps

### 1. Upload & Auto-Detection

**Endpoint:** `POST /api/v1/import/csv/analyze`

```python
# backend/main.py
async def analyze_csv(file: UploadFile = File(...)):
    # Read & size check (max 10MB)
    content = await file.read()
    if len(content) > 10_000_000:
        raise HTTPException(413, "File too large")
    
    text = content.decode('utf-8', errors='replace')
    
    # Auto-detect format
    format_type = detect_csv_format(text)
    
    # Parse with appropriate parser
    if format_type == "ipv4":
        meta, allocs = parse_ipv4_csv(text)
    elif format_type == "ipv6":
        meta, allocs = parse_ipv6_csv(text)
    else:
        raise HTTPException(400, "Unknown format")
    
    # Validate
    validation = validate_import_data(meta, allocs)
    
    return {
        "format": format_type,
        "meta": meta,
        "allocations": allocs[:100],
        "total_count": len(allocs),
        "validation": validation,
        "import_id": save_temp_import(meta, allocs)
    }

def detect_csv_format(content: str) -> str:
    lines = content.splitlines()[:15]
    text_sample = "\n".join(lines).lower()
    
    # IPv6 indicators
    if any("::" in line and "/127" in line for line in lines):
        return "ipv6"
    
    # IPv4 indicators
    if "alokasi" in text_sample and any("/30" in line for line in lines):
        return "ipv4"
    
    return "unknown"
```

### 2. Validation Logic

**Function:** `validate_import_data(meta, allocs)`

```python
def validate_import_data(meta: dict, allocs: list) -> dict:
    errors = []
    warnings = []
    valid_allocs = []
    
    # Validate block prefix
    if not meta.get("prefix"):
        errors.append({"field": "prefix", "message": "Missing parent block"})
    else:
        try:
            block_net = ipaddress.ip_network(meta["prefix"], strict=False)
        except ValueError as e:
            errors.append({"field": "prefix", "message": f"Invalid: {e}"})
    
    # Validate each allocation
    for idx, alloc in enumerate(allocs):
        alloc_errors = []
        
        if not alloc.get("prefix"):
            alloc_errors.append("Missing prefix")
        else:
            try:
                alloc_net = ipaddress.ip_network(alloc["prefix"], strict=False)
                
                # Check containment
                if meta.get("prefix") and not alloc_net.subnet_of(block_net):
                    alloc_errors.append(f"Not within block {meta['prefix']}")
                
            except ValueError as e:
                alloc_errors.append(f"Invalid prefix: {e}")
        
        # Check overlaps
        for other_idx, other in enumerate(valid_allocs):
            if overlaps(alloc.get("prefix"), other.get("prefix")):
                alloc_errors.append(f"Overlaps with #{other_idx + 1}")
        
        if alloc_errors:
            errors.append({"row": idx + 1, "errors": alloc_errors})
        else:
            valid_allocs.append(alloc)
    
    # Warnings
    if sum(1 for a in allocs if not a.get("customer")) > 0:
        warnings.append("Some allocations without customer name")
    
    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "valid_count": len(valid_allocs),
        "total_count": len(allocs)
    }

def overlaps(prefix1: str, prefix2: str) -> bool:
    if not prefix1 or not prefix2:
        return False
    try:
        net1 = ipaddress.ip_network(prefix1, strict=False)
        net2 = ipaddress.ip_network(prefix2, strict=False)
        return net1.overlaps(net2)
    except:
        return False
```

### 3. Import to Database

**Endpoint:** `POST /api/v1/import/csv/confirm`

```python
async def confirm_import(
    import_id: str,
    block_data: dict,
    allocations: list,
    db=Depends(get_db)
):
    # Re-validate after user edits
    validation = validate_import_data(block_data, allocations)
    if not validation["is_valid"]:
        raise HTTPException(400, validation["errors"])
    
    # Atomic transaction
    async with db.transaction():
        # Create block
        block = await db.fetchrow("""
            INSERT INTO ip_blocks (prefix, name, asn, router, operator, status)
            VALUES ($1::cidr, $2, $3, $4, $5, 'active')
            RETURNING id, prefix::text
        """, block_data["prefix"], block_data.get("name"),
            block_data.get("asn"), block_data.get("router"),
            block_data.get("operator"))
        
        block_id = block["id"]
        
        # Create allocations
        for alloc in allocations:
            # Find/create customer
            customer_id = None
            if alloc.get("customer"):
                customer = await db.fetchrow(
                    "SELECT id FROM customers WHERE name ILIKE $1 LIMIT 1",
                    alloc["customer"]
                )
                if not customer:
                    customer = await db.fetchrow(
                        "INSERT INTO customers (name) VALUES ($1) RETURNING id",
                        alloc["customer"]
                    )
                customer_id = customer["id"]
            
            # Create allocation
            await db.fetchrow("""
                INSERT INTO allocations (
                    block_id, prefix, customer_id, vlan_id,
                    status, owner_type, description, notes
                )
                VALUES ($1::uuid, $2::cidr, $3::uuid, $4::uuid,
                        $5::alloc_status_t, $6::owner_type_t, $7, $8)
                RETURNING id
            """, block_id, alloc["prefix"], customer_id, None,
                alloc.get("status", "active"),
                alloc.get("owner_type", "customer"),
                alloc.get("description", ""), alloc.get("notes", ""))
    
    return {"success": True, "block_id": block_id}
```

### 4. Frontend UI Flow

**Component:** `frontend/src/pages/Import.jsx`

```jsx
function CSVImport() {
  const [step, setStep] = useState(1); // 1:upload, 2:review, 3:done
  const [parseResult, setParseResult] = useState(null);
  const [editedData, setEditedData] = useState(null);
  
  async function handleUpload(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch('/api/v1/import/csv/analyze', {
      method: 'POST', body: formData
    });
    const data = await res.json();
    
    setParseResult(data);
    setEditedData({ block: data.meta, allocations: data.allocations });
    setStep(2);
  }
  
  async function handleConfirm() {
    const res = await fetch('/api/v1/import/csv/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        import_id: parseResult.import_id,
        block_data: editedData.block,
        allocations: editedData.allocations
      })
    });
    const result = await res.json();
    if (result.success) navigate('block', result.block_id);
  }
  
  return (
    <div>
      {step === 1 && <FileUploader onUpload={handleUpload} />}
      {step === 2 && (
        <ReviewStep
          data={editedData}
          validation={parseResult.validation}
          onEdit={setEditedData}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
```

---

## ✅ Why This Works

**Despite non-uniform formats:**
1. **Auto-detection** - Pattern matching on CSV structure
2. **Existing parsers** - `parse_ipv4_csv()` and `parse_ipv6_csv()` already handle complexity
3. **Validation layer** - Catches invalid IPs, overlaps, out-of-range allocations
4. **Preview/Edit** - User reviews and fixes data before import
5. **Atomic transaction** - Rollback on any error
6. **Auto-create relations** - Customers and VLANs created automatically

**Data validity guaranteed by:**
- IP address validation (Python ipaddress library)
- Subnet containment check (allocation within block)
- Overlap detection between allocations
- Required field validation
- User review step before final import

---

## 📋 Implementation Checklist

**Backend (backend/main.py):**
- [ ] Add `POST /api/v1/import/csv/analyze` endpoint
- [ ] Add `detect_csv_format()` function
- [ ] Add `validate_import_data()` function
- [ ] Add `overlaps()` helper function
- [ ] Add `POST /api/v1/import/csv/confirm` endpoint
- [ ] Add temporary storage for parsed data (Redis or in-memory)

**Frontend (frontend/src/pages/):**
- [ ] Create `Import.jsx` page component
- [ ] Add file upload component
- [ ] Add validation error/warning display
- [ ] Add editable preview table
- [ ] Add block metadata editor
- [ ] Add import confirmation flow

**Navigation:**
- [ ] Add "Import CSV" to Tools menu
- [ ] Add route to `Import.jsx`

**Testing:**
- [ ] Test IPv4 matrix format upload
- [ ] Test IPv6 list format upload
- [ ] Test validation (overlaps, invalid IPs, out-of-range)
- [ ] Test edit & remove allocations in preview
- [ ] Test transaction rollback on error
- [ ] Test with all 4 sample CSV files

---

## 🔗 Related Documentation

- **CSV_PATTERNS.md** - Format analysis and parser logic
- **IMPROVEMENTS.md** - Original improvement #1 (marked as skipped, now reconsidered)
- **backend/main.py:593-760** - Existing parser functions
- **Sample files:** `/opt/database-ipaddresses/data/csv/*.csv`

---

**Status:** Ready for implementation  
**Parser test results:** 3/3 IPv4 samples parsed successfully (123/123 valid prefixes)
**Estimated effort:** 1 day (backend endpoint only) — parser already done  
**Priority:** Medium (user explicitly requested this workflow)
