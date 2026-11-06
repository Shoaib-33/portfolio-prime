"""Generates apps/web/app/theme-dark.css: a dark re-colouring of the member area (admin, account, listings, ...).

It reads the existing light stylesheets, keeps every selector, and re-emits only the declarations that carry a colour,
with that colour mapped into the dark palette of the visitor pages (charcoal, warm off-white, coral accent).
Loaded after those stylesheets, it wins on equal specificity; remove its import in app/layout.tsx to go back.

Run after changing any of the source stylesheets:  python scripts/build-dark-theme.py
"""
import colorsys, re, sys
from pathlib import Path
import tinycss2

WEB = Path(__file__).resolve().parent.parent / 'apps' / 'web' / 'app'
SOURCES = ['globals.css', 'web.css', 'access.css', 'buyers.css', 'polish.css', 'motion.css']
OUT = WEB / 'theme-dark.css'

# ---------- palette ----------
BG, CARD, RAISED, BAND = (14, 14, 13), (22, 22, 21), (30, 30, 28), (10, 10, 9)
FG, TEXT, MUTED = (237, 233, 226), (203, 198, 188), (163, 158, 148)   # secondary text lifted for readability
ACCENT, ACCENT_TEXT = (228, 87, 59), (236, 128, 104)
LINE = 'rgba(237,233,226,.12)'
LINE_STRONG = 'rgba(237,233,226,.3)'

def hexrgb(h):
    h = h.lstrip('#')
    if len(h) in (3, 4): h = ''.join(c * 2 for c in h)
    a = int(h[6:8], 16) / 255 if len(h) == 8 else None
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)), a

def hls(rgb): return colorsys.rgb_to_hls(*(c / 255 for c in rgb))
def from_hls(h, l, s): return tuple(round(c * 255) for c in colorsys.hls_to_rgb(h, max(0, min(1, l)), max(0, min(1, s))))
def is_bronze(h, s): return 0.04 <= h <= 0.13 and s > 0.25
def css(rgb, a=None): return f'rgb({rgb[0]} {rgb[1]} {rgb[2]})' if a is None else f'rgb({rgb[0]} {rgb[1]} {rgb[2]} / {round(a, 3)})'

ACTIVE = re.compile(r'btn|button|\.on\b|active|pressed|checked|selected|current|primary|cta|send|submit', re.I)

def map_bg(rgb, sel):
    h, l, s = hls(rgb)
    if l >= 0.75:                                   # light surfaces → dark surfaces (white stays a step above the page)
        if s > 0.25 and l < 0.93 and not is_bronze(h, s): return from_hls(h, 0.15, min(s, 0.4) * 0.6)   # status pills keep a hint of hue
        return CARD if l >= 0.985 else RAISED if l < 0.9 else BG if l >= 0.965 else CARD
    if is_bronze(h, s) and l >= 0.3: return ACCENT if ACTIVE.search(sel) else RAISED
    if l < 0.3: return ACCENT if ACTIVE.search(sel) and s > 0.05 else BAND   # navy bands/buttons
    return from_hls(h, min(l, 0.42), s * 0.85)      # status colours (green, red) stay recognisable

def map_text(rgb):
    h, l, s = hls(rgb)
    if l >= 0.8: return rgb                          # already light (it sat on a dark band)
    if l < 0.22: return FG                           # ink and navy text, even when slightly tinted
    if is_bronze(h, s): return ACCENT_TEXT
    if s > 0.18 and l < 0.75: return from_hls(h, 0.68, min(s, 0.55))   # status colours, lifted for contrast
    return FG if l < 0.25 else TEXT if l < 0.5 else MUTED

def map_border(rgb, sel):
    h, l, s = hls(rgb)
    if is_bronze(h, s): return ACCENT if l < 0.75 else from_hls(h, 0.3, 0.35)
    if l >= 0.65: return None if s < 0.2 else from_hls(h, 0.24, 0.3)   # None → hairline
    if l < 0.3: return 'strong'
    return from_hls(h, 0.55, s)

KIND = {'background': 'bg', 'background-color': 'bg', 'background-image': 'bg',
        'color': 'text', 'fill': 'text', 'stroke': 'text', 'caret-color': 'text', '-webkit-text-stroke': 'text', 'text-decoration-color': 'text', 'accent-color': 'accent',
        'outline': 'accent', 'outline-color': 'accent', 'box-shadow': 'shadow', 'column-rule': 'border'}
def kind_of(name):
    if name in KIND: return KIND[name]
    if name.startswith('border') and 'radius' not in name and 'width' not in name and 'style' not in name and 'collapse' not in name and 'spacing' not in name: return 'border'
    return None

TOKENS = {}
COLOR_RE = re.compile(r'#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b|var\(--[\w-]+\)')

def parse_color(tok):
    if tok.startswith('var('):
        v = TOKENS.get(tok[4:-1].strip().lstrip('-').split(',')[0])
        return parse_color(v) if v and COLOR_RE.fullmatch(v) else (None, None)
    if tok == 'white': return (255, 255, 255), None
    if tok == 'black': return (0, 0, 0), None
    if tok.startswith('#'): return hexrgb(tok)
    nums = re.findall(r'[\d.]+%?', tok)
    if len(nums) < 3: return None, None
    rgb = tuple(int(float(n)) for n in nums[:3]); a = nums[3] if len(nums) > 3 else None
    if a is not None: a = float(a[:-1]) / 100 if a.endswith('%') else float(a)
    return rgb, a

def remap_value(name, value, sel):
    kind = kind_of(name)
    if not kind: return None
    changed = False
    def sub(m):
        nonlocal changed
        tok = m.group(0); rgb, a = parse_color(tok)
        if rgb is None: return tok
        if kind == 'shadow':
            if hls(rgb)[1] < 0.3: return tok                                   # real shadows stay shadows
            nb = map_border(rgb, sel); changed = True
            return LINE if nb is None else (LINE_STRONG if nb == 'strong' else css(nb, a))
        if kind == 'accent': changed = True; return css(ACCENT, a)
        if kind == 'text': out = map_text(rgb)
        elif kind == 'bg':
            if a is not None and a < 0.2 and hls(rgb)[1] > 0.9: changed = True; return f'rgb(237 233 226 / {round(a, 3)})'   # faint white wash
            out = map_bg(rgb, sel)
        else:
            nb = map_border(rgb, sel); changed = True
            if nb is None: return LINE
            if nb == 'strong': return LINE_STRONG
            out = nb
        changed = True; return css(out, a)
    new = COLOR_RE.sub(sub, value)
    # colours inside data-URI SVG icons (%23rrggbb) behave like text colours
    def sub_uri(m):
        nonlocal changed
        rgb, _ = hexrgb(m.group(1)); out = map_text(rgb) if kind != 'bg' or hls(rgb)[1] < 0.8 else CARD
        changed = True; return '%23' + ''.join(f'{c:02x}' for c in out)
    if 'url(' in new: new = re.sub(r'%23([0-9a-fA-F]{6})', sub_uri, new)
    return new if changed else None

DARK = 'html[data-theme=dark]'
def scope(sel):
    """Applies a rule only in dark mode: prefixes every selector in the list with html[data-theme=dark]."""
    out = []
    for part in sel.split(','):
        part = part.strip()
        if part.startswith(':root'): out.append(DARK + part[5:])
        elif re.match(r'html(?![\w-])', part): out.append(DARK + part[4:])
        else: out.append(f'{DARK} {part}')
    return ','.join(out)

def walk(rules, out, depth=0):
    for r in rules:
        if r.type == 'qualified-rule':
            sel = tinycss2.serialize(r.prelude).strip()
            if sel.startswith(':root') or sel.startswith('@'): continue
            decls = []
            for d in tinycss2.parse_declaration_list(r.content, skip_whitespace=True, skip_comments=True):
                if d.type != 'declaration' or d.name.startswith('--'): continue
                v = remap_value(d.name, tinycss2.serialize(d.value).strip(), sel)
                if v: decls.append(f'{d.name}:{v}{"!important" if d.important else ""}')
            if decls: out.append(f'{scope(sel)}{{{";".join(decls)}}}')
        elif r.type == 'at-rule' and r.lower_at_keyword in ('media', 'supports') and r.content:
            inner = []; walk(tinycss2.parse_rule_list(r.content, skip_whitespace=True, skip_comments=True), inner, depth + 1)
            if inner: out.append(f'@{r.lower_at_keyword} {tinycss2.serialize(r.prelude).strip()}{{{"".join(inner)}}}')

def main():
    sheets = [(f, (WEB / f).read_text(encoding='utf-8')) for f in SOURCES]
    for _, txt in sheets:                            # collect light-theme token values (last definition wins)
        for m in re.finditer(r':root\{([^}]*)\}', txt):
            for k, v in re.findall(r'--([\w-]+):([^;]+)', m.group(1)): TOKENS[k] = v.strip()
    parts = [HEADER]
    for f, txt in sheets:
        out = []; walk(tinycss2.parse_stylesheet(txt, skip_whitespace=True, skip_comments=True), out)
        parts.append(f'/* ---------- from {f} ---------- */\n' + '\n'.join(out))
    parts.append(FOOTER)
    OUT.write_text('\n'.join(parts) + '\n', encoding='utf-8')
    print(f'wrote {OUT} ({OUT.stat().st_size // 1024} KB)')

HEADER = """/* GENERATED by scripts/build-dark-theme.py — do not edit by hand; edit the source stylesheets or the script, then re-run it.
   Dark re-colouring of the member area, active only under html[data-theme=dark] (the site-wide light/dark switch). Hand-written refinements live in app/theme-dark-extra.css. */
html[data-theme=dark]{--ink:#EDE9E2;--navy:#0A0A09;--muted:#A39E94;--paper:#0E0E0D;--cream:#1E1E1C;--line:rgba(237,233,226,.12);--accent:#E4573B;--green:#7FB497;--card:#161615;--soft:#1E1E1C;--brass-soft:#2A201B;--ok:#7FB497;--warn:#D9A15E;--bad:#E8806C;--accent-text:#EC8068;--shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px rgba(0,0,0,.25);--shadow-lg:0 20px 60px rgba(0,0,0,.5);--brass-glow:rgba(228,87,59,.35);color-scheme:dark}"""
FOOTER = ''

if __name__ == '__main__':
    sys.exit(main())
