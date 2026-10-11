# Cadres de gloire — sources de design

Sources versionnées des cadres décoratifs des photos de gloire de Meeshy (issue #9963, parente #9382, milestone « Le jeu se comprend et se joue chaque jour »). Proposition **validée par le porteur le 2026-10-10** (« Tout est terminé »), le Néon gardé tel quel.

Ce dossier est la **source de vérité du design** des cadres. La planche publiée (rendu éphémère, pour voir) : https://claude.ai/artifact/QUWf5znxXcX1qGLEmGQGV2 — page « Sept atmosphères », avec le prototype interactif « choisir son atmosphère à Ambassadeur, puis sa décoration à Orateur ». En cas d'écart, ce dossier a raison.

Le développement dans l'app se fait avec le prompt [`PROMPT-developpement.md`](PROMPT-developpement.md).

## La montée

| Rangs | Thème | Décorations |
|---|---|---|
| Murmure → Polyglotte | une mythologie du monde par rang | première proposition `generateur/v1/frames.py` (planche `planches/v1-premiere-proposition.jpg`), à porter au niveau des autres |
| Ambassadeur (le rang du CHOIX) → Orateur | l'Afrique d'abord, par ses constructions ; chaque autre atmosphère y glisse l'Afrique dans un ou deux cadres | Ambassadeur : une par division V→I et par collection ; Orateur : A, B, C |
| Oracle → Mythe | le cosmos, vers l'infiniment grand et l'infiniment petit (« du quark au quasar » au Mythe) | Oracle : A, B, C ; Légende : une par division V→I ; Mythe : A, B, C |

À Ambassadeur, l'utilisateur choisit son **atmosphère** parmi sept : Afrique éternelle (deux collections, Savane et Royaumes), Égypte solaire, Olympe, Empire céleste, Aurores du Nord, Abysses, Néon. Aux rangs suivants, Meeshy propose d'abord les décorations de cette atmosphère, et il peut toujours en choisir une d'une autre.

## Le catalogue

| Collection | Nom | Cadres | Avec message | Hors règle d'empiètement |
|---|---|---|---|---|
| `savane` | Afrique éternelle · Savane | 19 | 11 | 10 |
| `royaumes` | Afrique éternelle · Royaumes | 19 | 12 | 12 |
| `egypte` | Égypte solaire | 19 | 14 | 16 |
| `olympe` | Olympe | 19 | 11 | 10 |
| `celeste` | Empire céleste | 19 | 11 | 0 |
| `nord` | Aurores du Nord | 19 | 12 | 12 |
| `abysses` | Abysses | 19 | 13 | 12 |
| `neon` | Néon | 19 | 13 | 18 |
| `moments` | Autres moments | 16 | 10 | 10 |
| `tresor` | Trésor | 14 | 6 | 7 |
| `poses` | Poses et messages | 9 | 5 | 6 |

Chaque manifeste (`manifests/<collection>.json`) liste, par cadre : `file`, `rank`, `division` (5→1, ou null), `option` (V…I, A/B/C, ou le palier), `name` et `story` (le nom et la courte histoire du cadre, en français), `layout` (la pose de Mee et Meo), `message` (exemple de message de l'auteur, ou null). Les planches-contacts sont dans `planches/`.

- `moments` : paliers de niveau (Lueur 10, Aurore 50, Galaxie 90, Nébuleuse 101, Supernova 400, Singularité 1000), Flamme (7, 30, 100, 365 jours), Meesh frappée (n° 1, 10, 100, 1000), réalisation du jour (A, B).
- `tresor` : Bourse (a, b), Escarcelle (a, b), Coffret (a, b), Coffre (a, b, c — chambre forte moderne), Trésor (a, b), Réserve (a, b, c — bâtiment de banque).
- `poses` : un même cadre (Ambassadeur I · Olympe) décliné en cinq poses de Mee et Meo et trois supports de message (cartouche, ruban, parchemin), plus une photo à trois.

## Anatomie d'un cadre

540 × 960 (story 9:16), un SVG par cadre, couches de bas en haut (`generateur/lib/base.py`) :

1. la photo (placeholder : deux silhouettes) ;
2. la décoration, avec la **fenêtre photo propre à chaque cadre** (arche, ovale, rectangle, forme libre) ;
3. le blason du rang, la division en gemmes ;
4. Mee et Meo (poses PNG de `generateur/mee/`, dérivées des stickers `packages/MeeshySDK/Sources/MeeshyUI/Resources/MeeStickers`) ;
5. la plaque : sur-titre « Nouveau rang · <Atmosphère> », titre, date, message optionnel (Caveat).

Texte et oiseaux sont **cuits** dans chaque SVG ; l'export (ci-dessous) en sépare les couches, les ancres des poses et les emplacements de texte vivant.

## Régénérer

Depuis `generateur/` (Python 3 + Pillow, Node avec Playwright installé par `bun install` à la racine) :

```bash
cd ateliers/<collection> && python3 gen.py        # → generateur/out/<collection>/*.svg + manifest.json (ignorés par git)
cd ../.. && node lib/render.mjs out/<collection>  # → .jpg 540×960 + sheet.png
node lib/overlap.mjs out/<collection> --png       # → overlap.json + .overlap/*.png (empiètement en rouge)
```

`lib/launch.mjs` trouve Chromium : `$PW_CHROMIUM` (ou `$CHROMIUM`), sinon celui que Playwright attend, sinon le plus récent `chromium_headless_shell-*` du cache de Playwright (macOS, Linux), sinon `/opt/pw-browsers/chromium-*/chrome-linux/chrome`. L'atelier `poses` demande `numpy` et `Pillow`. `v1/frames.py <dossier>` génère la première proposition (Murmure → Polyglotte).

## Exporter

L'app ne peint pas ces SVG : elle compose des **couches raster** et peint elle-même le texte, Mee et Meo, le blason et le bandeau (prompt § 5.1, § 5.3). Une commande, depuis `generateur/` :

```bash
node lib/export.mjs --generate      # régénère les 11 ateliers puis exporte les 191 cadres → generateur/export/ (ignoré par git)
node lib/export-check.mjs           # ROUGE tant qu'une couche porte un texte ou un oiseau, qu'une fenêtre est voilée,
                                    # que la bande du bandeau est trouée ou qu'un emplacement n'a pas de contraste mesuré
node lib/recompose.mjs              # recompose chaque cadre et le compare à la référence (§ 8.3) → export/fidelity.json
```

Options : `--only savane,neon-oracle-a` (collections ou cadres), `--jobs 3`, `--quality 82`, `--lossless`, `PYTHON=…` pour l'interpréteur des ateliers. `export.mjs --mutate text-in-decor|birds-in-decor|veil|no-contrast` rejoue un défaut connu : `export-check.mjs --partial` doit alors être ROUGE.

**Ce que l'export écrit**, par collection (`export/<collection>/export.json`, plus `export/index.json` : versions de Chromium, de sharp et de libwebp, poids par collection) et par cadre (`export/<collection>/<cadre>/*.webp`), en pixels de l'image finale 1080×1920 :

| Clé | Contenu |
|---|---|
| `window` | la fenêtre photo, TROUVÉE et non devinée : la photo factice rendue magenta puis verte, la fenêtre est là où les deux rendus diffèrent. `mask` (WebP sans perte), `box`, `area`, `veilMaxAlpha` (0) |
| `layers.decor` | le décor sans texte, sans oiseaux, sans blason, sans plaque, d'alpha nul dans la fenêtre ; la bande du bandeau (`banner.box`) y reste pleine |
| `layers.windowFill` | le fond d'atmosphère (le fond de la photo factice), découpé à la fenêtre : ce que montre une carte sans photo |
| `layers.grade` | ce que le décor peignait DANS la fenêtre, par mode de fusion : `normal`, `screen`, `multiply`, `color`, et `over` (le décor normal dessiné après un élément fondu) |
| `layers.front` | `under-birds` (décor dessiné après le blason ou la plaque, avant les oiseaux) et `over-birds` (après les oiseaux) |
| `layers.plate` | le panneau de la plaque, en `plain` ou `message` selon le cadre (une seule variante par cadre : l'atelier ne dessine que la sienne) |
| `thumb` | la vignette 270×480 du cadre complet |
| `stack` | l'ordre des couches de CE cadre, lu dans le SVG — le peintre ne le devine jamais |
| `text` | chaque emplacement (`kicker`, `title`, `message`, `date`, `plate.<n>`, `decor.<n>`) : texte, ligne de base, ancre, matrice, police (famille, graisse exacte, taille, interlettrage), remplissage résolu (dégradé et arrêts), contour, opacité, filtres, chemin courbe, boîte, effets (les copies décalées, floues ou dédoublées), et `contrast` : le contraste WCAG mesuré contre les pixels réellement dessous (5ᵉ centile, et `contrastMin`) |
| `birds` | chaque oiseau : pose, boîte carrée du sticker, rotation, miroir, opacité |
| `crest`, `motifs`, `banner`, `veil`, `inventory` | la boîte du blason ; les motifs (`afrique`, `cosmos`) ; la bande du bandeau et sa part opaque ; le voile de la fenêtre ; ce que chaque couche contient de texte et d'oiseaux, compté dans le DOM au moment du rendu |

**Comment le générateur le dit.** `lib/base.py` : `Card.layer(kind)` pose un `<g data-layer>` (photo, fond, blason, oiseaux, plaque) ; chaque `<text>` reçoit `data-slot` ; `@plate_layer` sur une fonction d'inscription range ce qu'elle dessine dans la plaque et nomme ses emplacements par ses arguments ; `nid()` est un compteur porté par `Card` (une régénération partielle rend des SVG identiques à l'octet) ; un cadre qui dessine avec la bibliothèque africaine ou cosmique d'un atelier porte le motif `afrique` ou `cosmos`. Le rendu ne bouge pas : les 191 SVG instrumentés rendent, au pixel près, la référence ci-dessous. L'export charge les polices variables dans leur plage de graisses (`lib/page.mjs`, `exactFontsCss`) : Manrope 600, Fraunces 700 ou Caveat 600 ne sont plus substituées.

**La référence de fidélité** (`reference/`, lot L0) : la génération de `c5b1390040` rendue en 1080×1920, `sha256.json` (empreinte de chaque SVG et de chaque rendu, versions de Chromium et de libwebp) et un WebP sans perte par collection (`reference/samples/`). `node lib/reference.mjs out ../reference --commit <sha>` la reproduit ; `recompose.mjs` vérifie d'abord que le rendu de référence retrouve son sha256, puis juge la recomposition hors boîtes de texte et de blason. sharp est celui du workspace de la passerelle (ou `$SHARP_MODULE`) : sa version épingle les octets des couches.

## La règle d'empiètement

Mee et Meo ne recouvrent **jamais** la photo : sur chaque cadre, `lib/overlap.mjs` doit donner **overlap ≤ 250 px, depth ≤ 6 px, face = 0**. Seule exception, la pose « selfie » choisie exprès par l'utilisateur (`poses-selfie`) : Meo dans la photo, sans toucher un visage.

État au 2026-10-10 (`controle/empietements-<collection>.json`) : aucun visage touché nulle part ; l'Empire céleste est conforme ; dans les autres collections, la pose « au pied du cadre » assied encore Mee et Meo sur les coins bas de la photo (colonne « Hors règle » ci-dessus). Dans l'app, les oiseaux deviennent une couche posée à des ancres validées par le détecteur : la règle y est une garde de CI, et ces empiètements s'y corrigent.

## Polices

Cinzel, Cinzel Decorative, Cormorant Garamond, Fraunces, Manrope, Caveat (Google Fonts, SIL Open Font License 1.1), en woff2 dans `generateur/fonts/`.
