# Generates every app icon / logo asset in public/ from the brand logo (dancing couple, Gemini artwork).
# The background outside the artwork becomes transparent ("sticker"); maskable/apple icons get white.
# Usage: python3 scripts/generate-icons.py [path/to/logo.jpg]
# NOTE: design-system/brand/logo.jpg is an OLD logo - do not use it as the source.
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
src_path = sys.argv[1] if len(sys.argv) > 1 else ROOT / "design-system" / "brand" / "logo-dancing.jpg"
out = ROOT / "public"
src = Image.open(src_path).convert("RGB")
a = np.asarray(src).astype(np.int16)
diff = (255 - a).max(axis=2)              # 0 = pure white
ink = diff > 40
rows = np.where(ink.sum(axis=1) >= 3)[0]; cols = np.where(ink.sum(axis=0) >= 3)[0]
y0, y1, x0, x1 = rows[0], rows[-1], cols[0], cols[-1]
cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
print("bbox", x0, y0, x1, y1)

# Sticker silhouette: close the ink shape (bridges the ring gaps), fill its holes, add a small margin.
# Everything inside stays opaque (white album pages, QR gaps, dress); only the outside becomes transparent.
q = 4
small = Image.fromarray((ink * 255).astype(np.uint8), "L").resize((src.width // q, src.height // q), Image.BOX).point(lambda v: 255 if v > 20 else 0)
closed = small.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.MinFilter(11))
padi = Image.new("L", (closed.width + 2, closed.height + 2), 0); padi.paste(closed, (1, 1))
ImageDraw.floodfill(padi, (0, 0), 128, thresh=0)
outside = (np.asarray(padi)[1:-1, 1:-1] == 128)
sil = Image.fromarray(((~outside) * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(3))
sil = sil.resize(src.size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))
alpha = np.asarray(sil).astype(np.float32)
bg = alpha < 128
rgba = np.dstack([np.asarray(src), alpha.astype(np.uint8)])
full = Image.fromarray(rgba, "RGBA")

# Square crop centred on the artwork, side = longest bbox side + margin.
side = int(max(x1 - x0, y1 - y0) * 1.04)
box = (int(cx - side / 2), int(cy - side / 2), int(cx - side / 2) + side, int(cy - side / 2) + side)
art = full.crop(box)
# Max radius of ink from the centre (for the maskable safe zone).
ys, xs = np.nonzero(ink[box[1]:box[3], box[0]:box[2]])
rmax = np.sqrt((xs - side / 2) ** 2 + (ys - side / 2) ** 2).max() / side
print("side", side, "rmax(frac)", round(float(rmax), 3), "bg fraction", round(float(bg.mean()), 3))

def place(size, scale, bgcolor=None):
    canvas = Image.new("RGBA", (size, size), bgcolor or (255, 255, 255, 0))
    s = int(size * scale)
    a2 = art.resize((s, s), Image.LANCZOS)
    canvas.alpha_composite(a2, ((size - s) // 2, (size - s) // 2))
    return canvas

any512 = place(512, 0.98); any512.save(f"{out}/icon-512.png", optimize=True)
place(192, 0.98).save(f"{out}/icon-192.png", optimize=True)
place(48, 1.0).save(f"{out}/favicon-48.png", optimize=True)
place(160, 1.0).save(f"{out}/logo-mark.webp", quality=90, method=6)
# iPhone: opaque white, a bit of margin for the rounded mask.
place(180, 0.86, (255, 255, 255, 255)).convert("RGB").save(f"{out}/apple-touch-icon.png", optimize=True)
# Android maskable: opaque white, artwork inside the 40%-radius safe circle.
ms = min(0.98, 0.40 / rmax)
print("maskable scale", round(ms, 3))
place(512, ms, (255, 255, 255, 255)).convert("RGB").save(f"{out}/icon-maskable-512.png", optimize=True)

# Site home: big centered logo.
place(384, 1.0).save(f"{out}/logo-hero.webp", quality=88, method=6)
print("wrote icons to", out)
