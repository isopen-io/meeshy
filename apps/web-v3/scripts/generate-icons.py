#!/usr/bin/env python3
"""Genere les icones PNG de la PWA depuis la MEME geometrie que public/favicon.svg.

Pourquoi un generateur plutot que trois binaires commites : une icone posee a la
main derive en silence de la marque (la v3 a paye cette lecon sur ses captures,
d'ou capture-cibles.js). Ici la geometrie est ECRITE une fois ; les trois
fichiers en sont des projections, rejouables par `python3 scripts/genere-icones.py`.

`maskable` n'est pas la meme image agrandie : Android rogne jusqu'a 20 % de
chaque bord pour l'adapter au gabarit de l'appareil. La variante masquable pose
donc le fond a PLEIN BORD et rentre le glyphe dans la zone sure (40 % du rayon),
sinon le trait se fait couper.
"""
import struct
import zlib
from pathlib import Path

FOND = (0x7D, 0x80, 0xF6)
ENCRE = (0x0B, 0x0C, 0x14)
PUBLIC = Path(__file__).resolve().parent.parent / "public"

# La polyligne du favicon, en coordonnees 0..32 : M8,21 L8,11 L16,17 L24,11 L24,21
POLYLIGNE = [(8, 21), (8, 11), (16, 17), (24, 11), (24, 21)]
EPAISSEUR = 2.5  # stroke-width du SVG, meme repere


def distance_au_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    longueur2 = dx * dx + dy * dy
    t = 0.0 if longueur2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / longueur2))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def png(chemin, taille, masquable):
    echelle = taille / 32.0
    demi_trait = (EPAISSEUR / 2.0) * echelle
    rayon = 0.0 if masquable else 8.0 * echelle  # rx=8 du SVG
    # Zone sure d'une icone masquable : le glyphe est reduit pour survivre au rognage.
    facteur_glyphe = 0.8 if masquable else 1.0
    centre = taille / 2.0

    segments = []
    for (ax, ay), (bx, by) in zip(POLYLIGNE, POLYLIGNE[1:]):
        pts = []
        for x, y in ((ax, ay), (bx, by)):
            gx = centre + (x * echelle - centre) * facteur_glyphe
            gy = centre + (y * echelle - centre) * facteur_glyphe
            pts.append((gx, gy))
        segments.append((*pts[0], *pts[1]))
    demi_trait *= facteur_glyphe

    lignes = bytearray()
    for y in range(taille):
        lignes.append(0)  # filtre PNG « None »
        cy = y + 0.5
        for x in range(taille):
            cx = x + 0.5
            # Coins arrondis : hors du rayon, le pixel est transparent.
            if rayon > 0:
                dx = max(rayon - cx, cx - (taille - rayon), 0.0)
                dy = max(rayon - cy, cy - (taille - rayon), 0.0)
                if dx * dx + dy * dy > rayon * rayon:
                    lignes.extend((0, 0, 0, 0))
                    continue
            couleur = FOND
            for seg in segments:
                if distance_au_segment(cx, cy, *seg) <= demi_trait:
                    couleur = ENCRE
                    break
            lignes.extend((*couleur, 255))

    def bloc(nom, donnees):
        entete = nom + donnees
        return struct.pack(">I", len(donnees)) + entete + struct.pack(">I", zlib.crc32(entete) & 0xFFFFFFFF)

    fichier = (
        b"\x89PNG\r\n\x1a\n"
        + bloc(b"IHDR", struct.pack(">IIBBBBB", taille, taille, 8, 6, 0, 0, 0))
        + bloc(b"IDAT", zlib.compress(bytes(lignes), 9))
        + bloc(b"IEND", b"")
    )
    chemin.write_bytes(fichier)
    print(f"  {chemin.name}  {taille}x{taille}  {len(fichier)} o")


PUBLIC.mkdir(exist_ok=True)
png(PUBLIC / "icone-192.png", 192, masquable=False)
png(PUBLIC / "icone-512.png", 512, masquable=False)
png(PUBLIC / "icone-512-masque.png", 512, masquable=True)
