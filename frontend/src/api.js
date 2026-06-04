const BASE = "/api/v1";

async function request(path, opts = {}) {
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `HTTP ${res.status}`);
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
export const getCustomers    = (q="",limit=100,offset=0) => request(`/customers?limit=${limit}&offset=${offset}${q?"&search="+encodeURIComponent(q):""}`);
export const getCustomer     = (id)   => request(`/customers/${id}`);
export const createCustomer  = (b)    => request("/customers", json("POST", b));
export const updateCustomer  = (id,b) => request(`/customers/${id}`, json("PUT", b));
export const deleteCustomer  = (id)   => request(`/customers/${id}`, { method:"DELETE" });

// VLANs
export const getVlans        = (q="",site_id="",limit=200) => request(`/vlans?limit=${limit}${q?"&search="+encodeURIComponent(q):""}${site_id?"&site_id="+site_id:""}`);
export const createVlan      = (b)    => request("/vlans", json("POST", b));
export const updateVlan      = (id,b) => request(`/vlans/${id}`, json("PUT", b));
export const deleteVlan      = (id)   => request(`/vlans/${id}`, { method:"DELETE" });

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
