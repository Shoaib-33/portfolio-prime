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
