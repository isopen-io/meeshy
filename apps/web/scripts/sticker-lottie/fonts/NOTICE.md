# Manrope — police du générateur Lottie des stickers Mee

`manrope-variable.ttf` sert UNIQUEMENT à `scripts/sticker-lottie/text-path.ts`, qui
convertit le texte des stickers en tracés au moment de la génération. Le
fichier n'est livré dans aucune application : seuls les contours produits
voyagent, dans les `.lottie`.

- Source : https://github.com/google/fonts/blob/main/ofl/manrope/Manrope%5Bwght%5D.ttf
- SHA-256 : `3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6`
- Licence : SIL Open Font License 1.1 — Copyright 2019 The Manrope Project Authors
  (https://github.com/googlefonts/manrope)

Le dépôt redistribue déjà Manrope en WOFF2 (`src/styles/fonts/glory-manrope-latin.woff2`).
Le TTF est gardé à part, parce que fontkit n'instancie pas la graisse d'un WOFF2 variable.
