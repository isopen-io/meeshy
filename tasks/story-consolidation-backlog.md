# Story consolidation — standing backlog (loop-driven, 2026-06-01)

Goal: story create/view/publish fully functional + pleasant. Unified composition logic,
no bug, no unwired feature, all callbacks wired, fluidity, display perf, sync across
preview / mini-preview / Thumbnail / ThumbHash with ALL layers (image+text+drawing).
Local-first, efficient cache, FABs, show-only-necessary. Each fix: prove → fix → review
→ commit → push. Maintain & replenish this backlog across iterations.

## Principles (senior SWE)
- Prove every hypothesis in the real code before fixing (no blind fixes).
- Local-first; cache-first display; only render what's necessary.
- Single source of truth (CanvasGeometry, StoryRenderer, resolveUserLanguage).
- Review after each change.

## IN PROGRESS / DONE this session (proven fixes, pushed)
- [x] Composer canvas 9:16 parity (coordination bug) — CanvasGeometry.aspectFitSize
- [x] Drawing UX: resizable dedicated band + canvas scaled/rounded above
- [x] Comments overlay pauses the story timer
- [x] Voice caption respects full Prisme chain
- [x] Translation badge respects full Prisme chain
- [x] markViewed decodes gateway Bool
- [x] Reaction count no over-count on repeated same emoji
- [x] Slide delete keeps editing the same slide
- [x] Duplicate background element clones as foreground
- [x] **ThumbHash composite includes the DRAWING layer** (renderComposite) ← active

## BACKLOG (to consume, then replenish)
### Thumbnail / ThumbHash / preview sync (ALL layers)
- [ ] Verify SlideMiniPreview renders the drawing layer at the right z-order/scale (it uses
      MeeshyStrokeCanvas — confirm parity with StoryRenderer order: bg→media→drawing→text).
- [ ] renderComposite z-order vs real StoryRenderer (text drawn before media here = media
      over text; confirm acceptable for thumbhash, else align order).
- [ ] Thumbnail used in tray ring vs slide-strip vs reader loading overlay — single source?
- [ ] ThumbHash recomputed when drawing/text edited (staleness)? slideImages invalidation.

### Composition consistency / unified logic
- [ ] Confirm StoryRenderer is the single render path for composer + reader + export (it is)
      and SlideMiniPreview is the only re-implementation (audit its parity drift).
- [ ] Repost: RepostPayload drops modern drawingStrokes (DORMANT — only diagnostic consumer
      today; fix when a consumer builds content from RepostImportResult).

### Callbacks wired / no unwired feature
- [ ] Audit StoryComposerView / StoryViewerView closures for any no-op / unwired callback.
- [ ] Language picker in viewer: does picking a non-preferred language change the display
      (override) or only request translation? (UX gap suspected.)

### UI/UX (ios-simulator)
- [ ] Drawing band grabber resize feel + canvas rounding/inset on device.
- [ ] Navigation: create (Ma story idx0) vs view (idx1); alignment/positioning checks.
- [ ] Composer tool panels (media/text/audio) layout + canvas-scale-above generalization.

### Local-first / cache / perf
- [ ] Confirm cache-first on story tray + viewer (CacheCoordinator.stories) — stale-while-revalidate.
- [ ] Leaf views: no @ObservedObject on global singletons in story cells.

## Progress — structured loop (2026-06-01)
- [x] it.1 ThumbHash composite includes drawing layer (all layers) — pushed main 0c8fe3d7d
- [x] it.2 Drawing topmost everywhere (renderComposite + SlideMiniPreview parity) — pushed main 4a83174dd
- [x] it.3 Tray own-first sort on network/cache load (unified w/ socket path) — pushed main 30dc06754
- [x] it.4 Visual review (latest build): drawing band + canvas scale/round/below-island + draw OK, no regression.

## Verified-correct this session (no fix needed, proven)
- buildEffects includes drawingStrokes (publish keeps drawing); currentEffects write-through (live thumbnail).
- addMediaObject sets real aspectRatio for images + videos (TODO@1037 is stale, handled at picker).
- loadStories cache-first + stale-while-revalidate (textbook); availableTranslationLanguages correct.
- toggleBackground enforces 1-bg invariant; resolvedBackgroundAudio legacy synth correct.

## FEATURE GAPS (need design decision, NOT blind-fixable)
- Viewer language picker (showFullLanguagePicker) calls requestTranslation only — NO display override
  and NO user feedback. Per Prisme "explore other languages", picking should display the chosen language
  (needs: session override @State, fold into resolvedViewerLanguageChain, re-render on translation arrival,
  revert-on-slide-change policy). Mirror messages' activeTranslationOverrides. Medium feature, design-gated.
- Repost: RepostPayload drops modern drawingStrokes (DORMANT — only diagnostic consumer today).

## NEXT to consume
- [ ] ios-simulator: systematic nav/visual/alignment pass (login lost on reinstall — batch checks; don't reinstall per-iter).
- [ ] Thumbnail single-source audit (tray ring vs slide-strip vs reader loading overlay).
- [ ] Confirm leaf story cells have no @ObservedObject on global singletons (zero-rerender).

## Progress it.5-6
- [x] it.5 Preview-surface default-bg audit: minor/rare gap only (nil bg color differs canvas/thumbhash/mini) — not worth blind fix (pastel auto-applied).
- [x] it.6 ios-simulator visual pass (viewer): real story (photo + 'Zero' text) renders clean — 9:16 canvas, letterbox blur, text/photo positioning, sidebar, composer all aligned; tap-right advance/dismiss OK. No visual/nav/alignment bug.

## DECISION NEEDED (highest remaining value = an IMPROVEMENT, not a bug)
- Viewer language-picker display override: complete the half-wired "explore other languages" Prisme
  feature. Plan (mirror messages' activeTranslationOverrides): add @State sessionLanguageOverride in
  StoryViewerView; resolvedViewerLanguageChain prepends it when set; picker sets it (+ requestTranslation);
  re-render on translation arrival; clear on slide change. Medium async feature — implement next iteration
  unless user redirects. Until then picker = request-only (no display change).

## Progress it.7 — composer↔reader alignment EMPIRICALLY + DATA verified (2026-06-01)
- [x] it.7 Pulled REAL stored positions via API (GET /posts/feed/stories). jcnm "Zero" 6a1ccd74:
      image isBackground=true x=0.525 y=0.568 ratio=1.333 ; text "Zero" y=0.82. "Noir Sacré" 6a1ccefa:
      image isBackground=true x=0.306 (left!) y=0.632 ; texts y=0.25 / y=0.963.
- [x] PROVEN ROOT CAUSE (no blind fix): background media offset = (x-0.5)·renderSize.width,
      (y-0.5)·renderSize.height (StoryCanvasUIView). renderSize.height differs old composer (874)
      vs reader (714) → same normalized y renders at different px → bg pan + text shift in reader.
      These stories are PRE-9:16-fix (composed ~00h, fix ~04h). NOT migratable (normalized positions
      are render-size-independent; only the composer that captured them used 874).
- [x] EMPIRICAL CONFIRM new stories align: composed bg image in current (9:16) composer → in-composer
      preview (=reader pipeline, .play) renders the bg image IDENTICALLY (full-frame, centered, no canvas
      bg). edit==reader for new stories. (screenshots /tmp/c6 edit, /tmp/c7_preview reader)
- [x] No code fix needed for the coordination bug — already fixed by aspectFitSize 9:16 parity; the
      perceived misalignment in the J.Charles story is unmigratable old data.

## NEW backlog item (minor, low-priority cosmetic)
- [ ] StorySlideRenderer.drawTextObject (thumbHash composite) font uses /390.0 (device width) instead of
      /CanvasGeometry.designWidth (1080) → text ~2.77× oversized in the 100×178 blur composite. Cosmetic
      only (thumbHash is a ~28-byte blur placeholder, downsampled to ~32×32) but inconsistent w/ the fixed
      SlideMiniPreview (/designWidth). Align for single-source consistency when touching this file.

## NOW ACTIVE (user-queued after the create/view loop)
- [x] it.8 Viewer language-picker display OVERRIDE shipped — pushed main ae5e97be7. Pure helper
      StoryViewerView.viewerLanguageChain(base:override:) (6 tests GREEN), @State sessionLanguageOverride
      prepended to resolvedViewerLanguageChain, reset on slide change (.onChange currentStory?.id),
      onSelectLanguageOverride closure → StoryCardView + StoryActionSidebarView (full picker + strip both
      set it + requestTranslation). Full picker auto-dismisses on select → story re-renders in chosen lang.
      Build 21s OK. Falls through to next preferred lang if chosen lang not yet translated (never
      translations.first per Prisme rule #1); re-renders when translation arrives.

## Progress it.9 — realtime story TEXT translation delivery wired (2026-06-01)
- [x] it.9 PROVEN 2 pre-existing bugs that made the override work for cached translations ONLY:
      (1) SDK listened on stale event `post:story-translation-updated` while the gateway emits
          `story:translation-updated` (source of truth socketio-events.ts:242; gateway
          StoryTextObjectTranslationService:110) → translations never reached the client.
      (2) NO app subscriber to socialSocket.storyTranslationUpdated → even if received, no merge.
- [x] FIX (1): SocialSocketManager listens on `story:translation-updated`.
- [x] FIX (2): StoryViewModel subscribes to storyTranslationUpdated → merges per-text-object translations
      into the cached story (mirrors storyUpdated handler) → reader re-renders via observed VM.
- [x] SDK helper StoryItem.mergingTextObjectTranslations(at:translations:) — pure, immutable rebuild,
      6 tests GREEN (MeeshySDKTests). App helper viewerLanguageChain 6 tests GREEN. App + SDK build OK.
- [ ] KNOWN: open-viewer live-update for NON-cached translations depends on the presenter passing live
      viewModel.storyGroups. StoryViewerContainer does (live); StoryTrayView passes a frozen [group]
      snapshot → that path updates on re-open only. Pre-existing (storyUpdated has the same shape). Note.

## Progress it.10 — ThumbHash composite layer fidelity (2026-06-01)
- [x] PROVEN: StoryTrayView frozen [group] is the PREVIEW path (isPreviewMode, ephemeral) — figer est
      correct. The REAL viewing path is StoryViewerContainer (@ObservedObject viewModel, live storyGroups)
      → the it.9 realtime translation merge re-renders the open viewer live. (false-alarm item dropped)
- [x] PROVEN + FIXED: StorySlideRenderer.renderComposite (thumbHash) ignored the modern background
      MEDIA object — a `StoryMediaObject(isBackground:true)` was drawn by the foreground loop as a
      0.6× centred blob AFTER the text (occluding it), never full-bleed. Now draws resolvedBackgroundMedia
      full-bleed (parity with StoryBackgroundLayer/SlideMiniPreview) + foreground loop uses
      resolvedForegroundMediaObjects (excludes bg). 2 pixel tests GREEN.
- [x] FIXED: drawTextObject font /390 → /CanvasGeometry.designWidth (1080) — text was ~2.77× oversized
      in the composite (parity with SlideMiniPreview's /designWidth).
- [x] xcodebuild BUILD SUCCEEDED; MeeshyUITests bundle compiled + ran the new renderComposite (runtime-proven).

## Verified it.10b — per-media thumbHash loop is CORRECT (no fix)
- [x] PROVEN: StoryComposerView per-media thumbHash loop (line 2033) computes a thumbHash PER media-id
      including the background media — this is CORRECT: every media (bg or fg) needs its own loading-state
      blur (StoryBackgroundLayer uses the bg media's thumbHash). No bg-exclusion needed here. (false alarm)

## Audit it.11 — publication path + cache + mini-preview: SOLID (no bug found)
- [x] runStoryUpload: dedup-safe (skip slideIdx < alreadyPublishedCount on retry → no duplicate slides),
      RAW publish (bg + fg media uploaded individually, effects JSON), offline queue (enqueueStoryForOffline
      → StoryPublishQueue replay), onPublishedSlide → insertOrAppendStoryItem (id-dedup). Solid.
- [x] insertOrAppendStoryItem: dedups by story id (optimistic+echo → no double segment). persistStoryCache.
- [x] Cache coherence: realtime counters (reaction/comment) route via mutateStoryItem → persistStoryCache
      → survive cold start (local-first). storyUpdated/Deleted/TranslationUpdated all persist. Solid.
- [x] SlideMiniPreview: only used at StoryComposerView:853 with a 9:16 cell (thumbW = thumbH*9/16) →
      non-uniform .position(y: media.y*size.height) is consistent with the width-based reader. No bug.
  → 3 potential concerns verified as NON-issues (no blind fix). Publish/cache subsystem in good shape.

## Audit it.12 — composer sync architecture + leaf-view perf: SOLID (no bug)
- [x] GranularSync watches View-level state (filter/image/stickers/drawing/bgColor) → syncCurrentSlideEffects
      (= currentEffects = buildEffects(), full rebuild). VM mutation methods (text/media/drawing-strokes)
      write-through DIRECTLY: `var e = currentEffects; …; currentEffects = e` → slide.effects → mini-preview
      re-renders. Verified text edits (1166-1219), drawingStrokes computed setter (DrawingEditing:67-72),
      drawingData didSet (368) all write-through. No sync gap (text-not-synced hypothesis = FALSE).
- [x] drawingCount watch uses legacy drawingData?.count — redundant (modern strokes write-through), not a bug.
- [x] Leaf-view perf: StoryTrayView cells read ThemeManager.shared / PresenceManager.shared DIRECTLY
      (computed property, NOT @ObservedObject) → no per-event re-render. @ObservedObject viewModel only on
      the top-level tray. "Zero unnecessary re-render" principle respected. No bug.

## CONVERGENCE (2026-06-01)
After it.7→it.12 the core story create/view/publish subsystem is audited across composition (9:16),
language override, realtime translation, ThumbHash all-layers, publish path, cache coherence, sync
architecture, and leaf-view perf. Real bugs found+fixed: it.8 (override), it.9 (realtime translation
event-name + subscriber), it.10 (thumbHash bg-media + font). Other areas verified solid (no blind fixes).
Remaining work is on-device VISUAL/UX validation (best on the user's real account) + re-auditing any new
story-touching commits from parallel agents.

## Audit it.13 — drawing capture↔render alignment under scaling/zoom: SOLID (no bug)
- [x] StrokeCaptureLayer.projectionScale = (designW/bounds.w, designH/bounds.h); MeeshyStrokeCanvas render
      = context.scaleBy(size/designSize) — EXACT inverses → round-trip regardless of bounds aspect.
- [x] Capture bounds = canvasCore .frame(aspectFitSize) = 9:16; .scaleEffect/.offset (viewport zoom) apply
      AFTER the frame, so touches arrive in the 9:16 local space → shape + position preserved in the reader
      (StoryRenderer stretches design 1080×1920 → 9:16 renderSize uniformly). Verified in code, not claims.

## REPLENISHED backlog (next to consume)
- [ ] NEXT: genuine VISUAL SMOKE attempt — install latest (meeshy.sh run), re-login atabeth, navigate to a
      story, verify language strip + reader rendering. Accept fragility; bounded attempt per anti-rabbit-hole.
- [ ] RE-AUDIT trigger: new commit touching StoryViewModel / StoryComposer* / StoryViewer* /
      StorySlideRenderer / SocialSocketManager → re-run the relevant audit slice.
- [ ] (deferred, large + well-tested) repost flow, export flow, computedTotalDuration/keyframes.
- [ ] Reader language indicator: should the active override show a subtle "viewing in X" affordance + a
      one-tap revert to preferred? (Prisme discretion — currently silent revert on slide change only.)
- [ ] StorySlideRenderer.drawTextObject thumbHash font /390 → /designWidth (cosmetic, noted it.7).

## Audit it.14 — solid text background hides glyphs (REAL BUG, fixed 104ff0387)
Triggered by user report "Le texte effacé dans le fond noir ne rend pas le texte lisible".
Found via VISUAL SMOKE (composer → Texte → type → Fond=Noir → exit): committed canvas showed
an EMPTY BLACK BOX while the Texte list still listed the text. Root cause PROVEN (4 screenshots,
not claims): `StoryTextLayer.applyBackgroundStyle` posed the solid fill as a CALayer SUBLAYER with
zPosition=-1; Core Animation composites sublayers ABOVE the parent's own contents (the CATextLayer
glyphs) regardless of zPosition → the opaque fill occluded the glyphs. Inline editor (separate overlay
UIView) still painted glyphs on top → looked fine while editing, broke once committed. Thumbnail
composite (`StorySlideRenderer`) used `.backgroundColor` attribute (behind glyphs) → canvas diverged
from preview (the "incohérence").
- [x] Decisive control: a NO-bg committed text rendered VISIBLE (rules out the glyphsHidden hypothesis).
- [x] Fix: move solid fill to the layer's OWN backgroundColor + cornerRadius (painted before contents),
      reset on .none/.glass. 5 new tests (StoryTextLayerSolidBackgroundTests) + related suites green.
- [x] Visual verify post-fix: "Lisible" now renders white-on-black, readable; slide thumbnail too.
- [x] GLASS case PROVEN acceptable (not the same bug): glass backdrop is translucent (blur) so glyphs
      show through → readable. No risky glyph-on-top restructure needed. Hypothesis disproven by test.
- Lesson saved: [[feedback_calayer_sublayer_zposition_covers_contents]].

## REPLENISHED backlog (next to consume) — updated it.14
- [ ] NEXT: continue visual smoke on OTHER text controls now that the editor is reachable — verify
      Style (Aa cycle), Taille, Alignement, Contour (border) all render correctly on the committed canvas
      (same editor-vs-committed divergence class as the bg bug just fixed).
- [ ] Verify multi-line / long text + solid bg: backgroundColor now fills the full padded bounds — confirm
      wrapped text box still looks right (cornerRadius scales with bounds.height).
- [ ] RE-AUDIT trigger: new commit touching StoryTextLayer / StorySlideRenderer / StoryCanvas* → re-run.
- [ ] Reader language indicator affordance (deferred, Prisme discretion).
- [ ] (deferred, large + well-tested) repost flow, export flow, keyframes.

## Audit it.15 — drawing mode: full-viewport canvas + collapsible drawer (REDESIGN, 3f3d2bf24)
User reports (2): (1) "les dessins prend toute la vue mais ... le dessin ne prend pas tout le
viewport" en preview ; (2) "le canvas arrondi doit être visible en bas de la bande header ...
permettre que le drawer puisse se reduire totalement sans faire disparaitre le controleur overlay".
Root cause: le DESSIN était le SEUL outil qui rétrécissait le canvas (bottomPanelHeight =
composerBandHeight+40) pour le caser au-dessus du drawer ; et le drag-below-min (onResizeDismiss)
quittait le dessin (contrôleur flottant disparu + FABs réaffichées).
Choix user (AskUserQuestion) : Option A — canvas TOUJOURS plein 9:16, drawer flottant par-dessus.
- [x] Canvas plein 9:16 en dessin (top reserve + arrondi only, plus de bottom shrink) → dessin WYSIWYG
      avec le reader (projection 9:16→design space inchangée).
- [x] Inset du contrôleur flottant découplé de la géométrie canvas (drawingDrawerHeight).
- [x] Drag du grabber sous le min → REPLIE le drawer (poignée seule, drawingDrawerCollapsed) SANS
      quitter le dessin : contrôleur (bulles) persiste, canvas arrondi 100 % visible. Grabber tiré/
      tapé vers le haut → redéploie. Quitter le dessin = bouton dismiss des bulles.
- [x] Vérifié simulateur : canvas plein+arrondi derrière les overlays ; collapse→poignée+contrôleur+
      canvas plein ; re-expand ; un trait dessiné en édition matche sa position proportionnelle en
      preview (WYSIWYG, en tenant compte du letterbox 9:16 du reader).
- [x] No re-expand-on-commit (confirmé par code : commitStroke ne touche pas drawingDrawerCollapsed).
- Tests construction ComposerControlsLayer/BandStateMachine verts (nouvel arg threadé). Layout/gesture
  pur → vérif visuelle (ViewInspector indispo). Flakiness gesture.py = ciblage synthétique, pas produit.

## REPLENISHED backlog — updated it.15
- [ ] NEXT: vérifier que le drawer dessin part REPLIÉ par défaut serait + conforme à "afficher
      uniquement le nécessaire" (FAB philosophy) ? Actuellement déplié à l'entrée. À valider avec user.
- [ ] Smoke autres contrôles texte (Style/Taille/Alignement/Contour) sur canvas committé.
- [ ] RE-AUDIT trigger: nouveau commit touchant StoryComposerView / Composer*Band / StoryTextLayer.

## Audit it.16 — text background missing in thumbHash composite + mini-preview (REAL BUG, 7aee47888)
Suite au fix it.14 (canvas StoryTextLayer fond solide → backgroundColor), audit des 3 chemins de
rendu pour le texte à fond solide (axe user "synchro preview/mini preview/Thumbnail/Thumbhash de
TOUTE la story avec toutes les couches"). Preuve par code : le contrôle "Fond du texte"
(TextEditToolOptions:195 / TextBackgroundStylePicker:139) écrit `backgroundStyle = .solid(hex:)`
AVEC `textBg = nil`. Or :
- StorySlideRenderer.drawTextObject (composite ThumbHash) lisait `textObj.textBg` (nil) → fond absent.
- SlideMiniPreview.textItem (vignette strip) ne lisait NI textBg NI backgroundStyle → glyphes nus
  (souvent illisibles sur slide claire) sans la boîte.
- Seul le canvas (StoryTextLayer via resolvedBackgroundStyle) affichait la boîte → incohérence.
- [x] Fix StorySlideRenderer : `compositeBackgroundColor(for:)` (seam testable) basé sur
      resolvedBackgroundStyle (.solid → hex opaque, .glass → translucide, .none → nil).
- [x] Fix SlideMiniPreview : `.background(miniTextBackground(...))` + padding proportionnel,
      même source resolvedBackgroundStyle.
- [x] 4 tests StorySlideRendererTextBackgroundTests verts (dont régression solid+textBg=nil) +
      StorySlideRendererBackgroundMediaTests verts. Vignette strip montre la boîte noire (vérif sim).

## REPLENISHED backlog — updated it.16
- [ ] NEXT: SlideMiniPreview/StorySlideRenderer n'appliquent pas le CONTOUR (border) ni le textStyle
      (police bold/neon/typewriter) du texte — vérifier la cohérence vs canvas (sans doute approximations
      acceptables pour une vignette, mais à confirmer pour le contour qui change la lisibilité).
- [ ] Drawer dessin replié par défaut à l'entrée (philosophie "afficher uniquement le nécessaire") —
      question ouverte it.15, à trancher.
- [ ] Smoke autres contrôles texte (Style/Taille/Alignement/Contour) sur canvas committé.
- [ ] RE-AUDIT trigger: nouveau commit touchant StoryTextLayer/StorySlideRenderer/SlideMiniPreview/Composer*.

## Audit it.17 — glass text z-order fix completed + worktree stabilized (0119209c7)
État au réveil : changements NON COMMITÉS d'un autre acteur (StoryTextLayer.swift `glyphLayer` pour le
cas .glass = la suite z-order différée par 104ff0387, + StoryTextLayerGlassZOrderTests untracked).
Review (loop "un review doit être réalisé") → 2 problèmes bloquants trouvés :
- [x] Le test glass avait un warning-as-error (`as? CGColor` always-succeeds) → bundle MeeshyUITests ne
      compilait PLUS (bloquait TOUT le monde). Fix : CFGetTypeID(value) == CGColor.typeID.
- [x] Le changement glass cassait un test EXISTANT (StoryTextLayerGlyphSuppressionTests
      .test_setGlyphsHidden_makesForegroundTransparent_thenRestores) : il lisait `layer.string` alors
      que pour le glass les glyphes visibles vivent désormais dans la sous-calque glyphLayer (parent
      transparent en permanence). Test mis à jour pour lire la sous-calque.
- [x] Logique glass VALIDÉE par 5 tests (glyphes au-dessus du backdrop, foreground visible, parent
      supprimé, setGlyphsHidden bascule la sous-calque, backdrop reste sous-calque sans solid fill) +
      suites solid/glyph-suppression/renderer/wrapping/languages vertes. Changeset cohésif commité
      (StoryTextLayer + nouveau test + fix test existant) → worktree stabilisé.
- [ ] RESTE : vérif VISUELLE du glass committé (glyphes nets sur boîte givrée) — bloquée ce tour par
      expiration de session JWT (re-login mot de passe atabeth ≠ DEMO_PASSWORD). À refaire en session
      fraîche. (Anti-rabbit-hole : la logique est prouvée par 5 tests unitaires.)
- Convergence fond-de-texte : canvas solid (104ff0387) + canvas glass (0119209c7) + thumbHash composite
  + mini-preview (7aee47888) → les 4 chemins lisent resolvedBackgroundStyle, cohérents.

## REPLENISHED backlog — updated it.17
- [ ] Vérif visuelle glass committé (session fraîche).
- [ ] Doublon mémoire potentiel : feedback_calayer_sublayer_zposition_covers_contents (mien) vs
      feedback_catextlayer_sublayer_covers_glyphs (autre acteur) — même leçon ; fusionner un jour.
- [ ] Session JWT expire vite (plusieurs fois en qq heures) — hors scope story mais à signaler équipe ?
- [ ] Border/textStyle dans SlideMiniPreview/StorySlideRenderer (approximations vignette) — à confirmer.
- [ ] Drawer dessin replié par défaut (question it.15).

## Audit it.18 — broad regression sweep + timeline-duration source-of-truth bug (SPEC'D)
Sweep complet MeeshyUITests (snapshot exclu) : SEULS échecs = 5 tests EXPORT
(StoryExporterStaticOnlyTests ×1 + StoryExporter_BackgroundVideoTests ×4). Tout le reste vert.
Audit code (undo/redo, gomme, aspectRatio, thumbHash publish) : sain, aucun bug.

Cause racine des 5 échecs (prouvée bout-en-bout) : `computedTotalDuration()` (source de vérité
unique viewer+canvas+exporter) IGNORE `effects.slideDuration` ET `slide.duration` (centralisation
28/05, pour éviter les valeurs backend héritées). Donc :
- La durée configurée via le TIMELINE (`TimelineProject.apply → slide.duration`) est perdue.
- `computedTotalDuration` ne regarde que le BG media → un FOREGROUND vidéo long est coupé.
- `slide.duration` écrit par 3 chemins (currentSlideDuration, autoExtendDuration, apply) mais
  jamais lu → champ mort pour le playback.

DÉCISION PRODUIT USER (2026-06-01) : **Option A — la timeline est AUTORITAIRE et écourte le média
en rognant son temps**. « La timeline EST la story avec la vision temporelle » (durée de chaque
élément, moment d'apparition, animation = config timeline).

PLAN détaillé : `tasks/story-timeline-duration-spec.md`. Champ dédié `StoryEffects.timelineDuration:
Double?` (nil = fallback contenu, zéro régression existant ; non-nil = autoritaire, peut trim),
lu EN PRIORITÉ dans computedTotalDuration ; écrit par apply/autoExtend/currentSlideDuration ; init
timeline le relit. Viewer/exporter suivent (vérifier rognage). 5 tests export à mettre à jour.

## REPLENISHED backlog — updated it.18
- [ ] **NEXT (prioritaire) : IMPLÉMENTER `tasks/story-timeline-duration-spec.md`** (incréments TDD :
      1 model+computedTotalDuration, 2 écrivains+init, 3 tests export+rognage, 4 vérif visuelle).
- [ ] Vérif visuelle glass committé (session fraîche, login atabeth).
- [ ] Doublon mémoire CALayer-sublayer (2 entrées même leçon) — fusionner.

## it.18 IMPLÉMENTÉ — timeline pilote la durée du slide (spec livré, 3 incréments)
Commits : ca2cd5be3 (inc.1 model+computedTotalDuration), 0b0f5e1c2 (inc.2 persistance+foreground),
06407dbaa (inc.3 tests stale → modèle timeline-autoritaire).
- [x] `StoryEffects.timelineDuration: Double?` (champ dédié, additif, backward-compat). `nil`=fallback
      contenu (zéro régression existant). Lu EN PRIORITÉ par `computedTotalDuration()` (autoritaire, peut rogner).
- [x] `contentDerivedDuration()` extrait + ÉTENDU au foreground media (vidéo non-bg plus coupée hors pin).
- [x] `TimelineProject.apply` pose le pin SEULEMENT si surcharge explicite (≠ contenu) → pas de pin obsolète ;
      `init(from:)` recharge le pin. `autoExtendDuration` rétabli en miroir legacy (pas de pin obsolète).
- [x] Tests : StoryTimelineDurationTests (9 neufs) verts. Stale corrigés : export ×5 (dont
      `longerThanSlide_truncates` qui PROUVE le rognage via AVFoundation réel), StoryModelsExtensionsTests ×2,
      SlideDurationLoopTests reframé (auto-loop 6s + pin autoritaire). Toutes les suites durée vertes.
- [ ] VÉRIF VISUELLE différée (session fraîche) : un slide configuré court rogne bien la vidéo dans le viewer.
- ⚠️ Sweep large MeeshyUITests BLOQUÉ par un fichier d'un agent parallèle non commité qui ne compile pas
  (NotificationCoordinator.swift:78 init incomplet) — PAS mon code (mes tests ciblés ont compilé+passé à 17:05).
  À re-vérifier quand le worktree recompile.

## REPLENISHED backlog — updated post-it.18
- [ ] Re-lancer le sweep large quand NotificationCoordinator (agent parallèle) recompile.
- [ ] Vérif visuelle : glass committé + rognage timeline (session fraîche, login atabeth).
- [ ] Doublon mémoire CALayer-sublayer (2 entrées) — fusionner.

## it.19 — broad sweep post-recompile : régressions de la centralisation durée triées
Sweep large relancé après recompilation (NotificationCoordinator de l'agent parallèle réglé).
Échecs triés MINE vs PRE-EXISTING :
- [x] MINE (vrai bug introduit) : `currentSlideDuration` setter écrivait seulement le legacy
      `slide.duration` (ignoré) → le contrôle de durée du composer était un no-op au playback.
      Corrigé (e2d363d7c) : getter/setter via `effects.timelineDuration` (autoritaire, clampé
      [2,600]). + fixture stale `StoryCanvasUIViewReaderContextTests.makeStaticSlide` pin posé.
      Vérifié : Timeline/ReaderContext/clamp/conformance verts.
- [x] STALE (intentionnel, hors durée) : `AvatarContextTests` ×5 — le trail avatar doublé à 88pt
      (ab691abaf, demande user 2026-05-27) jamais répercuté aux tests. Expectations mises à jour
      (a3265b3f1). 57/0 verts.
- [ ] PRE-EXISTING, DOMAINE AGENT PARALLÈLE (audio) — NON corrigé (diagnostic précis) :
      `CanvasAudioLifecycleTests` ×5 échouent car `startAudioPlayback()` gate désormais sur
      `contentReadyFired` (gate intentionnel « ne pas démarrer l'audio bg tant que les médias ne
      sont pas prêts », StoryCanvasUIView:1005). Or `makePlayingCanvas()` ne pose PAS de frame →
      `bounds == .zero` → `rebuildLayers` early-return → content-ready ne fire jamais → mixer gaté →
      `isPlaying` reste false. Test STALE vs gate intentionnel. Fix = poser un frame + déclencher
      content-ready (mécanisme du domaine audio). À traiter par le propriétaire audio/playback
      (pas de seam `_forTesting` content-ready ; risque de flakiness si patché à l'aveugle).

## REPLENISHED backlog — updated it.19
- [ ] CanvasAudioLifecycleTests ×5 (cf. diagnostic ci-dessus) — propriétaire audio.
- [ ] Vérif visuelle (session fraîche) : glass committé + rognage timeline dans le viewer.
- [ ] Doublon mémoire CALayer-sublayer — fusionner.

## it.19 CONFIRMÉ (sweep final) — bundle MeeshyUITests vert sauf le cluster audio déféré
Sweep large (snapshot exclu) : SEUL `CanvasAudioLifecycleTests` ×5 rouge (déféré, domaine audio
agent parallèle, diagnostic ci-dessus). Aucune erreur de build, aucune nouvelle régression. Les
12 tests durée stale + les 5 export d'origine + les 5 avatar sont désormais VERTS. Le fix
source-de-vérité durée (timeline autoritaire) est livré, intégré et vérifié de bout en bout.

## it.20 — AUDIT publication : `timelineDuration` survit le round-trip backend (AUCUN bug)
Vérifié que mon nouveau champ durée se publie end-to-end (emphase user « publication de story ») :
- iOS publish : `StoryEffects.toJSON()` + `encode(to:)` incluent `timelineDuration`.
- Gateway IN : `StoryEffectsSchema` est `.passthrough()` (posts/types.ts:162) → champ inconnu conservé.
- Stockage : `Post.storyEffects` est un `Json?` blob (schema.prisma:2740), stocké entier
  (`PostService.ts:132 storyEffects: data.storyEffects`).
- Gateway OUT : routes posts via `sendSuccess(reply, post)` SANS response-schema Fastify
  (pas de field-typing → pas de strip) ; `postIncludes.ts:109 storyEffects: true` renvoie le blob entier.
- iOS decode : `decodeIfPresent(.timelineDuration)`.
→ Le rognage timeline fonctionne donc aussi pour les viewers DISTANTS. Aucun changement backend requis.
Le fix durée est complet : composer + preview + exporter + publish + viewers distants.

## it.21 — AUDIT timing par-élément (viewer) : honoré, AUCUN bug
Vérifié (vision user « la timeline configure le moment où chaque élément apparaît + animation ») :
- `StoryRenderer.shouldRender(item:at:mode:)` : `.edit` montre tout ; `.play` respecte la fenêtre
  `t >= startTime && t < startTime+duration` (StoryRenderer.swift:237-248). Keyframes
  (`applyKeyframeOverrides`) + fadeIn/fadeOut (`fadeOpacity`) snapshot au playhead. → timing
  par-élément BRANCHÉ dans le viewer.
- Compose correctement avec `timelineDuration` : un élément dont la fenêtre dépasse la durée
  (rognée) du slide est coupé à la fin du slide (cohérent, timeline autoritaire).
- ThumbHash/mini-preview montrent TOUS les éléments (composite « TOUTE la story ») — intentionnel.
Convergence : composition (9:16, couches, text bg solid+glass, dessin, foreground), durée
(timeline-autoritaire end-to-end), thumbHash/mini-preview cohérents, timing par-élément, publish
round-trip — tous audités + sains.

## REPLENISHED backlog — surfaces story PAS ENCORE auditées (prochaines cibles bugs)
- [ ] Viewer navigation/gestes : progression slides, tap/swipe, barre de progression, edge cases.
- [ ] Realtime story : story:new/updated/deleted + translation-updated (sink câblé ? tri ? dedup ?).
- [ ] Ops multi-slides : add/delete/reorder/duplicate (cohérence index, sélection, durée).
- [ ] Audio story : transcription/voice, mixer (cf. CanvasAudioLifecycle ×5 déféré audio-owner).
- [ ] Exporter : honore-t-il le timing par-élément (texte startTime=3 → apparaît à 3s dans le MP4) ?
- [ ] Vérif visuelle (login frais) : glass committé + rognage timeline dans le viewer.

## it.22 — AUDIT exporter timing par-élément : honoré, AUCUN bug
`StoryAVCompositor` rend chaque frame via `StoryRenderer.render(slide:, at: request.compositionTime,
mode: .play, ...)` (StoryAVCompositor:138,202-205) → `shouldRender(item:at:.play)` gate la visibilité
par-élément à CHAQUE frame. Un texte `startTime=3` apparaît bien à 3s dans le MP4 exporté, pas à 0.
→ Le timing par-élément est cohérent COMPOSER → VIEWER → EXPORTER → PUBLISH (même chemin StoryRenderer).

## CONVERGENCE (post it.7→it.22)
Tous les axes profonds story sont audités + sains : composition (9:16, couches text/dessin/média/
sticker, text bg solid+glass z-order), durée (timeline-autoritaire, rognage, end-to-end incl. publish
+ exporter), timing par-élément (viewer+exporter), thumbHash/mini-preview cohérents (toutes couches),
undo/redo/gomme/aspectRatio. Bugs réels trouvés+corrigés : it.8/9/10/14/16/15/17(glass via agent)/18-19
(durée source-de-vérité)/19(currentSlideDuration no-op + avatar stale). Reste : surfaces non encore
auditées (realtime, ops multi-slides, viewer gestes) + vérif VISUELLE (proven par tests ; login flaky
— utiliser le compte DEMO jcharlesnm via « Autre compte » si besoin) + CanvasAudio ×5 (audio-owner).

## it.23 — BUG RÉEL trouvé (realtime story reactions non branché iOS) — diagnostic + plan
SOURCE prouvée :
- Gateway : `POST/DELETE /posts/:id/like` fan-out PAR TYPE (routes/posts/interactions.ts:70-96) :
  STORY → `broadcastStoryReacted`/`broadcastStoryUnreacted` → émet `story:reacted`/`story:unreacted`
  À LA STORY ROOM (SocialEventsHandler:222-232 `io.to(ROOMS.post(storyId)).emit`). Donc les VIEWERS
  doivent recevoir le delta en realtime (intent backend confirmé).
- iOS SDK : `socket.on("story:reacted")` existe (SocialSocketManager:816) → publie `storyReacted`,
  MAIS ce publisher n'a AUCUN abonné. `story:unreacted` : NI listener NI publisher.
- iOS StoryViewModel : s'abonne uniquement aux events POST (`postReactionAdded/Removed/Sync`,
  StoryViewModel:1223-1250) — que les stories N'ÉMETTENT PAS (le fan-out story passe par story:reacted).
→ CONSÉQUENCE : une réaction/dé-réaction d'un AUTRE user sur une story en cours de visionnage n'est PAS
  reflétée en realtime (compteur figé jusqu'au refetch). Seuls l'action propre (optimiste) + le load initial
  mettent à jour `storyReactionCount`.

PLAN DE CORRECTIF (incrément focalisé, TDD) :
1. SDK SocialSocketManager : ajouter `SocketStoryUnreactedData {storyId,userId,emoji}` (miroir reacted) +
   `storyUnreacted` PassthroughSubject (publisher+protocol) + `socket.on("story:unreacted")` (miroir 816).
2. App StoryViewModel.setupSubscriptions : sink `storyReacted` (+1) + `storyUnreacted` (-1) → `mutateStoryItem(byPostId: data.storyId)` reactionCount ±delta + currentUserReactions (miroir `applyPostReactionDelta`).
3. ⚠️ Propager au @State `storyReactionCount` du StoryViewerView SI la story touchée == currentStory
   (le @State est une copie dérivée au slide change, StoryViewerView+Content:570 — vérifier le chemin VM→View).
4. Tests : décode socket story:unreacted (SDK) + delta StoryViewModel (app).

## it.23 IMPLÉMENTÉ — realtime story reactions branché (1a9433d77)
- [x] SDK : `SocketStoryUnreactedData` (+ init public) + publisher/protocol `storyUnreacted` +
      `socket.on("story:unreacted")` (miroir story:reacted). 2 mocks (SDK + app) à jour.
- [x] StoryViewModel : sinks `storyReacted` (+1) / `storyUnreacted` (-1) → `applyStoryReactionDelta`
      → `mutateStoryItem` reactionCount ±delta (+ currentUserReactions si action propre). Réaction propre
      fire-and-forget (pas d'optimiste) → l'écho propre fournit le delta sans double-compte.
- [x] StoryViewerView : `onChange(of: currentStory?.reactionCount)` re-dérive le @State sidebar →
      compteur live pendant le visionnage. Prod câble via `subscribeToSocketEvents()` (RootView:335 etc.).
- [x] Tests : 2 SDK (decode + publisher) + 4 VM (±delta, clamp-0, câblage socket) verts.
→ Story reactions désormais en temps réel pour les viewers (parité avec post:liked/unliked).

## REPLENISHED backlog — post it.23
- [ ] Surfaces story non encore auditées : ops multi-slides (add/delete/reorder/duplicate), viewer gestes.
- [ ] Vérif visuelle (login frais) : glass committé + rognage timeline + compteur réactions live.
- [ ] CanvasAudioLifecycle ×5 (gate contentReadyFired, domaine audio-owner) + doublon mémoire CALayer.

## it.24 IMPLÉMENTÉ — filtres story branchés sur le rendu réel (036f4f1d5)
- [x] BUG CRITIQUE prouvé : `StoryCanvasUIView.updateFilterLayer` faisait `Kind(rawValue: effects.filter)`,
      mais `effects.filter` = `StoryFilter.rawValue` ("vintage"/"bw"…) alors que `Kind` rawValue = nom de
      **fonction Metal** ("vintageFilter"/"bwContrastFilter"). → toujours nil → AUCUN filtre rendu sur le
      canvas composer NI le viewer/reader, pour tous les filtres. Feature 100% non branchée.
- [x] Fix : `StoryFilteredLayer.Kind(storyFilter:)` (pont vocabulaire → Kind ; vintage→vintage, bw→bwContrast,
      6 autres → nil faute de kernel). `updateFilterLayer` passe par le pont. Kind rawValue reste le nom Metal.
- [x] Cause du slip : les tests canvas seedaient `effects.filter = "vintageFilter"` (nom Metal, jamais écrit
      en prod) → vocabulaire fictif que le canvas acceptait, masquant le mismatch. Corrigés au vrai vocabulaire
      + cas bw + cas kernel-less. RED reproduit avant fix.
- [x] 18 tests filtres verts (Canvas/TextureCapture/WarmUp/GlassBackdrop) + app build vert.

## REPLENISHED backlog — post it.24 (filtres = chantier de cohérence)
- [ ] **P1 — 6 filtres sans kernel Metal** (warm/cool/dramatic/vivid/fade/chrome) : visibles dans la grille
      (CoreImage via `StoryFilter.ciFilterName`) + mini-preview (SwiftUI) mais AUCUN effet sur canvas/viewer/
      thumbHash → l'auteur voit un filtre qui disparaît à la publication. Options : (a) rendre les 8 via
      CoreImage (`ciFilterName`) sur le canvas en unifiant ; (b) écrire 6 kernels Metal ; (c) retirer les 6 de
      la grille. Décision produit requise. PROUVÉ it.24.
- [ ] **P2 — ThumbHash ignore les filtres** : `StorySlideRenderer.renderComposite` ne réapplique pas
      `effects.filter`/`filterIntensity` → placeholder flou non filtré alors que la story rendue l'est
      (vintage/bw). Refléter au moins vintage/bw (CoreImage) pour matcher le viewer. PROUVÉ it.24.
- [ ] **P3 — 3 looks divergents** : grille (CoreImage), mini-preview (SwiftUI approx), canvas (Metal kernels)
      donnent 3 rendus différents pour le même filtre → unifier sur une source de vérité (`ciFilterName`).
- [ ] Vérif visuelle device/simu (login frais) : vintage + bw désormais visibles sur canvas + reader.
- [ ] Surfaces non auditées : ops multi-slides (add/delete/reorder/duplicate), viewer gestes.

## it.25 IMPLÉMENTÉ — thumbHash reflète le filtre, synchro avec le viewer (7756dd99e)
- [x] P2 résolu : `StorySlideRenderer.renderComposite` applique `effects.filter` sur tout le composite,
      gaté sur le MÊME pont `StoryFilteredLayer.Kind(storyFilter:)` que le canvas → couverture en lock-step
      avec ce que le viewer rend réellement. vintage (CISepiaTone) + bw (CIPhotoEffectMono) ; 6 kernel-less
      laissent le composite intact (pas de faux placeholder → pas de pop placeholder→story).
- [x] 4 tests StorySlideRendererFilterTests (RED reproduit avant fix) + 2 suites sœurs sans régression
      + app build vert (direct ; meeshy.sh exit 1 = contention SPM transitoire d'un agent //, résolu).
- Note forward-compat : quand le canvas rendra les 8 filtres (P1), thumbHash suivra automatiquement via le pont.

## REPLENISHED backlog — post it.25
- [ ] **P1 — 6 filtres sans kernel Metal (chantier architectural, nécessite un PLAN)** : warm/cool/dramatic/
      vivid/fade/chrome visibles grille+mini-preview mais pas canvas/viewer/thumbHash. Solution élégante =
      unifier le rendu canvas sur CoreImage (`StoryFilter.ciFilterName`, déjà la source des 8 dans la grille)
      OU écrire 6 kernels Metal. Décision archi+produit → mode plan dédié, PAS une itération loop rushée.
- [ ] **P3 — 3 looks divergents** (grille CoreImage vs mini-preview SwiftUI vs canvas Metal) — se résout
      avec P1 (unifier sur ciFilterName). Lié.
- [ ] Vérif visuelle device/simu (login frais) : vintage + bw visibles canvas+reader (it.24) ET thumbHash
      placeholder teinté cohérent (it.25). Login-gated → à faire quand session de test dispo.
- [ ] **Surfaces non auditées (prochaine cible loop)** : ops multi-slides (add/delete/reorder/duplicate) —
      vérifier que thumbHash/mini-preview/currentSlideIndex restent synchro après mutation ; viewer gestes
      (tap zones, hold-to-pause, swipe inter-groupes) ; callbacks publication (onPublished/onError branchés).

## it.26 IMPLÉMENTÉ — thumbnail/thumbHash + mini-preview capturent le fond VIDÉO (84f11cdcb)
- [x] Bug : `renderComposite` ET `SlideMiniPreview` gataient le dessin du média de fond sur `kind == .image`
      → un FOND VIDÉO était droppé (composite = bgColor + texte + dessin + stickers, sans la frame vidéo),
      alors que la poster frame est dispo dans `loadedImages[bgMedia.id]` (la frame qu'utilise le canvas/reader).
- [x] Fix : dessiner la frame du média de fond dès qu'une poster est chargée, quel que soit le kind (image OU
      vidéo), plein cadre (parité StoryBackgroundLayer reader). Fallback bgColor si pas de poster (no-régression),
      bg exclu de la boucle foreground (pas de double-dessin). Même fix 1-ligne sur SlideMiniPreview.
- [x] Le filtre it.25 couvre désormais aussi la frame vidéo (appliqué sur tout le composite).
- [x] StorySlideRendererBackgroundMediaTests +1 cas vidéo full-bleed (RED reproduit) ; 11 tests verts ; app build vert.
- BILAN it.24→it.26 : le composite généré AU SEND capture TOUTE la composition — fond (couleur/image/**vidéo**),
  texte (+ fonds), médias foreground image, stickers, dessin (moderne+legacy), filtre. C'est la source du thumbHash
  (placeholder reader) et de tout futur vrai thumbnail.

## REPLENISHED backlog — post it.26
- [ ] **THUMBNAIL TRAY/FEED (demande user directe — décision archi requise)** : le tray affiche le `thumbnailUrl`
      SERVEUR (généré depuis l'asset de fond brut → SANS overlays texte/dessin). Pour montrer le composite complet :
      (A) LOCAL-FIRST — le client rend le composite haute-déf au publish, le cache localement (clé = post id),
          le tray le préfère pour les stories de l'auteur. Pas de backend, respecte RAW-publish, instantané, mais
          seul l'auteur voit le composite (les autres viewers gardent le thumbnail serveur).
      (B) UPLOAD BAKÉ — uploader le composite comme asset thumbnail → tout le monde le voit. Touche la règle
          « ne jamais baker/uploader de composite » (Prisme : fige le texte en langue auteur dans le preview).
      → Décision user. Non vérifiable visuellement sans login.
- [ ] Foreground (non-bg) vidéos pas dessinées dans le composite (poster seulement) — étendre la boucle foreground.
- [ ] P1 filtres (6 sans kernel) + P3 looks divergents — chantier archi (plan dédié).

## it.27 IMPLÉMENTÉ — thumbnail composite local-first dans le tray (hybride Phase 1) (af655b14b)
- [x] Demande user : « the entire story should have a thumbnail capturing text drawing and all content on send ».
- [x] Au send (runStoryUpload, après createStory), rend le composite COMPLET (bg couleur/image/**vidéo** + texte
      + dessin + média + stickers + filtre) via `StorySlideRenderer.renderComposite` à 270×480, cache dans
      `CacheCoordinator.thumbnails` sous clé synthétique `story-cover:<postId>` (pas de collision URL média).
- [x] `StoryTrayView` préfère ce cover local (file://, déjà supporté par CachedAsyncImage) → l'auteur voit
      instantanément sa story composée, au lieu du thumbnail serveur (bg brut, sans overlays).
- [x] `renderComposite` gagne param `size` (défaut 100×178 inchangé pour thumbHash) ; `CacheCoordinator`
      gagne `thumbnailLocalFileURL(for:)` (nonisolated, miroir imageLocalFileURL) ; enum `StoryCoverThumbnail`
      centralise clé + ordre de résolution pur testable.
- [x] App build full vert (compile tout). 3 tests StoryViewModelTests (clé, prefer-local, fallback chain).
- [!] EXÉCUTION tests bloquée ce tour par contention SPM d'un agent // (éviction répétée des XCFrameworks
      Firebase/GoogleAds) + un test SDK cassé par le même agent (SocialSocketAdditionalTests / SocketPostCreatedData).
      À relancer quand le cache SPM se stabilise. Vérif visuelle device (login) reste à faire.

## REPLENISHED backlog — post it.27
- [ ] **Phase 2 (hybride, user a choisi both) — cover baké uploadé** : pour que TOUS les viewers voient les
      overlays dans le tray (pas seulement l'auteur). Upload TUS du composite comme asset thumbnail + champ modèle
      + gateway. ⚠️ touche la règle « never bake/upload composite » (Prisme : fige le texte langue auteur dans le
      preview) — assumé pour un preview de tray. Plan dédié.
- [ ] Relancer les 3 tests StoryViewModelTests cover-thumbnail + les 11 renderer tests quand SPM stable.
- [ ] Vérif visuelle device : tray montre le composite (texte+dessin+vidéo) pour ses propres stories après publish.
- [ ] Foreground (non-bg) vidéos pas dessinées dans le composite (poster seulement).
- [ ] P1 filtres (6 sans kernel) + P3 looks divergents — chantier archi.
