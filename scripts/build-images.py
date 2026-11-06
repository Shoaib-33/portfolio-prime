"""Creates web-sized copies of the photos in apps/web/public/img in apps/web/public/img/opt:
   name.avif and name.webp (large), name-sm.webp (phones and cards) and name-blur.webp (pre-blurred, for the locked teaser cards).
   Run after adding or replacing a photo:  python scripts/build-images.py   (needs Pillow)"""
from pathlib import Path
from PIL import Image, ImageFilter

SRC = Path(__file__).resolve().parent.parent / 'apps' / 'web' / 'public' / 'img'
OUT = SRC / 'opt'
OUT.mkdir(exist_ok=True)


def fit(im, width):
    return im if im.width <= width else im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


total_in = total_out = 0
for f in sorted(SRC.glob('*.jpg')):
    im = Image.open(f).convert('RGB'); total_in += f.stat().st_size
    large = 1680 if f.stem == 'hero' else 1100
    outputs = {
        f'{f.stem}.webp': (fit(im, large), 56),
        f'{f.stem}-sm.webp': (fit(im, 640), 58),
        f'{f.stem}-blur.webp': (fit(im, 200).filter(ImageFilter.GaussianBlur(5)), 55),
    }
    for name, (img, quality) in outputs.items():
        img.save(OUT / name, 'WEBP', quality=quality, method=6)
    fit(im, large).save(OUT / f'{f.stem}.avif', 'AVIF', quality=42, speed=4)   # hero slides; browsers without AVIF use the WebP
    sizes = [(OUT / n).stat().st_size for n in outputs]; total_out += sizes[0]
    print(f'{f.name}: {f.stat().st_size // 1024} KB -> {sizes[0] // 1024} / {sizes[1] // 1024} / {sizes[2] // 1024} KB')
print(f'large versions: {total_in // 1024} KB -> {total_out // 1024} KB')
