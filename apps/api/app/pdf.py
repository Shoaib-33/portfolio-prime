"""PDFs: sample data-room documents, the investment-committee memo, and the per-viewer watermark (name, email, time)."""
from __future__ import annotations
import io, unicodedata
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

A4 = (595, 842)
NAVY, GREY, BRASS, RUST, INK = Color(0.09, 0.18, 0.2), Color(0.35, 0.38, 0.36), Color(0.42, 0.3, 0.16), Color(0.6, 0.3, 0.2), Color(0.13, 0.2, 0.2)


def safe(s: str) -> str:
    """Standard PDF fonts only cover Latin-1 (plus a few symbols); replace anything else so stamping never fails."""
    s = unicodedata.normalize('NFKD', str(s))
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace('€', 'EUR ').replace('–', '-').replace('—', '-').replace('·', '-').replace('’', "'").replace('“', '"').replace('”', '"').replace('›', '>').replace('₂', '2').replace('≤', '<=')
    return ''.join(ch if 32 <= ord(ch) <= 255 else '?' for ch in s)


def _wrap(c: canvas.Canvas, text: str, font: str, size: float, x: float, y: float, width: float, color=INK, need=None) -> float:
    c.setFont(font, size); c.setFillColor(color); line = ''
    for w in safe(text).split(' '):
        if line and stringWidth(line + w, font, size) > width:
            if need: y = need(size + 5)
            c.setFont(font, size); c.setFillColor(color); c.drawString(x, y, line.rstrip()); y -= size + 5; line = ''
        line += w + ' '
    if line.strip():
        if need: y = need(size + 5)
        c.setFont(font, size); c.setFillColor(color); c.drawString(x, y, line.rstrip()); y -= size + 5
    return y


def sample_pdf(title: str, subtitle: str, paragraphs: list[str]) -> bytes:
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4)
    c.setFont('Helvetica-Bold', 9); c.setFillColor(Color(0.42, 0.45, 0.43)); c.drawString(50, 790, 'PORTFOLIO & PRIME - DATA ROOM')
    c.setFont('Helvetica-Bold', 20); c.setFillColor(NAVY); c.drawString(50, 755, safe(title))
    c.setFont('Helvetica', 11); c.setFillColor(GREY); c.drawString(50, 732, safe(subtitle))
    y = 690
    for p in paragraphs:
        y = _wrap(c, p, 'Helvetica', 11, 50, y, 495, Color(0, 0, 0)) - 13
    c.setFont('Helvetica', 8); c.setFillColor(RUST); c.drawString(50, 50, 'Fictional demonstration document. Not a legal, technical or financial document.')
    c.save(); return buf.getvalue()


def memo_pdf(title: str, subtitle: str, sections: list[dict], footer: str) -> bytes:
    """Multi-page document: sections of headings, paragraphs and "- " bullets, wrapped and paginated."""
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4); state = {'y': 760.0}

    def header():
        c.setFont('Helvetica-Bold', 8); c.setFillColor(Color(0.42, 0.45, 0.43)); c.drawString(50, 800, 'PORTFOLIO & PRIME - INVESTMENT COMMITTEE MEMO - DRAFT')

    def foot():
        c.setFont('Helvetica', 7); c.setFillColor(RUST); c.drawString(50, 40, safe(footer)[:150])

    def need(h: float) -> float:
        if state['y'] - h < 70:
            foot(); c.showPage(); header(); state['y'] = 770.0
        return state['y']

    def wrap(text, font, size, x, width, color=INK):
        c.setFont(font, size); line = ''
        for w in safe(text).split(' '):
            if line and stringWidth(line + w, font, size) > width:
                need(size + 5); c.setFont(font, size); c.setFillColor(color); c.drawString(x, state['y'], line.rstrip()); state['y'] -= size + 5; line = ''
            line += w + ' '
        if line.strip():
            need(size + 5); c.setFont(font, size); c.setFillColor(color); c.drawString(x, state['y'], line.rstrip()); state['y'] -= size + 5

    header(); wrap(title, 'Helvetica-Bold', 22, 50, 495, NAVY); state['y'] -= 4; wrap(subtitle, 'Helvetica', 10.5, 50, 495, GREY); state['y'] -= 14
    for s in sections:
        need(40); state['y'] -= 6; wrap(s['heading'].upper(), 'Helvetica-Bold', 10, 50, 495, BRASS); state['y'] -= 3
        for l in s['lines']:
            b = l.startswith('- ')
            if b:
                need(14); c.setFont('Helvetica', 10); c.setFillColor(INK); c.drawString(54, state['y'], '-')
            wrap(l[2:] if b else l, 'Helvetica', 10, 66 if b else 50, 479 if b else 495); state['y'] -= 3
        state['y'] -= 6
    foot(); c.save(); return buf.getvalue()


def watermark(pdf: bytes, text: str) -> bytes:
    """Dynamic watermark on every page (plan: name, email, date), applied on the server for each view."""
    reader = PdfReader(io.BytesIO(pdf)); writer = PdfWriter(); t = safe(text)
    for page in reader.pages:
        w, h = float(page.mediabox.width), float(page.mediabox.height)
        buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=(w, h))
        c.saveState(); c.setFillColor(Color(0.64, 0.27, 0.2, alpha=0.18)); c.setFont('Helvetica-Bold', 11)
        y = -100
        while y < h + 100:
            x = -200
            while x < w:
                c.saveState(); c.translate(x, y); c.rotate(28); c.drawString(0, 0, t); c.restoreState(); x += 330
            y += 120
        c.restoreState(); c.setFillColor(Color(0.64, 0.27, 0.2)); c.setFont('Helvetica-Bold', 8); c.drawString(50, 25, t); c.save()
        page.merge_page(PdfReader(io.BytesIO(buf.getvalue())).pages[0]); writer.add_page(page)
    out = io.BytesIO(); writer.write(out); return out.getvalue()
