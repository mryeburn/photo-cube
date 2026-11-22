"""Build defaults.js from six photos, in face order: Front Back Right Left Top Bottom.

Usage: python3 tools/make_defaults.py PHOTO PHOTO PHOTO PHOTO PHOTO PHOTO

Each PHOTO is a file name, optionally followed by how to frame it:
  photo.jpg               crop a square from the centre (tall photos keep more of the top)
  photo.jpg@0.09,0        crop a square whose top-left corner is at 9% across, 0% down
  photo.jpg@fit:0.15,0.98 keep the strip from 15% to 98% across, fitted inside the square,
                          with a blurred copy of the photo filling the space around it
Every photo is turned upright and saved as a 512px JPEG inside defaults.js.
"""
import base64, io, json, sys
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps

try:
    import pillow_heif  # iPhone HEIC photos
    pillow_heif.register_heif_opener()
except ImportError:
    pass

SIZE = 512

def frame(arg):
    path, _, spec = arg.partition('@')
    img = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    w, h = img.size
    if spec.startswith('fit:'):
        a, b = (float(v) for v in spec[4:].split(','))
        strip = img.crop((int(a * w), 0, int(b * w), h))
        bg = ImageOps.fit(img, (SIZE, SIZE)).filter(ImageFilter.GaussianBlur(24))
        bg = Image.blend(bg, Image.new('RGB', bg.size, (0, 0, 0)), 0.35)
        strip.thumbnail((SIZE, SIZE), Image.LANCZOS)
        bg.paste(strip, ((SIZE - strip.width) // 2, (SIZE - strip.height) // 2))
        return bg
    s = min(w, h)
    if spec:
        fx, fy = (float(v) for v in spec.split(','))
        x, y = int(fx * w), int(fy * h)
    else:
        x = (w - s) // 2
        y = int((h - s) * 0.3) if h > w else (h - s) // 2
    x, y = max(0, min(x, w - s)), max(0, min(y, h - s))
    return img.crop((x, y, x + s, y + s)).resize((SIZE, SIZE), Image.LANCZOS)

def data_url(img):
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=85, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

if len(sys.argv) != 7:
    sys.exit(__doc__)
faces = [frame(a) for a in sys.argv[1:]]
out = Path(__file__).resolve().parent.parent / 'defaults.js'
out.write_text('// Built-in photos: Front, Back, Right, Left, Top, Bottom (made by tools/make_defaults.py)\n'
               'window.DEFAULT_FACES = ' + json.dumps([data_url(f) for f in faces], indent=0) + ';\n')
print(f'wrote {out} ({out.stat().st_size // 1024} KB)')
