import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "../supabaseClient";
import { Search, X, Workflow, UserPlus, BriefcaseBusiness, Building2, ArrowRight } from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────
   Global search bar — a new, always-visible dashboard widget (not the
   existing Cmd/Ctrl+K CommandPalette, which this file does not touch or
   depend on). Searches pipeline, leads, deals and customers directly from
   Supabase, using the same ilike-OR pattern and the same deep-link query
   params (?entry=, ?selected=) those pages/the activity feed already use.
   ───────────────────────────────────────────────────────────────────────── */

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const TYPE_META = {
  pipeline: { label: "Pipeline", icon: Workflow, color: "#8B5CF6" },
  lead: { label: "Lead", icon: UserPlus, color: "#3B82F6" },
  deal: { label: "Deal", icon: BriefcaseBusiness, color: "#10B981" },
  customer: { label: "Customer", icon: Building2, color: "#F59E0B" },
};

export default function GlobalSearchBar() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const debounced = useDebouncedValue(query, 220);

  useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);

    Promise.all([
      // "Pipeline" has no table of its own — a migration unified it into
      // leads (stage='pipeline'); Dashboard's own getContextRoute() makes
      // this exact distinction already. One query, split by stage below,
      // rather than a second query against a table that no longer exists.
      supabase.from("leads").select("id, company_name, contact_name, stage, temperature")
        .or(`company_name.ilike.%${q}%,contact_name.ilike.%${q}%`).limit(10),
      supabase.from("deals").select("id, company_name, title, stage, value")
        .or(`company_name.ilike.%${q}%,title.ilike.%${q}%`).limit(5),
      supabase.from("customers").select("id, company_name, contact_name, status")
        .or(`company_name.ilike.%${q}%,contact_name.ilike.%${q}%`).limit(5),
    ])
      .then(([leadsRes, dealsRes, customersRes]) => {
        if (cancelled) return;
        const leadRows = leadsRes.data || [];
        const pipelineRows = leadRows.filter((r) => r.stage === "pipeline").slice(0, 5);
        const leadOnlyRows = leadRows.filter((r) => r.stage !== "pipeline").slice(0, 5);
        setResults([
          ...pipelineRows.map((r) => ({
            type: "pipeline", id: r.id,
            title: r.company_name || r.contact_name || "Pipeline entry",
            sub: [r.contact_name, r.temperature].filter(Boolean).join(" · "),
            path: `/pipeline?entry=${r.id}`,
          })),
          ...leadOnlyRows.map((r) => ({
            type: "lead", id: r.id,
            title: r.company_name || r.contact_name || "Lead",
            sub: [r.contact_name, r.stage].filter(Boolean).join(" · "),
            path: `/leads?selected=${r.id}`,
          })),
          ...(dealsRes.data || []).map((r) => ({
            type: "deal", id: r.id,
            title: r.company_name || r.title || "Deal",
            sub: [r.title && r.title !== r.company_name ? r.title : null, r.stage, r.value ? `₹${(Number(r.value) / 1000).toFixed(0)}K` : null].filter(Boolean).join(" · "),
            path: `/deals?selected=${r.id}`,
          })),
          ...(customersRes.data || []).map((r) => ({
            type: "customer", id: r.id,
            title: r.company_name || r.contact_name || "Customer",
            sub: [r.contact_name, r.status].filter(Boolean).join(" · "),
            path: "/customers",
          })),
        ]);
        setActiveIdx(0);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [debounced]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const handleSelect = useCallback((r) => {
    navigate(r.path);
    setOpen(false);
    setQuery("");
  }, [navigate]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" && results[activeIdx]) { e.preventDefault(); handleSelect(results[activeIdx]); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, results, activeIdx, handleSelect]);

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} style={{ position: "relative", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)" }}>
        <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search pipeline, leads, deals, customers…"
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13.5, color: "var(--text)", fontFamily: "inherit" }}
        />
        {loading && (
          <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
        )}
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); }}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", padding: 2 }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30,
              background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 12,
              boxShadow: "0 14px 34px rgba(0,0,0,0.18)", maxHeight: 360, overflowY: "auto",
            }}
          >
            {!loading && results.length === 0 ? (
              <div style={{ padding: "22px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12.5 }}>
                No matches for "{query}"
              </div>
            ) : (
              results.map((r, idx) => {
                const meta = TYPE_META[r.type];
                const Icon = meta.icon;
                const isActive = idx === activeIdx;
                return (
                  <div
                    key={`${r.type}-${r.id}`}
                    onClick={() => handleSelect(r)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      background: isActive ? "var(--surface-2)" : "transparent",
                    }}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: `${meta.color}18`, border: `1px solid ${meta.color}30`,
                    }}>
                      <Icon size={14} style={{ color: meta.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.title}
                      </div>
                      {r.sub && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.sub}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, color: meta.color, background: `${meta.color}14`,
                      padding: "2px 7px", borderRadius: 99, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.03em",
                    }}>
                      {meta.label}
                    </span>
                    <ArrowRight size={12} style={{ color: isActive ? meta.color : "var(--text-muted)", flexShrink: 0 }} />
                  </div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
