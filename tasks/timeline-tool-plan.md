# Timeline Story — Outil fonctionnel de bout en bout (2026-07-11)

## Diagnostic (cartographie 3 agents, vérifiée)

Socle SOLIDE et mergé : TimelineProject + 12 EditCommands + CommandStack persisté (E4) +
SnapEngine + KeyframeInterpolator + StoryTimelineEngine (AVMutableComposition) + vues
Quick/Pro + sheet composer (détents 0.45/large) + commit → publish → reader qui honore
fenêtres temporelles, keyframes x/y/scale/opacity, crossfade intra-slide, timelineDuration.

Trous CONFIRMÉS (grep : références uniquement en commentaires) :
- Éditeur : PlayheadView / SnapGuideView / KeyframeMarkerView / TransitionBadge /
  DurationHandle définis mais JAMAIS montés ; `RulerView.onTapTime = { _ in }` no-op ;
  `TimelineViewModel.beginScrub/scrub/endScrub` sans appelant UI → split-au-playhead et
  keyframe-au-playhead opèrent à t≈0 ; `addTransition` sans UI → transitions ni créables
  ni visibles ; preview vidéo engine jamais affichée (previewSlot nil).
- Reader live : fadeIn/fadeOut des médias foreground NON appliqués (texte/stickers OK) ;
  `effects.closing` rendu NULLE PART ; opening `.zoom`/`.slide` = no-ops ;
  `.dissolve` intra-slide invisible en live (export seulement).
- Divers : publishAllSlides ne flush pas une timeline ouverte ; ClipInspector start/durée
  en lecture seule sur main (édition ms sur branche non mergée `claude/amazing-bell-wtDQ6`).

## Plan par lots (ordre d'exécution)

### Lot A — Playhead & scrub (fondation de TOUTE l'interaction)
- [ ] A1. Monter PlayheadView (Quick + Pro) au-dessus de la zone pistes ; drag →
      beginScrub/scrub/endScrub ; ligne + poignée, temps courant affiché pendant le scrub.
- [ ] A2. Ruler tap → scrub(to:) (remplacer les no-ops Quick & Pro).
- [ ] A3. Label temps courant / durée dans le transport (mm:ss.d).
- Tests : TimelineViewModel scrub déjà couvert ; ajouter tests vue (pattern existant
  QuickTimelineViewTests/ProTimelineViewTests) : playhead présent, positionné selon
  currentTime×pixelsPerSecond, tap ruler appelle scrub.

### Lot B — Preview vivante (canvas piloté par la timeline)
- [ ] B1. Scrub timeline → canvas composer rend la slide à t (chemin : bridge
      StoryComposerViewModel+Timeline ; le canvas derrière la sheet 0.45 = LA preview).
- [ ] B2. Play/pause timeline → canvas .play/.edit synchronisés.
- Piège : ne pas invalider les layers à chaque frame (cache contentHash — les updates de
  playhead passent par le chemin playback existant, PAS par rebuildLayers).

### Lot C — Fidélité reader (respecter TOUT ce que l'éditeur exprime)
- [ ] C1. fadeIn/fadeOut des StoryMediaObject appliqués en live (StoryRenderer.renderItem).
- [ ] C2. `closing` rendu en fin de slide (applyClosing symétrique d'applyOpening,
      déclenché à t > durée−transition) — fade/reveal + zoom/slide.
- [ ] C3. Opening `.zoom`/`.slide` implémentés (scale/translate) au lieu de `break`.
- [ ] C4. `.dissolve` visible en live (dégradé acceptable : rendu type crossfade).
- Tests : StoryRendererKeyframesTests comme modèle ; un test par infidélité corrigée.

### Lot D — Transitions créables & visibles dans l'éditeur
- [ ] D1. TransitionBadge monté entre clips adjacents d'une piste (média/vidéo) ;
      badge "+" discret quand aucune transition.
- [ ] D2. Tap badge → transition existante : ouvre TransitionInspector ; sinon
      addTransition(.crossfade, 0.5s) puis inspector (undo-able via commande).
- [ ] D3. Parité Quick (badge simplifié, mêmes actions).

### Lot E — Keyframes visibles & manipulables
- [ ] E1. KeyframeMarkerView monté sur le clip sélectionné (losanges à startTime+kf.time).
- [ ] E2. Tap marqueur → sélection keyframe → KeyframeInspector ; drag → MoveKeyframeCommand.

### Lot F — Polish UX
- [ ] F1. SnapGuideView pendant les drags (guide vertical au point d'aimantation).
- [ ] F2. Undo/redo accessibles en Quick.
- [ ] F3. publishAllSlides flush la timeline ouverte avant sérialisation.
- [ ] F4. ClipInspector : édition précise start/durée (port par contenu de la branche
      amazing-bell — PAS de merge, main a divergé).
- [ ] F5. DurationHandle : pin direct de la durée de slide.

### Lot G — Extensions créatives (si A-F verts)
- [ ] G1. Canal rotation dans StoryKeyframe (modèle + interpolator + inspector + renderer).
- [ ] G2. Vignettes filmstrip des clips vidéo (frames: [] aujourd'hui).
- [ ] G3. Transitions push/wipe live-only (fallback crossfade à l'export).

### Lot H — Validation simulateur (continue, après chaque lot)
- [ ] Build + install + login atabeth ; story complexe : bg vidéo + 2 médias fg + texte +
      sticker + audio ; fenêtres temporelles, keyframes, transitions, durée pinée.
- [ ] Vérifier Quick ET Pro (portrait/paysage) ; publier ; lire la story publiée ;
      cohérence composer-preview ↔ reader. Captures d'écran à chaque étape.

## Règles d'exécution
- TDD : test rouge d'abord (scheme MeeshySDK-Package, tests MeeshyUI non-@MainActor).
- Build : ./apps/ios/meeshy.sh build ; -derivedDataPath partagé si agents parallèles.
- Commits réguliers par lot cohérent VERT, pathspec strict, jamais --amend.
- SDK purity : tout reste dans MeeshyUI/Story (éditeur+canvas+bridge déjà SDK-side).
- Ne PAS toucher : export MP4 (stub assumé), OfflinePublish mort (E7 — décision produit).

## Review
(complété au fil de l'eau)
