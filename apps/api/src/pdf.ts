import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
/* Standard PDF fonts only support WinAnsi characters; replace anything else so stamping never fails. */
const safe = (s: string) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E -ÿ€–—·]/g, '?');
export async function samplePdf(title: string, subtitle: string, paragraphs: string[]) {
  const doc = await PDFDocument.create(); const page = doc.addPage([595, 842]); const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText('PORTFOLIO & PRIME · DATA ROOM', { x: 50, y: 790, size: 9, font: fb, color: rgb(0.42, 0.45, 0.43) });
  page.drawText(safe(title), { x: 50, y: 755, size: 20, font: fb, color: rgb(0.09, 0.18, 0.2) });
  page.drawText(safe(subtitle), { x: 50, y: 732, size: 11, font: f, color: rgb(0.35, 0.38, 0.36) });
  let y = 690;
  for (const p of paragraphs) { const words = safe(p).split(' '); let line = ''; for (const w of words) { if (f.widthOfTextAtSize(line + w, 11) > 495) { page.drawText(line, { x: 50, y, size: 11, font: f }); y -= 17; line = ''; } line += w + ' '; } page.drawText(line, { x: 50, y, size: 11, font: f }); y -= 30; }
  page.drawText('Fictional demonstration document. Not a legal, technical or financial document.', { x: 50, y: 50, size: 8, font: f, color: rgb(0.6, 0.3, 0.2) });
  return Buffer.from(await doc.save());
}
/** Multi-page document (investment committee memo): sections of headings, paragraphs and "- " bullets, wrapped and paginated. */
export async function memoPdf(title: string, subtitle: string, sections: { heading: string; lines: string[] }[], footer: string) {
  const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]); let y = 760;
  const header = () => page.drawText('PORTFOLIO & PRIME · INVESTMENT COMMITTEE MEMO · DRAFT', { x: 50, y: 800, size: 8, font: fb, color: rgb(0.42, 0.45, 0.43) });
  const need = (h: number) => { if (y - h < 70) { page.drawText(safe(footer), { x: 50, y: 40, size: 7, font: f, color: rgb(0.6, 0.3, 0.2) }); page = doc.addPage([595, 842]); header(); y = 770; } };
  const wrap = (text: string, font: any, size: number, x: number, width: number, color = rgb(0.13, 0.2, 0.2)) => { const words = safe(text).split(' '); let line = ''; for (const w of words) { if (font.widthOfTextAtSize(line + w, size) > width && line) { need(size + 5); page.drawText(line, { x, y, size, font, color }); y -= size + 5; line = ''; } line += w + ' '; } if (line.trim()) { need(size + 5); page.drawText(line, { x, y, size, font, color }); y -= size + 5; } };
  header(); wrap(title, fb, 22, 50, 495, rgb(0.09, 0.18, 0.2)); y -= 4; wrap(subtitle, f, 10.5, 50, 495, rgb(0.35, 0.38, 0.36)); y -= 14;
  for (const s of sections) { need(40); y -= 6; wrap(s.heading.toUpperCase(), fb, 10, 50, 495, rgb(0.42, 0.3, 0.16)); y -= 3;
    for (const l of s.lines) { const b = l.startsWith('- '); if (b) { need(14); page.drawText('•', { x: 54, y, size: 10, font: f }); } wrap(b ? l.slice(2) : l, f, 10, b ? 66 : 50, b ? 479 : 495); y -= 3; } y -= 6; }
  page.drawText(safe(footer), { x: 50, y: 40, size: 7, font: f, color: rgb(0.6, 0.3, 0.2) });
  return Buffer.from(await doc.save());
}
/** Dynamic watermark on every page (plan: name, email, date), applied on the server for each view. */
export async function watermark(bytes: Buffer, text: string) {
  const doc = await PDFDocument.load(bytes); const f = await doc.embedFont(StandardFonts.HelveticaBold); const t = safe(text);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    for (let y = -100; y < height + 100; y += 120) for (let x = -200; x < width; x += 330) page.drawText(t, { x, y, size: 11, font: f, color: rgb(0.64, 0.27, 0.2), opacity: 0.18, rotate: degrees(28) });
    page.drawText(t, { x: 50, y: 25, size: 8, font: f, color: rgb(0.64, 0.27, 0.2) });
  }
  return Buffer.from(await doc.save());
}
