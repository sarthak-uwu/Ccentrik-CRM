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

async function generateFrontendDsrPdf({ dateLabel, generatedAt, scopeProfiles, statsMap, meetings }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let pageNum = 0;

    function addHeader() {
      pageNum++;
      doc.rect(0, 0, PW, 36).fill(C.navy);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.white).text('Ccentrik CRM', ML, 13, { continued: true });
      doc.font('Helvetica').fillColor('#94A3B8').text('  |  Daily Sales Report');
      doc.font('Helvetica').fontSize(8.5).fillColor('#94A3B8').text(`Page ${pageNum}`, PW - MR - 36, 14, { width: 36, align: 'right' });
    }

    function addFooter() {
      doc.rect(0, PH - 26, PW, 26).fill(C.navy);
      doc.font('Helvetica').fontSize(7.5).fillColor('#94A3B8')
         .text('Ccentrik CRM  ·  Confidential — Internal Use Only', ML, PH - 16, { width: CW * 0.55 });
      doc.font('Helvetica').fontSize(7.5).fillColor('#64748B')
         .text(`Generated: ${generatedAt}`, ML + CW * 0.55, PH - 16, { width: CW * 0.45, align: 'right' });
    }

    function newPage() {
      if (pageNum > 0) { addFooter(); doc.addPage(); }
      addHeader();
      return 44;
    }

    function sectionTitle(title, y) {
      doc.rect(ML, y, CW, 22).fill('#F1F5F9');
      doc.rect(ML, y, 3, 22).fill(C.accent);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.text).text(title, ML + 10, y + 7);
      return y + 26;
    }

    function drawTable(cols, rows, startY, rowH = 15) {
      let y = startY;
      const drawHeader = () => {
        doc.rect(ML, y, CW, rowH + 1).fill(C.blue);
        let x = ML;
        cols.forEach(col => {
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.white)
             .text(col.label, x + 3, y + 4, { width: col.width - 6, ellipsis: true });
          x += col.width;
        });
        y += rowH + 1;
      };
      drawHeader();
      rows.forEach((row, ri) => {
        if (y > PH - 50) { addFooter(); doc.addPage(); addHeader(); y = 44; drawHeader(); }
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

    function statGrid(items, y, cols = 4) {
      const boxW = Math.floor(CW / cols);
      const boxH = 54;
      const gap  = 6;
      items.forEach((item, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const bx  = ML + col * (boxW);
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

    // ── Aggregate data from scopeProfiles ────────────────────────────────────
    const totals = {
      activitiesCompleted: 0, activitiesPending: 0, activitiesOverdue: 0,
      callsMade: 0, emailsSent: 0, notesAdded: 0, meetingsScheduled: 0,
      leadsCreated: 0, leadsConverted: 0, prospectsAdded: 0,
      dealsCreated: 0, dealsWon: 0, revenue: 0, tasksCompleted: 0,
      followUpsCompleted: 0, followUpsPending: 0,
    };
    const allTimeline  = [];
    const allLeads     = [];
    const allDeals     = [];
    const allOverdue   = [];

    scopeProfiles.forEach(p => {
      const s = statsMap[p.id];
      if (!s) return;
      Object.keys(totals).forEach(k => { totals[k] += s[k] || 0; });
      (s.activityTimeline  || []).forEach(a => allTimeline.push({ ...a, empName: p.full_name || p.email }));
      (s.todayLeads        || []).forEach(l => allLeads.push({ ...l, empName: p.full_name || p.email }));
      (s.todayDeals        || []).forEach(d => allDeals.push({ ...d, empName: p.full_name || p.email }));
      (s.overdueActivities || []).forEach(a => allOverdue.push({ ...a, empName: p.full_name || p.email }));
    });

    allTimeline.sort((a, b) => ((a.time || '') > (b.time || '') ? -1 : 1));

    const multi = scopeProfiles.length > 1;
    const totalActs = totals.activitiesCompleted + totals.activitiesPending + totals.activitiesOverdue;

    // ── COVER PAGE ───────────────────────────────────────────────────────────
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
      const by = 255;
      doc.rect(bx + 3, by, cBW - 6, 72).fill('#1A2F55');
      doc.rect(bx + 3, by, 3, 72).fill(s.color);
      doc.font('Helvetica-Bold').fontSize(22).fillColor(s.color)
         .text(String(s.value), bx + 10, by + 12, { width: cBW - 22, align: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor('#94A3B8')
         .text(s.label, bx + 10, by + 46, { width: cBW - 22, align: 'center' });
    });

    // Employee info
    if (!multi && scopeProfiles.length === 1) {
      const p = scopeProfiles[0];
      doc.font('Helvetica-Bold').fontSize(12).fillColor(C.white)
         .text(p.full_name || p.email, ML, 354, { width: CW, align: 'center' });
      doc.font('Helvetica').fontSize(9).fillColor('#94A3B8')
         .text(fmtType(p.role), ML, 372, { width: CW, align: 'center' });
    } else {
      doc.font('Helvetica').fontSize(10).fillColor('#94A3B8')
         .text(`${scopeProfiles.length} Employees`, ML, 358, { width: CW, align: 'center' });
    }

    doc.font('Helvetica').fontSize(8).fillColor('#475569')
       .text(`Generated: ${generatedAt}`, ML, PH - 55, { width: CW, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).fillColor('#334155')
       .text('CONFIDENTIAL — FOR INTERNAL USE ONLY', ML, PH - 40, { width: CW, align: 'center' });
    addFooter();

    // ── EXECUTIVE SUMMARY ────────────────────────────────────────────────────
    doc.addPage();
    let y = addHeader(); y = 44;

    y = sectionTitle('Executive Summary — Key Performance Indicators', y);
    y += 8;

    const kpis = [
      { label: 'Total Activities',   value: totalActs,                        color: C.accent  },
      { label: 'Completed',          value: totals.activitiesCompleted,        color: C.green   },
      { label: 'Pending',            value: totals.activitiesPending,          color: C.yellow  },
      { label: 'Overdue',            value: totals.activitiesOverdue,          color: C.red     },
      { label: 'Meetings',           value: totals.meetingsScheduled,          color: C.purple  },
      { label: 'Calls Made',         value: totals.callsMade,                  color: C.blue    },
      { label: 'Emails Sent',        value: totals.emailsSent,                 color: C.accent  },
      { label: 'Notes Added',        value: totals.notesAdded,                 color: C.gray    },
      { label: 'New Leads',          value: totals.leadsCreated,               color: C.green   },
      { label: 'Deals Created',      value: totals.dealsCreated,               color: C.purple  },
      { label: 'Leads Converted',    value: totals.leadsConverted,             color: C.accent  },
      { label: 'Deals Won',          value: totals.dealsWon,                   color: C.green   },
      { label: 'Revenue',            value: fmtCurrency(totals.revenue),       color: C.yellow  },
      { label: 'Tasks Completed',    value: totals.tasksCompleted,             color: C.blue    },
      { label: 'Follow-ups Done',    value: totals.followUpsCompleted,         color: C.green   },
      { label: 'Prospects Added',    value: totals.prospectsAdded,             color: C.accent  },
    ];
    y = statGrid(kpis, y, 4);

    // Performance metrics (simple bar charts)
    if (totalActs > 0 || totals.dealsCreated > 0) {
      y += 10;
      y = sectionTitle('Performance Metrics', y);
      y += 8;

      const compPct = totalActs > 0 ? Math.round((totals.activitiesCompleted / totalActs) * 100) : 0;
      const convRate = (totals.leadsCreated + totals.prospectsAdded) > 0
        ? Math.round((totals.leadsConverted / (totals.leadsCreated + totals.prospectsAdded)) * 100)
        : 0;
      const winRate = totals.dealsCreated > 0
        ? Math.round((totals.dealsWon / totals.dealsCreated) * 100) : 0;

      const metrics = [
        { label: 'Activity Completion Rate', pct: compPct, color: C.green  },
        { label: 'Lead Conversion Rate',     pct: convRate, color: C.accent },
        { label: 'Deal Win Rate',            pct: winRate,  color: C.purple },
      ];
      metrics.forEach(m => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.text)
           .text(m.label, ML, y, { continued: true });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(m.color)
           .text(`  ${m.pct}%`, { align: 'right' });
        y += 14;
        doc.rect(ML, y, CW, 8).fill('#E2E8F0');
        if (m.pct > 0) doc.rect(ML, y, Math.round(CW * m.pct / 100), 8).fill(m.color);
        y += 14;
      });
    }

    // Employee performance table (multi-employee only)
    if (multi && scopeProfiles.length > 0) {
      y += 10;
      y = sectionTitle('Employee Performance Summary', y);
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
        const pActs = s ? (s.activityTimeline || []).length : 0;
        return {
          name:    p.full_name || p.email,
          role:    fmtType(p.role),
          acts:    pActs,
          done:    s?.activitiesCompleted ?? 0,
          calls:   s?.callsMade ?? 0,
          emails:  s?.emailsSent ?? 0,
          leads:   s?.leadsCreated ?? 0,
          deals:   s?.dealsCreated ?? 0,
          revenue: fmtCurrency(s?.revenue ?? 0),
        };
      });
      y = drawTable(empCols, empRows, y);
    }

    // ── ACTIVITY TIMELINE ────────────────────────────────────────────────────
    if (allTimeline.length > 0) {
      addFooter(); doc.addPage(); y = addHeader(); y = 44;
      y = sectionTitle(`Activity Timeline (${allTimeline.length} activities)`, y);
      y += 6;

      // Multi: 70+78+84+93+50+148 = 523; Single: 80+98+110+53+182 = 523
      const actCols = multi
        ? [
            { key: 'time',    label: 'Date/Time', width: 70  },
            { key: 'emp',     label: 'Employee',  width: 78  },
            { key: 'type',    label: 'Type',      width: 84  },
            { key: 'company', label: 'Company',   width: 93  },
            { key: 'status',  label: 'Status',    width: 50  },
            { key: 'notes',   label: 'Notes',     width: 148 },
          ]
        : [
            { key: 'time',    label: 'Date/Time', width: 80  },
            { key: 'type',    label: 'Type',      width: 98  },
            { key: 'company', label: 'Company',   width: 110 },
            { key: 'status',  label: 'Status',    width: 53  },
            { key: 'notes',   label: 'Notes',     width: 182 },
          ];

      const actRows = allTimeline.map(a => {
        const row = {
          time:    fmtDateTime(a.time),
          type:    fmtType(a.type),
          company: a.companyName !== '—' ? a.companyName : (a.contactName !== '—' ? a.contactName : '—'),
          status:  { v: fmtType(a.status || 'pending'), c: statusColor(a.status) },
          notes:   String(a.description || a.outcome || '—').substring(0, 80),
        };
        if (multi) row.emp = a.empName || '—';
        return row;
      });
      y = drawTable(actCols, actRows, y);
    }

    // ── NEW LEADS ────────────────────────────────────────────────────────────
    if (allLeads.length > 0) {
      if (y > PH - 120) { addFooter(); doc.addPage(); y = addHeader(); y = 44; } else y += 12;
      y = sectionTitle(`New Leads (${allLeads.length})`, y);
      y += 6;

      // Multi: 100+85+68+62+58+150=523; Single: 130+115+90+88+100=523
      const leadColsM = [
        { key: 'company', label: 'Company', width: 100 },
        { key: 'contact', label: 'Contact', width: 85  },
        { key: 'source',  label: 'Source',  width: 68  },
        { key: 'stage',   label: 'Stage',   width: 62  },
        { key: 'created', label: 'Created', width: 58  },
        { key: 'emp',     label: 'Employee',width: 150 },
      ];
      const leadColsS = [
        { key: 'company', label: 'Company', width: 140 },
        { key: 'contact', label: 'Contact', width: 115 },
        { key: 'source',  label: 'Source',  width: 88  },
        { key: 'stage',   label: 'Stage',   width: 88  },
        { key: 'created', label: 'Created', width: 92  },
      ];
      const leadRows = allLeads.map(l => {
        const row = {
          company: l.companyName || '—',
          contact: l.contactName || '—',
          source:  l.source || '—',
          stage:   { v: fmtType(l.stage || '—'), c: l.isConverted ? C.green : C.accent },
          created: fmtDate(l.createdAt),
        };
        if (multi) row.emp = l.empName || '—';
        return row;
      });
      y = drawTable(multi ? leadColsM : leadColsS, leadRows, y);
    }

    // ── DEALS ────────────────────────────────────────────────────────────────
    if (allDeals.length > 0) {
      if (y > PH - 120) { addFooter(); doc.addPage(); y = addHeader(); y = 44; } else y += 12;
      y = sectionTitle(`Deals (${allDeals.length})`, y);
      y += 6;

      const dealStatusC = s => (s === 'won' ? C.green : s === 'lost' ? C.red : C.accent);

      // Multi: 105+90+60+65+65+55+83=523; Single: 130+120+72+85+76+40=523
      const dealColsM = [
        { key: 'name',    label: 'Deal Name',   width: 105 },
        { key: 'company', label: 'Company',     width: 90  },
        { key: 'value',   label: 'Value',       width: 60  },
        { key: 'stage',   label: 'Stage',       width: 65  },
        { key: 'close',   label: 'Close Date',  width: 65  },
        { key: 'status',  label: 'Status',      width: 55  },
        { key: 'emp',     label: 'Employee',    width: 83  },
      ];
      const dealColsS = [
        { key: 'name',    label: 'Deal Name',   width: 130 },
        { key: 'company', label: 'Company',     width: 120 },
        { key: 'value',   label: 'Value',       width: 72  },
        { key: 'stage',   label: 'Stage',       width: 85  },
        { key: 'close',   label: 'Close Date',  width: 76  },
        { key: 'status',  label: 'Status',      width: 40  },
      ];
      const dealRows = allDeals.map(d => {
        const row = {
          name:    d.name || '—',
          company: d.companyName || '—',
          value:   fmtCurrency(d.value),
          stage:   fmtType(d.stage || '—'),
          close:   fmtDate(d.expectedClose),
          status:  { v: fmtType(d.status || 'active'), c: dealStatusC(d.status) },
        };
        if (multi) row.emp = d.empName || '—';
        return row;
      });
      y = drawTable(multi ? dealColsM : dealColsS, dealRows, y);
    }

    // ── MEETINGS ─────────────────────────────────────────────────────────────
    if (meetings && meetings.length > 0) {
      if (y > PH - 120) { addFooter(); doc.addPage(); y = addHeader(); y = 44; } else y += 12;
      y = sectionTitle(`Meetings (${meetings.length})`, y);
      y += 6;

      const meetStatusC = s => (s === 'completed' || s === 'done') ? C.green : s === 'cancelled' ? C.red : C.yellow;

      // Cols sum: 70+100+95+62+56+140 = 523
      const meetCols = [
        { key: 'time',     label: 'Date/Time', width: 70  },
        { key: 'customer', label: 'Customer',  width: 100 },
        { key: 'company',  label: 'Company',   width: 95  },
        { key: 'type',     label: 'Type',      width: 62  },
        { key: 'status',   label: 'Status',    width: 56  },
        { key: 'purpose',  label: 'Purpose',   width: 140 },
      ];
      const meetRows = meetings.map(m => ({
        time:     fmtDateTime(m.start_time),
        customer: m.customer_name || m.contact_name || '—',
        company:  m.company_name || '—',
        type:     fmtType(m.meeting_type || '—'),
        status:   { v: fmtType(m.status || 'scheduled'), c: meetStatusC(m.status) },
        purpose:  String(m.purpose || m.notes || m.title || '—').substring(0, 60),
      }));
      y = drawTable(meetCols, meetRows, y);
    }

    // ── OVERDUE ACTIVITIES ───────────────────────────────────────────────────
    if (allOverdue.length > 0) {
      if (y > PH - 120) { addFooter(); doc.addPage(); y = addHeader(); y = 44; } else y += 12;
      y = sectionTitle(`Overdue Activities (${allOverdue.length})`, y);
      y += 6;

      // Multi: 88+105+90+73+58+109=523; Single: 105+135+115+90+78=523
      const overColsM = [
        { key: 'type',    label: 'Type',      width: 88  },
        { key: 'company', label: 'Company',   width: 105 },
        { key: 'contact', label: 'Contact',   width: 90  },
        { key: 'due',     label: 'Due Date',  width: 73  },
        { key: 'days',    label: 'Days Late', width: 58  },
        { key: 'emp',     label: 'Employee',  width: 109 },
      ];
      const overColsS = [
        { key: 'type',    label: 'Type',      width: 105 },
        { key: 'company', label: 'Company',   width: 135 },
        { key: 'contact', label: 'Contact',   width: 115 },
        { key: 'due',     label: 'Due Date',  width: 90  },
        { key: 'days',    label: 'Days Late', width: 78  },
      ];
      const overRows = allOverdue.map(a => {
        const row = {
          type:    fmtType(a.type),
          company: a.companyName || '—',
          contact: a.contactName || '—',
          due:     fmtDate(a.dueDate),
          days:    { v: (a.daysOverdue > 0 ? `${a.daysOverdue}d` : '—'), c: C.red },
        };
        if (multi) row.emp = a.empName || '—';
        return row;
      });
      y = drawTable(multi ? overColsM : overColsS, overRows, y);
    }

    addFooter();
    doc.end();
  });
}

module.exports = { generateFrontendDsrPdf };
