'use strict';
const PDFDocument = require("pdfkit");

// ─── Constants ────────────────────────────────────────────────────────────────
const PW = 595.28, PH = 841.89;
const ML = 40, MR = 40, MT = 40, MB = 40;
const CW = PW - ML - MR;  // 515.28

const C = {
  brand:     "#4338CA",
  brandDark: "#1e1b4b",
  brandLight:"#EEF2FF",
  text:      "#1f2937",
  muted:     "#6b7280",
  border:    "#e5e7eb",
  rowAlt:    "#F9FAFB",
  white:     "#FFFFFF",
  success:   "#059669",
  warning:   "#d97706",
  danger:    "#dc2626",
  accent:    "#6366f1",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rl = r =>
  r === "owner"           ? "Super Admin"
  : r === "sales_head"    ? "Sales Head"
  : r === "sales_manager" ? "Sales Manager"
  : r === "inside_sales"  ? "Inside Sales"
  : r === "sales_employee"? "Sales Employee"
  : (r || "Staff").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());

const fmtRev = n => {
  if (!n) return "0";
  if (n >= 10000000) return `${(n/10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `${(n/100000).toFixed(1)}L`;
  if (n >= 1000)     return `${(n/1000).toFixed(1)}K`;
  return String(n);
};

const fmtTime = iso => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      timeZone:"Asia/Kolkata", hour:"2-digit", minute:"2-digit", hour12:true,
    });
  } catch { return "—"; }
};

const fmtDateTime = iso => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone:"Asia/Kolkata", day:"2-digit", month:"short",
      hour:"2-digit", minute:"2-digit", hour12:true,
    });
  } catch { return "—"; }
};

const actTypeLabel = t => {
  if (!t) return "Activity";
  const m = t.toLowerCase();
  if (m.includes("call"))    return "Call";
  if (m.includes("email"))   return "Email";
  if (m.includes("meeting")) return "Meeting";
  if (m.includes("follow"))  return "Follow Up";
  if (m.includes("whatsapp"))return "WhatsApp";
  if (m.includes("visit"))   return "Visit";
  if (m.includes("note"))    return "Note";
  if (m.includes("task"))    return "Task";
  return t.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
};

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function pageHeader(doc, recipientName, dateLabel, pageNum) {
  // Top bar
  doc.rect(0, 0, PW, 52).fill(C.brandDark);
  doc.font("Helvetica-Bold").fontSize(14).fillColor(C.white)
     .text("CCENTRIK", ML, 18);
  doc.font("Helvetica").fontSize(8).fillColor("#818cf8")
     .text("CRM Platform", ML, 34);
  doc.font("Helvetica").fontSize(9).fillColor("#c7d2fe")
     .text(`Daily Sales Report · ${dateLabel}`, 0, 20, { align: "center", width: PW });
  if (recipientName) {
    doc.font("Helvetica").fontSize(8).fillColor("#a5b4fc")
       .text(`Prepared for: ${recipientName}`, 0, 32, { align: "center", width: PW });
  }
  doc.font("Helvetica").fontSize(8).fillColor("#818cf8")
     .text(`Page ${pageNum}`, PW - MR - 30, 22, { width: 30, align: "right" });
}

function pageFooter(doc, generatedAt) {
  const y = PH - 28;
  doc.rect(0, y - 4, PW, 32).fill("#f9fafb");
  doc.moveTo(0, y - 4).lineTo(PW, y - 4).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.font("Helvetica").fontSize(8).fillColor(C.muted)
     .text(`Generated: ${fmtDateTime(generatedAt)} · Ccentrik CRM · Confidential — Internal Use Only`,
       ML, y + 4, { width: CW, align: "center" });
}

function sectionTitle(doc, y, title) {
  doc.rect(ML, y, CW, 22).fill(C.brandLight);
  doc.moveTo(ML, y).lineTo(ML + 3, y).lineTo(ML + 3, y + 22).lineTo(ML, y + 22).fill(C.brand);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(C.brand)
     .text(title.toUpperCase(), ML + 10, y + 7, { width: CW - 20 });
  return y + 28;
}

function statGrid(doc, y, stats, cols = 4) {
  const cw  = CW / cols;
  const ch  = 36;
  let col = 0, row = 0;
  for (const [label, value, color] of stats) {
    const x = ML + col * cw;
    const cy = y + row * (ch + 4);
    doc.rect(x, cy, cw - 4, ch).fill(C.rowAlt);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(color || C.brand)
       .text(String(value), x + 4, cy + 4, { width: cw - 8, align: "center" });
    doc.font("Helvetica").fontSize(7).fillColor(C.muted)
       .text(label, x + 4, cy + 20, { width: cw - 8, align: "center" });
    col++;
    if (col >= cols) { col = 0; row++; }
  }
  const rows = Math.ceil(stats.length / cols);
  return y + rows * (ch + 4) + 4;
}

function tableHeader(doc, y, columns) {
  const rowH = 20;
  doc.rect(ML, y, CW, rowH).fill(C.brand);
  let x = ML;
  for (const col of columns) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(C.white)
       .text(col.label, x + 3, y + 6, { width: col.w - 6, align: col.align || "left" });
    x += col.w;
  }
  return y + rowH;
}

function tableRow(doc, y, cells, columns, isAlt = false) {
  const rowH = 18;
  if (isAlt) doc.rect(ML, y, CW, rowH).fill(C.rowAlt);
  let x = ML;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const val = cells[i] != null ? String(cells[i]) : "—";
    doc.font("Helvetica").fontSize(7.5).fillColor(C.text)
       .text(val, x + 3, y + 5, { width: col.w - 6, align: col.align || "left" });
    x += col.w;
  }
  return y + rowH;
}

function drawHLine(doc, y) {
  doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor(C.border).lineWidth(0.4).stroke();
}

function ensurePage(doc, y, needed = 80, pages, recipientName, dateLabel, generatedAt) {
  if (y + needed > PH - MB - 40) {
    doc.addPage();
    pages.count++;
    pageHeader(doc, recipientName, dateLabel, pages.count);
    pageFooter(doc, generatedAt);
    return MT + 60;
  }
  return y;
}

// ─── Main PDF generator ──────────────────────────────────────────────────────
function generateNewDsrPdf({ recipientName, recipientRole, dateLabel, generatedAt, scopeProfiles, scopeTotals, statsMap, meetings, profileMap }) {
  return new Promise((resolve, reject) => {
    const doc  = new PDFDocument({ size: "A4", margins: { top:0, bottom:0, left:0, right:0 }, bufferPages: true });
    const bufs = [];
    doc.on("data", b => bufs.push(b));
    doc.on("end",  () => resolve(Buffer.concat(bufs)));
    doc.on("error", reject);

    const pages = { count: 1 };
    const roleStr = rl(recipientRole);

    // ══════════════════════════════════════════════════════════════════════════
    // COVER PAGE
    // ══════════════════════════════════════════════════════════════════════════
    doc.rect(0, 0, PW, PH).fill(C.brandDark);
    doc.rect(0, PH - 200, PW, 200).fill(C.brand);

    // Company name
    doc.font("Helvetica-Bold").fontSize(42).fillColor(C.white)
       .text("CCENTRIK", ML, 180, { align: "center", width: CW });
    doc.font("Helvetica").fontSize(14).fillColor("#818cf8")
       .text("CRM Platform", ML, 230, { align: "center", width: CW });

    // Divider
    doc.moveTo(ML + 60, 265).lineTo(PW - MR - 60, 265).strokeColor("#4f46e5").lineWidth(2).stroke();

    // Report title
    doc.font("Helvetica-Bold").fontSize(28).fillColor(C.white)
       .text("Daily Sales Report", ML, 285, { align: "center", width: CW });

    // Date
    doc.font("Helvetica").fontSize(16).fillColor("#a5b4fc")
       .text(dateLabel, ML, 325, { align: "center", width: CW });

    // Recipient box
    doc.rect(ML + 60, 380, CW - 120, 80).fill("rgba(99,102,241,0.25)");
    doc.rect(ML + 60, 380, 3, 80).fill("#6366f1");
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#a5b4fc")
       .text("PREPARED FOR", ML + 70, 396);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(C.white)
       .text(recipientName || "Management", ML + 70, 410);
    doc.font("Helvetica").fontSize(10).fillColor("#818cf8")
       .text(roleStr, ML + 70, 432);

    // Generated at
    doc.font("Helvetica").fontSize(9).fillColor("#6366f1")
       .text(`Generated: ${fmtDateTime(generatedAt)}`, ML, 490, { align: "center", width: CW });
    doc.font("Helvetica").fontSize(9).fillColor("#6366f1")
       .text("Prepared Automatically · Ccentrik CRM · Confidential", ML, 504, { align: "center", width: CW });

    // Bottom branding
    doc.font("Helvetica-Bold").fontSize(12).fillColor(C.white)
       .text("Ccentrik — Driving Sales Excellence", ML, PH - 160, { align: "center", width: CW });
    doc.font("Helvetica").fontSize(9).fillColor("#e0e7ff")
       .text("This report is auto-generated and contains confidential business data.", ML, PH - 140, { align: "center", width: CW });

    // ══════════════════════════════════════════════════════════════════════════
    // PAGE 2 — ORGANIZATION DASHBOARD SUMMARY
    // ══════════════════════════════════════════════════════════════════════════
    doc.addPage();
    pages.count = 2;
    pageHeader(doc, recipientName, dateLabel, 2);
    pageFooter(doc, generatedAt);

    let y = MT + 62;
    y = sectionTitle(doc, y, "Organization Dashboard Summary");

    const t = scopeTotals;
    const summaryStats = [
      ["Prospects Added",   t.prospectsAdded,      C.brand],
      ["Leads Created",     t.leadsCreated,         C.success],
      ["Deals Created",     t.dealsCreated,         "#7c3aed"],
      ["Revenue (Won)",     fmtRev(t.revenue),      "#ca8a04"],
      ["Activities Done",   t.activitiesCompleted,  C.success],
      ["Calls Made",        t.callsMade,            C.brand],
      ["Emails Sent",       t.emailsSent,           "#0369a1"],
      ["Meetings Sched.",   t.meetingsScheduled,    "#6d28d9"],
      ["Tasks Done",        t.tasksCompleted,       C.success],
      ["Follow Ups Done",   t.followUpsCompleted,   C.success],
      ["Pending",           t.activitiesPending,    C.warning],
      ["Overdue",           t.activitiesOverdue,    C.danger],
      ["FU Pending",        t.followUpsPending,     C.warning],
      ["Leads Converted",   t.leadsConverted,       C.success],
      ["Deals Won",         t.dealsWon,             C.success],
      ["Deals Lost",        t.dealsLost,            C.danger],
    ];

    y = statGrid(doc, y, summaryStats, 4);
    y += 16;

    // Employee performance summary table
    y = ensurePage(doc, y, 120, pages, recipientName, dateLabel, generatedAt);
    y = sectionTitle(doc, y, `Team Performance — ${scopeProfiles.length} Member${scopeProfiles.length !== 1 ? "s" : ""}`);

    const COLS_PERF = [
      { label: "Employee Name",  w: 110, align: "left"   },
      { label: "Role",           w:  75, align: "left"   },
      { label: "Prosp",          w:  30, align: "center" },
      { label: "Leads",          w:  30, align: "center" },
      { label: "Deals",          w:  28, align: "center" },
      { label: "Calls",          w:  28, align: "center" },
      { label: "Emails",         w:  28, align: "center" },
      { label: "Meets",          w:  28, align: "center" },
      { label: "Done",           w:  28, align: "center" },
      { label: "Pend",           w:  28, align: "center" },
      { label: "Ovrd",           w:  28, align: "center" },
      { label: "Won",            w:  28, align: "center" },
      { label: "Revenue",        w:  50, align: "right"  },
    ];

    y = tableHeader(doc, y, COLS_PERF);
    drawHLine(doc, y);

    scopeProfiles.forEach((p, i) => {
      y = ensurePage(doc, y, 20, pages, recipientName, dateLabel, generatedAt);
      const s = statsMap[p.id] || {};
      y = tableRow(doc, y, [
        p.full_name || "—",
        rl(p.role),
        s.prospectsAdded || 0,
        s.leadsCreated   || 0,
        s.dealsCreated   || 0,
        s.callsMade      || 0,
        s.emailsSent     || 0,
        s.meetingsScheduled || 0,
        s.activitiesCompleted || 0,
        s.activitiesPending   || 0,
        s.activitiesOverdue   || 0,
        s.dealsWon       || 0,
        fmtRev(s.revenue),
      ], COLS_PERF, i % 2 === 1);
      drawHLine(doc, y);
    });

    y += 16;

    // Today's meetings table (if any)
    if (meetings && meetings.length > 0) {
      y = ensurePage(doc, y, 80, pages, recipientName, dateLabel, generatedAt);
      y = sectionTitle(doc, y, `Today's Meetings (${meetings.length})`);

      const COLS_MTG = [
        { label: "Time",       w:  52, align: "left"   },
        { label: "Customer",   w:  90, align: "left"   },
        { label: "Company",    w:  90, align: "left"   },
        { label: "Mode",       w:  70, align: "left"   },
        { label: "Employee",   w:  80, align: "left"   },
        { label: "Status",     w:  60, align: "center" },
        { label: "Location",   w:  73, align: "left"   },
      ];

      y = tableHeader(doc, y, COLS_MTG);
      meetings.forEach((m, i) => {
        y = ensurePage(doc, y, 20, pages, recipientName, dateLabel, generatedAt);
        const emp  = profileMap?.[m.created_by];
        const mode = (() => {
          const t2 = (m.meeting_type || "").toLowerCase();
          if (t2.includes("google")||t2.includes("meet")) return "Google Meet";
          if (t2.includes("teams")||t2.includes("ms"))   return "MS Teams";
          if (t2.includes("zoom"))                        return "Zoom";
          if (t2.includes("person")||t2.includes("phys")) return "In-Person";
          return m.meeting_type || "—";
        })();
        y = tableRow(doc, y, [
          fmtTime(m.start_time),
          m.customer_name || m.title || "—",
          m.company_name  || "—",
          mode,
          emp ? (emp.full_name || "—") : "—",
          (m.status || "—").toUpperCase(),
          m.location || (m.meet_link ? "Online" : "—"),
        ], COLS_MTG, i % 2 === 1);
        drawHLine(doc, y);
      });
      y += 16;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PER-EMPLOYEE SECTIONS (one section per employee with full activity timeline)
    // ══════════════════════════════════════════════════════════════════════════
    for (const p of scopeProfiles) {
      const s    = statsMap[p.id] || {};
      const mgr  = p.manager_id ? profileMap?.[p.manager_id] : null;
      const timeline = (s.activityTimeline || []).sort((a, b) => (a.time > b.time ? 1 : -1));

      // New page for each employee
      doc.addPage();
      pages.count++;
      pageHeader(doc, recipientName, dateLabel, pages.count);
      pageFooter(doc, generatedAt);
      y = MT + 62;

      // ── Employee header ──────────────────────────────────────────
      doc.rect(ML, y, CW, 50).fill(C.brandDark);
      doc.rect(ML, y, 4, 50).fill(C.accent);
      doc.font("Helvetica-Bold").fontSize(14).fillColor(C.white)
         .text(p.full_name || "—", ML + 12, y + 8, { width: CW - 100 });
      doc.font("Helvetica").fontSize(9).fillColor("#a5b4fc")
         .text(`${rl(p.role)}${p.email ? ` · ${p.email}` : ""}`, ML + 12, y + 26);
      if (mgr) {
        doc.font("Helvetica").fontSize(8).fillColor("#818cf8")
           .text(`Reports to: ${mgr.full_name || "—"}`, ML + 12, y + 38);
      }
      const lastAct = s.lastActivityAt ? fmtTime(s.lastActivityAt) : "No Activity";
      const lastActColor = s.lastActivityAt ? "#34d399" : "#f87171";
      doc.font("Helvetica-Bold").fontSize(9).fillColor(lastActColor)
         .text(`Last: ${lastAct}`, ML + CW - 100, y + 20, { width: 90, align: "right" });

      y += 58;

      // ── Employee stats grid ──────────────────────────────────────
      const empStats = [
        ["Prospects",    s.prospectsAdded      || 0, C.brand],
        ["Leads",        s.leadsCreated        || 0, C.success],
        ["Deals",        s.dealsCreated        || 0, "#7c3aed"],
        ["Calls",        s.callsMade           || 0, C.brand],
        ["Emails",       s.emailsSent          || 0, "#0369a1"],
        ["Meetings",     s.meetingsScheduled   || 0, "#6d28d9"],
        ["Tasks Done",   s.tasksCompleted      || 0, C.success],
        ["FU Done",      s.followUpsCompleted  || 0, C.success],
        ["Acts Done",    s.activitiesCompleted || 0, C.success],
        ["Pending",      s.activitiesPending   || 0, C.warning],
        ["Overdue",      s.activitiesOverdue   || 0, C.danger],
        ["Won",          s.dealsWon            || 0, C.success],
        ["Lost",         s.dealsLost           || 0, C.danger],
        ["Revenue",      fmtRev(s.revenue),          "#ca8a04"],
        ["Conv. Leads",  s.leadsConverted      || 0, C.success],
        ["FU Pending",   s.followUpsPending    || 0, C.warning],
      ];
      y = statGrid(doc, y, empStats, 4);
      y += 12;

      // ── Activity timeline ────────────────────────────────────────
      if (timeline.length > 0) {
        y = ensurePage(doc, y, 60, pages, recipientName, dateLabel, generatedAt);
        y = sectionTitle(doc, y, `Activity Timeline — ${timeline.length} Activities`);

        const COLS_TL = [
          { label: "Time",        w:  60, align: "left"  },
          { label: "Type",        w:  70, align: "left"  },
          { label: "Status",      w:  55, align: "center"},
          { label: "Description / Outcome",  w: 330, align: "left"  },
        ];

        y = tableHeader(doc, y, COLS_TL);
        drawHLine(doc, y);

        for (let i = 0; i < timeline.length; i++) {
          const act = timeline[i];
          y = ensurePage(doc, y, 20, pages, recipientName, dateLabel, generatedAt);

          // Wrap long descriptions
          const desc = [act.description, act.outcome].filter(Boolean).join(" · ").substring(0, 120);
          const isAlt = i % 2 === 1;

          // Rough height based on description length
          const lines = Math.ceil((desc.length || 1) / 55);
          const rowH  = Math.max(18, lines * 10 + 6);

          if (isAlt) doc.rect(ML, y, CW, rowH).fill(C.rowAlt);

          let x = ML;
          const cols = [
            { val: fmtTime(act.time), w: 60, align: "left"   },
            { val: actTypeLabel(act.type), w: 70, align: "left" },
            { val: (act.status || "—").toUpperCase(), w: 55, align: "center" },
            { val: desc || "—", w: 330, align: "left" },
          ];

          for (const col of cols) {
            doc.font("Helvetica").fontSize(7.5).fillColor(C.text)
               .text(col.val, x + 3, y + 4, { width: col.w - 6, align: col.align, lineGap: 1 });
            x += col.w;
          }

          y += rowH;
          drawHLine(doc, y);
        }
        y += 12;
      } else {
        y = ensurePage(doc, y, 30, pages, recipientName, dateLabel, generatedAt);
        doc.rect(ML, y, CW, 26).fill(C.rowAlt);
        doc.font("Helvetica").fontSize(9).fillColor(C.muted)
           .text("No activities logged today.", ML + 10, y + 8);
        y += 34;
      }

      // ── Pending & Overdue note ───────────────────────────────────
      if (s.activitiesPending > 0 || s.activitiesOverdue > 0) {
        y = ensurePage(doc, y, 30, pages, recipientName, dateLabel, generatedAt);
        const noteBg = s.activitiesOverdue > 0 ? "#fef2f2" : "#fffbeb";
        const noteColor = s.activitiesOverdue > 0 ? C.danger : C.warning;
        doc.rect(ML, y, CW, 24).fill(noteBg);
        doc.rect(ML, y, 3, 24).fill(noteColor);
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(noteColor)
           .text(
             `⚠  ${s.activitiesPending > 0 ? `${s.activitiesPending} pending` : ""}`
             + `${s.activitiesPending > 0 && s.activitiesOverdue > 0 ? " · " : ""}`
             + `${s.activitiesOverdue > 0 ? `${s.activitiesOverdue} overdue` : ""} activities require attention.`,
             ML + 10, y + 8, { width: CW - 20 }
           );
        y += 32;
      }
    }

    doc.end();
  });
}

module.exports = { generateNewDsrPdf };
