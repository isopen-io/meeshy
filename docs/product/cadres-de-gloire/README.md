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

Aujourd'hui texte et oiseaux sont **cuits** dans chaque SVG : l'app aura besoin de couches séparées (décor à fenêtre transparente, ancres des poses, emplacements de texte vivant et localisé). C'est le premier lot du prompt de développement.

## Régénérer

Depuis `generateur/` (Python 3 + Pillow, Node avec Playwright installé par `bun install` à la racine) :

```bash
cd ateliers/<collection> && python3 gen.py        # → generateur/out/<collection>/*.svg + manifest.json (ignorés par git)
cd ../.. && node lib/render.mjs out/<collection>  # → .jpg 540×960 + sheet.png
node lib/overlap.mjs out/<collection> --png       # → overlap.json + .overlap/*.png (empiètement en rouge)
```

`lib/launch.mjs` trouve Chromium : `$PW_CHROMIUM`, sinon celui de Playwright, sinon `/opt/pw-browsers/chromium-*/chrome-linux/chrome`. `v1/frames.py <dossier>` génère la première proposition (Murmure → Polyglotte).

## La règle d'empiètement

Mee et Meo ne recouvrent **jamais** la photo : sur chaque cadre, `lib/overlap.mjs` doit donner **overlap ≤ 250 px, depth ≤ 6 px, face = 0**. Seule exception, la pose « selfie » choisie exprès par l'utilisateur (`poses-selfie`) : Meo dans la photo, sans toucher un visage.

État au 2026-10-10 (`controle/empietements-<collection>.json`) : aucun visage touché nulle part ; l'Empire céleste est conforme ; dans les autres collections, la pose « au pied du cadre » assied encore Mee et Meo sur les coins bas de la photo (colonne « Hors règle » ci-dessus). Dans l'app, les oiseaux deviennent une couche posée à des ancres validées par le détecteur : la règle y est une garde de CI, et ces empiètements s'y corrigent.

## Polices

Cinzel, Cinzel Decorative, Cormorant Garamond, Fraunces, Manrope, Caveat (Google Fonts, SIL Open Font License 1.1), en woff2 dans `generateur/fonts/`.
