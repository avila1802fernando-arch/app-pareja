# Dibuja los íconos del Recreo (las cuatro fichas del logo) en familia/icons/.
#   python familia/herramientas/iconos.py
# Se dibuja grande (x4) y se achica: así los bordes quedan suaves.
from pathlib import Path
from PIL import Image, ImageDraw

CREMA = (255, 246, 229)
FICHAS = [((5, 5), (232, 96, 63)), ((34, 5), (44, 85, 224)), ((5, 34), (14, 156, 130)), ((34, 34), (255, 197, 61))]
BLANCO = (255, 255, 255)
SALIDA = Path(__file__).resolve().parent.parent / "icons"


def logo(lado, escala_logo, fondo_redondo):
    S = lado * 4
    img = Image.new("RGBA", (S, S), CREMA + (255,) if not fondo_redondo else (0, 0, 0, 0))
    if fondo_redondo:
        ImageDraw.Draw(img).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=CREMA + (255,))
    capa = Image.new("RGBA", (64 * 16, 64 * 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    k = 16  # el logo está pensado en una grilla de 64
    for (x, y), color in FICHAS:
        d.rounded_rectangle((x * k, y * k, (x + 25) * k, (y + 25) * k), radius=8 * k, fill=color)
    # estrella
    import math
    cx, cy, r1, r2 = 17.5 * k, 17.5 * k, 7.2 * k, 3.1 * k
    pts = [(cx + (r1 if i % 2 == 0 else r2) * math.sin(math.pi * i / 5), cy - (r1 if i % 2 == 0 else r2) * math.cos(math.pi * i / 5)) for i in range(10)]
    d.polygon(pts, fill=BLANCO)
    # avioncito
    d.polygon([(39 * k, 18.5 * k), (53.5 * k, 12 * k), (47.5 * k, 25 * k), (44.9 * k, 19.8 * k)], fill=BLANCO)
    # carta (dos cartitas)
    d.rounded_rectangle((11 * k, 39 * k, 21 * k, 53 * k), radius=int(2.5 * k), fill=BLANCO)
    d.rounded_rectangle((16.5 * k, 41 * k, 25.5 * k, 54 * k), radius=int(2.5 * k), fill=BLANCO, outline=(14, 156, 130), width=int(1.6 * k))
    # cereza
    d.ellipse((38.3 * k, 45.8 * k, 46.7 * k, 54.2 * k), fill=BLANCO)
    d.ellipse((46.8 * k, 46.8 * k, 55.2 * k, 55.2 * k), fill=BLANCO)
    d.line([(42.5 * k, 46 * k), (47 * k, 39.5 * k), (51 * k, 38.5 * k)], fill=BLANCO, width=int(1.8 * k))
    d.line([(51 * k, 47 * k), (50.8 * k, 38.6 * k)], fill=BLANCO, width=int(1.8 * k))
    capa = capa.rotate(6, resample=Image.BICUBIC)
    tam = int(S * escala_logo)
    capa = capa.resize((tam, tam), Image.LANCZOS)
    img.alpha_composite(capa, ((S - tam) // 2, (S - tam) // 2))
    return img.resize((lado, lado), Image.LANCZOS)


SALIDA.mkdir(exist_ok=True)
logo(192, 0.86, False).save(SALIDA / "icon-192.png")
logo(512, 0.86, False).save(SALIDA / "icon-512.png")
logo(512, 0.62, False).save(SALIDA / "icon-512-maskable.png")  # el logo dentro de la zona segura
logo(180, 0.86, False).convert("RGB").save(SALIDA / "apple-180.png")
logo(96, 0.9, True).save(SALIDA / "favicon-96.png")
print("íconos listos en", SALIDA)
