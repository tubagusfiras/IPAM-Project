---
name: ipam-available-status-free-clarification
description: "Available" status terminology - should be clarified as "free/unallocated"
metadata:
  type: project
  date: 2026-07-07
  priority: MEDIUM
---

# IPAM Status Terminology - "Available" = "Free"

**Noted by:** Firas (2026-07-07)  
**Context:** During BlockDetail status change testing

## Current Issue

When status set to "available", users bingung karena label tidak jelas:
- "Available" bisa berarti "sedang tersedia untuk diubah" atau "free/tidak dialokasikan"
- Perlu clarification di seluruh aplikasi

## Terminology Clarification

| Status | Meaning | IP State | UI Label | Action |
|--------|---------|----------|----------|--------|
| **active** | Allocated to customer | IN USE | "Active" | Can deallocate or change |
| **available** | Not allocated, FREE | FREE/EMPTY | "Free" or "Available (Free)" | Can allocate to customer |
| **reserved** | Reserved for future use | RESERVED | "Reserved" | Cannot allocate |
| **deprecated** | No longer used | DEPRECATED | "Deprecated" | Should clean up |

## Required Updates

### 1. Frontend Labels (All Pages)
- [ ] Update label "available" → "Free / Available"
- [ ] Or: "available" → "Unallocated"
- [ ] Add tooltip: "Free IP addresses not yet allocated to customers"

### 2. Backend API Responses
- [ ] Verify status values returned match terminology
- [ ] Add description field explaining each status

### 3. Documentation
- [ ] Update UIUX_REVIEW.md dengan status definitions
- [ ] Add to BlockDetail component comments
- [ ] Add to API docs

### 4. Database/Schema
- [ ] Check if ENUM constraint sudah match terminology
- [ ] Add constraint description/comment

## Files to Update

- `frontend/src/pages/Blocks.jsx` - Status badge labels
- `frontend/src/pages/BlockDetail.jsx` - Status dropdown + display
- `frontend/src/components/ui/Badge.jsx` - Status badge component
- `backend/main.py` - API docs + responses
- `backend/schema.sql` - ENUM comments
- Documentation files

## Implementation Note

**Do NOT break existing API** - Keep status values same (active, available, reserved, deprecated), just update LABELS di UI

---

**Related:** [[blockdetail-status-change-loading-rough]]
