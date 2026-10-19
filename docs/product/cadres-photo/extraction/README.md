# Extraction des cadres photo (#10936)

La planche validée (`../planche-cadres-photo.html`, #10934) est la source du DESSIN ;
les sources du dépôt (`packages/shared/design/appearance/avatar-rings/rings.json`,
packs `contours-*`, et `banner-frames/frames.json`) en sont extraites, une fois, par :

    cd docs/product/cadres-photo/extraction
    python3 build.py /tmp/contours.json /tmp/cadres.json   # Pillow requis (masques de recouvrement)

puis recopiées dans les registres, et `bun scripts/generate-appearance-packs.ts`
(gateway) les publie. Ce qui est fait au passage, et pourquoi, est dit en tête de
`build.py` (contraste haussmannien, masque rituel lisible à 40 px, palette rituelle
à huit couleurs) et de `frames.py` (frises détectées par périodicité, pièces
ancrées, reflets ciblant la bande).
