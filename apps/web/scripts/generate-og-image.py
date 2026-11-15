#!/usr/bin/env python3
"""Genere l'image d'apercu des liens Meeshy (#9712) : `public/og/invitation-v1.png`.

C'est l'image que WhatsApp, iMessage, Telegram, Messenger, Slack ou X affichent
sous un lien `https://meeshy.me/chat/<lien>` deplie (balise `og:image`, servie
par la page de la passerelle, `services/gateway/src/services/linkUnfurl/page.ts`).
1200 x 630 : le format 1,91:1 que tous ces robots affichent en grand.

Elle est generee UNE fois et versionnee ; ce script la rejoue a l'identique.
Changer l'image, c'est changer son NOM (`invitation-v2.png`) et la constante
`LINK_UNFURL_IMAGE.path` : les messageries gardent une image en cache par
adresse, longtemps, et une image remplacee sous la meme adresse ne serait pas
revue.

Ce qu'elle porte, et rien d'autre :
  - le degrade de la marque (indigo #6366F1 -> #4338CA, `apps/ios/CLAUDE.md`
    § Brand Identity) ;
  - le GLYPHE de l'icone iOS, RECUPERE et non redessine (directive porteur
    2026-09-07, meme regle que `generate-icons.py`) : son masque blanc est lu
    sur `Icon-Light-1024x1024.png` ;
  - le mot « Meeshy » et un bonjour dans les sept langues de l'interface — une
    image sans langue privilegiee, puisque l'apercu, lui, est dans celle de
    l'hote.

Polices : Noto Sans et Noto Sans Arabic (SIL Open Font License), lues la ou
le depot en porte deja une copie (`harfbuzzjs`, dependance installee). Le rendu
de l'arabe exige Pillow avec libraqm (`PIL.features.check('raqm')`).

Usage : python3 apps/web/scripts/generate-og-image.py
"""
from __future__ import annotations

import glob
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, features

ROOT = Path(__file__).resolve().parents[3]
ICON = ROOT / 'apps/ios/Meeshy/Assets.xcassets/AppIcon.appiconset/Icon-Light-1024x1024.png'
OUT = ROOT / 'apps/web/public/og/invitation-v1.png'

WIDTH, HEIGHT = 1200, 630
TOP = (0x63, 0x66, 0xF1)
BOTTOM = (0x43, 0x38, 0xCA)

GREETINGS_LATIN = ['Bonjour', 'Hello', 'Hola', 'Olá', 'Hallo', 'Ciao']
GREETING_ARABIC = 'مرحبا'
SEPARATOR = '  ·  '


def font_path(name: str) -> str:
    matches = sorted(glob.glob(str(ROOT / f'node_modules/.bun/harfbuzzjs@*/node_modules/harfbuzzjs/test/fonts/noto/{name}')))
    if not matches:
        sys.exit(f'Police introuvable : {name} (installer les dependances : bun install --ignore-scripts)')
    return matches[-1]


def gradient() -> Image.Image:
    image = Image.new('RGB', (WIDTH, HEIGHT))
    pixels = image.load()
    span = WIDTH + HEIGHT
    for y in range(HEIGHT):
        for x in range(WIDTH):
            t = (x + y) / span
            pixels[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM))
    return image


def glyph_mask(height: int) -> Image.Image:
    icon = Image.open(ICON).convert('RGB')
    box = (200, 320, 824, 704)
    crop = icon.crop(box)
    whiteness = crop.convert('L').point(lambda v: max(0, min(255, round((v - 140) * 255 / 115))))
    bbox = whiteness.getbbox()
    whiteness = whiteness.crop(bbox)
    scale = height / whiteness.height
    return whiteness.resize((round(whiteness.width * scale), height), Image.LANCZOS)


def text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, **kwargs) -> int:
    left, _, right, _ = draw.textbbox((0, 0), text, font=font, **kwargs)
    return right - left


def main() -> None:
    if not features.check('raqm'):
        sys.exit("Pillow sans libraqm : l'arabe serait rendu sans liaisons.")

    image = gradient()
    draw = ImageDraw.Draw(image)
    white = (255, 255, 255)
    soft = (224, 231, 255)

    mask = glyph_mask(150)
    glyph_top = 92
    image.paste(Image.new('RGB', mask.size, white), ((WIDTH - mask.width) // 2, glyph_top), mask)

    wordmark = ImageFont.truetype(font_path('NotoSans-Regular.ttf'), 112)
    word = 'Meeshy'
    word_width = text_width(draw, word, wordmark, stroke_width=3)
    draw.text(((WIDTH - word_width) // 2, glyph_top + mask.height + 26), word, font=wordmark, fill=white, stroke_width=3, stroke_fill=white)

    latin = ImageFont.truetype(font_path('NotoSans-Regular.ttf'), 38)
    arabic = ImageFont.truetype(font_path('NotoSansArabic-Variable.ttf'), 40)
    latin_text = SEPARATOR.join(GREETINGS_LATIN) + SEPARATOR
    latin_width = text_width(draw, latin_text, latin)
    arabic_width = text_width(draw, GREETING_ARABIC, arabic, direction='rtl', language='ar')
    line_x = (WIDTH - latin_width - arabic_width) // 2
    line_y = 492
    draw.text((line_x, line_y), latin_text, font=latin, fill=soft)
    draw.text((line_x + latin_width, line_y - 12), GREETING_ARABIC, font=arabic, fill=soft, direction='rtl', language='ar')

    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, 'PNG', optimize=True)
    print(f'{OUT.relative_to(ROOT)} : {WIDTH}x{HEIGHT}, {OUT.stat().st_size} octets')


if __name__ == '__main__':
    main()
