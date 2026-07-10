/**
 * Global Ping Visibility — Cloudflare Worker
 *
 * Deploy ke Cloudflare Workers (free tier: 100k req/hari)
 * Worker ini melakukan HTTP ping dari edge location terdekat
 * dan mengembalikan status + RTT
 *
 * Deploy:
 *   npx wrangler deploy scripts/global-ping-worker.js --name ipam-global-ping
 *
 * Test:
 *   curl "https://ipam-global-ping.your-subdomain.workers.dev/ping?target=103.10.120.5"
 */

// Lokasi-lokasi strategis untuk penanda
const LOCATION_NAMES = {
  "SIN": "Singapore",
  "NRT": "Tokyo",
  "HND": "Tokyo",
  "KIX": "Osaka",
  "LAX": "Los Angeles",
  "SJC": "San Jose",
  "SEA": "Seattle",
  "IAD": "Washington DC",
  "EWR": "Newark",
  "JFK": "New York",
  "MIA": "Miami",
  "ATL": "Atlanta",
  "ORD": "Chicago",
  "DFW": "Dallas",
  "DEN": "Denver",
  "PHX": "Phoenix",
  "FRA": "Frankfurt",
  "LHR": "London",
  "LGW": "London",
  "AMS": "Amsterdam",
  "CDG": "Paris",
  "MAD": "Madrid",
  "MXP": "Milan",
  "FCO": "Rome",
  "ARN": "Stockholm",
  "CPH": "Copenhagen",
  "OSL": "Oslo",
  "WAW": "Warsaw",
  "PRG": "Prague",
  "BUD": "Budapest",
  "IST": "Istanbul",
  "DXB": "Dubai",
  "BOM": "Mumbai",
  "DEL": "Delhi",
  "MAA": "Chennai",
  "HKG": "Hong Kong",
  "ICN": "Seoul",
  "TPE": "Taipei",
  "MNL": "Manila",
  "BKK": "Bangkok",
  "KUL": "Kuala Lumpur",
  "CGK": "Jakarta",
  "SYD": "Sydney",
  "MEL": "Melbourne",
  "GRU": "Sao Paulo",
  "EZE": "Buenos Aires",
  "SCL": "Santiago",
  "JNB": "Johannesburg",
  "CPT": "Cape Town",
  "LOS": "Lagos",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === "/" || path === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        worker: "ipam-global-ping",
        version: "1.0.0",
        colo: request.cf?.colo || "unknown",
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Ping endpoint
    if (path === "/ping") {
      const target = url.searchParams.get("target");
      if (!target) {
        return new Response(JSON.stringify({ error: "Missing target parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Lakukan HTTP request ke target
      const startTime = Date.now();
      let status = "offline";
      let rtt = null;
      let error = null;

      try {
        const response = await fetch(`http://${target}`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
          headers: { "User-Agent": "IPAM-GlobalPing/1.0" },
        });
        rtt = Date.now() - startTime;
        status = response.ok ? "online" : "online"; // response ok or not, masih online
      } catch (e) {
        // Coba HTTPS sebagai fallback
        try {
          const startTime2 = Date.now();
          const response2 = await fetch(`https://${target}`, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
            headers: { "User-Agent": "IPAM-GlobalPing/1.0" },
          });
          rtt = Date.now() - startTime2;
          status = "online";
        } catch (e2) {
          error = e2.message?.substring(0, 100) || "error";
          status = "offline";
        }
      }

      // Dapatkan lokasi edge dari Cloudflare
      const colo = request.cf?.colo || "unknown";
      const locationName = LOCATION_NAMES[colo] || colo;
      const region = request.cf?.region || "unknown";
      const country = request.cf?.country || "unknown";

      return new Response(JSON.stringify({
        target,
        status,
        rtt_ms: rtt,
        colo,
        location: locationName,
        region,
        country,
        timestamp: new Date().toISOString(),
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Multi-region ping — panggil dari beberapa edge sekaligus
    if (path === "/multi-ping") {
      const target = url.searchParams.get("target");
      if (!target) {
        return new Response(JSON.stringify({ error: "Missing target" }), { status: 400 });
      }

      const startTime = Date.now();
      let status = "offline";

      try {
        const response = await fetch(`http://${target}`, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        status = "online";
      } catch {
        try {
          const response = await fetch(`https://${target}`, {
            method: "HEAD",
            signal: AbortSignal.timeout(5000),
          });
          status = "online";
        } catch { /* offline */ }
      }

      const rtt = Date.now() - startTime;
      const colo = request.cf?.colo || "unknown";

      return new Response(JSON.stringify({
        target,
        status,
        rtt_ms: rtt,
        colo,
        location: LOCATION_NAMES[colo] || colo,
        country: request.cf?.country || "unknown",
        timestamp: new Date().toISOString(),
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
