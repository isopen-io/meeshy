#!/usr/bin/env python3
"""Genere les images d'apercu de la landing (#10002) : `public/og/landing-<langue>-v1.png`.

Une image 1200 x 630 par langue de la landing (planche « OgImage ») : c'est ce
que WhatsApp, iMessage, Telegram, Slack, LinkedIn ou X affichent sous un lien
`https://meeshy.me/` (balise `og:image` de `src/landing/landing-document.tsx`).

Ce qu'elle porte :
  - la surface sombre de l'application et la lueur radiale de la marque
    (indigo #6366F1, `packages/design-tokens/ios.css`) ;
  - le LOGO de l'application, RECUPERE et jamais redessine (decision porteur du
    2026-10-10 sur #10002) : `public/brand/logo.png` (`BRAND_LOGO_PATH`) ;
  - le titre et le sous-titre du heros DANS LA LANGUE de la page, lus sur
    `src/landing/landing-copy.ts` (jamais recopies ici), et l'appel
    « Rejoindre World Wide · meeshy.me ».

Elles sont generees une fois et versionnees ; ce script les rejoue. Changer une
image, c'est changer son NOM (`-v2`) et `landingOgImagePath` : les messageries
gardent une image en cache par adresse, longtemps.

Police : DejaVu Sans (libre), qui couvre le latin et l'arabe ; l'arabe exige
Pillow avec libraqm (`PIL.features.check('raqm')`).

Usage : python3 apps/web/scripts/generate-landing-og-images.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, features

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / 'apps/web'
LOGO = WEB / 'public/brand/logo.png'
OUT = WEB / 'public/og'

WIDTH, HEIGHT = 1200, 630
SURFACE = (0x09, 0x09, 0x0B)
CARD = (0x13, 0x11, 0x1C)
INK = (0xEE, 0xF2, 0xFF)
INK_2 = (0xA5, 0xB4, 0xFC)
BRAND = (0x63, 0x66, 0xF1)
BRAND_DEEP = (0x43, 0x38, 0xCA)
BRAND_LIGHT = (0x81, 0x8C, 0xF8)
AMBER = (0xFB, 0xBF, 0x24)
EMERALD = (0x34, 0xD3, 0x99)
SELF = (0xC7, 0xD2, 0xFE)

BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

COPY_EXPORT = """
import { LANDING_COPY } from './src/landing/landing-copy';
import { LANDING_LANGUAGES } from './src/landing/landing-languages';
console.log(JSON.stringify(Object.fromEntries(LANDING_LANGUAGES.map((l) => [l, {
  headline: LANDING_COPY[l].headline,
  accent: LANDING_COPY[l].headlineAccent,
  join: LANDING_COPY[l].join,
  you: LANDING_COPY[l].previewYourself,
}]))));
"""


def copies() -> dict:
    """La copie de la landing, lue sur sa SOURCE TypeScript par bun."""
    run = subprocess.run(['bun', '-e', COPY_EXPORT], cwd=WEB, capture_output=True, text=True, check=False)
    if run.returncode != 0:
        sys.exit(f'Lecture de landing-copy.ts impossible : {run.stderr}')
    return json.loads(run.stdout)


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.RAQM)


def direction(text: str) -> str:
    return 'rtl' if re.search('[؀-ۿ]', text) else 'ltr'


def fit(draw: ImageDraw.ImageDraw, text: str, path: str, size: int, floor: int, width: int) -> ImageFont.FreeTypeFont:
    while size > floor:
        face = font(path, size)
        if draw.textlength(text, font=face, direction=direction(text)) <= width:
            return face
        size -= 2
    return font(path, floor)


def glow() -> Image.Image:
    layer = Image.new('RGB', (WIDTH, HEIGHT), SURFACE)
    halo = Image.new('L', (WIDTH, HEIGHT), 0)
    ImageDraw.Draw(halo).ellipse((WIDTH * 0.45, -HEIGHT * 0.2, WIDTH * 1.05, HEIGHT * 0.8), fill=90)
    halo = halo.filter(ImageFilter.GaussianBlur(120))
    return Image.composite(Image.new('RGB', (WIDTH, HEIGHT), BRAND), layer, halo)


def gradient_text(image: Image.Image, xy: tuple[int, int], text: str, face: ImageFont.FreeTypeFont) -> None:
    mask = Image.new('L', image.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=face, fill=255, direction=direction(text))
    box = mask.getbbox()
    if box is None:
        return
    shade = Image.new('RGB', image.size, BRAND)
    pixels = ImageDraw.Draw(shade)
    for x in range(box[0], box[2]):
        t = (x - box[0]) / max(1, box[2] - box[0])
        pixels.line([(x, box[1]), (x, box[3])], fill=tuple(round(a + (b - a) * t) for a, b in zip(BRAND_LIGHT, BRAND)))
    image.paste(shade, (0, 0), mask)


def rounded(image: Image.Image, box: tuple[int, int, int, int], radius: int, fill: tuple[int, int, int]) -> None:
    ImageDraw.Draw(image).rounded_rectangle(box, radius=radius, fill=fill)


def render(language: str, copy: dict) -> Image.Image:
    image = glow()
    draw = ImageDraw.Draw(image)
    left, column = 80, 660

    logo = Image.open(LOGO).convert('RGBA').resize((64, 64), Image.LANCZOS)
    mask = Image.new('L', (64, 64), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 63, 63), radius=16, fill=255)
    image.paste(logo, (left, 72), Image.composite(logo.split()[3], Image.new('L', (64, 64), 0), mask))
    gradient_text(image, (left + 80, 76), 'Meeshy', font(BOLD, 40))

    headline = fit(draw, copy['headline'], BOLD, 66, 40, column)
    draw.text((left, 196), copy['headline'], font=headline, fill=INK, direction=direction(copy['headline']))
    accent = fit(draw, copy['accent'], BOLD, 34, 24, column)
    draw.text((left, 296), copy['accent'], font=accent, fill=INK_2, direction=direction(copy['accent']))

    label = f"{copy['join']} · meeshy.me"
    cta = fit(draw, label, BOLD, 24, 18, column - 48)
    width = round(draw.textlength(label, font=cta, direction=direction(label))) + 48
    pill = Image.new('RGB', (width, 60), BRAND)
    shade = ImageDraw.Draw(pill)
    for x in range(width):
        t = x / max(1, width - 1)
        shade.line([(x, 0), (x, 59)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BRAND, BRAND_DEEP)))
    pill_mask = Image.new('L', (width, 60), 0)
    ImageDraw.Draw(pill_mask).rounded_rectangle((0, 0, width - 1, 59), radius=14, fill=255)
    image.paste(pill, (left, 380), pill_mask)
    draw.text((left + 24, 410), label, font=cta, fill=(255, 255, 255), anchor='lm', direction=direction(label))

    card = (800, 150, 1140, 480)
    rounded(image, card, 22, CARD)
    rows = [('Kenji · JA', AMBER, copy['headline']), ('Luiza · PT', EMERALD, copy['headline']), (f"{copy['you']} · {language.upper()}", SELF, copy['accent'])]
    y = card[1] + 26
    for name, colour, text in rows:
        draw.text((card[0] + 24, y), name, font=font(BOLD, 17), fill=colour, direction=direction(name))
        body = fit(draw, text, REGULAR, 20, 13, card[2] - card[0] - 48)
        draw.text((card[0] + 24, y + 28), text, font=body, fill=INK, direction=direction(text))
        y += 100
    return image


def main() -> None:
    if not features.check('raqm'):
        sys.exit('Pillow sans libraqm : l\'arabe ne peut pas etre mis en forme.')
    OUT.mkdir(parents=True, exist_ok=True)
    for language, copy in copies().items():
        target = OUT / f'landing-{language}-v1.png'
        render(language, copy).save(target, optimize=True)
        print(f'  {target.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
