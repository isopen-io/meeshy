# Cadres de gloire — sources de design

> **Voix de l'épopée (2026-10-20, jalon #194, #11172).** Ce que VOIT le joueur — les noms, la voix, les moments et ce qu'ils racontent —
> suit [la conception de l'épopée](../../superpowers/specs/2026-10-20-epopee-du-jeu-design.md) et son [glossaire français](../epopee/glossaire/fr.md).
> Ce dossier garde ses règles de dessin, ses nombres et ses noms techniques (`rank`, `division`, `option`, collections, champs d'export) tels quels.

Sources versionnées des cadres décoratifs des photos de gloire de Meeshy (issue #9963, parente #9382, milestone « Le jeu se comprend et se joue chaque jour »). Proposition **validée par le porteur le 2026-10-10** (« Tout est terminé »), le Néon gardé tel quel.

Ce dossier est la **source de vérité du design** des cadres. La planche publiée (rendu éphémère, pour voir) : https://claude.ai/artifact/QUWf5znxXcX1qGLEmGQGV2 — page « Sept atmosphères », avec le prototype interactif « choisir son atmosphère à Ambassadeur, puis sa décoration à Orateur ». En cas d'écart, ce dossier a raison.

Le développement dans l'app se fait avec le prompt [`PROMPT-developpement.md`](PROMPT-developpement.md).

## Dans l'épopée

Un cadre de gloire est un **signe des aïeux** : à chaque évolution du héros, ses aïeux se manifestent, et Mee et Meo, les deux colibris
messagers entre les deux mondes, l'immortalisent avec lui dans une photo qui rejoint sa **Chronique**.

- **Le rang** est le nom que le monde donne au héros, de Murmure à Légende, puis le Mythe (cent élus). Chaque rang a cinq **marches**,
  de V (la première) à I (la plus haute) : le champ `division` (5 → 1) les porte, et le texte affiché dit « marche ».
- **À Ambassadeur, les aïeux se révèlent** : le héros reconnaît leur **terre** parmi sept — les sept atmosphères ci-dessous. Aux rangs
  suivants, Meeshy propose d'abord les décorations de cette terre.
- **Les autres signes** : chaque nouvel état de **ta lumière** (Lueur, Aurore, Galaxie, Nébuleuse, Supernova, Singularité), chaque forme
  de la **Flamme** (7, 30, 100, 365 jours), chaque Meesh qui entre dans l'**Héritage** (n° 1, 10, 100, 1000), chaque contenant de
  l'Héritage (Bourse, Escarcelle, Coffret, Coffre, Trésor, Réserve) et le **rêve** réalisé.
- Le sur-titre de la plaque reste « Nouveau rang · <Atmosphère> » : l'atmosphère y est la terre des aïeux.

## La montée

| Rangs | Thème | Décorations |
|---|---|---|
| Murmure → Polyglotte | une mythologie du monde par rang | première proposition `generateur/v1/frames.py` (planche `planches/v1-premiere-proposition.jpg`), à porter au niveau des autres |
| Ambassadeur (le rang où les aïeux se révèlent) → Orateur | l'Afrique d'abord, par ses constructions ; chaque autre atmosphère y glisse l'Afrique dans un ou deux cadres | Ambassadeur : une par marche V→I et par collection ; Orateur : A, B, C |
| Oracle → Mythe | le cosmos, vers l'infiniment grand et l'infiniment petit (« du quark au quasar » au Mythe) | Oracle : A, B, C ; Légende : une par marche V→I ; Mythe : A, B, C |

À Ambassadeur, les aïeux se révèlent : le héros reconnaît leur terre, son **atmosphère**, parmi sept : Afrique éternelle (deux collections, Savane et Royaumes), Égypte solaire, Olympe, Empire céleste, Aurores du Nord, Abysses, Néon. Aux rangs suivants, Meeshy propose d'abord les décorations de cette terre, et il peut toujours en choisir une d'une autre.

## Le catalogue

| Collection | Nom | Cadres | Avec message | Hors règle d'empiètement (2026-10-10 → 2026-10-12) |
|---|---|---|---|---|
| `savane` | Afrique éternelle · Savane | 19 | 11 | 10 → 0 |
| `royaumes` | Afrique éternelle · Royaumes | 19 | 12 | 12 → 0 |
| `egypte` | Égypte solaire | 19 | 14 | 16 → 0 |
| `olympe` | Olympe | 19 | 11 | 10 → 0 |
| `celeste` | Empire céleste | 19 | 11 | 0 → 0 |
| `nord` | Aurores du Nord | 19 | 12 | 12 → 0 |
| `abysses` | Abysses | 19 | 13 | 12 → 0 |
| `neon` | Néon | 19 | 13 | 18 → 0 |
| `moments` | Autres signes des aïeux | 16 | 10 | 10 → 0 |
| `tresor` | L'Héritage | 14 | 6 | 7 → 0 |
| `poses` | Poses et messages | 9 | 5 | 6 → 0 |

Chaque manifeste (`manifests/<collection>.json`) liste, par cadre : `file`, `rank`, `division` (la marche, 5→1, ou null), `option` (V…I, A/B/C, ou le palier), `name` et `story` (le nom et la courte histoire du cadre, en français), `layout` (la pose de Mee et Meo), `message` (exemple de message de l'auteur, ou null). Les planches-contacts sont dans `planches/`.

- `moments` : états de ta lumière (Lueur 10, Aurore 50, Galaxie 90, Nébuleuse 101, Supernova 400, Singularité 1000), formes de la Flamme (7, 30, 100, 365 jours), Meesh frappée (n° 1, 10, 100, 1000), rêve réalisé (A, B).
- `tresor` : les contenants de l'Héritage — Bourse (a, b), Escarcelle (a, b), Coffret (a, b), Coffre (a, b, c — chambre forte moderne), Trésor (a, b), Réserve (a, b, c — bâtiment de banque).
- `poses` : un même cadre (Ambassadeur I · Olympe) décliné en cinq poses de Mee et Meo et trois supports de message (cartouche, ruban, parchemin), plus une photo à trois.

## Anatomie d'un cadre

540 × 960 (story 9:16), un SVG par cadre, couches de bas en haut (`generateur/lib/base.py`) :

1. la photo (placeholder : deux silhouettes) ;
2. la décoration, avec la **fenêtre photo propre à chaque cadre** (arche, ovale, rectangle, forme libre) ;
3. le blason du rang, la marche en gemmes ;
4. Mee et Meo (poses PNG de `generateur/mee/`, dérivées des stickers `packages/MeeshySDK/Sources/MeeshyUI/Resources/MeeStickers`) ;
5. la plaque : sur-titre « Nouveau rang · <Atmosphère> », titre, date, message optionnel (Caveat).

Texte et oiseaux sont **cuits** dans chaque SVG ; l'export (ci-dessous) en sépare les couches, les ancres des poses et les emplacements de texte vivant.

## Régénérer

Depuis `generateur/` (Python 3 + Pillow, Node avec Playwright installé par `bun install` à la racine) :

```bash
cd ateliers/<collection> && python3 gen.py        # → generateur/out/<collection>/*.svg + manifest.json (ignorés par git)
cd ../.. && node lib/render.mjs out/<collection>  # → .jpg 540×960 + sheet.png
node lib/overlap.mjs [--only <collection>] [--png <dossier>]   # → ../controle/empietements-<collection>.json (empiètement en rouge)
```

`lib/launch.mjs` trouve Chromium : `$PW_CHROMIUM` (ou `$CHROMIUM`), sinon celui que Playwright attend, sinon le plus récent `chromium_headless_shell-*` du cache de Playwright (macOS, Linux), sinon `/opt/pw-browsers/chromium-*/chrome-linux/chrome`. L'atelier `poses` demande `numpy` et `Pillow`. `v1/frames.py <dossier>` génère la première proposition (Murmure → Polyglotte).

## Exporter

L'app ne peint pas ces SVG : elle compose des **couches raster** et peint elle-même le texte, Mee et Meo, le blason et le bandeau (prompt § 5.1, § 5.3). Une commande, depuis `generateur/` :

```bash
node lib/export.mjs --generate      # régénère les 11 ateliers (et leurs plaques dans les deux variantes, out-plate/)
                                    # puis exporte les 191 cadres → generateur/export/ (ignorés par git)
node lib/export-check.mjs           # ROUGE tant qu'une couche porte un texte ou un oiseau, qu'une fenêtre est voilée,
                                    # que la bande du bandeau est trouée, qu'un emplacement n'a pas de contraste mesuré ou
                                    # qu'une plaque dessinée n'a pas ses deux variantes
node lib/recompose.mjs              # recompose chaque cadre et le compare à la référence (§ 8.3) → export/fidelity.json
```

Options : `--only savane,neon-oracle-a` (collections ou cadres), `--jobs 3`, `--quality 82`, `--lossless`, `PYTHON=…` pour l'interpréteur des ateliers. `export.mjs --mutate text-in-decor|birds-in-decor|veil|no-contrast|one-plate` rejoue un défaut connu : `export-check.mjs --partial` doit alors être ROUGE.

**Ce que l'export écrit**, par collection (`export/<collection>/export.json`, plus `export/index.json` : versions de Chromium, de sharp et de libwebp, poids par collection) et par cadre (`export/<collection>/<cadre>/*.webp`), en pixels de l'image finale 1080×1920 :

| Clé | Contenu |
|---|---|
| `window` | la fenêtre photo, TROUVÉE et non devinée : la photo factice rendue magenta puis verte, la fenêtre est là où les deux rendus diffèrent. `mask` (WebP sans perte), `box`, `area`, `veilMaxAlpha` (0) |
| `layers.decor` | le décor sans texte, sans oiseaux, sans blason, sans plaque, d'alpha nul dans la fenêtre ; la bande du bandeau (`banner.box`) y reste pleine |
| `layers.windowFill` | le fond d'atmosphère (le fond de la photo factice), découpé à la fenêtre : ce que montre une carte sans photo |
| `layers.grade` | ce que le décor peignait DANS la fenêtre, en PASSES ordonnées : le décor est découpé en suites consécutives de même mode de fusion (`normal`, `screen`, `multiply`…), chaque passe est une couche posée sur la photo dans l'ordre du SVG avec son `blend` (`null` quand la passe ne touche pas la fenêtre) |
| `layers.front` | l'avant-plan, en PASSES ordonnées comme le grade : chaque suite d'éléments dessinée entre deux ancrages (blason, plaque, oiseaux) prend le rang de l'ancrage qu'elle précède — `under-birds` (la lueur sous chaque oiseau), `under-plate`, `under-crest` — et la suite qui suit le dernier ancrage est `over-birds`. Une lueur dessinée après la plaque reste au-dessus d'elle ; `stack` dit l'ordre |
| `layers.plate` | le panneau de la plaque dans ses DEUX variantes, `plain` et `message` (§ 5.1, la hauteur change avec le message), quand la plaque est un panneau dessiné (`null` sinon). La variante du cadre vient de son SVG ; l'autre, de l'atelier rejoué avec `CADRES_PLATE` (`lib/base.py` : `plain` retire le message, `message` pose celui du cadre ou « On brille ensemble ») sous `out-plate/<variante>/`. Chaque panneau se lit DANS sa scène (un filtre en linearRGB quantifie les sombres selon ce qui est peint autour) : sa couleur se résout depuis la scène complète et la même scène sans lui, son alpha restant celui du rendu seul |
| `plateVariant` | l'autre variante : son nom, `decorDelta` (pixels du décor qui diffèrent de celui du cadre : 0, sinon export-check est rouge) et la géométrie de ses emplacements (`kicker`, `title`, `message`, `date` : le message déplace la date) |
| `thumb` | la vignette 270×480 du cadre, photo factice, oiseaux, blason et plaque compris, SANS texte : le texte est vivant et localisé, une vignette ne le cuit pas en français (et le rendu Chromium d’un titre en dégradé sur chemin courbe n’est pas déterministe) |
| `stack` | l'ordre des couches de CE cadre, lu dans le SVG — le peintre ne le devine jamais |
| `text` | chaque emplacement (`kicker`, `title`, `message`, `date`, `plate.<n>`, `decor.<n>`) : texte, ligne de base, ancre, matrice, police (famille, graisse exacte, taille, interlettrage), remplissage résolu (dégradé et arrêts), contour, opacité, filtres, chemin courbe, boîte, effets (les copies décalées, floues ou dédoublées), et `contrast` : le contraste WCAG mesuré contre les pixels réellement dessous (5ᵉ centile, et `contrastMin`) |
| `birds` | chaque oiseau posé (`bird()`) : pose, boîte carrée du sticker, rotation, miroir, opacité |
| `art` | les boîtes des images de Mee qui restent dans le décor parce qu'elles en sont une ILLUSTRATION (frappées sur une pièce, en hologramme au Néon) et non un oiseau posé |
| `crest`, `motifs`, `banner`, `veil`, `inventory` | la boîte du blason ; les motifs (`afrique`, `cosmos`) ; la bande du bandeau et sa part opaque ; le voile de la fenêtre ; ce que chaque couche contient de texte et d'oiseaux, compté dans le DOM au moment du rendu |

**Comment le générateur le dit.** `lib/base.py` : `Card.layer(kind)` pose un `<g data-layer>` (photo, fond, blason, oiseaux, plaque) ; chaque `<text>` reçoit `data-slot` ; `@plate_layer` sur une fonction d'inscription range ce qu'elle dessine dans la plaque et nomme ses emplacements par ses arguments ; `nid()` est un compteur porté par `Card` (une régénération partielle rend des SVG identiques à l'octet) ; un cadre qui dessine avec la bibliothèque africaine ou cosmique d'un atelier porte le motif `afrique` ou `cosmos`, et un atelier qui dessine l'Afrique sans module nommé le dit lui-même (`card.motif("afrique")` : Malindi et le carillon aux cauris de l'Empire céleste, l'or de Nubie, le baobab de la première lueur et le journal au bogolan, le drakkar au kente, la bourse aux cauris et le kuduo akan). Le rendu ne bouge pas : les 191 SVG instrumentés rendent, au pixel près, la référence ci-dessous. L'export charge les polices variables dans leur plage de graisses (`lib/page.mjs`, `exactFontsCss`) : Manrope 600, Fraunces 700 ou Caveat 600 ne sont plus substituées.

**La référence de fidélité** (`reference/`, lot L0) : la génération de `c5b1390040` rendue en 1080×1920, `sha256.json` (empreinte de chaque SVG et de chaque rendu, versions de Chromium et de libwebp) et un WebP sans perte par collection (`reference/samples/`). `node lib/reference.mjs out ../reference --commit <sha>` la reproduit ; `recompose.mjs` vérifie d'abord que le rendu de référence retrouve son sha256, puis juge la recomposition hors boîtes de texte et de blason. **La tolérance du § 8.3 juge la SÉPARATION des couches : elle se mesure sur un export `--lossless`.** L'encodage de livraison (WebP q82, le poids visé par le § 5.1) ajoute sa propre perte, que `recompose.mjs` chiffre à part (part de pixels, PSNR) : sur un décor texturé (papier, grain), aucune qualité avec perte raisonnable ne tient |Δ| ≤ 6 sur 99,5 % des pixels, et le compromis poids / perte se tranche au L3, où le poids des packs se mesure. sharp est celui du workspace de la passerelle (ou `$SHARP_MODULE`) : sa version épingle les octets des couches.

## Les cibles de fidélité

**Ce contre quoi les peintres web et iOS se jugent (prompt § 8.3, lot L21a, #10177), rendu par le générateur AVANT que l'app ne peigne.** L'échantillon versionné sous `cible/` : **un cadre par collection** (l'Ambassadeur I des sept atmosphères, comme la référence L0 ; `moments-flamme-30`, `tresor-coffre-a`, `poses-pied` pour les trois autres), dans la mise en page que le contrat lui connaît (chaque cadre en déclare exactement une, `birds.default`), **avec et sans message** (`<cadre>.plain.webp`, `<cadre>.message.webp` — les deux variantes de plaque, `CADRES_PLATE`), en **9:16**. Vingt-deux fichiers et `cible/index.json` (versions de Chromium, de sharp et de libwebp, boîte de la fenêtre, sha256, poids et verdict de stabilité de chaque cible). Une commande, depuis `generateur/` :

```bash
node lib/cible.mjs --generate        # régénère les 11 ateliers dans les deux variantes, puis rend l'échantillon → ../cible/
node lib/cible.mjs --generate --check  # le rend à part et exige l'identité à l'octet avec les cibles versionnées
node lib/cible.mjs --full            # le jeu COMPLET (191 cadres × 2 variantes) → generateur/cible-complete/, jamais versionné
```

Options : `--jobs 3` ; `--only savane,poses` et `--final` (garde le 1080×1920) **exigent `--cible <dossier>`** (hors `--check`) : le dossier versionné `cible/` ne reçoit que l'échantillon complet, et un plan vide (collection inconnue, `out/` vide) est rouge. Chromium par `lib/launch.mjs` — en CI, `playwright@1.56.1`, dont le Chromium 141.0.7390.37 est celui de `cible/index.json` ; les témoins du générateur (`node --test lib/*.test.mjs`, lancés par le job) tiennent l'épingle et l'index ensemble, et se lancent localement après `npm install --prefix . --no-save --no-package-lock playwright@1.56.1` depuis `generateur/`. sharp par `lib/sharp.mjs`.

- **La photo est une FIXTURE versionnée**, `generateur/fixture/photo.jpg` : un paysage dessiné par `lib/fixture.mjs` (libre de droits, aucun visage), au format d'une photo développée par l'app (1 080 × 1 440, JPEG q0,85). Elle prend la place des silhouettes, **recadrée en `cover` sur la boîte de la fenêtre** (trouvée comme à l'export, par différence magenta / vert) et centrée : c'est la pose par défaut que les peintres reproduisent. Le texte français et la date « 10 octobre 2026 » sont ceux des SVG.
- **Chaque cible se prouve** : le cadre est rendu deux fois, depuis deux chargements de page ; des octets différents rendent la commande rouge et la cible `stable: false`. C'est pour cela que les trois collections hors atmosphère n'échantillonnent pas le cadre de la référence L0 : un titre en dégradé sur chemin courbe (`poses-ruban`, `moments-meesh-100`, `tresor-reserve-a`) ne se rend pas deux fois à l'identique dans Chromium.
- **Rendues en 1080 × 1920 comme l'app peint, versionnées à l'échelle de design (540 × 960)** par la moyenne EXACTE de chaque bloc 2 × 2 en alpha prémultiplié (`lib/cible-plan.mjs`, `halve`), WebP sans perte : 7,5 Mo pour l'échantillon, contre plus de 20 Mo en 1080 × 1920 (0,9 Mo par cible mesurés sur la Savane, la plus légère). Un peintre qui se juge contre ces cibles applique la même descente à sa composition avant la comparaison du § 8.3 ; `--final` rend le 1080 × 1920 quand il le faut.
- **Pas de carré** : D1 (#10180) tient le 1:1 d'un cadre décoré pour la carte simple (`formats.square: null`), et le médaillon viendra en lot additif avec sa cible ; `index.json` le dit (`formats.square`).
- **La fraîcheur se juge sur l'export normalisé, jamais sur ces octets** (§ 8.3) : en CI, le job du générateur régénère l'échantillon, le publie en artefact et ne fait que SIGNALER un écart avec les cibles versionnées ; le jeu complet n'est produit (artefact) que sur `workflow_dispatch`.
- Les cibles sont rendues sur l'**état courant des cadres** (ancres L2, #10153) ; la revalidation du porteur reste attendue, et un cadre qu'elle ferait bouger se régénère par la même commande.

## La règle d'empiètement

Mee et Meo ne recouvrent **jamais** la photo : sur chaque cadre, **overlap ≤ 250 px, depth ≤ 6 px, face = 0** (repère de design, `lib/overlap-rule.mjs`). Une mise en page `selfie` (déclarée par le manifeste : Meo dans la photo) est exemptée de l'overlap et de la profondeur, jamais du visage.

**Le détecteur v2** (`lib/overlap.mjs`, lot L2) : la fenêtre est trouvée par DIFFÉRENCE (photo factice magenta puis verte sous tout ce que le cadre peint par-dessus, oiseaux exceptés : plus aucun faux positif sur un décor magenta) ; les oiseaux se lisent par `data-layer="birds"` (leur corps, pas leur ombre) ; les visages sont les cercles du placeholder, à leur position rendue. Sans option, il réécrit `controle/` ; avec `--check`, c'est la **garde de CI** (job « Cadres de gloire (empiètement) » de `ci.yml`, domaine `glory_frames` de `scripts/ci-affected.mjs`) : elle sort en 1 dès qu'un cadre est hors règle, et son témoin (`--mutate bird-in-window`, un oiseau posé au centre de la fenêtre) prouve qu'elle rougit.

**Les ancres** (`lib/anchors.json`, calculées par `node lib/anchors.mjs`) : pour chaque cadre hors règle, chaque oiseau qui recouvre la photo est déplacé du MOINS possible, vers l'extérieur de la fenêtre, un peu réduit au besoin, sans sortir de la carte ni couvrir le texte de la plaque ou le blason. `lib/base.py` les applique à l'enregistrement du SVG ; ce qui suit un oiseau (`data-follows-bird` : la lueur du Néon, les queues du ruban tenues au bec) bouge avec lui ; le décor ne bouge pas. Relancer l'outil AFFINE (une correction se compose avec la précédente) ; `CADRES_ANCHORS=off` rend le dessin validé du 2026-10-10. La référence L0 n'est pas réécrite : `node lib/reference.mjs out ../reference --amend l2 --design <out CADRES_ANCHORS=off>` ajoute sous `amendments.l2` le rendu des seuls cadres corrigés, avec la preuve que le dessin validé se retrouve à l'octet et que le décor (oiseaux, suiveurs et texte vivant masqués) est identique au pixel ; `recompose.mjs` juge ces cadres contre l'amendement.

État au 2026-10-12 (`controle/`) : **191/191 cadres dans la règle, aucun visage touché** ; 107 cadres ont des ancres corrigées (199 oiseaux : déplacement médian 54 px de design, 66 légèrement réduits), relevé d'avant : 106 hors règle au détecteur v2 (113 au v1), un 107e rapproché de la limite par marge. La planche avant/après de chaque collection est sous `planches/l2-avant-apres/` ; **le porteur revalide** (#9963) — vider `lib/anchors.json` rend le dessin d'avant.

## Polices

Cinzel, Cinzel Decorative, Cormorant Garamond, Fraunces, Manrope, Caveat (Google Fonts, SIL Open Font License 1.1), en woff2 dans `generateur/fonts/`.
