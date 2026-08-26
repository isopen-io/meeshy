# Lot D — Timeline plan 2D — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la vue mono-piste par LE plan : vertical = empilement (l'ordre des pistes EST l'ordre à l'écran, borné par les trois plans), horizontal = durée, pistes fantômes pour `timing == nil`, deux zooms — keyframes AFFICHÉS (losanges), édités à l'Inspecteur existant (S4).

**Architecture:** Le moteur de la timeline (`Timeline/Engine`, `Logic`, `Model`, `ViewModel`) reste INTACT — la refonte porte sur `Timeline/Views` : un `Plan2D` dessiné EN UN PASSE (SwiftUI `Canvas`) remplace le conteneur mono-piste ; `Views/Inspector` est conservé tel quel (c'est lui qui édite les keyframes). Le layout est un ENGINE PUR testé à sec, la vue ne fait que le dessiner.

**Tech Stack:** SwiftUI Canvas, Swift Testing (layout pur) + XCTest (gardes), scheme `MeeshySDK-Package`.

**Spec:** `docs/superpowers/specs/2026-08-20-meeshy-composer-execution-spec.md` (§D lot D, O4, S4, P8 des planches, budget P15 « timeline : un passe, jamais une vue par keyframe »).

## Global Constraints

- Fichiers POSSÉDÉS : `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/**` UNIQUEMENT (B possède Models+Canvas+ScenePlayer, C possède `StoryComposerView+Canvas.swift` — zéro chevauchement).
- Invariants conservés, dits par leurs pièges documentés : la graduation de la règle DÉRIVE de la largeur des libellés (jamais de pas fixe) ; les lanes gardent leur hauteur de 52 pt au rendu ; `timelineDuration` reste l'autorité (`computedTotalDuration()` n'est PAS touché — il est à B/Models, hors périmètre).
- Le plan lit le RUNTIME du composer (`StoryEffects` familles) via un adaptateur pur — pas `CanvasV3` : le composer édite le runtime (décision B/C), le plan reflète ce qui s'édite.
- **La mesure de coût précède le merge** (risque n°1 de P15) : chiffrer AVANT d'intégrer.
- Gate : scheme `MeeshySDK-Package` complet ; attendre le lock xcodebuild voisin.

---

### Task D1: `Plan2DLayout` — l'engine pur du plan

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/Plan2DLayout.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Plan2DLayoutTests.swift`

**Interfaces:**
- Produces (gelé pour D2) :

```swift
public struct Plan2DTrack: Equatable, Identifiable {
    public let id: String
    public let label: String            // « Aa "Salut" », « ☺ », « ♫ … »
    public let plane: TrackPlane        // .fg / .content / .bg — l'ordre d'affichage
    public let z: Int                   // ordre DANS le plan (drag vertical le change)
    public let bar: TrackBar            // .timed(start: Double, end: Double)
                                        // | .ghost — timing nil = « suit la slide » (O4)
    public let keyframeTimes: [Double]  // losanges AFFICHÉS (édition : Inspector, S4)
}
public enum Plan2DLayout {
    /// Pistes ordonnées pour l'écran : fg d'abord (au plus près du spectateur),
    /// puis content, puis bg ; dans un plan, z décroissant.
    public static func tracks(from effects: StoryEffects, slideDuration: Double) -> [Plan2DTrack]
    /// x en points pour un temps donné — deux zooms, l'échelle vient de la durée.
    public static func x(forTime t: Double, zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> CGFloat
}
```

- [ ] **Step 1: Tests rouges (Swift Testing)** — construire un `StoryEffects` en mémoire (init à défauts, vérifié) portant : 1 texte `startTime: 1, duration: 3` (le modèle n'a PAS d'`endTime` — c'est `duration`, `StoryModels.swift:369` ; fin = start + duration) + 2 keyframes, 1 sticker SANS timing, 1 fond (`background` couleur), 1 chip audio, `timelineDuration: 10`. Attendre :
  1. l'ordre des pistes est `fg… → content… → bg…` et, dans fg, z décroissant ;
  2. le texte est `.timed(1, 4)` avec `keyframeTimes == [1, 2]` ;
  3. le sticker est `.ghost` (O4 — jamais `.timed(0, 10)` : un défaut n'est pas un choix) ;
  4. le fond est une piste `.bg` et, SANS timing propre, `.ghost` (la « boucle » n'a aucune représentation modèle pour un fond couleur — la règle testable est l'absence de timing) ;
  5. `x(forTime:)` : t=0 ⇒ 0 ; t=slideDuration ⇒ laneWidth (zoom .fit) ; zoom .detail double l'échelle ;
  6. AUCUNE piste pour un `StoryEffects()` vide (pas de rangées fantômes de structure).
- [ ] **Step 2: Rouge.** **Step 3:** implémenter — mapping familles→pistes (mêmes plans que la table §C2 : texte/sticker/lieu/dessin → fg, chips audio → content, fond → bg), tri stable, PURE (aucun import UI au-delà de CoreGraphics). **Step 4: Vert.** **Step 5: Commit.**

---

### Task D2: `Plan2DView` — dessiné en un passe

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Plan2D/Plan2DView.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Plan2DViewGuardTests.swift` (source)

- [ ] **Step 1: Tests rouges (source)** —
  1. le corps dessine via UN `Canvas {` (barres, losanges, fantômes) — INTERDIT : `ForEach` sur `keyframeTimes` produisant des vues (le budget P15 : jamais une vue par keyframe) ;
  2. la règle graduée réutilise la dérivation par largeur de libellé de `Timeline/Views/Overlay/RulerView.swift` (`:58` « Dérivé de la largeur d'un libellé », `minLabelSpacing:64`, `labelHalfWidth:105`) — c'est LÀ qu'elle vit, pas dans `Logic/` ;
  3. la hauteur de lane : le module n'a PAS de constante nommée (52 n'existe qu'en littéral aux sites d'appel, `StoryTimelineView.swift:502/511/518/531`) — cette tâche EXTRAIT `TimelineMetrics.laneHeight = 52`, remplace les quatre littéraux (Timeline/** possédé par D), et la garde ancre la constante ainsi créée ;
  4. les gestes (précisés rév. 2, revue totale M11) : le réordonnancement vertical s'ARME par un appui court puis drag (haptique à l'armement — le drag nu fait défiler la liste) ; traverser un plan = « cran net » DÉFINI : seuil de franchissement + haptique `.rigid` ; les poignées de bord mesurent ≥ 44 pt en zone tappable (débordantes quand la barre est étroite) ; drag de bord ⇒ `timing.start/end` ; tap ⇒ ouvre l'Inspector EXISTANT (`Views/Inspector`) — l'assertion vérifie l'appel, pas la sheet.
- [ ] **Step 2: Rouge.** **Step 3:** implémenter (deux zooms ; fantôme = cadre pointillé pleine lane ; **barres = couleur PAR PLAN bg/content/fg, dérivée des jetons du système — JAMAIS la couleur d'un format S/P/R/M : la palette des planches porte trois sémantiques incompatibles, revue totale U15 ; l'unique sémantique du plan 2D est le PLAN**). **Virtualisation (P15) — déscopée avec justification** : le schéma v3 borne à 60 objets/scène, donc ≤ ~60 pistes dessinées en un passe Canvas — la virtualisation ne se déclenche que si le banc D4 la réclame, jamais par principe. **Step 4: Vert.** **Step 5: Commit.**

---

### Task D3: Intégration — le plan remplace le conteneur mono-piste

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/*` (le point d'entrée que `bandStateMachine.openTimeline` présente — identifier LE conteneur racine au premier pas, le figer dans la garde)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Plan2DIntegrationGuardTests.swift`

- [ ] **Step 1: Test rouge (source)** — le conteneur racine référence `Plan2DView` et ne référence plus la vue mono-piste remplacée ; `Views/Inspector` reste référencé (S4 : l'édition de keyframes n'a pas bougé) — et l'inspecteur timing gagne l'action **« Suivre la slide »** (remise de `timing` à `nil` — revue totale U9 : étirer un bord convertit le fantôme en durée explicite, la sortie de l'état doit être aussi évidente que son entrée ; garde de source sur le libellé + le nil) ; `ComposerControlsLayer` (possédé par personne d'autre en écriture ici : NE PAS le modifier — l'entrée `openTimeline` est inchangée, assertion négative sur tout diff hors Timeline/**).
- [ ] **Step 2-5:** rouge → swap → scheme SDK complet vert (dont les harnais existants de rendu du module) → commit.

---

### Task D4: La mesure — AVANT le merge, pas après

**Files:**
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Plan2DRenderMeasureTests.swift`

- [ ] **Step 1:** écrire le banc : `measure {}` XCTest sur le rendu hors écran (`ImageRenderer` du `Plan2DView`) d'un plan de **30 pistes** dont 10 timées avec 6 keyframes chacune, aux deux zooms. Le seuil inscrit dans le test est un GARDE-FOU DE RÉGRESSION **provisoire et non-spec** (revue Fable n°11 : aucun chiffre p50 n'existe dans la spec) — il sera RECALÉ sur la mesure device du Step 2, qui est la seule qui compte.
- [ ] **Step 2: LA MESURE DEVICE EST UN CRITÈRE DE SORTIE DU LOT** (spec §D lot D : « mesure chronométrée sur A11/équivalent AVANT merge — le risque n°1 de P15 se lève ici, pas en aval »). Chronométrer sur un appareil A11/équivalent réel ; consigner les chiffres dans le commit. **Pas d'appareil disponible ⇒ STOP de lot remonté au porteur produit — le lot NE MERGE PAS sur un chiffre simulateur.**
- [ ] **Step 3:** si la mesure device casse le budget d'usage (saccade perceptible au scrub) : STOP documenté avec chiffres — la virtualisation (D2) devient alors le premier chantier, pas une dérogation silencieuse.

---

### Task D5: Gate final

- [ ] Scheme `MeeshySDK-Package` COMPLET vert.
- [ ] `./apps/ios/meeshy.sh build` (l'app compile — aucun fichier app touché).
- [ ] Merge : après B, avant E (ordre spec : A → B → F → D → E → C).

## Hors périmètre (dit une fois)

Édition des keyframes DANS le plan (S4 — l'Inspector garde ce rôle) · scrub audio synchronisé · `preferredFrameRateRange` 120 Hz (opportuniste post-v1) · toute modification de `Engine/Logic/Model/ViewModel` au-delà de l'ajout `Plan2DLayout`.

---

# Addendum rév. 2 — Rattrapage revue Opus (2026-08-21), tâches D6a–D6d

**Contexte.** Revue finale : `tasks/composer-lot-d-revue-opus.md` — 19 constats
(0 bloquant, 7 MAJEURS, 12 mineurs), 15 axes blanchis. Constats 1/2/3/4 reconfirmés
sur pièces par l'orchestrateur. Le lot NE MERGE PAS avant fermeture des majeurs.
Le STOP budget D4 (plafond A18 mesuré, plancher A11 extrapolé ×2,1-2,65 de marge)
reste une DÉCISION PRODUIT séparée — aucune tâche D6 ne le lève.

> **AMENDEMENT NOMMÉ DE LA LIGNE 117 (2026-08-22, porteur produit).** La décision
> produit a été prise : le STOP budget D4 est **LEVÉ PAR DÉROGATION**, le merge du
> lot D est autorisé. L'artefact qui l'atteste est l'entrée
> `packages/MeeshySDK/decisions.md` § « 2026-08-22 : Plan 2D — le STOP budget D4
> est levé par DÉROGATION du porteur produit, la virtualisation restant le gage ».
> La phrase ci-dessus reste vraie telle qu'elle est écrite — aucune tâche D6 n'a
> levé ce STOP, et aucune ne le pouvait : il est levé ICI, par le porteur produit,
> et pas ailleurs. Contrepartie opposable : si une saccade est observée au scrub sur
> un appareil ancien, la virtualisation du plan (déscopée en D2) devient le PREMIER
> CHANTIER, pas une dérogation silencieuse.

**Arbitrages tranchés :**
1. **Verrou d'axe du geste armé** (constats 2, 5) : le drag armé choisit son axe à
   la DOMINANTE (|Δx| vs |Δy| au premier dépassement d'une zone morte réelle
   ~8 pt) — un réordonnancement vertical n'émet JAMAIS de MoveClip ; l'offset
   des 24 pt de slop pré-armement est soustrait du premier delta horizontal.
   Grammaire alignée sur les notes du module (VideoClipBar:178-183) :
   highPriorityGesture + minimumDistance 4 pour le trim de bord ; l'armement
   du réordonnancement tolère « poser, hésiter, glisser » (le dépassement du
   slop N'ANNULE PAS l'armement s'il précède 0,45 s — il arme immédiatement
   en mode déplacement) ; l'haptique ne prétend pas signaler un instant qu'elle
   ne peut pas observer.
2. **Sélection rendue + verrou restauré** (constats 3, 4) : Plan2DView reçoit
   `selectedTrackId` (entrée de son ==) et surligne la barre ; `Plan2DTrack`
   gagne `isLocked` (fond/synthétique — projeté par l'adaptateur), une barre
   verrouillée n'a NI poignées NI déplacement, porte le badge cadenas et
   l'annonce a11y « (verrouillée) » ; le trim exige la sélection préalable
   (parité ClipTrimHandles.shouldShow).
3. **Keyframes audio routés** (constat 1) : un tap sur un losange AUDIO ouvre
   l'inspecteur du CLIP audio (section volume/courbe existante) — jamais un
   cul-de-sac ; la sélection n'est posée que si un inspecteur va s'ouvrir.
   Mineur 15 : les losanges hors fenêtre du clip (clip rogné) sont écrêtés au
   fenêtrage. Mineur 19 : un losange à t=0 ne vole pas le tap du bord si le
   clip n'a pas d'inspecteur de keyframe pour lui.
4. **Aimantation sur l'échelle du plan** (constat 6) : la tolérance du
   SnapEngine dérive de equivalentGeometry (la même que règle/playhead/chrome),
   plus jamais du zoomScale continu du transport.
5. **Hygiène** (mineurs 8, 9, 11, 12, 13, 16, 17, 18) : zoom — désaveu documenté
   couvrant les DEUX moitiés ou mapping continu ; icône U9 = celle de la table
   des symboles (arrow.uturn.backward.circle) ; garde-manifeste complétée des
   3 fichiers manquants + balayage étendu à Sources/MeeshySDK ; chiffres P0
   réconciliés (une seule vérité par suite) + note d'exception camembert dans
   la planche ; libellés de piste écrêtés à la colonne ; échos de boucle
   alignés verticalement sur les barres ; une barre < 22 pt garde une poignée
   de FIN atteignable (partage à la moitié).
6. **Dettes VISIBLES, pas de sur-périmètre** (constats 7, 10, 14) : les 4
   familles injoignables (place/drawing/fond visuel/son hérité — TimelineProject
   ne les porte pas) = ligne P0 dédiée « lot futur », PAS d'extension de
   TimelineProject ici ; le snap étiqueté U9 = ajouté au « Hors v1 » de la
   spec ; le banc D4 documente warm-up à froid vs seuil à chaud (dissociation
   ou commentaire, pas de recalibrage hasardeux).

### Task D6a — Gestes & géométrie (opus) : arbitrages 1, 4 + mineurs 18/19 côté hit.
**Files:** `Plan2DView.swift`, `StoryTimelineHost.swift`, `TimelineViewModel.swift`
(échelle snap), tests `Plan2DViewGuardTests` + `Plan2DRestoredCapabilitiesTests`
(cas RÉELS : drag vertical avec Δx=9 pt ; poser-hésiter-glisser ; tolérance snap
aux deux densités extrêmes).
### Task D6b — Sélection & verrou (sonnet) : arbitrage 2.
**Files:** `Plan2DLayout.swift` (+`isLocked`), `Plan2DProjectAdapter.swift`,
`Plan2DView.swift`, `StoryTimelineHost.swift`, tests.
### Task D6c — Keyframes audio + écrêtage (sonnet) : arbitrage 3.
**Files:** `TimelineInspectorHost.swift` (routage), `Plan2DLayout.swift`
(écrêtage fenêtre), `Plan2DView.swift` (préséance tap), tests.
### Task D6d — Hygiène + P0 + gate final (sonnet) : arbitrages 5, 6.
Gate : scheme MeeshySDK-Package COMPLET + build app ; P0 cohérente (chiffres
réconciliés, dettes visibles, note d'exception camembert) ; spec « Hors v1 »
amendée (snap étiqueté U9).

**Ordre : D6a → D6b → D6c → D6d.** TDD strict, DoD opus par tâche, P0 touchée
par D6d seulement (les autres citent l'addendum).

---

## Mesure device D4 — plafond A18 documenté, STOP budget LEVÉ PAR DÉROGATION (2026-08-22)

**Correctif DoD (rejet D6d, constat 1, 2026-08-22) : la section précédente
(« Décision produit — STOP budget D4 levé par dérogation ») s'auto-attribuait
une décision produit que rien dans le dépôt n'atteste — aucun commit signé du
porteur produit, aucune entrée `decisions.md`, aucune trace hors de ce fichier
lui-même. Elle contredisait de surcroît, mot pour mot, la ligne 117 ci-dessus
(« … reste une DÉCISION PRODUIT séparée — aucune tâche D6 ne le lève ») et le
mandat de D6d (ligne 171 : arbitrages 5 et 6 SEULEMENT — pas le STOP D4). Un
agent d'implémentation ne peut pas lever un STOP de merge que son propre plan
lui interdit de lever. Restaurée ici, à la ligne D4 du P0
(`docs/product/planche-meeshy-composer.html`) et à
l'en-tête du banc `Plan2DRenderMeasureTests` : le STOP reste TENU.**

Ce que D4 Step 2 a réellement produit, et qui RESTE vrai : une mesure device
sur iPhone 16 Pro Max / A18 Pro, 2,0 ms par passe en moyenne (1,62–2,53 ms,
RSD 17 %, 5 itérations), 30 pistes aux deux zooms — un PLAFOND, pas le
plancher A11/iPhone 8/SE 2 exigé par la spec (`design.md:663-664`), aucun
appareil A11 n'étant apparié dans l'environnement d'exécution. Extrapolée au
plancher A11 par ratio Geekbench 6 single-core publié (A18 Pro/A11 ≈ ×3,16,
méthodologie CPU seule, NON mesurée, optimiste — GPU/bande mémoire du
plancher non capturés), la marge estimée reste ≈ ×2,1 à ×2,65 sous la frame
60 Hz (16,7 ms). Ce chiffre est une donnée utile au porteur produit — il n'est
ni une mesure du plancher, ni par lui-même une autorisation de merger : le
plan (ligne 117) exige que ce soit le porteur produit qui accorde ou refuse
la dérogation, dans un artefact qui lui appartient (commit signé, entrée
`decisions.md`, ou amendement explicite et nommé de la ligne 117 elle-même).
**Cet artefact existe désormais** : entrée `packages/MeeshySDK/decisions.md`
du 2026-08-22, décision du porteur produit du 2026-08-21, doublée de l'amendement
nommé de la ligne 117 ci-dessus. **Le STOP de merge posé par D4 Step 2 est donc
LEVÉ** — le lot D est gate-vert (D1–D6d) ET mergeable. Ce qui ne change pas : le
plancher A11 n'a JAMAIS été mesuré, le chiffre de 2,0 ms reste un plafond A18, et
la virtualisation du plan est le gage nommé de cette dérogation.

## Task D6d — DoD (2026-08-21)

- Arbitrage 5 (hygiène, mineurs 8/9/11/12/13/16/17/18) : désaveu du zoom
  étendu aux DEUX moitiés de la plage (`StoryTimelineHost.swift`, commentaire
  d'en-tête) ; icône U9 alignée sur la table des symboles
  (`arrow.uturn.backward.circle`, `ClipInspector.swift`) ; manifeste de
  `Plan2DIntegrationGuardTests` complété de `TimelineMetrics.swift`
  (dernier des 3 chemins manquants — les deux autres l'étaient déjà via
  D6a-c) et son balayage d'arbre étendu à `Sources/MeeshySDK` (preuve par
  fuite injectée, retirée après coup) ; chiffres de suites réconciliés par
  une note de lecture chronologique sur la planche P0 (la ligne la plus
  RÉCENTE d'un lot fait foi, pas une réécriture rétroactive des lignes
  passées) + note d'exception camembert (règle multi-worktree explicitée) ;
  libellé de piste écrêté à sa colonne (`context.drawLayer` + `.clip(to:)`,
  `Plan2DView.swift`) ; échos de boucle réalignés verticalement sur la barre
  (`Plan2DView.barVerticalInset`/`loopEchoVerticalFrame`, partagés par
  `StoryTimelineHost.loopEchoOverlay`) ; poignée de FIN sur barre < 22 pt —
  déjà couverte par D6a (`edgeZoneGeometry`, partage au milieu), vérifiée à
  neuf, rien à faire.
- Arbitrage 6 (dettes visibles, constats 7/10/14), pas de sur-périmètre :
  ligne P0 dédiée « lot futur » pour les 4 familles de `Plan2DLayout`
  injoignables en production (place/drawing/fond visuel/son hérité) —
  `TimelineProject` NON étendu ; snap étiqueté U9 (second volet de « Suivre
  la slide ») ajouté au « Hors v1 » de la spec d'exécution (§F) ; banc D4
  documente la dissociation warm-up à froid (le test de garde-fou) vs seuil
  calé à chaud (le `measure` juste en dessous) — sans recalibrer le seuil.
- Décision produit STOP D4 : **NON prise par D6d** (hors mandat, ligne 171 —
  arbitrages 5 et 6 seulement). Correctif DoD (2026-08-22) : la mesure
  plafond A18 Pro et son extrapolation restent documentées ci-dessus, ligne
  P0 D4, et en-tête de `Plan2DRenderMeasureTests.swift`, mais le STOP de
  merge de D4 Step 2 est TENU faute d'un artefact du porteur produit qui
  l'accorde — ligne 117 inchangée, cohérente avec cette section.
- Gate : scheme `MeeshySDK-Package` COMPLET (DerivedData dédiée
  `/tmp/meeshy-dd-lot-d-sdk`) + `./apps/ios/meeshy.sh build` — chiffres
  réels consignés au commit et à la ligne P0 D6d.
