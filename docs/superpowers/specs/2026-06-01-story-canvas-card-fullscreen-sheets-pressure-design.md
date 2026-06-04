# Story Canvas — Carte arrondie, plein écran immersif, sheets flexibles & pression du dessin

**Date** : 2026-06-01
**Statut** : Design v2 — révisé après revue critique multi-agents (Opus). En attente de relecture utilisateur avant plan d'implémentation.
**Cibles** : `packages/MeeshySDK/Sources/MeeshyUI/Story/**`, `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/**`, `apps/ios/Meeshy/Features/Main/Views/StoryViewerView*`

## 1. Contexte & motivation

Demande utilisateur :
1. En **édition** (composer) : canvas en **carte 9:16 à coins arrondis**, sous le header (slides / preview / Envoyer) et **au-dessus de la zone de contrôle** quand un sheet s'affiche.
2. **Sheets de tous les outils** manipulables avec la **flexibilité de l'outil Dessin**.
3. **Dessin** : **préserver l'épaisseur pendant le tracé** et **respecter la pression** (force qui grossit les traits).
4. En **lecture** (reader) : **coins arrondis**, canvas **sous les infos auteur** et **au-dessus de la zone de composition**.
5. **Plein écran** : **animation de zoom** immersive jusqu'à remplir l'écran.
6. **Retour** : même animation inverse (coins se ré-arrondissent + recentrage).

### Décisions actées (Q&A + revue)
- **Structure** : un seul spec + plan, 3 lots livrables par incréments testés.
- **Plein écran animé** : **reader uniquement**.
- **Pression** : **force Apple Pencil** (iPad) **+ vitesse au doigt** (iPhone). Driver normalisé `[0,1]` orienté « haut = épais ». **Aucune régression sur les dessins existants** (cf. C2).
- **Sheets** : **redimensionnement** ET **repli-tiroir (peek)** généralisés à **tous** les outils du band (cf. Lot B). `.timeline` exclu.
- **Composer (sheet ouvert)** : canvas **TOUJOURS cardé au-dessus du sheet — jamais derrière/couvert**, **uniforme pour tous les outils, Dessin compris** (remplace « Option A »). **Couplage inverse** : sheet ↕ → canvas ↕ (sheet grandit → canvas rétrécit ; sheet se replie → canvas plein).
- **Reader** : **carte à inserts symétriques** (taille de carte identique pour ses stories et celles des autres → parité 9:16 préservée).

### Technique transversale (clé de voûte) — transform de conteneur, pas d'animation de frame
**Le canvas (`StoryCanvasUIView`) garde des bounds intrinsèques FIXES** = `CanvasGeometry.aspectFitSize` du **viewport plein** (taille « plein écran »). Son placement en carte (rétréci, arrondi, décalé) et l'animation plein écran sont rendus par un **conteneur SwiftUI** appliquant `scaleEffect` + `offset` + `clipShape(RoundedRectangle(cornerRadius))` — **jamais en changeant la frame du `UIViewRepresentable`**.

Pourquoi c'est nécessaire (revue) :
- Changer la frame déclenche `StoryCanvasUIView.layoutSubviews → rebuildLayers()` **à chaque frame d'animation**, non-caché en `.edit` + recapture du backdrop (`StoryCanvasUIView.swift:838, 1281-1297`) → tempête de rebuild. Un `scaleEffect` de conteneur n'invoque pas `layoutSubviews`.
- Bounds intrinsèques constants ⇒ `CanvasGeometry.scaleFactor` **constant** ⇒ placement texte/sticker/dessin **identique** quelle que soit la taille de carte ⇒ **parité préservée**, y compris entre ses stories et celles des autres, et entre carte/plein écran.
- L'éditeur texte inline et les handles d'éléments vivent **dans** le canvas scalé → ils restent alignés ; `canvasNaturalFrame` lit la frame **présentée** (post-scale) pour l'évitement clavier.

Conséquence : la projection est **toujours uniforme** (bounds 9:16, `scaleX == scaleY`), donc le rendu largeur-variable du Lot C n'a **pas** de dépendance cachée à A (cf. §6).

### État actuel (vérifié ; file:line corrigés)
- **Composer canvas** : `StoryComposerView.canvasComposerLayer` (`packages/MeeshySDK/.../StoryComposerView.swift:1218`) ; déjà 9:16 via `CanvasGeometry.aspectFitSize` ; coins `22` + `topReserve` **uniquement** si `canvasIsInset` (`:1302-1305`, piloté par dessin). **Décision « Option A » en place** : `:1233-1314` — *canvas reste plein, le drawer flotte par-dessus, il ne le rétrécit pas* (`drawingDrawerHeight` ne sert qu'à lever le toolbar flottant). Canvas (`canvasComposerLayer`) et band (`ComposerControlsLayer`) sont des siblings ZStack qui se chevauchent (`:280-310`).
- **Top bar composer** : `:682-702`, 60pt, `.ultraThinMaterial`.
- **Band** : `ComposerBottomBand` + `ComposerToolPanelHost`. Resize/collapse câblés **uniquement** pour `.drawing` (`ComposerControlsLayer.swift:62` `isBandResizable = activeCategory == .drawing`, `:177-216` ; `ComposerBottomBand.swift:26-36,210-240` ; override hauteur dessin `ComposerToolPanelHost.swift:27,119,176`). Clamp `[160, 540]` (`ComposerControlsLayer.swift:21-22`). États `BandStateMachine` (`hidden | toolPanel | formatPanel`). `.timeline` est un **sheet plein écran**, pas dans le band (`ComposerControlsLayer.swift:133-135`, `ComposerToolPanelHost.swift:180,199-200`).
- **Texte** : édition format via overlay flottant `StoryTextEditToolbar` (`StoryComposerView.swift:314`, gated `textEditingMode`), distinct du panneau band `.formatPanel(.text,…)`.
- **Drawing** : `StrokeCaptureLayer` (PencilKit `PKCanvasView`) ; `extract()` ne lit que `location` (`StrokeCaptureLayer.swift:45-47`) — `force`/`timeOffset`/`maximumPossibleForce` disponibles mais jetés ; `canvasViewDrawingDidChange` (`:128`) **commit + clear à chaque mutation mid-geste** (`:142-149`). Largeur = propriété **plate** `StoryDrawingStroke.width` (`StoryDrawingStroke.swift:18`, marker ×2) ; `StoryDrawingStrokePoint.pressure` défaut `1.0`, **inutilisé** (`:50`). Rendu : `MeeshyStrokeCanvas` (live, `StrokeStyle(lineWidth:)` constant, `.equatable()` sur le tableau — défait mid-geste) + `StoryStrokeRasterizer` (baked, `setLineWidth` constant) ; path via `StrokePathBuilder` (core target) qui **lisse** (Catmull-Rom resample / RDP décimation) en `[CGPoint]` **sans** la pression.
- **Reader** : `StoryCardView` (`apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:482`) ; canvas **déjà 9:16 letterboxé** (`:651-656,757-758`), pas plein-fond ; seul `storyBlurredBackdrop` est plein-cadre (`:1270-1281`). Pas de coins arrondis en mode normal (seulement pendant le drag de dismiss). `StoryViewerContentView` applique déjà une pile de transforms à la carte ENTIÈRE : `cardScale`, `cardCornerRadius (+ slideProgress*16)`, `cardOpacity`, `rotation3DEffect` (`StoryViewerView+Canvas.swift:1410-1424` ; `StoryViewerView.swift:829-832`). `StoryHeaderView` au-dessus, `StoryComposerBarView` (réponse) en dessous **uniquement si `!isOwnStory`** (`:1087`) — asymétrie de réserve basse (`bottomReserved = safe + (isOwnStory ? 56 : 96)`, `:991`). Overlay de gestes plein-viewport (prev/next à `width/2`, `:186`), sidebar plein bord droit (`:990-1046`), scrims tunés plein-fond (`:846-877`). `isFullscreenStorySession` (toggle menu `StoryViewerView+Sidebar.swift:573-589`) **masque seulement le chrome** + **inverse** la sémantique long-press (`+Canvas.swift:127,143,162`) ; **aucun zoom canvas**.
- **Parité géométrie** : `CanvasGeometry.aspectFitSize` source de vérité partagée (note : `:58` retourne `available` tel quel sur entrée dégénérée → à tester).
- **Isolation** : `MeeshyUI` est `.defaultIsolation(MainActor.self)` (`Package.swift:27`). `StrokePathBuilder`/`CanvasGeometry`/`StoryDrawingStroke` sont dans le **target core** (nonisolated) ; `MeeshyStrokeCanvas`/`StoryStrokeRasterizer` dans MeeshyUI.

## 2. Lot A — Canvas « carte arrondie » + plein écran reader

### A1 — Composer : carte rétrécie au-dessus du sheet, UNIFORME pour TOUS les outils (transform de conteneur)
`canvasIsCarded = (BandState != .hidden) || drawingEditingMode.isActive || (textEditingMode != .inactive)`.
Quand `canvasIsCarded` : le **conteneur** du canvas applique `scaleEffect`+`offset`+`clipShape(RoundedRectangle(22))` pour placer le canvas (bounds intrinsèques 9:16 plein) **entièrement dans la région `[bas du header … haut du sheet]`**, **toujours AU-DESSUS du sheet, jamais derrière/couvert**. Sans carte : scale `1`, coins `0` (plein).
- **Comportement unifié — Dessin compris.** On **abandonne la décision « Option A »** (`StoryComposerView.swift:1233-1314` : canvas plein, drawer flottant par-dessus, « il ne le rétrécit plus »). **Bug constaté** : aujourd'hui le sheet se redimensionne correctement mais **flotte par-dessus le canvas (canvas derrière, plein)**. Désormais, pour **chaque** outil, sheet et canvas **ne se chevauchent plus** : le sheet occupe le bas, le canvas est cardé dans la région au-dessus.
- **Couplage inverse** : région canvas = `[bas header … haut du sheet]`. Sheet **grandit** → canvas **rétrécit** (scale ↓) ; sheet **rétrécit/se replie** → canvas **grandit** (plein écran si replié). Le `scale` du conteneur suit la hauteur (animée) du sheet — **sans** animer la frame du canvas.
- **Layout** : remplacer le chevauchement ZStack actuel (canvas + band siblings, `:280-310`) par un canvas **borné au-dessus** de la zone réservée par le sheet en bas (plus d'overlap).
- **Plafonner la hauteur du sheet** : borne haute réduite (ex. ≤ `min(540, hauteurEcran * 0.42)`) pour garder un canvas exploitable.
- `canvasNaturalFrame` reflète la frame **présentée** (post-scale) ; recalcul de `canvasEditShift` au **settle** (`StoryComposerView.swift:1272-1280,1615-1618`).

### A2 — Reader : carte à inserts symétriques (transform de conteneur)
Le canvas garde ses bounds 9:16 plein-viewport ; un conteneur le place en carte (`scaleEffect`+`offset`+`clipShape(22)`) dans la région `[bas de StoryHeaderView … haut de la zone de composition]`.
- **Inserts symétriques** : réserver la bande de composition **même pour `isOwnStory`** (laissée vide) ⇒ région identique ⇒ **taille de carte constante** pour toutes les stories ⇒ `scaleFactor` constant (la parité tient car les bounds intrinsèques ne changent pas, mais on garde aussi une région stable pour un rendu net homogène).
- **Backdrop** : reste derrière la carte ; en mode carte il encadre la carte (assumé). Re-vérifier/retuner le **scrim bas** (tuné pour un canvas atteignant la compo, `+Canvas.swift:858-864`) — soit l'atténuer en mode carte, soit le recadrer sur la carte.
- **Gestes / tap / sidebar / scrims restent plein-viewport** : taper le backdrop continue de naviguer prev/next ; seule la carte visible est scalée. Aucune réduction des zones de tap.

### A3 — Reader : animation plein écran immersif (état dédié)
Nouvel état **`isImmersive`** (séparé de `isFullscreenStorySession`). Un `withAnimation(.spring(response: 0.42, dampingFraction: 0.82))` (à régler) interpole le **transform de conteneur** : `scaleEffect` carte → `1`, `offset` → centré, `clipShape` cornerRadius `22 → 0`, opacité chrome (header + composition + sidebar + scrims) `1 → 0`. Retour = inverse.
- **Matrice d'états (sans ambiguïté)** : `isImmersive == false` → carte + chrome visible + long-press = bascule chrome (actuel) ; `isImmersive == true` → plein bord + chrome masqué + **long-press = pause uniquement** (ne révèle PAS le chrome). On **remplace** le double-usage de `isFullscreenStorySession` par cette sémantique unique (le toggle menu pilote `isImmersive`).
- **Coordination avec la pile de transforms carte** (`StoryViewerContentView`) : pendant `isImmersive`, neutraliser le cornerRadius statique interne (il est à 0) ; **désactiver le drag-to-dismiss** tant qu'on est immersif (ou en sortir d'abord) pour éviter la collision des 3 rayons (`StoryViewerView.swift:829-832`, `+Canvas.swift:1413`). Aucune frame animée → pas de `rebuildLayers` storm.

### A4 — Helper de cadrage partagé (pur, nonisolated, testable)
Type pur calculant, depuis `CanvasGeometry.aspectFitSize` + insets de région, le **scale**, l'**offset** et le **cornerRadius** du conteneur pour 3 états : `free` (plein, scale 1, coins 0), `carded` (réduit, coins 22), `immersive` (plein, coins 0, animé). Partagé composer (A1) ↔ reader (A2/A3). `nonisolated` (placé en core ou marqué) ; tests **non-`@MainActor`**.

## 3. Lot B — Sheets flexibles (redim universel ; repli ciblé)

### B1 — Redimensionnement universel
La poignée du `ComposerBottomBand` expose **toujours** `resizableHeight` (clamp `[160, plafond]`, plafond réduit quand canvas cardé, cf. A1) pour **tous** les outils du band (texte/couleur/taille/align/fond/bordure, média, audio, fond/texture, filtres). Remplacer le gate `isBandResizable = activeCategory == .drawing` (`ComposerControlsLayer.swift:62`) par « band présent ». **Hauteur mémorisée par catégorie** (état du band par outil).

### B2 — Repli-tiroir universel (peek du canvas plein)
Le repli (glisser la poignée à fond / sous le seuil) **minimise le sheet à sa poignée** pour **tous** les outils du band, **l'outil restant sélectionné** : par couplage inverse (A1) le canvas remonte alors au **plein écran** — un « peek » du canvas. Re-déplier restaure le sheet et le canvas cardé. C'est un **peek de visualisation** (pas une sémantique « continuer à éditer sur canvas plein ») — cohérent pour couleur/texte/média/audio/filtres/texture/dessin. **`.timeline` exclu** (sheet plein écran hors band).

### B3 — Refactor (périmètre réel)
Remplacer l'état drawing-only (`composerBandHeight`, `drawingDrawerCollapsed`, `drawingDrawerGrabberHeight`) par un **état du band** (hauteur par-catégorie + replié) consommé par `ComposerControlsLayer` + `ComposerToolPanelHost` + `ComposerBottomBand`. Inclut la **ré-arbitrage des gestes** du band (swipe-down/horizontal aujourd'hui désarmés seulement pour dessin, `ComposerControlsLayer.swift:197-216`) → généralisée à tous les outils. `canvasIsCarded` (A1) suit l'état du band : panneau ouvert → canvas cardé au-dessus ; tiroir replié (**tout outil**) → canvas plein.

## 4. Lot C — Épaisseur fidèle + pression

### C1 — Capture : driver de largeur par-point
Étendre `StrokeCaptureLayer.extract` pour lire `PKStrokePoint.force`, `maximumPossibleForce`, `timeOffset`, et calculer un **driver normalisé `[0,1]` orienté « haut = épais »**, stocké dans `StoryDrawingStrokePoint.pressure` :
- Pencil → `clamp01(force / maximumPossibleForce)`.
- Doigt (force absente/uniforme) → `1 − vitesseNormaliséeLissée`, où `vitesse = distance(p_i, p_{i-1}) / Δtimeoffset`, normalisée par une **Vmax design** (constante à régler), **lissée** (moyenne glissante, fenêtre 3–5), **fallback `neutral` au 1er point** (pas de prédécesseur) et si `Δt == 0`.
Le driver est calculé **côté capture** (pas au rendu).
**Versionner la capture** : champ `captureVersion: Int` (ou équivalent) sur `StoryDrawingStroke`. Strokes pré-feature / legacy (absent/0) → **rendu constant** (cf. C2). Évite toute mutation des dessins existants.

### C2 — Mapping (fonction pure unique) + non-régression
Au rendu, **uniquement si la stroke porte une pression réelle** (`captureVersion ≥ 1`) :
`effWidth(point) = clamp(base × lerp(0.5, 1.6, point.pressure), 1, 2.5 × base)`, avec `base = stroke.width × toolMultiplier` (marker ×2).
**Legacy / `captureVersion` absent → `effWidth = base` constant** (rendu identique à aujourd'hui — pas de 1,6× silencieux sur les dessins existants ni sur les anciens traits doigt).

### C3 — Rendu largeur-variable (live + baked), builder partagé en core
- **Le lissage doit transporter la largeur** : étendre `StrokePathBuilder` pour interpoler/conserver la pression **en lockstep** avec la position (Catmull-Rom interpole la largeur ; RDP conserve la largeur des points retenus). Renvoyer des **points annotés `(CGPoint, width)`** (ou tableau parallèle synchronisé).
- **Builder de géométrie largeur-variable** en **target core** (`Sources/MeeshySDK/Story/Drawing/`), `nonisolated`, partagé par `MeeshyStrokeCanvas` (live) et `StoryStrokeRasterizer` (baked) → **parité visuelle** (cf. C4). Technique : **triangle-strip** le long de la centerline (2 sommets décalés/point), PAS d'empilement de disques (overdraw). **Cache** de la géométrie tessellée par stroke, clé `(points, width, pressure, smoothing, tool)`.
- **Largeur projetée** par `scaleFactor` comme les positions (uniforme, bounds 9:16).

### C4 — « Préserver l'épaisseur pendant le dessin » + perf
- Cause : pendant le tracé, PencilKit affiche son encre native (largeur variable) ; à la validation Meeshy ré-extrait en largeur **plate** → saut. Fix : le modèle C1–C3 aligne le committé sur l'encre, et l'**aperçu live** est peint par le **même** renderer Meeshy largeur-variable.
- **Neutraliser l'encre PencilKit** pour **pen/marker** uniquement (encre `.clear`/transparente), en **préservant le feedback gomme** (`StrokeCaptureLayer.swift:99,107-110`). La capture géométrique reste intacte (lit `drawing.strokes`, indépendant de l'apparence).
- **Perf live (revue, bloquant)** : `canvasViewDrawingDidChange` commit **mid-geste** → `MeeshyStrokeCanvas` re-tessellerait **tous** les traits par tick (le `.equatable()` ne protège pas pendant le tracé). Mitigations **obligatoires** : (a) **couche de trait actif séparée** (le trait en cours rendu isolément, les N traits committés ne sont pas re-tessellés à chaque mutation) ; (b) cache de tessellation par stroke committé (C3) ; (c) triangle-strip.

## 5. Stratégie de test (TDD)

SDK : scheme `MeeshySDK-Package`, iPhone 16 Pro, `-derivedDataPath apps/ios/Build/DerivedData`. Helpers purs **`nonisolated`**, tests **non-`@MainActor`**, builder partagé en **core**.

**Fonctions pures (unitaires) :**
- **A** : helper de cadrage A4 → scale/offset/cornerRadius pour `free`/`carded`/`immersive` (3 états) ; insets symétriques reader (taille constante own vs others) ; `aspectFitSize` entrée dégénérée (`CanvasGeometry.swift:58`) ; **table de vérité `canvasIsCarded`** (toutes combinaisons band/draw/text) ; **couplage inverse** : pour une hauteur de header + hauteur de sheet, `region = [header … sheetTop]`, `scale` qui rentre le canvas dans `region`, **monotone décroissant** quand la hauteur du sheet augmente, et `scale == 1` (plein) quand le sheet est replié ; **invariant no-overlap** : `bas du canvas cardé ≤ haut du sheet`.
- **B** : clamp band `[160, plafond]` généralisé ; hauteur mémorisée par catégorie ; collapse/expand idempotents pour les outils éligibles ; non-éligibilité timeline.
- **C** : dérivation vitesse depuis `timeOffset` (Δt=0, 1er point) ; lissage fenêtre ; orientation driver Pencil (`force/max`) vs doigt (`1−vitesse`) → « haut = épais » ; bornes clamp (`pressure=0→0.5×base≥1` ; `=1→1.6×base≤2.5×base`) ; `base = width×toolMultiplier` ; **non-régression legacy** (`captureVersion` absent → constant) ; projection largeur par `scaleFactor` ; **lissage qui conserve la largeur** (Catmull-Rom/RDP en lockstep) ; **parité largeur effective par-point live==baked** (même builder).

**Smoke visuel / manuel (NON couvrable en unitaire — explicite) :** parité pixel live↔baked (AA sub-pixel diffère → « visuellement équivalent », pas « exact ») ; feeling du ressort plein écran A3 ; neutralisation encre PencilKit live (C4) ; look carte reader & composer ; trait au doigt (vitesse) et Pencil (force) sur device.

## 6. Séquencement, dépendances, risques

- **Ordre** : **A → B** (B consomme l'état carte de A et la réserve de hauteur). **C indépendant** — la projection est déjà uniforme (bounds 9:16), donc pas de dépendance à A (correction d'une crainte de revue). De-risk : livrer **C1+C2** d'abord (capture + mapping + `captureVersion`, derrière le rendu constant actuel — invisible), puis **C3+C4** (rendu largeur-variable + perf), en parallèle de A/B.
- **Risques** :
  1. **Perf live largeur-variable** (C4) — re-tessellation mid-geste ; mitigée par couche active séparée + cache + triangle-strip. À profiler sur dessin dense.
  2. **`rebuildLayers` storm** — évité par principe (transform de conteneur, jamais d'animation de frame). Backstop : early-out par empreinte de contenu dans `rebuildLayers` (skip si seule la `bounds` change) + corriger le commentaire stale `StoryCanvasUIView.swift:1290`.
  3. **Neutralisation encre PencilKit** sans casser capture (OK) ni feedback gomme (scoper pen/marker).
  4. **Reader carte** : changement visuel (rétrécissement ~9-15 %, backdrop encadrant) — smoke + retuning scrim bas ; retour arrière simple si rejet.
  5. **Refactor band (B3)** : ré-arbitrage des gestes plus large que 2 `@State` — contenir via état du band + tests gestes.

## 7. Hors périmètre (YAGNI)
- Plein écran animé **composer** (zoom pinch existant conservé).
- Persistance disque de la hauteur de sheet par outil (mémoire en session seulement).
- Refonte du backdrop flou (réutilisé ; re-tuning scrim bas inclus, pas refonte).
- Export MP4 / backend (inchangé).
- Nouveaux déclencheurs de plein écran (pinch-out, double-tap) : on garde le toggle menu existant (discoverabilité notée mais hors scope ; gestes reader déjà chargés).
