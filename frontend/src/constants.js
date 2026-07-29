// Single source of truth for enum-backed dropdown values across the app.
// These MUST stay in sync with the PostgreSQL enum types:
//   owner_type_t, alloc_status_t, block_status_t, vlan_status_t
// (see backend/models/schemas.py for the Pydantic-side mirror of these sets)
//
// Do not hardcode these lists in individual page components — that drift
// is what caused the "infrastructure"/"inactive" 500-error incidents.

export const OWNER_TYPES = [
  { value: "customer",   label: "Customer" },
  { value: "internal",   label: "Internal" },
  { value: "ptp",        label: "PTP" },
  { value: "peering",    label: "Peering" },
  { value: "management", label: "Mgmt" },
  { value: "reserved",   label: "Reserved" },
];

// alloc_status_t and block_status_t currently share the same value set,
// but are kept as separate exports since they are independent enums in
// the database and may diverge in the future.
export const ALLOC_STATUS_OPTS = ["active", "available", "reserved", "deprecated"];
export const BLOCK_STATUS_OPTS = ["active", "available", "reserved", "deprecated"];

// vlan_status_t intentionally has no "available" value.
export const VLAN_STATUS_OPTS = ["active", "reserved", "deprecated"];
