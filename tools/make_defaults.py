"""Build defaults.js from six photos, in face order: Front Back Right Left Top Bottom.

Usage: python3 tools/make_defaults.py front.jpg back.jpg right.jpg left.jpg top.jpg bottom.jpg
Each photo is turned upright, cropped square (tall photos keep more of the top, where faces
usually are, matching the in-app crop) and saved as a 512px JPEG inside defaults.js.
"""
import base64, io, json, sys
from pathlib import Path
from PIL import Image, ImageOps

try:
    import pillow_heif  # iPhone HEIC photos
    pillow_heif.register_heif_opener()
except ImportError:
    pass

SIZE = 512

def crop_square(path):
    img = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    w, h = img.size
    s = min(w, h)
    x = (w - s) // 2
    y = int((h - s) * 0.3) if h > w else (h - s) // 2
    img = img.crop((x, y, x + s, y + s)).resize((SIZE, SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=85, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

if len(sys.argv) != 7:
    sys.exit(__doc__)
faces = [crop_square(p) for p in sys.argv[1:]]
out = Path(__file__).resolve().parent.parent / 'defaults.js'
out.write_text('// Built-in photos: Front, Back, Right, Left, Top, Bottom (made by tools/make_defaults.py)\n'
               'window.DEFAULT_FACES = ' + json.dumps(faces, indent=0) + ';\n')
print(f'wrote {out} ({out.stat().st_size // 1024} KB)')
