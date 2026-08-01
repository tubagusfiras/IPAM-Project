const BASE = "/api/v1";

export function getToken() {
  return localStorage.getItem("ipam_token");
}
export function setToken(token) {
  localStorage.setItem("ipam_token", token);
}
export function clearToken() {
  localStorage.removeItem("ipam_token");
  localStorage.removeItem("ipam_user");
}
export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem("ipam_user") || "null"); }
  catch { return null; }
}

// Helper for raw fetch calls in components (auto attach token + handle 401)
export async function authFetch(url, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = "/";
    throw new Error("Session expired");
  }
  return res;
}

async function request(path, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...opts, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/";
    throw new Error("Session expired, please login again");
  }

  if (!res.ok) {
    const msg = await res.text();
    // Fire error toast
    try { window.dispatchEvent(new CustomEvent("app-toast", { detail: { msg: msg || `HTTP ${res.status}`, type: "error" } })); } catch {}
    throw new Error(msg || `HTTP ${res.status}`);
  }

  // Fire success toast for mutations
  if (opts.method === "POST" || opts.method === "PUT" || opts.method === "DELETE") {
    const labels = { POST:"Created", PUT:"Updated", DELETE:"Deleted" };
    const name = path.split("/")[1]?.replace(/s$/, "") || "Item";
    const msg = opts.method === "DELETE" ? `${name} deleted` : `${name} ${labels[opts.method]}`;
    try { window.dispatchEvent(new CustomEvent("app-toast", { detail: { msg, type: "success" } })); } catch {}
  }

  if (res.status === 204) return null;
  return res.json();
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// Dashboard
export const getDashboardStats = () => request("/dashboard/stats");

// Sites
export const getSites        = (q="") => request(`/sites${q ? "?search="+encodeURIComponent(q) : ""}`);
export const createSite      = (b)    => request("/sites", json("POST", b));
export const updateSite      = (id,b) => request(`/sites/${id}`, json("PUT", b));
export const deleteSite      = (id)   => request(`/sites/${id}`, { method:"DELETE" });

// Customers
export const getCustomers    = (q="",limit=100,offset=0,source="") => request(`/customers?limit=${limit}&offset=${offset}${q?"&search="+encodeURIComponent(q):""}${source?"&source="+source:""}`);
export const getCustomer     = (id)   => request(`/customers/${id}`);
export const createCustomer  = (b)    => request("/customers", json("POST", b));
export const updateCustomer  = (id,b) => request(`/customers/${id}`, json("PUT", b));
export const deleteCustomer  = (id)   => request(`/customers/${id}`, { method:"DELETE" });

// VLANs
export const getVlans        = (q="",site_id="",limit=200,offset=0,source="") => request(`/vlans?limit=${limit}&offset=${offset}${q?"&search="+encodeURIComponent(q):""}${site_id?"&site_id="+site_id:""}${source?"&source="+source:""}`);
export const getVlan        = (id)   => request(`/vlans/${id}`);
export const getVlansLookup  = () => request(`/vlans/lookup`);
export const getCustomersLookup = () => request(`/customers/lookup`);
export const createVlan      = (b)    => request("/vlans", json("POST", b));
export const updateVlan      = (id,b) => request(`/vlans/${id}`, json("PUT", b));
export const deleteVlan      = (id)   => request(`/vlans/${id}`, { method:"DELETE" });

// Batch allocation lookups (avoid N+1 requests for router placements)
export const getAllocationsByCustomerIds = (ids) => ids.length ? request(`/allocations?customer_id=${ids.join(",")}&limit=1000`) : Promise.resolve({items:[]});
export const getAllocationsByVlanIds     = (ids) => ids.length ? request(`/allocations?vlan_id=${ids.join(",")}&limit=1000`) : Promise.resolve({items:[]});

// Blocks
export const getBlocks       = (p={}) => {
  const q = new URLSearchParams({ limit:100, ...p }).toString();
  return request(`/blocks?${q}`);
};
export const getBlock        = (id)   => request(`/blocks/${id}`);
export const createBlock     = (b)    => request("/blocks", json("POST", b));
export const updateBlock     = (id,b) => request(`/blocks/${id}`, json("PUT", b));
export const deleteBlock     = (id)   => request(`/blocks/${id}`, { method:"DELETE" });

// Allocations
export const getAllocations   = (p={}) => {
  const q = new URLSearchParams({ limit:500, ...p }).toString();
  return request(`/allocations?${q}`);
};
export const createAllocation = (b)    => request("/allocations", json("POST", b));
export const updateAllocation = (id,b) => request(`/allocations/${id}`, json("PUT", b));
export const deleteAllocation = (id)   => request(`/allocations/${id}`, { method:"DELETE" });

// Import
export const previewImport   = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return request("/import/preview", { method:"POST", body:fd });
};
export const confirmImport   = (b)    => request("/import/confirm", json("POST", b));

// Search
export const globalSearch    = (q)    => request(`/search?q=${encodeURIComponent(q)}`);
