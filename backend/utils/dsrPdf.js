'use strict';
const PDFDocument = require('pdfkit');

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  darkBg : '#0B1120',
  accent : '#1B3A6B',
  indigo : '#4F46E5',
  white  : '#FFFFFF',
  text   : '#0F172A',
  gray   : '#64748B',
  border : '#E2E8F0',
  rowAlt : '#F8FAFC',
  headBg : '#EEF2FF',
  green  : '#16A34A',
  red    : '#DC2626',
  amber  : '#D97706',
  blue   : '#2563EB',
};

// A4 dimensions in points
const PW = 595.28, PH = 841.89, ML = 36, MR = 36;
const CW = PW - ML - MR; // 523.28

// Helpers
const fmt  = v  => String(v == null ? 0 : v);
const rl   = r  => (r || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const fmtR = v  => {
  const n = Number(v) || 0;
  if (!n) return 'Rs. 0';
  if (n >= 10000000) return `Rs. ${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `Rs. ${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `Rs. ${(n / 1000).toFixed(1)}K`;
  return `Rs. ${n}`;
};
const conv = (w, l) => (w + l) > 0 ? `${Math.round((w / (w + l)) * 100)}%` : '-';

// Table columns — widths must sum to CW (523)
// 147 + 38×4 + 32×3 + 30×2 + 36 + 32 = 147+152+96+60+36+32 = 523 ✓
const COLS = [
  { label: 'Name / Role', w: 147, align: 'left'   },
  { label: 'Leads',       w:  38, align: 'center' },
  { label: 'Calls',       w:  38, align: 'center' },
  { label: 'Emails',      w:  38, align: 'center' },
  { label: 'Meets',       w:  38, align: 'center' },
  { label: 'F/U',         w:  32, align: 'center' },
  { label: 'Tasks',       w:  32, align: 'center' },
  { label: 'Deals',       w:  32, align: 'center' },
  { label: 'Won',         w:  30, align: 'center' },
  { label: 'Lost',        w:  30, align: 'center' },
  { label: 'Conv%',       w:  36, align: 'center' },
  { label: 'Score',       w:  32, align: 'center' },
];

function generateDSRPdf({ staff, userStats, totals, reportDateLabel, reportType, generatedAt }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
    });

    const bufs = [];
    doc.on('data',  b => bufs.push(b));
    doc.on('end',   () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    const typeLabel = (reportType || 'Daily')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    const genStr = new Date(generatedAt || Date.now()).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    }) + ' IST';

    // ── HEADER ─────────────────────────────────────────────────────────────────
    doc.rect(0, 0, PW, 90).fill(C.darkBg);
    doc.rect(0, 86, PW, 4).fill(C.indigo);

    doc.font('Helvetica-Bold').fontSize(22).fillColor(C.white)
       .text('CCENTRIK', ML, 18);
    doc.font('Helvetica').fontSize(9).fillColor('rgba(255,255,255,0.5)')
       .text(typeLabel.toUpperCase() + ' SALES REPORT', ML, 46);

    doc.font('Helvetica-Bold').fontSize(12).fillColor(C.white)
       .text(reportDateLabel, 0, 18, { width: PW - MR, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor('rgba(255,255,255,0.4)')
       .text('Generated: ' + genStr, 0, 44, { width: PW - MR, align: 'right' });

    let y = 104;

    // ── SUMMARY STATS ROW 1 ────────────────────────────────────────────────────
    const GAP = 8;
    const BW  = (CW - GAP * 5) / 6; // ~80.5 pts each
    const BH  = 50;

    const row1 = [
      { l: 'Sales Staff',      v: fmt(totals.totalStaff),      c: C.indigo },
      { l: 'Leads Today',      v: fmt(totals.leadsToday),      c: '#059669' },
      { l: 'Total Activities', v: fmt(totals.activities),      c: C.blue  },
      { l: 'Deals Created',    v: fmt(totals.dealsCreated),    c: C.amber },
      { l: 'Deals Won',        v: fmt(totals.dealsWon),        c: C.green },
      { l: 'Revenue Won',      v: fmtR(totals.revenueWon),     c: C.text  },
    ];

    row1.forEach((s, i) => {
      const x = ML + i * (BW + GAP);
      doc.rect(x, y, BW, BH).fillAndStroke(C.white, C.border);
      const fs = s.v.length > 7 ? 11 : 18;
      doc.font('Helvetica-Bold').fontSize(fs).fillColor(s.c)
         .text(s.v, x, y + (fs < 14 ? 12 : 8), { width: BW, align: 'center' });
      doc.font('Helvetica').fontSize(6.5).fillColor(C.gray)
         .text(s.l, x, y + 38, { width: BW, align: 'center' });
    });
    y += BH + GAP;

    // ── SUMMARY STATS ROW 2 ────────────────────────────────────────────────────
    const SBH = 36;
    const row2 = [
      { l: 'Calls',          v: fmt(totals.calls) },
      { l: 'Emails',         v: fmt(totals.emails) },
      { l: 'Meetings',       v: fmt(totals.meetings) },
      { l: 'Follow-ups',     v: fmt(totals.followUpsCompleted) },
      { l: 'Tasks Completed',v: fmt(totals.tasks) },
      { l: 'Conversion Rate',v: conv(totals.dealsWon, totals.dealsLost) },
    ];

    row2.forEach((s, i) => {
      const x = ML + i * (BW + GAP);
      doc.rect(x, y, BW, SBH).fillAndStroke(C.rowAlt, C.border);
      doc.font('Helvetica-Bold').fontSize(13).fillColor(C.text)
         .text(s.v, x, y + 5, { width: BW, align: 'center' });
      doc.font('Helvetica').fontSize(6.5).fillColor(C.gray)
         .text(s.l, x, y + 22, { width: BW, align: 'center' });
    });
    y += SBH + 14;

    // ── TABLE TITLE ────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.text)
       .text('Team Performance — Individual Breakdown', ML, y);
    y += 14;

    const TH = 21; // thead height
    const TR = 20; // row height

    const drawTHead = (atY) => {
      doc.rect(ML, atY, CW, TH).fill(C.accent);
      let cx = ML;
      COLS.forEach(c => {
        doc.font('Helvetica-Bold').fontSize(7).fillColor(C.white)
           .text(c.label, cx + 2, atY + 7, {
             width: c.w - 4,
             align: c.align === 'left' ? 'left' : 'center',
             lineBreak: false,
           });
        cx += c.w;
      });
    };

    drawTHead(y);
    y += TH;

    // ── DATA ROWS ─────────────────────────────────────────────────────────────
    (staff || []).forEach((s, ri) => {
      const u = userStats[s.id];
      if (!u) return;

      if (y + TR > PH - 44) {
        doc.addPage();
        y = 36;
        drawTHead(y);
        y += TH;
      }

      const bg = u.role === 'sales_head' ? '#F0F4FF' : (ri % 2 === 0 ? C.white : C.rowAlt);
      doc.rect(ML, y, CW, TR).fillAndStroke(bg, C.border);

      let cx = ML;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.text)
         .text(u.name, cx + 3, y + 3, { width: COLS[0].w - 6, lineBreak: false });
      doc.font('Helvetica').fontSize(6.5).fillColor(C.gray)
         .text(rl(u.role), cx + 3, y + 12, { width: COLS[0].w - 6, lineBreak: false });
      cx += COLS[0].w;

      const vals = [
        fmt(u.leadsToday), fmt(u.calls), fmt(u.emails), fmt(u.meetings),
        fmt(u.followUpsCompleted), fmt(u.tasks), fmt(u.dealsCreated),
        fmt(u.dealsWon), fmt(u.dealsLost), conv(u.dealsWon, u.dealsLost), fmt(u.score),
      ];
      vals.forEach((v, vi) => {
        const col = COLS[vi + 1];
        let clr = C.text;
        if (col.label === 'Won')   clr = C.green;
        if (col.label === 'Lost')  clr = C.red;
        if (col.label === 'Score') {
          const sc = parseInt(v) || 0;
          clr = sc >= 70 ? C.green : sc >= 40 ? C.amber : C.red;
        }
        doc.font('Helvetica').fontSize(8).fillColor(clr)
           .text(v, cx + 2, y + 7, { width: col.w - 4, align: 'center', lineBreak: false });
        cx += col.w;
      });
      y += TR;
    });

    // ── TOTALS ROW ─────────────────────────────────────────────────────────────
    if (y + TR > PH - 44) { doc.addPage(); y = 36; }
    doc.rect(ML, y, CW, TR).fillAndStroke(C.headBg, C.accent);

    let cx = ML;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.accent)
       .text('TEAM TOTAL', cx + 3, y + 7, { width: COLS[0].w - 6, lineBreak: false });
    cx += COLS[0].w;

    [
      fmt(totals.leadsToday), fmt(totals.calls), fmt(totals.emails), fmt(totals.meetings),
      fmt(totals.followUpsCompleted), fmt(totals.tasks), fmt(totals.dealsCreated),
      fmt(totals.dealsWon), fmt(totals.dealsLost),
      conv(totals.dealsWon, totals.dealsLost), '-',
    ].forEach((v, vi) => {
      const col = COLS[vi + 1];
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.accent)
         .text(v, cx + 2, y + 7, { width: col.w - 4, align: 'center', lineBreak: false });
      cx += col.w;
    });
    y += TR + 12;

    // ── REVENUE BANNER ─────────────────────────────────────────────────────────
    if (y + 22 > PH - 44) { doc.addPage(); y = 36; }
    doc.rect(ML, y, CW, 22).fill(C.headBg);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.accent)
       .text(
         `Revenue Won: ${fmtR(totals.revenueWon)}`
         + `   |   Deals Won: ${fmt(totals.dealsWon)} of ${fmt(totals.dealsCreated)} Created`
         + `   |   Sales Heads: ${fmt(totals.salesHeads)}   Inside Sales: ${fmt(totals.insideSales)}`,
         ML + 6, y + 7,
         { width: CW - 12, lineBreak: false },
       );
    y += 22;

    // ── FOOTER ON EVERY PAGE ──────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const fy = PH - 24;
      doc.rect(0, fy, PW, 24).fill('#F1F5F9');
      doc.font('Helvetica').fontSize(7.5).fillColor(C.gray)
         .text('Ccentrik CRM', ML, fy + 8);
      doc.font('Helvetica').fontSize(7.5).fillColor(C.gray)
         .text(`Page ${i + 1} of ${range.count}`, 0, fy + 8, { width: PW, align: 'center' });
      doc.font('Helvetica').fontSize(7.5).fillColor(C.gray)
         .text('Confidential — Internal Use Only', PW - MR - 160, fy + 8, { width: 160, align: 'right' });
    }

    doc.flushPages();
    doc.end();
  });
}

module.exports = { generateDSRPdf };
