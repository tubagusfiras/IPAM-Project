# Handover Session — PingTrace Copy Image & Text Issues

**Date:** 2026-06-26
**Status:** 🔴 Copy Image/Text not working properly

## Current State

PingTrace.jsx is fully functional for traceroute/ping. Two remaining bugs:

### 1. Copy Text — Missing timeout hops (P0)
- **Output:** shows `Hop IP Hostname RTT` but skips hops 10-15 (rate-limited)
- **Root cause:** `parseTracerouteLine()` returns `{ip: null}` for lines that don't match regex. Hops 10-15 have `ip: null` but `timeout: false` because the line format isn't `* * *` — it's something else (maybe blank lines or different format from rate-limiting).
- **Attempted fixes:** Filters at `openImageInTab` and `copyAsText` functions, null checks at multiple places
- **Problem persists:** `h.ip` is JS null, `h.timeout` is false. Filter `h.ip || h.timeout` skips them for copy.
- **Next attempt needed:** Check raw `lines` data alongside `hops` to identify what the actual input is for those null-IP hops. The parser may need to handle a new line format.

### 2. Copy Image — Cannot right-click copy (P1)
- **Currently:** Opens HTML page via `document.write` — table is rendered fine, but user can't right-click → Copy Image
- **Attempted fixes:** 
  - SVG via `data:image/svg+xml` — works in Chrome, fails in Firefox (tab closes), fails in FlashPeak (about:blank)
  - Canvas API — blocked by security (noise injection) + HTTPS requirement
- **Working approaches identified:**
  - `data:image/svg+xml` + `encodeURIComponent` — **worked in Chrome** but not Firefox
  - Need a reliable cross-browser solution

## Recommended Approach for Next Agent

### Copy Text fix:
When `parseTracerouteLine` returns `{ip: null, timeout: false}`, this is a new unhandled traceroute output format. Check the raw `lines` array alongside `hops` to see what text produces these null-IP entries. The backend outputs SSE events with raw text, and the parser needs to handle whatever format the null-IP hops have.

### Copy Image fix:
Two options:
1. **HTML → Canvas → Blob → Clipboard**: Use `dom-to-image` library or `html2canvas` to render the HTML table to a canvas, then copy to clipboard
2. **Add a "Copy Image" button** that uses Canvas API to render the data to a PNG blob

Actually the cleanest solution would be to remove the "Open Image" button entirely and instead add:
- **"Copy Image"** button that uses Canvas API to render and copy
- Fallback: download as PNG if clipboard fails

But this requires a working Canvas approach which was problematic before.

### Files modified:
- `frontend/src/pages/PingTrace.jsx` (many times)

### Last stable commit for PingTrace:
- `24b6e54` (before any of the Open Image changes)

### Quick fix suggestion:
The easiest guaranteed approach: **Replace Open Image button with a "Download SVG" button** that generates SVG and triggers download. This works 100% across all browsers, no clipboard API needed, user can then copy the downloaded file.

Also: hop dengan `ip: null` TAPI `timeout: false` perlu ditangani di parser, bukan di filter. Cek isi `lines` array untuk hop 10-15 untuk lihat format aslinya.
