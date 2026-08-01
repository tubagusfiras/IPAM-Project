// ── Status & Owner Colors ─────────────────────────────────────
// Single source of truth untuk semua status/owner color definitions

export const STATUS_STYLE = {
  active:     { color:"var(--success)",  bg:"var(--success-surface)", border:"var(--success-border)", label:"Active" },
  available:  { color:"var(--text-muted)", bg:"transparent",          border:"var(--border-soft)", label:"Free" },
  reserved:   { color:"var(--text-dim)",   bg:"transparent",          border:"var(--border-soft)", label:"Reserved" },
  deprecated: { color:"var(--warning)",  bg:"var(--warning-surface)", border:"var(--warning-border)", label:"Deprecated" },
};

export const OWNER_COLORS = {
  customer:     "#3b82f6",
  internal:     "#22c55e",
  ptp:          "#f59e0b",
  peering:      "#a855f7",
  management:   "#0ea5e9",
  reserved:     "#71717a",
};

export const OWNER_LABEL = {
  customer:     "Customer",
  internal:     "Internal",
  ptp:          "PTP",
  peering:      "Peering",
  management:   "Mgmt",
  reserved:     "Reserved",
};

export const STATUS_HEX = {
  active:     "var(--success)",
  available:  "#38e8c6",
  reserved:   "#818cf8",
  deprecated: "var(--warning)",
};
