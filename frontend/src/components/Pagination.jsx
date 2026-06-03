import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 30;

// Shared button style helper
function PgBtn({ disabled, onClick, children, active, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 6,
        border: active ? "1.5px solid var(--accent)" : "1px solid var(--border)",
        background: active ? "var(--accent)" : "var(--surface)",
        color: active ? "#fff" : "var(--text-2)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        fontSize: 12, fontWeight: active ? 800 : 500,
        fontFamily: "inherit", flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function buildPages(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = [1];
  if (currentPage > 3) pages.push("...");
  for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
    pages.push(i);
  }
  if (currentPage < totalPages - 2) pages.push("...");
  pages.push(totalPages);
  return pages;
}

/**
 * compact=false (default) — full bar at the bottom of the table with "Showing X–Y of Z" text
 * compact=true            — inline toolbar version, no border-top wrapper, fits in search bar row
 */
export default function Pagination({ currentPage, totalPages, onPageChange, totalRecords, compact = false }) {
  if (!totalRecords || totalPages <= 1) return null;

  const from  = (currentPage - 1) * PAGE_SIZE + 1;
  const to    = Math.min(currentPage * PAGE_SIZE, totalRecords);
  const pages = buildPages(currentPage, totalPages);

  const nav = (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <PgBtn disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} title="Previous page">
        <ChevronLeft size={12} />
      </PgBtn>

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`e${i}`} style={{ width: 28, textAlign: "center", fontSize: 12, color: "var(--text-muted)", lineHeight: "28px" }}>…</span>
        ) : (
          <PgBtn key={p} active={p === currentPage} onClick={() => onPageChange(p)}>
            {p}
          </PgBtn>
        )
      )}

      <PgBtn disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)} title="Next page">
        <ChevronRight size={12} />
      </PgBtn>
    </div>
  );

  if (compact) {
    // Inline version for toolbar — no wrapper padding, just the nav buttons + a small count badge
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {nav}
        <span style={{
          fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap",
          padding: "3px 8px", borderRadius: 99,
          background: "var(--surface-2)", border: "1px solid var(--border)",
        }}>
          {from}–{to} / {totalRecords}
        </span>
      </div>
    );
  }

  // Full bottom-of-table version
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 18px", borderTop: "1px solid var(--border)",
      background: "var(--surface)", flexWrap: "wrap", gap: 10,
    }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Showing{" "}
        <strong style={{ color: "var(--text-2)", fontWeight: 700 }}>{from}–{to}</strong>
        {" "}of{" "}
        <strong style={{ color: "var(--text-2)", fontWeight: 700 }}>{totalRecords}</strong>
        {" "}records
      </span>
      {nav}
    </div>
  );
}
