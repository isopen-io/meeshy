# Focal Grandeur Nature §5 — réécriture fidèle du défilement iOS (2026-08-18)

Contrat : `docs/design/2026-08-15-focal-spec-integration.html` §5 fait foi (demande user 18/08).
Les acquis d'architecture (six sites d'appel, `FocalPerspectiveCell` qui repose en
`layoutSubviews`, `MessageListLayout` compensation d'offset, décoration CALayer,
épingle d'élection, chrome escamoté, hauteur de rangée invariante à l'élection)
sont CONSERVÉS — ils ne contredisent pas la spec, ils la font tenir à 120 Hz.

## Lot 1 — Cœur du défilement (loi + pass + bogues)

- [ ] 1.1 Loi partagée : `FOCUS_CURVE_CONSTANTS.thread` → `{ maxDistance: 380, scaleDecay: 0.40, alphaDecay: 0.82 }`
      (`packages/shared/utils/focus-curve.ts`) + bande thread dédiée
      `THREAD_FOCUS_BAND_OFFSET = 150`, `THREAD_FOCUS_BAND_HYSTERESIS = 95`
      (la bande `list` 140/45 de la Lentille/Rivière ne bouge PAS). Régénérer
      vecteurs + tests TS.
- [ ] 1.2 Miroir Swift `FocalFocusCurve` : mêmes constantes, pivot horizontal
      0.18 → **0.16** (spec anchorPoint (0.16, 1.0) — mécanisme translation
      équivalente conservé, documenté). `FocalPerspectiveGeometry.standard` :
      bandLift 150, focusTolerance 95. Forme dynamique
      `focusY = H − max(150, composeur + 8)` conservée (clavier).
- [ ] 1.3 Fondu de distance RÉTABLI (spec) : `alpha = min(alphaCeiling, courbe.alpha)`
      — plancher 0.18 par construction, optimiste = `min(0.7, alphaPerspective)`
      littéralement. Supprimer `neighbourAlphaFloor` (mort).
- [ ] 1.4 LOUPE SUPPRIMÉE (spec : échelle ≤ 1, l'élu est à 1.0 + carte + tenue de
      focus) : retirer `magnification*` (constantes, geometry, zPosition
      d'élévation, `magnifiedTrailingReserve`, réserve trailing de section →
      retour à 12). `FocalCellTransform` sans zPosition (écrit 0).
- [ ] 1.5 Bogue « chrome de focus fantôme » : `isFocused` à la config de cellule
      gated par `!scrollingActive` ; à l'arrêt, reconfigure [ancien élu, élu].
- [ ] 1.6 Bogue « atterrissage sans tenue » : drapeau d'atterrissage programmatique ;
      `scrollViewDidEndScrollingAnimation` gère nudge ET atterrissage (rejoue le
      pass, re-cible UNE fois si |visualMidY − focusY| > 8 — hauteurs estimées —
      puis pose chrome + typographie + flush).
- [ ] 1.7 Pose après auto-scroll message entrant : `scrollToBottom` animé passe
      par le même chemin de pose (typographie du nouvel élu).
- [ ] 1.8 Coûts par frame : suppression du double balayage d'inset
      (`applyBottomInset` n'appelle plus le pass en propre), `syncFocalPassTheme`
      hors chemin chaud (aux changements seulement), garde d'égalité
      `ScrollTimePillState.isVisible`, code mort pilule flottante retiré
      (`configureScrollTimePillOverlay` sans appelant).
- [ ] 1.9 Rotation / changement de taille : rejouer pass + insets sur changement
      de bounds (`viewDidLayoutSubviews` gardé par delta), typographie ensuite.
- [ ] 1.10 Tests : mise à jour de la liste `wouldBreakOnSpecReturn` (géométrie,
      write, magnificence supprimée, élection 95, focusY 150) + nouveaux tests
      RED d'abord pour 1.3/1.5/1.6/1.7/1.9.

## Lot 2 — Matrice temps réel

- [ ] 2.1 Reconfigures ciblés (traductions, transcriptions, audios traduits)
      DIFFÉRÉS pendant le geste (§4.7ter), flush à la pose.
- [ ] 2.2 Swap de traduction tardive : cross-fade 150 ms sur le bloc texte
      (animation scopée au changement de texte effectif) + chip 🌐 INTERACTIF
      (tap = V.O., appui long = sélecteur).
- [ ] 2.3 Présence live : canal d'observation → reconfigure des rangées visibles
      (différé pendant geste).
- [ ] 2.4 Pilule non-lus : ne plus compter ses PROPRES messages.
- [ ] 2.5 Typing indicator PLAT en Focal/Script (pastille 22 auteur + 3 points
      accent, sans capsule) ; capsule conservée en bulles.
- [ ] 2.6 Effets de message : `effects` réellement passé à `FocalRowInput`
      (aujourd'hui jamais fourni — feature morte).
- [ ] 2.7 Échec d'envoi : bande retry rendue en Focal (`onRetry` déjà câblé),
      exclue de la perspective (plafond alpha inchangé pour .failed = 1).
- [ ] 2.8 Élection : messages supprimés / système / appel / éphémère expiré
      NON candidats et sans carte ; rangées système/appel CENTRÉES (spec).

## Lot 3 — Parité contenu & accessibilité

- [ ] 3.1 Flou de message (`content.isBlurred`) appliqué au bloc contenu en
      Focal avec révélation (parité bulle).
- [ ] 3.2 Lieu / fichier : rendu réel (carte lieu, carte fichier + badge de
      téléchargement + tap ouvrir) au lieu du repli texte inerte.
- [ ] 3.3 Long-press iOS 26 : préview native = rangée Focal (pixels), plus
      jamais une bulle en mode Focal.
- [ ] 3.4 « Début de la conversation · {date} » (date du premier message).
- [ ] 3.5 VoiceOver : libellés d'état d'envoi localisés (plus de français en dur
      sans accents dans `MessageAccessibilityLabelComposer`).

## Écarts spec ASSUMÉS (conservés, documentés au rapport)
- Carte de focus = fond accent translucide SANS anneau (choix user 17/08,
  postérieur à la spec) — `ringSize` 1.5 reste à une ligne.
- Texte 15→16 remplacé par la tenue de focus à hauteur constante (pastille 34,
  nom +2, barre) — la variation de corps re-mesurait la cellule à chaque arrêt.
- Pilule « jour · heure » remplacée par le révélé d'heures (amendement P2).
- Chrome escamoté pendant le défilement (demande user, absent de la spec).
- `focusY` dynamique (suit clavier/composeur) plutôt que littéral H−150.
- Carrousel audio multi-pistes : « inchangé » (spec) — garde sa carte.
- Orchestrateur `noteOpened` jamais appelé (isReaderAbsent toujours vrai) —
  hors périmètre défilement, signalé au rapport.

## Review (2026-08-18, fin de passe)

**Livré** : lots 1 et 2 COMPLETS + 3.1/3.5, plus deux correctifs de crash
découverts en vérification :
- Loi partagée réancrée spec §5 : thread 380/0.40/0.82 (fondu RÉTABLI),
  bande fil 150/95 (`THREAD_FOCUS_BAND_*`), pivot 0.16 ; vecteurs régénérés,
  parité TS/Swift verte, web intact (aucun consommateur production du thread).
- Loupe Magnificence SUPPRIMÉE (échelle ≤ 1, réserve trailing retirée,
  zPosition sans écrivain) ; `FocalSpecCurveTests` remplace
  `FocalMagnificenceTests`.
- Bogues de défilement corrigés : chrome de focus fantôme (gate
  anti-recyclage), pose d'atterrissage programmatique (drapeau + re-ciblage
  unique + épilogue commun de `scrollViewDidEndScrollingAnimation`),
  double balayage d'inset, travail mort par frame (pilule, thème).
- **CRASH long fling (SIGTRAP `_updateVisibleCellsNow` ×7, 3 .ips le
  18/08)** : cascade compensation d'offset × solveur self-sizing — plafonné
  à 3 compensations/transaction CA (`MessageListLayout`), réarmé au tour
  suivant. 60 flings violents post-fix : zéro crash. Reconfigures (globaux,
  ciblés, visibles/présence) TOUS différés pendant le geste.
- Matrice : effets câblés (feature morte), flou de message en Focal
  (`FocalProtectedContent`, conditionnel), bande retry, chip 🌐 interactif +
  cross-fade 150 ms, présence vivante (refreshSignal), badge non-lus sans
  ses propres envois, typing plat, fantômes/système exclus de l'élection,
  notices centrées, VoiceOver localisé.
- 581 tests Focal/Lentille verts ; garde `BetaFeatures…` (rouge sur main,
  préexistant) résolue par exception étroite agent-grammar.

**Restes (prochaine passe)** :
- Starvation de rendu hosting sur fling EXTRÊME (frames clairsemées à très
  haute vélocité — préexistant, atténué par les reports ; piste : pré-chauffe
  de cellules/`UICollectionViewDataSourcePrefetching`, simplification du
  corps de FocalRow).
- Lot 3 restant : lieu/fichier réels (3.2), préview iOS 26 en rangée plate
  (3.3), date du premier message dans « Début de la conversation » (3.4).
- `noteOpened` jamais appelé (orchestrateur : `isReaderAbsent` toujours
  vrai) — hors périmètre défilement, signalé.
- « Crash à l'ouverture » signalé en fin de passe = artefact d'installation
  build-for-testing (dylib widget absente du bundle installé), PAS un défaut
  du code — réinstallé via `meeshy.sh build`, lancement sain vérifié.
