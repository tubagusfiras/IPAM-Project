---
name: blockdetail-status-change-loading-rough
description: BlockDetail status change UX issue - rough loading, utilization not updating
metadata:
  type: project
  status: BLOCKING
  date: 2026-07-07
  priority: HIGH
---

# BlockDetail Status Change - Rough Loading Issue

**Reported by:** Firas (2026-07-07)  
**Status:** 🔴 BLOCKING - Must fix before improvement work  
**Priority:** HIGH

## Problem Description

When user changes status in BlockDetail.jsx dari "active" → "available":

1. **Rough loading screen** - Loading animation/transition kasar, tidak smooth
2. **Utilization doesn't update** - Angka utilization tetap sama padahal status berubah
3. **Row still visible** - Baris IP tetap terlihat di table padahal status "available" (seharusnya hilang atau berbeda styling)

## Root Cause (To Investigate)

- [ ] API response lambat?
- [ ] UI state update kasar/terjadi langsung tanpa smooth transition?
- [ ] Table refresh tidak terpicu setelah status change?
- [ ] Utilization calculation masih pakai data lama?

## Related Clarification

**"Available" status = "Free" IP** - Ini perlu clarification:
- Status "available" berarti IP tidak dialokasikan (GRATIS/FREE)
- Sekarang label masih "available" - kurang jelas
- Perlu update label atau documentation untuk clarity

## Solution Needed

**For rough loading:**
- [ ] Add smooth fade/transition untuk loading state
- [ ] Use loading skeleton atau spinner yang lebih halus
- [ ] Debounce multiple requests

**For utilization:**
- [ ] Ensure recalculation di backend atau frontend saat status change
- [ ] Verify API response includes updated utilization

**For visual clarity:**
- [ ] Update label "available" → "Free / Available"
- [ ] Or add tooltip explaining "available" means "free/unallocated"

## Files to Check

- `frontend/src/pages/BlockDetail.jsx` - Status change UI/UX
- `backend/main.py` - API endpoint untuk update status (check response time)
- `frontend/src/pages/Blocks.jsx` - Table refresh logic setelah status change
- `frontend/src/components/Skeleton.jsx` - Better loading indicators

## Next Steps

1. Reproduce issue terlebih dahulu (create repro steps)
2. Add to IMPROVEMENT_PLAN_2026.md sebagai Task 0 (fix blocking issue dulu)
3. Smooth loading transition (use CSS transition atau React Framer Motion)
4. Verify utilization recalculates correctly

---

**Related:** [[ipam-available-status-free-clarification]]
