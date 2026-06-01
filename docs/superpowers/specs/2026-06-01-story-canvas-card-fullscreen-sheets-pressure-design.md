# Story Canvas — Carte arrondie, plein écran immersif, sheets flexibles & pression du dessin

**Date** : 2026-06-01
**Statut** : Design validé (brainstorming) — en attente de relecture utilisateur avant plan d'implémentation
**Cibles** : `packages/MeeshySDK/Sources/MeeshyUI/Story/**`, `apps/ios/Meeshy/Features/Main/Views/StoryViewer*`

## 1. Contexte & motivation

Demande utilisateur (verbatim reformulé) :
1. En **édition** (composer), reproduire une forme de canvas claire : carte 9:16 à **coins arrondis** et limites nettes, posée **sous le header** (slides / preview / bouton d'envoi) et **au-dessus de la zone de contrôle** quand un sheet s'affiche.
2. Permettre la **manipulation des sheets de tous les outils** avec la **même flexibilité que l'outil Dessin** (poignée de redimensionnement + repli en tiroir).
3. L'**outil Dessin** doit **préserver l'épaisseur de trait pendant le dessin** et **respecter la pression** (force qui grossit les traits).
4. En **lecture** (reader), **préserver les coins arrondis** : canvas dans le viewport, **sous les infos auteur** et **au-dessus de la zone de composition**.
5. L'**activation du plein écran** fait une **animation de zoom** immersive pour occuper tout l'écran.
6. Au **retour**, même animation : **arrondir les bords progressivement** et **recentrer** le canvas.

### Décisions de cadrage (Q&A)
- **Structure** : un seul spec + plan, découpé en 3 lots livrables par incréments testés.
- **Plein écran animé** : **reader uniquement** (le composer conserve son zoom pinch 3 doigts existant).
- **Pression du trait** : **force Apple Pencil** quand disponible (iPad) **+ simulation par vitesse au doigt** (iPhone, pas de 3D Touch) — couvre iPhone et iPad.
- **Sheets** : **parité totale** avec Dessin (redimensionnement par poignée **+** repli en tiroir gardant l'outil actif, canvas plein).

### État actuel (résumé de l'exploration ; file:line)
- **Composer canvas** : `StoryComposerView.canvasComposerLayer` (`StoryComposerView.swift:1218`) cadre en 9:16 via `CanvasGeometry.aspectFitSize` ; coins arrondis `22` et `topReserve` **uniquement** quand `canvasIsInset` (`StoryComposerView.swift:1302-1305`), lui-même piloté par `drawingEditingMode.isActive || bandStateMachine.state.activeCategory == .drawing`. Hors dessin → plein bord, coins `0`.
- **Top bar composer** : `StoryComposerView.swift:682-702`, 60pt, `.ultraThinMaterial` (dismiss / slides / preview / publish / menu).
- **Band partagé** : `ComposerBottomBand` (poignée 42×5) + `ComposerToolPanelHost`. Seul le panneau **Dessin** est redimensionnable (`resizableHeight` passé uniquement pour dessin) et repliable (`drawingDrawerCollapsed`). Clamp `[160, 540]` (`ComposerControlsLayer.swift:21-22`). Hauteur via `composerBandHeight` (`StoryComposerView.swift:197`), drawer height (`StoryComposerView.swift:1311-1314`). États : `BandStateMachine` (`hidden | toolPanel | formatPanel`).
- **Zoom composer** : pinch 3 doigts → `canvasScale` `[0.5, 4.0]` + `canvasOffset`, bouton reset. Pas de « plein écran » dédié.
- **Drawing** : `StrokeCaptureLayer` via PencilKit `PKCanvasView` (`.anyInput`) ; `extract()` ne lit **que** `location` (pas `force`). Largeur = **propriété plate par trait** `StoryDrawingStroke.width` (1–30, marker ×2). `StoryDrawingStrokePoint.pressure` existe mais **inutilisé** en capture & rendu. Rendu : `MeeshyStrokeCanvas` (live, `StrokeStyle(lineWidth:)` constant) + `StoryStrokeRasterizer` (baked reader, `setLineWidth` constant), path via `StrokePathBuilder`. Projection capture non-uniforme (`scaleX = 1080/bounds.w`, `scaleY = 1920/bounds.h`) ; la **largeur n'est jamais projetée**.
- **Reader** : `StoryCardView` cadre le canvas en 9:16 (`canvasFitSize = CanvasGeometry.aspectFitSize`, `StoryCardView:651-758`) **plein-fond** + backdrop flou en letterbox ; **pas de coins arrondis** en mode normal (seulement pendant le drag de dismiss). `StoryHeaderView` (avatar/nom/menu) **au-dessus**, `StoryComposerBarView` (réponse, si `!isOwnStory`) **en dessous**, superposés en chrome. `isFullscreenStorySession` (`StoryViewerView.swift:159`, toggle menu `StoryViewerView+Sidebar.swift:571-587`) **masque seulement le chrome** — aucune animation de zoom canvas ni de coins.
- **Parité géométrie** : `CanvasGeometry.aspectFitSize` est la source de vérité partagée composer↔reader.

## 2. Lot A — Canvas « carte arrondie » + plein écran reader

### A1 — Cadrage en édition (composer)
Introduire `canvasIsCarded` (généralise `canvasIsInset`) :
```
canvasIsCarded = bandStateMachine.state != .hidden
              || drawingEditingMode.isActive
              || textEditingMode != .inactive
```
Quand `canvasIsCarded` : canvas = carte 9:16 à coins arrondis `22`, `topReserve` sous le top bar, et **borne basse** au-dessus du sheet (la région d'aspectFit est réduite par la hauteur du band). Sinon (free canvas, FABs only) : plein bord, coins `0`, comportement actuel.
Seam : `StoryComposerView.canvasComposerLayer` — remplacer le pilotage par `canvasIsInset` (dessin) par `canvasIsCarded`, et réserver une hauteur basse = hauteur effective du band (cf. Lot B) quand un panneau est ouvert.

### A2 — Cadrage en lecture (reader)
`StoryCardView` : le canvas devient une **carte 9:16 arrondie** (cornerRadius `22`) cadrée dans la région **sous `StoryHeaderView`** et **au-dessus de `StoryComposerBarView`**, au lieu d'être plein-fond avec chrome superposé. Le backdrop flou reste **derrière** la carte (letterbox). En mode immersif (A3) la carte s'étend plein bord (coins `0`) et le chrome disparaît.
Note : changement assumé du look reader par défaut (plein-fond → carte) — à valider en smoke.

### A3 — Animation plein écran (reader)
`@State isImmersive` synchronisé avec `isFullscreenStorySession`. Un seul ressort `withAnimation(.spring(response: 0.42, dampingFraction: 0.82))` (valeurs à régler) interpole en parallèle :
- **frame** de la carte : région réduite (sous header / au-dessus composer) → plein écran ;
- **cornerRadius** : `22 → 0` ;
- **opacité du chrome** (header auteur + composition) : `1 → 0`.
Retour = animation inverse (coins se ré-arrondissent + recentrage). Le toggle menu existant déclenche `isImmersive` (aujourd'hui il ne fait que basculer `chromeVisible`).
**Technique retenue** : animer directement `frame` + `cornerRadius` du conteneur canvas (un seul `UIViewRepresentable`) via `withAnimation`. *Alternative `matchedGeometryEffect` rejetée : superflue pour une vue unique, plus fragile.*

### A4 — Helper de cadrage partagé
Petit type pur (testable) calculant, à partir de `CanvasGeometry.aspectFitSize`, les **insets de région** (haut/bas) et le **cornerRadius** selon l'état (`carded` vs `immersive`/`plein`). Utilisé par composer (A1) et reader (A2/A3) pour garantir la parité.

## 3. Lot B — Sheets flexibles universels (parité Dessin)

### B1
La poignée de `ComposerBottomBand` expose **toujours** `resizableHeight` (binding hauteur, clamp `[160, 540]`) + le **repli en tiroir**, pour **tous** les outils (plus seulement `.drawing`).

### B2
Remplacer l'état drawing-only (`composerBandHeight`, `drawingDrawerCollapsed`) par un **état du band** (hauteur + replié) consommé par `ComposerControlsLayer` + `ComposerToolPanelHost`, valable pour chaque catégorie d'outil (texte / couleur / taille / align / fond / bordure, média, audio, fond/texture, filtres). Chaque panneau devient : redimensionnable ↕ (poignée) + repliable en tiroir (garde l'outil actif, canvas plein). Conserver la hauteur par-catégorie (mémoriser la dernière hauteur choisie par outil est un bonus, non requis).

### B3
`canvasIsCarded` (A1) suit l'état du band : **tiroir replié** → canvas plein ; **panneau ouvert** → canvas en carte au-dessus du band.

## 4. Lot C — Épaisseur fidèle + pression (Pencil force + vitesse au doigt)

### C1 — Largeur par-point (capture)
Étendre `StrokeCaptureLayer.extract` pour produire une **largeur effective par point** :
- lire `PKStrokePoint.force` / `maximumPossibleForce` (Pencil) ;
- au doigt (force absente/uniforme), dériver la **vitesse locale** = distance entre points consécutifs / Δ-paramètre, **lissée** (moyenne glissante).
Stocker par point dans **`StoryDrawingStrokePoint.pressure`** (champ déjà existant, déjà sérialisé, déjà lu par la migration legacy, aujourd'hui inutilisé en rendu), interprété comme **driver de largeur normalisé `[0,1]`, orienté « plus haut = plus épais »** :
- Pencil → `force / maxForce` (forte pression = épais) ;
- doigt → `1 − vitesseNormaliséeLissée` (lent = épais).
Ainsi le **rendu applique une seule formule** quelle que soit la source (le renderer n'a pas à connaître Pencil vs doigt). Décision actée : on **réutilise `pressure`**, pas de nouveau champ.

### C2 — Mapping (fonction pure unique, valeurs à régler)
Une seule formule au rendu, alimentée par le driver `pressure` (C1, déjà orienté « haut = épais ») :
`effWidth = clamp(base × lerp(0.5, 1.6, pressure), 1, 2.5 × base)`.
Le calcul du driver est, lui, spécifique à la source (force Pencil vs vitesse doigt) et vit côté **capture** (C1), lissé pour éviter le tremblement.

### C3 — Rendu largeur variable (live + baked, partagé)
`MeeshyStrokeCanvas` (live overlay) et `StoryStrokeRasterizer` (baked reader) tracent aujourd'hui un **polyligne à `lineWidth` constant**. Passer à un rendu **largeur variable** : tracer des segments épaissis (quads) ou empiler des disques le long du chemin, largeur interpolée entre points. Extraire un **builder partagé** (réutiliser/étendre `StrokePathBuilder`) pour garantir une **parité exacte live ↔ baked**.

### C4 — « Préserver l'épaisseur pendant le dessin »
Cause racine : pendant le tracé, `PKCanvasView` affiche **son encre native** (largeur variable selon la force) ; à la validation, Meeshy ré-extrait en **largeur plate** → l'épaisseur **saute** au lâcher. Fix :
1. Le modèle largeur-variable (C1–C3) fait que le **rendu committé matche l'encre Pencil**.
2. Peindre l'**aperçu live** avec le **même** renderer Meeshy largeur-variable (et neutraliser visuellement l'encre PencilKit native pendant la saisie : encre transparente / overlay Meeshy par-dessus) → cohérence live ↔ committé.
3. La largeur est désormais **projetée** design↔render comme les positions (avec le canvas 9:16 imposé, `scaleX == scaleY`, donc projection uniforme via `scaleFactor`).

## 5. Stratégie de test (TDD)

SDK : scheme `MeeshySDK-Package`, destination iPhone 16 Pro (UDID `30BFD3A6-…`), `-derivedDataPath apps/ios/Build/DerivedData` (cf. lessons). Fonctions pures privilégiées :
- **A** : helper de cadrage (insets + cornerRadius selon `carded`/`immersive`) ; cibles d'animation (état `isImmersive` → frame/cornerRadius/opacité chrome).
- **B** : dérivation `canvasIsCarded` ; clamp/collapse du band généralisé à tous les outils (plus de gating `.drawing`).
- **C** : mappings `force→width` et `vitesse→width` (pures) ; builder de path largeur-variable ; **parité live ↔ baked** (même largeur effective par point).
- Smoke visuel (manuel/simulateur) : look carte reader, animation plein écran aller/retour, redim/repli des sheets de 2-3 outils non-dessin, trait au doigt (vitesse) et — si dispo — Pencil (force).

## 6. Séquencement, dépendances, risques

- **Ordre** : A → B (B dépend de l'état carte de A pour réserver la hauteur basse) → C (indépendant, parallélisable).
- **Risques** :
  1. Changement visuel reader (plein-fond → carte) — valider en smoke, prévoir un retour arrière simple si rejet.
  2. Perf du rendu largeur-variable (beaucoup de points) — garder le builder efficace (éviter un disque par pixel ; quads entre points).
  3. Neutralisation propre de l'encre PencilKit native pendant l'aperçu live sans casser la capture tactile.
  4. Région basse du composer doit suivre la hauteur **animée** du band (éviter un saut quand on redimensionne le sheet).

## 7. Hors périmètre (YAGNI)
- Plein écran animé **composer** (zoom pinch existant conservé).
- Mémorisation persistante de la hauteur de sheet par outil (bonus éventuel, pas requis).
- Refonte du backdrop flou letterbox du reader (réutilisé tel quel derrière la carte).
- Export MP4 / pipeline backend (inchangé).
