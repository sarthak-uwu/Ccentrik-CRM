'use strict';
const PDFDocument = require('pdfkit');

const C = {
  navy:    '#0F2044',
  blue:    '#1E3A5F',
  accent:  '#3B82F6',
  green:   '#10B981',
  red:     '#EF4444',
  yellow:  '#F59E0B',
  purple:  '#6366F1',
  gray:    '#64748B',
  border:  '#E2E8F0',
  surface: '#F8FAFC',
  white:   '#FFFFFF',
  text:    '#1E293B',
  text2:   '#475569',
};

const PW = 595.28;
const PH = 841.89;
const ML = 36;
const MR = 36;
const CW = PW - ML - MR; // 523.28

function fmtCurrency(n) {
  if (!n) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}
function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return '—'; }
}
function fmtDateTime(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return '—'; }
}
function fmtType(t) {
  if (!t) return '—';
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function statusColor(s) {
  const v = (s || '').toLowerCase();
  if (v === 'done' || v === 'completed') return C.green;
  if (v === 'overdue') return C.red;
  return C.yellow;
}
function roleColor(r) {
  if (r === 'owner')         return C.purple;
  if (r === 'sales_head')    return C.green;
  if (r === 'sales_manager') return C.yellow;
  return C.accent;
}

async function generateFrontendDsrPdf({ dateLabel, generatedAt, scopeProfiles, statsMap, meetings }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let pageNum = 0;

    function addHeader(subtitle) {
      pageNum++;
      doc.rect(0, 0, PW, 36).fill(C.navy);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.white).text('Ccentrik CRM', ML, 13, { continued: true });
      doc.font('Helvetica').fillColor('#94A3B8').text(`  |  ${subtitle || 'Daily Sales Report'}`);
      doc.font('Helvetica').fontSize(8.5).fillColor('#94A3B8')
         .text(`Page ${pageNum}`, PW - MR - 36, 14, { width: 36, align: 'right' });
    }

    function addFooter() {
      doc.rect(0, PH - 26, PW, 26).fill(C.navy);
      doc.font('Helvetica').fontSize(7.5).fillColor('#94A3B8')
         .text('Ccentrik CRM  ·  Confidential — Internal Use Only', ML, PH - 16, { width: CW * 0.55 });
      doc.font('Helvetica').fontSize(7.5).fillColor('#64748B')
         .text(`Generated: ${generatedAt}`, ML + CW * 0.55, PH - 16, { width: CW * 0.45, align: 'right' });
    }

    // Start a fresh page, return starting y
    function newPage(subtitle) {
      if (pageNum > 0) { addFooter(); doc.addPage(); }
      addHeader(subtitle);
      return 44;
    }

    function sectionTitle(title, y) {
      doc.rect(ML, y, CW, 22).fill('#F1F5F9');
      doc.rect(ML, y, 3, 22).fill(C.accent);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.text).text(title, ML + 10, y + 7);
      return y + 26;
    }

    // Draws table header + rows; handles page breaks by re-drawing header
    function drawTable(cols, rows, startY, subtitle, rowH = 15) {
      let y = startY;
      const drawTHead = () => {
        doc.rect(ML, y, CW, rowH + 1).fill(C.blue);
        let x = ML;
        cols.forEach(col => {
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.white)
             .text(col.label, x + 3, y + 4, { width: col.width - 6, ellipsis: true });
          x += col.width;
        });
        y += rowH + 1;
      };
      drawTHead();
      rows.forEach((row, ri) => {
        if (y > PH - 50) {
          addFooter(); doc.addPage(); addHeader(subtitle); y = 44;
          drawTHead();
        }
        doc.rect(ML, y, CW, rowH).fill(ri % 2 === 0 ? C.white : C.surface);
        doc.rect(ML, y, CW, rowH).stroke('#E2E8F0').strokeColor('#E2E8F0');
        let rx = ML;
        cols.forEach(col => {
          const cell = row[col.key];
          const val  = cell && typeof cell === 'object' ? cell.v : (cell ?? '—');
          const clr  = cell && typeof cell === 'object' ? (cell.c || C.text) : C.text;
          doc.font('Helvetica').fontSize(7.5).fillColor(clr)
             .text(String(val), rx + 3, y + 4, { width: col.width - 6, ellipsis: true });
          rx += col.width;
        });
        y += rowH;
      });
      return y;
    }

    // 4-column stat grid (KPI boxes)
    function statGrid(items, y, cols = 4) {
      const boxW = Math.floor(CW / cols);
      const boxH = 54;
      const gap  = 6;
      items.forEach((item, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const bx  = ML + col * boxW;
        const by  = y + row * (boxH + gap);
        const w   = col === cols - 1 ? CW - col * boxW : boxW - 4;
        doc.rect(bx, by, w, boxH).fill(C.white).stroke(C.border).strokeColor(C.border);
        doc.rect(bx, by, 3, boxH).fill(item.color || C.accent);
        doc.font('Helvetica-Bold').fontSize(17).fillColor(item.color || C.accent)
           .text(String(item.value), bx + 8, by + 10, { width: w - 16 });
        doc.font('Helvetica').fontSize(7.5).fillColor(C.text2)
           .text(item.label, bx + 8, by + 34, { width: w - 16, ellipsis: true });
      });
      return y + Math.ceil(items.length / cols) * (boxH + gap) + 4;
    }

    // Compact 8-column stat grid for per-employee pages
    function miniStatGrid(items, y) {
      const cols = 4;
      const boxW = Math.floor(CW / cols);
      const boxH = 42;
      const gap  = 5;
      items.forEach((item, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const bx  = ML + col * boxW;
        const by  = y + row * (boxH + gap);
        const w   = col === cols - 1 ? CW - col * boxW : boxW - 4;
        doc.rect(bx, by, w, boxH).fill(C.white).stroke(C.border).strokeColor(C.border);
        doc.rect(bx, by, 3, boxH).fill(item.color || C.accent);
        doc.font('Helvetica-Bold').fontSize(14).fillColor(item.color || C.accent)
           .text(String(item.value), bx + 7, by + 7, { width: w - 14 });
        doc.font('Helvetica').fontSize(7).fillColor(C.text2)
           .text(item.label, bx + 7, by + 27, { width: w - 14, ellipsis: true });
      });
      return y + Math.ceil(items.length / cols) * (boxH + gap) + 4;
    }

    // ── Aggregate totals ────────────────────────────────────────────────────
    const totals = {
      activitiesCompleted: 0, activitiesPending: 0, activitiesOverdue: 0,
      callsMade: 0, emailsSent: 0, notesAdded: 0, meetingsScheduled: 0,
      leadsCreated: 0, leadsConverted: 0, prospectsAdded: 0,
      dealsCreated: 0, dealsWon: 0, revenue: 0, tasksCompleted: 0,
      followUpsCompleted: 0, followUpsPending: 0,
    };
    scopeProfiles.forEach(p => {
      const s = statsMap[p.id];
      if (!s) return;
      Object.keys(totals).forEach(k => { totals[k] += s[k] || 0; });
    });
    const totalActs = totals.activitiesCompleted + totals.activitiesPending + totals.activitiesOverdue;

    // ─────────────────────────────────────────────────────────────────────────
    // COVER PAGE
    // ─────────────────────────────────────────────────────────────────────────
    doc.rect(0, 0, PW, PH).fill(C.navy);
    doc.rect(0, 0, PW, 5).fill(C.accent);
    doc.rect(0, PH - 5, PW, 5).fill(C.accent);

    doc.font('Helvetica-Bold').fontSize(30).fillColor(C.white)
       .text('Ccentrik CRM', ML, 90, { width: CW, align: 'center' });
    doc.rect(ML + 70, 132, CW - 140, 2).fill(C.accent);
    doc.font('Helvetica').fontSize(16).fillColor('#94A3B8')
       .text('Daily Sales Report', ML, 143, { width: CW, align: 'center' });

    // Date badge
    doc.rect(ML + 90, 178, CW - 180, 38).fill(C.blue);
    doc.rect(ML + 90, 178, 3, 38).fill(C.accent);
    doc.font('Helvetica-Bold').fontSize(13.5).fillColor(C.white)
       .text(dateLabel, ML + 93, 192, { width: CW - 192, align: 'center' });

    // 4 cover stats
    const cStats = [
      { label: 'Total Activities', value: totalActs,                   color: C.accent  },
      { label: 'Leads Created',    value: totals.leadsCreated,         color: C.green   },
      { label: 'Deals Won',        value: totals.dealsWon,             color: C.purple  },
      { label: 'Revenue',          value: fmtCurrency(totals.revenue), color: C.yellow  },
    ];
    const cBW = CW / 4;
    cStats.forEach((s, i) => {
      const bx = ML + i * cBW;
      doc.rect(bx + 3, 255, cBW - 6, 72).fill('#1A2F55');
      doc.rect(bx + 3, 255, 3, 72).fill(s.color);
      doc.font('Helvetica-Bold').fontSize(22).fillColor(s.color)
         .text(String(s.value), bx + 10, 267, { width: cBW - 22, align: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor('#94A3B8')
         .text(s.label, bx + 10, 301, { width: cBW - 22, align: 'center' });
    });

    // Employee list on cover
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748B')
       .text(`${scopeProfiles.length} Employee${scopeProfiles.length !== 1 ? 's' : ''}`, ML, 350, { width: CW, align: 'center' });
    const empListY = 366;
    scopeProfiles.slice(0, 6).forEach((p, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const bx  = ML + col * (CW / 3);
      const by  = empListY + row * 28;
      doc.rect(bx + 4, by, (CW / 3) - 8, 22).fill('#1A2F55');
      doc.rect(bx + 4, by, 3, 22).fill(roleColor(p.role));
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.white)
         .text(p.full_name || p.email, bx + 12, by + 4, { width: (CW / 3) - 24, ellipsis: true });
      doc.font('Helvetica').fontSize(7).fillColor('#94A3B8')
         .text(fmtType(p.role), bx + 12, by + 14, { width: (CW / 3) - 24, ellipsis: true });
    });
    if (scopeProfiles.length > 6) {
      doc.font('Helvetica').fontSize(8).fillColor('#64748B')
         .text(`+ ${scopeProfiles.length - 6} more`, ML, empListY + 2 * 28 + 4, { width: CW, align: 'center' });
    }

    doc.font('Helvetica').fontSize(8).fillColor('#475569')
       .text(`Generated: ${generatedAt}`, ML, PH - 55, { width: CW, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).fillColor('#334155')
       .text('CONFIDENTIAL — FOR INTERNAL USE ONLY', ML, PH - 40, { width: CW, align: 'center' });
    addFooter();

    // ─────────────────────────────────────────────────────────────────────────
    // PAGE 2: EXECUTIVE SUMMARY (aggregate)
    // ─────────────────────────────────────────────────────────────────────────
    let y = newPage('Executive Summary');
    y = sectionTitle('Executive Summary — Key Performance Indicators', y);
    y += 8;

    const kpis = [
      { label: 'Total Activities',   value: totalActs,                  color: C.accent  },
      { label: 'Completed',          value: totals.activitiesCompleted,  color: C.green   },
      { label: 'Pending',            value: totals.activitiesPending,    color: C.yellow  },
      { label: 'Overdue',            value: totals.activitiesOverdue,    color: C.red     },
      { label: 'Meetings',           value: totals.meetingsScheduled,    color: C.purple  },
      { label: 'Calls Made',         value: totals.callsMade,            color: C.blue    },
      { label: 'Emails Sent',        value: totals.emailsSent,           color: C.accent  },
      { label: 'Notes Added',        value: totals.notesAdded,           color: C.gray    },
      { label: 'New Leads',          value: totals.leadsCreated,         color: C.green   },
      { label: 'Deals Created',      value: totals.dealsCreated,         color: C.purple  },
      { label: 'Leads Converted',    value: totals.leadsConverted,       color: C.accent  },
      { label: 'Deals Won',          value: totals.dealsWon,             color: C.green   },
      { label: 'Revenue',            value: fmtCurrency(totals.revenue), color: C.yellow  },
      { label: 'Tasks Completed',    value: totals.tasksCompleted,       color: C.blue    },
      { label: 'Follow-ups Done',    value: totals.followUpsCompleted,   color: C.green   },
      { label: 'Prospects Added',    value: totals.prospectsAdded,       color: C.accent  },
    ];
    y = statGrid(kpis, y, 4);

    // Performance bars
    if (totalActs > 0 || totals.dealsCreated > 0) {
      y += 10;
      y = sectionTitle('Performance Metrics', y);
      y += 8;
      const compPct  = totalActs > 0 ? Math.round((totals.activitiesCompleted / totalActs) * 100) : 0;
      const convRate = (totals.leadsCreated + totals.prospectsAdded) > 0
        ? Math.round((totals.leadsConverted / (totals.leadsCreated + totals.prospectsAdded)) * 100) : 0;
      const winRate  = totals.dealsCreated > 0 ? Math.round((totals.dealsWon / totals.dealsCreated) * 100) : 0;
      [
        { label: 'Activity Completion Rate', pct: compPct,  color: C.green  },
        { label: 'Lead Conversion Rate',     pct: convRate, color: C.accent },
        { label: 'Deal Win Rate',            pct: winRate,  color: C.purple },
      ].forEach(m => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.text).text(m.label, ML, y, { continued: true });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(m.color).text(`  ${m.pct}%`, { align: 'right' });
        y += 14;
        doc.rect(ML, y, CW, 8).fill('#E2E8F0');
        if (m.pct > 0) doc.rect(ML, y, Math.round(CW * m.pct / 100), 8).fill(m.color);
        y += 14;
      });
    }

    // Team summary table
    if (scopeProfiles.length > 1) {
      y += 10;
      y = sectionTitle('Team Performance Overview', y);
      y += 6;
      // Cols sum: 110+78+55+55+44+44+42+40+55 = 523
      const empCols = [
        { key: 'name',    label: 'Employee',   width: 110 },
        { key: 'role',    label: 'Role',       width: 78  },
        { key: 'acts',    label: 'Activities', width: 55  },
        { key: 'done',    label: 'Completed',  width: 55  },
        { key: 'calls',   label: 'Calls',      width: 44  },
        { key: 'emails',  label: 'Emails',     width: 44  },
        { key: 'leads',   label: 'Leads',      width: 42  },
        { key: 'deals',   label: 'Deals',      width: 40  },
        { key: 'revenue', label: 'Revenue',    width: 55  },
      ];
      const empRows = scopeProfiles.map(p => {
        const s = statsMap[p.id];
        return {
          name:    p.full_name || p.email,
          role:    fmtType(p.role),
          acts:    s ? (s.activityTimeline || []).length : 0,
          done:    s?.activitiesCompleted ?? 0,
          calls:   s?.callsMade ?? 0,
          emails:  s?.emailsSent ?? 0,
          leads:   s?.leadsCreated ?? 0,
          deals:   s?.dealsCreated ?? 0,
          revenue: fmtCurrency(s?.revenue ?? 0),
        };
      });
      y = drawTable(empCols, empRows, y, 'Executive Summary');
    }

    // Meetings (aggregate, if any)
    if (meetings && meetings.length > 0) {
      if (y > PH - 120) { y = newPage('Meetings'); } else { y += 12; }
      y = sectionTitle(`Meetings (${meetings.length})`, y);
      y += 6;
      // Cols sum: 70+100+95+62+56+140 = 523
      const meetCols = [
        { key: 'time',     label: 'Date/Time', width: 70  },
        { key: 'customer', label: 'Customer',  width: 100 },
        { key: 'company',  label: 'Company',   width: 95  },
        { key: 'type',     label: 'Type',      width: 62  },
        { key: 'status',   label: 'Status',    width: 56  },
        { key: 'purpose',  label: 'Purpose',   width: 140 },
      ];
      const mStatusC = s => (s === 'completed' || s === 'done') ? C.green : s === 'cancelled' ? C.red : C.yellow;
      const meetRows = meetings.map(m => ({
        time:     fmtDateTime(m.start_time),
        customer: m.customer_name || m.contact_name || '—',
        company:  m.company_name || '—',
        type:     fmtType(m.meeting_type || '—'),
        status:   { v: fmtType(m.status || 'scheduled'), c: mStatusC(m.status) },
        purpose:  String(m.purpose || m.notes || m.title || '—').substring(0, 60),
      }));
      y = drawTable(meetCols, meetRows, y, 'Meetings');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PER-EMPLOYEE PAGES
    // ─────────────────────────────────────────────────────────────────────────
    scopeProfiles.forEach(p => {
      const s = statsMap[p.id];
      if (!s) return;

      const empLabel = p.full_name || p.email;
      const pActs    = (s.activityTimeline  || []).length;

      // ── Employee header page ─────────────────────────────────────────────
      y = newPage(empLabel);

      // Employee header bar
      doc.rect(ML, y, CW, 52).fill(C.blue);
      doc.rect(ML, y, 4, 52).fill(roleColor(p.role));

      // Avatar circle
      const av = (p.full_name || p.email || '?')[0].toUpperCase();
      doc.circle(ML + 32, y + 26, 18).fill('#0F2044');
      doc.font('Helvetica-Bold').fontSize(14).fillColor(C.white).text(av, ML + 23, y + 18);

      // Name + role
      doc.font('Helvetica-Bold').fontSize(13).fillColor(C.white)
         .text(empLabel, ML + 58, y + 10, { width: CW - 160, ellipsis: true });
      doc.font('Helvetica').fontSize(9).fillColor('#94A3B8')
         .text(fmtType(p.role), ML + 58, y + 27, { width: CW - 160 });
      doc.font('Helvetica').fontSize(8.5).fillColor('#64748B')
         .text(p.email || '—', ML + 58, y + 38, { width: CW - 160 });

      // Last active
      if (s.lastActivityAt) {
        doc.font('Helvetica').fontSize(8).fillColor('#94A3B8')
           .text(`Last active: ${fmtDateTime(s.lastActivityAt)}`, PW - MR - 140, y + 20, { width: 136, align: 'right' });
      }
      y += 62;

      // ── Mini stat grid (8 stats, 4 cols × 2 rows) ───────────────────────
      const empStats = [
        { label: 'Activities',    value: pActs,                  color: C.accent  },
        { label: 'Completed',     value: s.activitiesCompleted,  color: C.green   },
        { label: 'Pending',       value: s.activitiesPending,    color: C.yellow  },
        { label: 'Overdue',       value: s.activitiesOverdue,    color: C.red     },
        { label: 'Calls',         value: s.callsMade,            color: C.blue    },
        { label: 'Emails',        value: s.emailsSent,           color: C.accent  },
        { label: 'Leads',         value: s.leadsCreated,         color: C.green   },
        { label: 'Deals',         value: s.dealsCreated,         color: C.purple  },
        { label: 'Leads Conv.',   value: s.leadsConverted,       color: C.accent  },
        { label: 'Deals Won',     value: s.dealsWon,             color: C.green   },
        { label: 'Revenue',       value: fmtCurrency(s.revenue), color: C.yellow  },
        { label: 'Notes',         value: s.notesAdded,           color: C.gray    },
      ];
      y = miniStatGrid(empStats, y);

      // ── Activity Timeline ────────────────────────────────────────────────
      const timeline = s.activityTimeline || [];
      if (timeline.length > 0) {
        if (y > PH - 120) { y = newPage(empLabel); } else { y += 10; }
        y = sectionTitle(`Activity Timeline (${timeline.length})`, y);
        y += 6;
        // Cols sum: 80+98+110+53+182 = 523
        const actCols = [
          { key: 'time',    label: 'Date/Time', width: 80  },
          { key: 'type',    label: 'Type',      width: 98  },
          { key: 'company', label: 'Company',   width: 110 },
          { key: 'status',  label: 'Status',    width: 53  },
          { key: 'notes',   label: 'Notes',     width: 182 },
        ];
        const actRows = timeline.map(a => ({
          time:    fmtDateTime(a.time),
          type:    fmtType(a.type),
          company: a.companyName !== '—' ? a.companyName : (a.contactName !== '—' ? a.contactName : '—'),
          status:  { v: fmtType(a.status || 'pending'), c: statusColor(a.status) },
          notes:   String(a.description || a.outcome || '—').substring(0, 80),
        }));
        y = drawTable(actCols, actRows, y, empLabel);
      }

      // ── Leads ────────────────────────────────────────────────────────────
      const leads = s.todayLeads || [];
      if (leads.length > 0) {
        if (y > PH - 120) { y = newPage(empLabel); } else { y += 10; }
        y = sectionTitle(`Leads (${leads.length})`, y);
        y += 6;
        // Cols sum: 140+115+90+88+90 = 523
        const leadCols = [
          { key: 'company', label: 'Company', width: 140 },
          { key: 'contact', label: 'Contact', width: 115 },
          { key: 'source',  label: 'Source',  width: 90  },
          { key: 'stage',   label: 'Stage',   width: 88  },
          { key: 'created', label: 'Created', width: 90  },
        ];
        const leadRows = leads.map(l => ({
          company: l.companyName || '—',
          contact: l.contactName || '—',
          source:  l.source || '—',
          stage:   { v: fmtType(l.stage || '—'), c: l.isConverted ? C.green : C.accent },
          created: fmtDate(l.createdAt),
        }));
        y = drawTable(leadCols, leadRows, y, empLabel);
      }

      // ── Deals ────────────────────────────────────────────────────────────
      const deals = s.todayDeals || [];
      if (deals.length > 0) {
        if (y > PH - 120) { y = newPage(empLabel); } else { y += 10; }
        y = sectionTitle(`Deals (${deals.length})`, y);
        y += 6;
        // Cols sum: 130+120+72+85+76+40 = 523
        const dealCols = [
          { key: 'name',    label: 'Deal Name',  width: 130 },
          { key: 'company', label: 'Company',    width: 120 },
          { key: 'value',   label: 'Value',      width: 72  },
          { key: 'stage',   label: 'Stage',      width: 85  },
          { key: 'close',   label: 'Close Date', width: 76  },
          { key: 'status',  label: 'Status',     width: 40  },
        ];
        const dStatusC = s => s === 'won' ? C.green : s === 'lost' ? C.red : C.accent;
        const dealRows = deals.map(d => ({
          name:    d.name || '—',
          company: d.companyName || '—',
          value:   fmtCurrency(d.value),
          stage:   fmtType(d.stage || '—'),
          close:   fmtDate(d.expectedClose),
          status:  { v: fmtType(d.status || 'active'), c: dStatusC(d.status) },
        }));
        y = drawTable(dealCols, dealRows, y, empLabel);
      }

      // ── Follow-ups ───────────────────────────────────────────────────────
      const followUps = s.todayFollowUps || [];
      if (followUps.length > 0) {
        if (y > PH - 120) { y = newPage(empLabel); } else { y += 10; }
        y = sectionTitle(`Pending Follow-ups (${followUps.length})`, y);
        y += 6;
        // Cols sum: 150+128+100+84+61 = 523
        const fuCols = [
          { key: 'company', label: 'Company',  width: 150 },
          { key: 'contact', label: 'Contact',  width: 128 },
          { key: 'type',    label: 'Type',     width: 100 },
          { key: 'due',     label: 'Due Date', width: 84  },
          { key: 'status',  label: 'Status',   width: 61  },
        ];
        const fuRows = followUps.map(f => ({
          company: f.companyName || '—',
          contact: f.contactName || '—',
          type:    fmtType(f.type),
          due:     fmtDate(f.dueDate),
          status:  { v: 'Pending', c: C.yellow },
        }));
        y = drawTable(fuCols, fuRows, y, empLabel);
      }

      // ── Overdue Activities ───────────────────────────────────────────────
      const overdue = s.overdueActivities || [];
      if (overdue.length > 0) {
        if (y > PH - 120) { y = newPage(empLabel); } else { y += 10; }
        y = sectionTitle(`Overdue Activities (${overdue.length})`, y);
        y += 6;
        // Cols sum: 105+135+115+90+78 = 523
        const overCols = [
          { key: 'type',    label: 'Type',      width: 105 },
          { key: 'company', label: 'Company',   width: 135 },
          { key: 'contact', label: 'Contact',   width: 115 },
          { key: 'due',     label: 'Due Date',  width: 90  },
          { key: 'days',    label: 'Days Late', width: 78  },
        ];
        const overRows = overdue.map(a => ({
          type:    fmtType(a.type),
          company: a.companyName || '—',
          contact: a.contactName || '—',
          due:     fmtDate(a.dueDate),
          days:    { v: a.daysOverdue > 0 ? `${a.daysOverdue}d` : '—', c: C.red },
        }));
        y = drawTable(overCols, overRows, y, empLabel);
      }
    });

    addFooter();
    doc.end();
  });
}

module.exports = { generateFrontendDsrPdf };
