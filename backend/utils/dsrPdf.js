'use strict';
const PDFDocument = require('pdfkit');

// ── B&W Palette ────────────────────────────────────────────────────────────────
const C = {
  black   : '#000000',
  text    : '#0F172A',
  gray    : '#475569',
  lightGray: '#94A3B8',
  border  : '#D1D5DB',
  rowAlt  : '#F8FAFC',
  headBg  : '#F1F5F9',
  white   : '#FFFFFF',
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
    doc.rect(0, 0, PW, 86).fill(C.white);
    doc.rect(0, 0, PW, 86).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.rect(0, 83, PW, 3).fill(C.black);

    doc.font('Helvetica-Bold').fontSize(22).fillColor(C.black)
       .text('CCENTRIK', ML, 18);
    doc.font('Helvetica').fontSize(9).fillColor(C.lightGray)
       .text(typeLabel.toUpperCase() + ' SALES REPORT', ML, 46);

    doc.font('Helvetica-Bold').fontSize(12).fillColor(C.text)
       .text(reportDateLabel, 0, 18, { width: PW - MR, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor(C.lightGray)
       .text('Generated: ' + genStr, 0, 44, { width: PW - MR, align: 'right' });

    let y = 100;

    // ── SUMMARY STATS ROW 1 ────────────────────────────────────────────────────
    const GAP = 6;
    const BW  = (CW - GAP * 5) / 6;
    const BH  = 48;

    const row1 = [
      { l: 'Sales Staff',      v: fmt(totals.totalStaff)   },
      { l: 'Leads Today',      v: fmt(totals.leadsToday)   },
      { l: 'Total Activities', v: fmt(totals.activities)   },
      { l: 'Deals Created',    v: fmt(totals.dealsCreated) },
      { l: 'Deals Won',        v: fmt(totals.dealsWon)     },
      { l: 'Revenue Won',      v: fmtR(totals.revenueWon)  },
    ];

    row1.forEach((s, i) => {
      const x = ML + i * (BW + GAP);
      doc.rect(x, y, BW, BH).fill(C.white).strokeColor(C.border).lineWidth(0.5).stroke();
      doc.rect(x, y, BW, 2).fill(C.black);
      const fs = s.v.length > 7 ? 11 : 17;
      doc.font('Helvetica-Bold').fontSize(fs).fillColor(C.text)
         .text(s.v, x, y + (fs < 14 ? 10 : 7), { width: BW, align: 'center' });
      doc.font('Helvetica').fontSize(6.5).fillColor(C.lightGray)
         .text(s.l, x, y + 36, { width: BW, align: 'center' });
    });
    y += BH + GAP;

    // ── SUMMARY STATS ROW 2 ────────────────────────────────────────────────────
    const SBH = 34;
    const row2 = [
      { l: 'Calls',           v: fmt(totals.calls) },
      { l: 'Emails',          v: fmt(totals.emails) },
      { l: 'Meetings',        v: fmt(totals.meetings) },
      { l: 'Follow-ups',      v: fmt(totals.followUpsCompleted) },
      { l: 'Tasks Completed', v: fmt(totals.tasks) },
      { l: 'Conversion Rate', v: conv(totals.dealsWon, totals.dealsLost) },
    ];

    row2.forEach((s, i) => {
      const x = ML + i * (BW + GAP);
      doc.rect(x, y, BW, SBH).fill(C.rowAlt).strokeColor(C.border).lineWidth(0.5).stroke();
      doc.font('Helvetica-Bold').fontSize(13).fillColor(C.text)
         .text(s.v, x, y + 4, { width: BW, align: 'center' });
      doc.font('Helvetica').fontSize(6.5).fillColor(C.lightGray)
         .text(s.l, x, y + 21, { width: BW, align: 'center' });
    });
    y += SBH + 14;

    // ── TABLE TITLE ────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.text)
       .text('Team Performance — Individual Breakdown', ML, y);
    y += 14;

    const TH = 21;
    const TR = 20;

    const drawTHead = (atY) => {
      doc.rect(ML, atY, CW, TH).fill(C.black);
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

      const bg = u.role === 'sales_head' ? '#F1F5F9' : (ri % 2 === 0 ? C.white : C.rowAlt);
      doc.rect(ML, y, CW, TR).fill(bg).strokeColor(C.border).lineWidth(0.3).stroke();

      let cx = ML;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.text)
         .text(u.name, cx + 3, y + 3, { width: COLS[0].w - 6, lineBreak: false });
      doc.font('Helvetica').fontSize(6.5).fillColor(C.lightGray)
         .text(rl(u.role), cx + 3, y + 12, { width: COLS[0].w - 6, lineBreak: false });
      cx += COLS[0].w;

      const vals = [
        fmt(u.leadsToday), fmt(u.calls), fmt(u.emails), fmt(u.meetings),
        fmt(u.followUpsCompleted), fmt(u.tasks), fmt(u.dealsCreated),
        fmt(u.dealsWon), fmt(u.dealsLost), conv(u.dealsWon, u.dealsLost), fmt(u.score),
      ];
      vals.forEach((v, vi) => {
        const col = COLS[vi + 1];
        doc.font('Helvetica').fontSize(8).fillColor(C.text)
           .text(v, cx + 2, y + 7, { width: col.w - 4, align: 'center', lineBreak: false });
        cx += col.w;
      });
      y += TR;
    });

    // ── TOTALS ROW ─────────────────────────────────────────────────────────────
    if (y + TR > PH - 44) { doc.addPage(); y = 36; }
    doc.rect(ML, y, CW, TR).fill(C.headBg).strokeColor(C.border).lineWidth(0.5).stroke();

    let cx = ML;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.text)
       .text('TEAM TOTAL', cx + 3, y + 7, { width: COLS[0].w - 6, lineBreak: false });
    cx += COLS[0].w;

    [
      fmt(totals.leadsToday), fmt(totals.calls), fmt(totals.emails), fmt(totals.meetings),
      fmt(totals.followUpsCompleted), fmt(totals.tasks), fmt(totals.dealsCreated),
      fmt(totals.dealsWon), fmt(totals.dealsLost),
      conv(totals.dealsWon, totals.dealsLost), '-',
    ].forEach((v, vi) => {
      const col = COLS[vi + 1];
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.text)
         .text(v, cx + 2, y + 7, { width: col.w - 4, align: 'center', lineBreak: false });
      cx += col.w;
    });
    y += TR + 12;

    // ── REVENUE BANNER ─────────────────────────────────────────────────────────
    if (y + 22 > PH - 44) { doc.addPage(); y = 36; }
    doc.rect(ML, y, CW, 22).fill(C.headBg).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.text)
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
      doc.rect(0, fy, PW, 24).fill(C.headBg).strokeColor(C.border).lineWidth(0.3).stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor(C.lightGray)
         .text('Ccentrik CRM', ML, fy + 8);
      doc.font('Helvetica').fontSize(7.5).fillColor(C.lightGray)
         .text(`Page ${i + 1} of ${range.count}`, 0, fy + 8, { width: PW, align: 'center' });
      doc.font('Helvetica').fontSize(7.5).fillColor(C.lightGray)
         .text('Confidential — Internal Use Only', PW - MR - 160, fy + 8, { width: 160, align: 'right' });
    }

    doc.flushPages();
    doc.end();
  });
}

// ─── Per-employee clean B&W professional DSR PDF ─────────────────────────────
function generateActivityPdf({ employeeData, staff, reportDateLabel, reportType, generatedAt }) {
  return new Promise((resolve, reject) => {
    try {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 }, bufferPages: true, autoFirstPage: true });
    const bufs = [];
    doc.on('data', b => bufs.push(b));
    doc.on('end',  () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    // Layout
    const PW = 595.28, PH = 841.89;
    const ML = 40, MR = 40, CW = PW - ML - MR;
    const HDR_H = 70, FTR_H = 36, CS = HDR_H + 16;

    // B&W Colors
    const BLACK   = '#000000';
    const DARK    = '#0F172A';
    const MED_C   = '#475569';
    const LIGHT_C = '#94A3B8';
    const BG1     = '#F8FAFC';
    const BG2     = '#F1F5F9';
    const WHITE   = '#FFFFFF';
    const BORDER  = '#D1D5DB';

    // Helpers
    const fmtR = v => { const n=Number(v)||0; if(!n) return 'Rs. 0'; if(n>=10000000) return `Rs. ${(n/10000000).toFixed(1)}Cr`; if(n>=100000) return `Rs. ${(n/100000).toFixed(1)}L`; if(n>=1000) return `Rs. ${(n/1000).toFixed(1)}K`; return `Rs. ${n}`; };
    const rlbl = r => r==='owner'?'Super Admin':r==='sales_head'?'Sales Head':r==='inside_sales'?'Inside Sales':(r||'Staff').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    const ts = d => d ? new Date(d).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}) : '-';
    const trunc = (s,n=38) => { const str=String(s||'-'); return str.length>n?str.slice(0,n)+'...':str; };
    const slbl = s => { const l=(s||'').toLowerCase(); if(['done','completed','complete'].includes(l)) return 'Done'; if(['pending','todo'].includes(l)) return 'Pending'; if(l.includes('progress')) return 'In Progress'; return s?s.charAt(0).toUpperCase()+s.slice(1):'-'; };
    const scol = s => { const l=(s||'').toLowerCase(); if(['done','completed','complete'].includes(l)) return DARK; return LIGHT_C; };
    const TYPE_LBL = {call:'Call',phone_call:'Call',outbound_call:'Outbound Call',inbound_call:'Inbound Call',follow_up:'Follow-up',follow_up_call:'F/U Call',follow_up_email:'F/U Email',email:'Email',email_sent:'Email',email_received:'Email',meeting:'Meeting',meeting_virtual:'Virtual Mtg',meeting_person:'In-Person Mtg',virtual_meeting:'Virtual Mtg',in_person:'In-Person Mtg',linkedin_connect:'LinkedIn',linkedin_message:'LinkedIn',linkedin_follow_up:'LinkedIn F/U',note:'Note',task:'Task',task_created:'Task',reminder:'Reminder',whatsapp:'WhatsApp',whatsapp_message:'WhatsApp',whatsapp_follow_up:'WhatsApp F/U',visit:'Client Visit',client_visit:'Client Visit'};
    const tlbl = t => TYPE_LBL[(t||'').toLowerCase().replace(/[-\s]/g,'_')] || (t||'Activity').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    const genStr = new Date(generatedAt||Date.now()).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' IST';
    const rtLabel = (reportType||'Daily').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

    // Page state
    let y = CS;
    let currentEmpName = '';

    // ── Page header (B&W) ─────────────────────────────────────────────────
    const drawHeader = (empName) => {
      doc.rect(0,0,PW,HDR_H).fill(WHITE);
      doc.rect(0,0,PW,HDR_H).strokeColor(BORDER).lineWidth(0.5).stroke();
      doc.rect(0,HDR_H-3,PW,3).fill(BLACK);
      doc.font('Helvetica-Bold').fontSize(17).fillColor(BLACK).text('CCENTRIK',ML,14,{lineBreak:false});
      doc.font('Helvetica').fontSize(8).fillColor(LIGHT_C).text('CRM',ML+79,18,{lineBreak:false});
      doc.font('Helvetica').fontSize(8.5).fillColor(MED_C).text(`${rtLabel} Sales Report`,ML,37,{lineBreak:false});
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(DARK).text(reportDateLabel,PW-MR-200,14,{width:200,align:'right',lineBreak:false});
      if (empName) doc.font('Helvetica').fontSize(8).fillColor(MED_C).text(empName,PW-MR-200,32,{width:200,align:'right',lineBreak:false});
      doc.font('Helvetica').fontSize(7).fillColor(LIGHT_C).text(`Generated: ${genStr}`,PW-MR-200,48,{width:200,align:'right',lineBreak:false});
    };
    drawHeader('');

    // ── Page break check ──────────────────────────────────────────────────
    const nb = (need) => {
      if (y + need > PH - FTR_H - 12) { doc.addPage(); drawHeader(currentEmpName); y = CS; }
    };

    // ── Section heading (B&W) ─────────────────────────────────────────────
    const sh = (title) => {
      nb(34);
      doc.rect(ML,y,4,22).fill(BLACK);
      doc.rect(ML+4,y,CW-4,22).fill(BG1).strokeColor(BORDER).lineWidth(0.4).stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(title.toUpperCase(),ML+14,y+7,{lineBreak:false});
      y += 28;
    };

    // ── KPI card grid (B&W) ───────────────────────────────────────────────
    const kpiGrid = (items, perRow=4) => {
      const gap=5, cardW=(CW-gap*(perRow-1))/perRow, cardH=56;
      let col=0, rowStart=y;
      items.forEach(item => {
        if (col===0) { nb(cardH+gap); rowStart=y; }
        const x = ML+col*(cardW+gap);
        doc.rect(x,rowStart,cardW,cardH).fill(WHITE).strokeColor(BORDER).lineWidth(0.5).stroke();
        doc.rect(x,rowStart,cardW,3).fill(BLACK);
        doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK).text(String(item.value??0),x+8,rowStart+9,{width:cardW-16,lineBreak:false});
        doc.font('Helvetica').fontSize(7).fillColor(MED_C).text(item.label,x+8,rowStart+34,{width:cardW-16,lineBreak:false});
        col++;
        if (col>=perRow) { col=0; y=rowStart+cardH+gap; }
      });
      if (col>0) y = rowStart+cardH+gap;
      y += 6;
    };

    // ── Table (B&W) ───────────────────────────────────────────────────────
    const tbl = (cols, rows, emptyMsg='No data available.') => {
      const totalW = cols.reduce((s,c)=>s+c.w,0);
      const xs=[]; let cx=ML; cols.forEach(c=>{xs.push(cx);cx+=c.w;});
      nb(22);
      doc.rect(ML,y,totalW,22).fill(BLACK);
      cols.forEach((c,i) => doc.font('Helvetica-Bold').fontSize(7.5).fillColor(WHITE).text(c.label,xs[i]+4,y+7,{width:c.w-6,lineBreak:false,align:c.align||'left'}));
      y += 22;
      if (!rows.length) {
        nb(28);
        doc.rect(ML,y,totalW,28).fill(BG1).strokeColor(BORDER).lineWidth(0.4).stroke();
        doc.font('Helvetica').fontSize(8.5).fillColor(LIGHT_C).text(emptyMsg,ML,y+9,{width:totalW,align:'center',lineBreak:false});
        y += 34; return;
      }
      rows.forEach((row,ri) => {
        nb(20);
        doc.rect(ML,y,totalW,20).fill(ri%2===0?WHITE:BG1).strokeColor(BORDER).lineWidth(0.3).stroke();
        cols.forEach((c,i) => {
          const raw = typeof c.key==='function' ? c.key(row,ri) : (row[c.key]??'-');
          const val = trunc(raw, c.max||40);
          const color = c.color ? c.color(row) : DARK;
          doc.font(c.bold?'Helvetica-Bold':'Helvetica').fontSize(7.5).fillColor(color).text(String(val),xs[i]+4,y+6,{width:c.w-6,lineBreak:false,align:c.align||'left'});
        });
        y += 20;
      });
      y += 8;
    };

    // ─── PER-EMPLOYEE LOOP ────────────────────────────────────────────────
    const effectiveStaff = (staff||[]).filter(s=>employeeData[s.id]);
    if (!effectiveStaff.length) {
      doc.font('Helvetica').fontSize(12).fillColor(LIGHT_C).text('No employee data available.',ML,CS+40,{width:CW,align:'center'});
      doc.flushPages(); doc.end(); return;
    }
    for (let empIdx=0; empIdx<effectiveStaff.length; empIdx++) {
      const s = effectiveStaff[empIdx];
      const { activities=[], newLeads=[], leadMap={}, stats={}, cat={} } = employeeData[s.id]||{};
      currentEmpName = s.full_name||s.email||'Employee';

      if (empIdx > 0) { doc.addPage(); y = CS; }
      drawHeader(currentEmpName);
      y = CS;

      // ── Employee identity card (B&W) ──────────────────────────────────
      nb(70);
      doc.rect(ML,y,CW,62).fill(BG2).strokeColor(BORDER).lineWidth(0.7).stroke();
      doc.rect(ML,y,4,62).fill(BLACK);
      doc.circle(ML+36,y+31,20).fill(BLACK);
      doc.font('Helvetica-Bold').fontSize(15).fillColor(WHITE).text(currentEmpName.charAt(0).toUpperCase(),ML+28,y+20,{lineBreak:false});
      doc.font('Helvetica-Bold').fontSize(13).fillColor(DARK).text(currentEmpName,ML+66,y+8,{lineBreak:false});
      doc.font('Helvetica').fontSize(8.5).fillColor(MED_C).text(rlbl(s.role),ML+66,y+26,{lineBreak:false});
      doc.font('Helvetica').fontSize(8).fillColor(LIGHT_C).text(s.email||'',ML+66,y+42,{lineBreak:false});
      doc.font('Helvetica-Bold').fontSize(22).fillColor(DARK).text(String(stats.total||0),PW-MR-130,y+6,{width:80,align:'right',lineBreak:false});
      doc.font('Helvetica').fontSize(7.5).fillColor(MED_C).text('Total Activities',PW-MR-130,y+32,{width:80,align:'right',lineBreak:false});
      doc.font('Helvetica-Bold').fontSize(13).fillColor(MED_C).text(`${stats.efficiency||0}%`,PW-MR-44,y+6,{width:44,align:'right',lineBreak:false});
      doc.font('Helvetica').fontSize(7).fillColor(LIGHT_C).text('Score',PW-MR-44,y+26,{width:44,align:'right',lineBreak:false});
      y += 70;

      // ── 1. Executive Summary ─────────────────────────────────────────────
      sh('Executive Summary');
      kpiGrid([
        {label:'Total Activities',   value:stats.total||0          },
        {label:'Calls',              value:stats.calls||0          },
        {label:'Follow-ups',         value:stats.followUps||0      },
        {label:'Emails',             value:stats.emails||0         },
        {label:'LinkedIn',           value:stats.linkedin||0       },
        {label:'Meetings',           value:stats.meetings||0       },
        {label:'Tasks',              value:stats.tasks||0          },
        {label:'Notes',              value:stats.notes||0          },
        {label:'New Leads',          value:stats.newLeads||0       },
        {label:'Revenue Won',        value:fmtR(stats.revenue)     },
        {label:'Productivity Score', value:`${stats.efficiency||0}%`},
      ], 4);

      // ── 2. Daily Summary ─────────────────────────────────────────────────
      sh('Daily Summary');
      nb(60);
      const parts=[];
      if (stats.calls>0)     parts.push(`${stats.calls} call${stats.calls!==1?'s':''}`);
      if (stats.emails>0)    parts.push(`${stats.emails} email${stats.emails!==1?'s':''}`);
      if (stats.meetings>0)  parts.push(`${stats.meetings} meeting${stats.meetings!==1?'s':''}`);
      if (stats.followUps>0) parts.push(`${stats.followUps} follow-up${stats.followUps!==1?'s':''}`);
      if (stats.linkedin>0)  parts.push(`${stats.linkedin} LinkedIn interaction${stats.linkedin!==1?'s':''}`);
      if (stats.tasks>0)     parts.push(`${stats.tasks} task${stats.tasks!==1?'s':''}`);
      if (stats.notes>0)     parts.push(`${stats.notes} note${stats.notes!==1?'s':''}`);
      let summary = `${currentEmpName} completed ${stats.completed||0} of ${stats.total||0} activities (${stats.efficiency||0}% productivity) during the ${rtLabel.toLowerCase()} period: ${reportDateLabel}.`;
      if (parts.length) summary += ` Activities included ${parts.join(', ')}.`;
      if (stats.newLeads>0) summary += ` ${stats.newLeads} new lead${stats.newLeads!==1?'s':''} added.`;
      if (stats.dealsWon>0) summary += ` ${stats.dealsWon} deal${stats.dealsWon!==1?'s':''} won worth ${fmtR(stats.revenue)}.`;
      if (stats.pending>0) summary += ` ${stats.pending} activit${stats.pending!==1?'ies':'y'} remain pending.`;
      doc.font('Helvetica').fontSize(9.5).fillColor(DARK).text(summary, ML+8, y+4, {width:CW-16,lineBreak:true,lineGap:2});
      y = doc.y + 14;

      // ── 3. Activity Timeline ─────────────────────────────────────────────
      sh('Activity Timeline');
      const descW = CW - 52 - 100 - 140 - 72;
      tbl(
        [
          {label:'Time',           key:a=>ts(a.created_at),                                     w:52 },
          {label:'Activity Type',  key:a=>tlbl(a.type),                                         w:100},
          {label:'Lead / Company', key:a=>{ const l=leadMap[a.lead_id]; return l?(l.full_name||l.company||'-'):'-'; }, w:140, max:28},
          {label:'Description',    key:a=>trunc(a.title||a.description||'',35),                 w:descW},
          {label:'Status',         key:a=>slbl(a.status), w:72, color:a=>scol(a.status), bold:true},
        ],
        activities,
        'No activities recorded for this period.'
      );

      // ── 4. Lead Summary ──────────────────────────────────────────────────
      sh('Lead Summary');
      const allLeads = [...new Map(
        (activities||[]).filter(a=>a.lead_id&&leadMap[a.lead_id]).map(a=>[a.lead_id,leadMap[a.lead_id]])
      ).values()];
      if (allLeads.length) {
        tbl(
          [
            {label:'Company', key:l=>l.company||'-',                                              w:140, max:26},
            {label:'Contact', key:l=>l.full_name||'-',                                            w:120, max:22},
            {label:'Stage',   key:l=>(l.stage||'-').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()), w:100, max:18},
            {label:'Status',  key:l=>(l.status||'-').replace(/\b\w/g,c=>c.toUpperCase()),         w:90, max:16},
            {label:'Email',   key:l=>l.email||'-',                                                w:CW-140-120-100-90, max:24},
          ],
          allLeads
        );
      } else {
        nb(34);
        doc.rect(ML,y,CW,32).fill(BG1).strokeColor(BORDER).lineWidth(0.4).stroke();
        doc.font('Helvetica').fontSize(9).fillColor(LIGHT_C).text('No Leads Available',ML,y+11,{width:CW,align:'center',lineBreak:false});
        y += 40;
      }

      // ── 5. Communication Summary ─────────────────────────────────────────
      sh('Communication Summary');
      kpiGrid([
        {label:'Calls',      value:stats.calls||0   },
        {label:'Emails',     value:stats.emails||0  },
        {label:'LinkedIn',   value:stats.linkedin||0},
        {label:'Meetings',   value:stats.meetings||0},
        {label:'Follow-ups', value:stats.followUps||0},
        {label:'Notes',      value:stats.notes||0   },
        {label:'Tasks',      value:stats.tasks||0   },
        {label:'WhatsApp',   value:stats.whatsapp||0},
      ], 4);

      // ── 6. Performance Summary ───────────────────────────────────────────
      sh('Performance Summary');
      const fuRate = stats.total>0 ? Math.round(((stats.followUps||0)/stats.total)*100) : 0;
      kpiGrid([
        {label:'Completed Activities', value:stats.completed||0        },
        {label:'Pending Activities',   value:stats.pending||0          },
        {label:'Overdue',              value:stats.overdue||0          },
        {label:'Follow-up Rate',       value:`${fuRate}%`              },
        {label:'Conversion Rate',      value:`${stats.convRate||0}%`   },
        {label:'Productivity Score',   value:`${stats.efficiency||0}%` },
      ], 3);

      y += 8;
    }

    // ── Footer on every page ─────────────────────────────────────────────────
    doc.flushPages();
    const range = doc.bufferedPageRange();
    for (let i=0; i<range.count; i++) {
      doc.switchToPage(range.start+i);
      const fy = PH - FTR_H;
      doc.rect(0,fy,PW,FTR_H).fill(BG1).strokeColor(BORDER).lineWidth(0.3).stroke();
      doc.rect(0,fy,PW,1).fill(BLACK);
      doc.font('Helvetica').fontSize(7.5).fillColor(LIGHT_C).text('Generated by Ccentrik CRM  |  Employee-Wise Daily Sales Report',ML,fy+8,{lineBreak:false});
      doc.font('Helvetica').fontSize(7).fillColor(LIGHT_C).text(`Generated: ${genStr}`,ML,fy+20,{lineBreak:false});
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(`Page ${i+1} of ${range.count}`,PW-MR-80,fy+11,{width:80,align:'right',lineBreak:false});
    }
    doc.end();
    } catch(err) { reject(err); }
  });
}

module.exports = { generateDSRPdf, generateActivityPdf };
