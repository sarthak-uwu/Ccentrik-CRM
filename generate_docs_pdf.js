const fs   = require('fs');
const path = require('path');
const PDFDocument = require('./backend/node_modules/pdfkit');
const { marked }  = require('./backend/node_modules/marked');

const mdPath  = path.join(__dirname, 'CCENTRIK_CRM_DOCUMENTATION.md');
const outPath = path.join(__dirname, 'CCENTRIK_CRM_DOCUMENTATION.pdf');

const mdText = fs.readFileSync(mdPath, 'utf8');
const tokens = marked.lexer(mdText);

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 55, bottom: 55, left: 58, right: 58 },
  bufferPages: true,
  info: {
    Title:   'Ccentrik CRM — Complete Project Documentation',
    Author:  'Ccentrik Development Team',
    Subject: 'CRM Project Documentation',
  },
});

const outStream = fs.createWriteStream(outPath);
doc.pipe(outStream);

// ── Constants ─────────────────────────────────────────────────────────────────
const BRAND   = '#1E3A5F';
const ACCENT  = '#2563EB';
const GREY    = '#64748B';
const WHITE   = '#FFFFFF';
const BLACK   = '#1E293B';
const GREEN   = '#166534';
const RED_C   = '#991B1B';
const PAGE_W  = 595 - 116;

// ── Cover Page ────────────────────────────────────────────────────────────────
doc.rect(0, 0, 595, 842).fill(BRAND);
doc.rect(0, 660, 595, 182).fill('#0F2647');

doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(34)
   .text('Ccentrik CRM', 58, 220, { align: 'center', width: 479 });

doc.fillColor('#93C5FD').fontSize(18).font('Helvetica')
   .text('Complete Project Documentation', 58, 268, { align: 'center', width: 479 });

doc.rect(170, 308, 255, 2).fill(ACCENT);

doc.fillColor(WHITE).fontSize(12).font('Helvetica')
   .text('Version 1.0', 58, 322, { align: 'center', width: 479 })
   .text('Prepared: June 2026', 58, 342, { align: 'center', width: 479 })
   .text('Ccentrik Development Team', 58, 362, { align: 'center', width: 479 });

doc.fillColor('#93C5FD').fontSize(9)
   .text('CONFIDENTIAL — INTERNAL USE ONLY', 58, 700, { align: 'center', width: 479 });

// ── Content Pages ─────────────────────────────────────────────────────────────
doc.addPage();

// thin top accent bar on every content page is applied after via bufferPages
function checkSpace(needed) {
  if (doc.y + needed > 775) doc.addPage();
}

function stripInline(text) {
  return (text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g,     '$1')
    .replace(/`(.+?)`/g,       '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g,  '<')
    .replace(/&gt;/g,  '>');
}

// ── Heading ───────────────────────────────────────────────────────────────────
function renderHeading(token) {
  const text  = stripInline(token.text);
  const depth = token.depth;

  if (depth === 1) {
    checkSpace(70);
    doc.moveDown(0.6);
    doc.save().rect(58, doc.y, PAGE_W, 38).fill(BRAND).restore();
    doc.font('Helvetica-Bold').fontSize(17).fillColor(WHITE)
       .text(text, 68, doc.y + 10, { width: PAGE_W - 20 });
    doc.moveDown(0.7);
    return;
  }
  if (depth === 2) {
    checkSpace(50);
    doc.moveDown(0.7);
    doc.save().rect(58, doc.y, 4, 20).fill(ACCENT).restore();
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND)
       .text(text, 70, doc.y + 2, { width: PAGE_W - 14 });
    doc.save()
       .moveTo(58, doc.y + 1).lineTo(58 + PAGE_W, doc.y + 1)
       .strokeColor('#CBD5E1').lineWidth(0.5).stroke().restore();
    doc.moveDown(0.55);
    return;
  }
  if (depth === 3) {
    checkSpace(35);
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(ACCENT)
       .text(text, 58, doc.y, { width: PAGE_W });
    doc.moveDown(0.3);
    return;
  }
  checkSpace(25);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(BLACK)
     .text(text, 58, doc.y, { width: PAGE_W });
  doc.moveDown(0.25);
}

// ── Paragraph ─────────────────────────────────────────────────────────────────
function renderParagraph(token) {
  const raw  = token.text || '';
  const text = stripInline(raw);
  if (!text.trim()) return;
  checkSpace(22);
  doc.font('Helvetica').fontSize(9.8).fillColor(BLACK)
     .text(text, 58, doc.y, { width: PAGE_W, align: 'justify' });
  doc.moveDown(0.4);
}

// ── List ──────────────────────────────────────────────────────────────────────
function renderList(token, indent) {
  indent = indent || 0;
  const ordered = token.ordered;
  (token.items || []).forEach((item, idx) => {
    const bullet   = ordered ? `${idx + 1}.` : '•';
    const rawText  = item.tokens && item.tokens[0]
      ? (item.tokens[0].text || item.tokens[0].raw || '')
      : (item.text || item.raw || '');
    const text = stripInline(rawText);
    checkSpace(16);

    const lx = 58 + indent * 14;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(ACCENT)
       .text(bullet, lx, doc.y, { continued: true, width: 14 });
    doc.font('Helvetica').fillColor(BLACK)
       .text(' ' + text, { width: PAGE_W - 16 - indent * 14 });

    if (item.items && item.items.length) {
      renderList({ ordered: false, items: item.items }, indent + 1);
    }
  });
  doc.moveDown(0.2);
}

// ── Code Block ────────────────────────────────────────────────────────────────
function renderCode(token) {
  const lines  = (token.text || '').split('\n');
  const lineH  = 12;
  const pad    = 10;
  const blockH = lines.length * lineH + pad * 2;

  checkSpace(blockH + 10);
  const sy = doc.y + 6;
  doc.save().rect(58, sy, PAGE_W, blockH).fill('#0F172A').restore();

  lines.forEach((line, i) => {
    doc.font('Courier').fontSize(7.8).fillColor('#94A3B8')
       .text(line || ' ', 58 + pad, sy + pad + i * lineH,
             { width: PAGE_W - pad * 2, lineBreak: false });
  });
  doc.y = sy + blockH + 10;
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable(token) {
  const headers  = (token.header || []).map(h => stripInline(h.text));
  const rows     = (token.rows   || []).map(r => r.map(c => stripInline(c.text)));
  const colCount = headers.length;

  // Give first column more space if it looks like a label column
  let colWidths;
  if (colCount === 2) {
    colWidths = [PAGE_W * 0.38, PAGE_W * 0.62];
  } else if (colCount === 3) {
    colWidths = [PAGE_W * 0.28, PAGE_W * 0.32, PAGE_W * 0.40];
  } else {
    const w = PAGE_W / colCount;
    colWidths = Array(colCount).fill(w);
  }

  const fontSize = colCount > 5 ? 7 : (colCount > 4 ? 7.8 : 9);
  const headH    = 24;
  const rowH     = 20;

  checkSpace(headH + Math.min(rows.length, 4) * rowH + 14);

  const sx = 58;
  let y = doc.y + 8;

  // header
  doc.save().rect(sx, y, PAGE_W, headH).fill(BRAND).restore();
  let hx = sx;
  headers.forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(WHITE)
       .text(h, hx + 4, y + 6, { width: colWidths[i] - 8, lineBreak: false });
    hx += colWidths[i];
  });
  y += headH;

  rows.forEach((row, ri) => {
    const neededH = rowH;
    if (y + neededH > 775) {
      doc.addPage();
      y = doc.y;
      // re-draw mini-header
      doc.save().rect(sx, y, PAGE_W, headH - 4).fill(BRAND).restore();
      let hx2 = sx;
      headers.forEach((h, i) => {
        doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(WHITE)
           .text(h, hx2 + 4, y + 5, { width: colWidths[i] - 8, lineBreak: false });
        hx2 += colWidths[i];
      });
      y += headH - 4;
    }

    const bg = ri % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
    doc.save().rect(sx, y, PAGE_W, rowH).fill(bg).restore();

    let cx = sx;
    row.forEach((cell, ci) => {
      let colour = BLACK;
      const lc = cell.toLowerCase();
      if (lc === 'yes' || lc === 'live' || lc === '**live**') colour = GREEN;
      else if (lc === 'no')                                    colour = RED_C;
      else if (lc === 'planned' || lc === 'in development')   colour = GREY;

      doc.font('Helvetica').fontSize(fontSize).fillColor(colour)
         .text(cell, cx + 4, y + 5, { width: colWidths[ci] - 8, lineBreak: false });
      cx += colWidths[ci];
    });

    doc.save()
       .moveTo(sx, y + rowH).lineTo(sx + PAGE_W, y + rowH)
       .strokeColor('#E2E8F0').lineWidth(0.4).stroke().restore();
    y += rowH;
  });

  // outer border
  doc.save().rect(sx, doc.y + 8, PAGE_W, y - doc.y - 8)
     .strokeColor('#CBD5E1').lineWidth(0.8).stroke().restore();

  doc.y = y + 12;
}

// ── HR ────────────────────────────────────────────────────────────────────────
function renderHR() {
  doc.moveDown(0.3);
  doc.save()
     .moveTo(58, doc.y).lineTo(58 + PAGE_W, doc.y)
     .strokeColor('#CBD5E1').lineWidth(0.8).stroke().restore();
  doc.moveDown(0.5);
}

// ── Main render loop ──────────────────────────────────────────────────────────
tokens.forEach(token => {
  switch (token.type) {
    case 'heading':   renderHeading(token);   break;
    case 'paragraph': renderParagraph(token); break;
    case 'table':     renderTable(token);     break;
    case 'code':      renderCode(token);      break;
    case 'list':      renderList(token);      break;
    case 'hr':        renderHR();             break;
    case 'space':     doc.moveDown(0.3);      break;
    default: break;
  }
});

// ── Page numbers & top accent bars (via bufferPages) ─────────────────────────
const totalPages = doc.bufferedPageRange();
for (let i = 0; i < totalPages.count; i++) {
  doc.switchToPage(totalPages.start + i);

  if (i === 0) continue; // skip cover

  // top accent bar
  doc.save().rect(0, 0, 595, 6).fill(BRAND).restore();

  // footer page number
  const pageLabel = `Page ${i} of ${totalPages.count - 1}`;
  doc.font('Helvetica').fontSize(8).fillColor(GREY)
     .text(pageLabel, 58, 820, { align: 'right', width: PAGE_W });

  // footer brand name
  doc.font('Helvetica').fontSize(8).fillColor(GREY)
     .text('Ccentrik CRM — Project Documentation', 58, 820, { align: 'left', width: PAGE_W });
}

doc.flushPages();
doc.end();

outStream.on('finish', () => console.log('PDF ready:', outPath));
outStream.on('error',  e  => console.error('Error:', e));
