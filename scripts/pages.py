#!/usr/bin/env python3
"""Render PDF pages for reading and crop diagrams out of them.

  python3 scripts/pages.py render <paper.pdf> <outdir> [--dpi 110]
      -> outdir/p01.png ... with a light 10% grid + labels (for reading and for choosing crop boxes),
         and outdir/text.txt (text layer per page, may be garbled for maths)
  python3 scripts/pages.py crop <paper.pdf> <page> <x0> <y0> <x1> <y1> <out.png> [--dpi 200]
      -> crops a region given in PERCENT of page width/height (0-100, from top-left) and trims white margins
"""
import os, subprocess, sys
from PIL import Image, ImageDraw, ImageChops


def render(pdf, outdir, dpi=110):
    os.makedirs(outdir, exist_ok=True)
    subprocess.run(["pdftoppm", "-r", str(dpi), "-png", pdf, os.path.join(outdir, "raw")], check=True)
    files = sorted(f for f in os.listdir(outdir) if f.startswith("raw"))
    for i, f in enumerate(files, 1):
        im = Image.open(os.path.join(outdir, f)).convert("RGB")
        d = ImageDraw.Draw(im)
        w, h = im.size
        for k in range(1, 10):
            x, y = w * k // 10, h * k // 10
            d.line([(x, 0), (x, h)], fill=(120, 170, 255), width=1)
            d.line([(0, y), (w, y)], fill=(120, 170, 255), width=1)
            d.text((x + 2, 2), str(k * 10), fill=(40, 90, 220))
            d.text((2, y + 2), str(k * 10), fill=(40, 90, 220))
        d.text((w - 60, h - 14), f"page {i}", fill=(220, 40, 40))
        im.save(os.path.join(outdir, f"p{i:02d}.png"))
        os.remove(os.path.join(outdir, f))
    txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout
    pages = txt.split("\f")
    with open(os.path.join(outdir, "text.txt"), "w") as fh:
        for i, p in enumerate(pages, 1):
            if p.strip():
                fh.write(f"\n===== page {i} =====\n{p}")
    print(f"{len(files)} pages -> {outdir}")


def crop(pdf, page, x0, y0, x1, y1, out, dpi=200):
    tmp = out + ".tmp"
    subprocess.run(["pdftoppm", "-r", str(dpi), "-png", "-singlefile", "-f", str(page), "-l", str(page), pdf, tmp], check=True)
    im = Image.open(tmp + ".png").convert("RGB")
    w, h = im.size
    box = (int(w * x0 / 100), int(h * y0 / 100), int(w * x1 / 100), int(h * y1 / 100))
    c = im.crop(box)
    bg = Image.new("RGB", c.size, (255, 255, 255))
    diff = ImageChops.difference(c, bg).convert("L").point(lambda v: 255 if v > 25 else 0)
    bb = diff.getbbox()
    if bb:
        pad = 12
        c = c.crop((max(bb[0] - pad, 0), max(bb[1] - pad, 0), min(bb[2] + pad, c.width), min(bb[3] + pad, c.height)))
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    c.save(out, optimize=True)
    os.remove(tmp + ".png")
    print(out, c.size)


if __name__ == "__main__":
    a = sys.argv[1:]
    dpi = int(a[a.index("--dpi") + 1]) if "--dpi" in a else None
    if a and a[0] == "render":
        render(a[1], a[2], dpi or 110)
    elif a and a[0] == "crop":
        crop(a[1], int(a[2]), *map(float, a[3:7]), a[7], dpi or 200)
    else:
        sys.exit(__doc__)
