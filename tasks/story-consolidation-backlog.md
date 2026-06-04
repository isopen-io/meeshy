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

## it.28 IMPLÉMENTÉ — composite capture les vidéos FOREGROUND (parité mini-preview) (b5cd10c28)
- [x] `renderComposite` boucle foreground gatait `where obj.kind == .image` → un clip vidéo foreground placé
      sur le slide était droppé du composite/thumbHash, alors que SlideMiniPreview le dessine déjà (pas de
      filtre kind). Fix : dessiner tout média foreground avec une frame chargée (image OU poster vidéo). Audio
      (pas de frame) naturellement ignoré ; bg exclu (resolvedForegroundMediaObjects) → pas de double-dessin.
- [x] +1 test fg-video (RED reproduit), 12 renderer tests verts, app build vert.
- ✅ BILAN COMPLÉTUDE COMPOSITE : le composite (= thumbHash + cover local it.27) capture TOUTES les couches :
  fond (couleur/image/vidéo), texte (+fonds), foreground (images ET vidéos), stickers, dessin, filtre.

## REPLENISHED backlog — post it.28
- [ ] Relancer quand SPM stable : 3 tests app StoryCoverThumbnail (it.27) + suite renderer complète.
- [ ] Vérif visuelle device (login) : tray montre le composite complet après publish (it.27) ; vidéos fg/bg
      dans thumbnail (it.26/it.28).
- [ ] **Phase 2 hybride — cover baké uploadé** (tous les viewers voient les overlays) — plan dédié, touche RAW-publish.
- [ ] P1 filtres (6 sans kernel Metal) + P3 looks divergents — chantier archi (plan dédié).
- [ ] Surfaces non auditées : ops multi-slides (add/delete/reorder/duplicate) + sync index/thumbHash ; viewer gestes.

## it.29 IMPLÉMENTÉ — composer drawer rétractable + canvas card mutualisé (user-directed, 3 commits)
- [x] e9f9ce066 : drawer rétractable sur TOUS les outils (pas seulement dessin) — `isBandResizable`
      gaté `== .drawing` → `BandState.allowsCollapsibleDrawer` (true pour tout `.toolPanel`). +2 tests.
- [x] 697edfdcb : Bug A (le menu rétrécit au resize pour tous les outils — `panelHeight` honore
      `panelHeightOverride`, plus seulement dessin) + Bug B (`presentedSheetHeight` collapse-aware →
      réserve la poignée seule, canvas bien cadré).
- [x] 128dcda43 : canvas = carte arrondie cohérente pour TOUS les outils (dessin inclus) — `StoryCanvasFraming`
      aspect-fit dans région inset (sous header / au-dessus sheet + marge latérale `sideInset:14`), arrondi dès
      que cardé. +2 tests (12 framing tests verts). bottomInset min + safe-area.
- [x] VÉRIF VISUELLE simulateur (meeshy.sh run + idb) : Effets ouvert (carte au-dessus sheet, sous header,
      marges) + Effets collapsé (carte arrondie, marges, sous header, near-full) + Dessin ouvert (même carte)
      + éditeur texte (overlay plein écran INTENTIONNEL pour la frappe → retour carte au dismiss). Cohérent.
- BILAN : canvas + .sheet (`ComposerBottomBand`) = composants partagés, comportement identique tous outils.
  L'agent // a abandonné son `BandLayoutState` concurrent au profit de cet état partagé (mutualisation max).

## it.30 — éditeur texte vérifié (pas de bug)
- [x] L'éditeur texte est un overlay plein écran intentionnel pendant la frappe (canvas cardé masqué opacity 0,
      surface d'édition séparée avec padding clavier). Le cadrage carte s'applique correctement aux états
      tool-drawer, pas au mode frappe. Retour à la carte au dismiss vérifié. RAS.

## REPLENISHED backlog — post it.30 (élargir la couverture)
- [ ] **VIEWER/READER (prochaine cible)** : gestes (tap zones prev/next, hold-to-pause, swipe inter-groupes),
      progress bars, transitions slides, audio/vidéo lifecycle. Auditer cohérence + callbacks branchés.
- [ ] **Ops multi-slides** : add/delete/reorder/duplicate + sync thumbHash/mini-preview/currentSlideIndex.
- [ ] Marge latérale composer (14pt) + corner (22pt) : tuning visuel si l'utilisateur veut plus inset/rond.
- [ ] canvasEditShift vs canvasNaturalFrame mesuré avant transform : revérifier l'évitement clavier si un
      texte bas est édité (subtil, non reproduit comme bug ce tour — overlay plein écran gère le clavier).
- [ ] Phase 2 cover baké (tous viewers) + relancer tests app SPM-bloqués (it.27).

## it.31 — AUDIT VIEWER + DESIGN READER CARTE/PLEIN-ÉCRAN (user-directed, à implémenter)

### TOP PRIORITY — Reader « carte → plein écran immersif » (design user 2026-06-02 + bug)
BUG signalé : « le canvas n'est pas arrondi, le canvas arrive au-delà du header » → le reader rend
la story PLEIN BORD au repos (cardScale=1, cardCornerRadius≈0, pas d'inset header) — StoryViewerView.swift:832-850.
DESIGN voulu (image fournie) :
- **État normal = CARTE** : story 9:16 arrondie (coins 22), SOUS le header auteur, AU-DESSUS du footer
  répondre, marges latérales (distinguée du viewport), chrome (auteur + composition) visible.
- **Plein écran immersif** : bouton « Plein écran » (déjà là, `isFullscreenStorySession`, +Sidebar.swift:573)
  → UN SEUL ressort pilote en // : taille carte→plein écran, coins 22→0, opacité chrome 1→0. Retour = inverse.
PLAN (mutualisation — réutiliser le solveur composer) :
1. Reuse `StoryCanvasFraming.resolve` pour la carte reader (région = [headerAuteur, footerRépondre] + sideInset),
   coins 22 au repos. MÊME composant canvas + même cadrage que le composer (principe user « mutualiser »).
2. Introduire `fullscreenProgress` (0=carte,1=plein écran) animé `withAnimation(.spring)` sur le toggle
   `isFullscreenStorySession` ; lerp(scale, coins 22→0, chromeOpacity 1→0). `chromeVisible` déjà lié au flag.
3. RISQUE : `cardScale/cardCornerRadius/cardOffsetY` sont PARTAGÉS avec la transition tray→reader (appearScale)
   + le drag swipe-dismiss (dragProgress). NE PAS casser ces 2 animations — composer `fullscreenProgress`
   par-dessus sans toucher appear/drag, ou faire atterrir la transition tray sur l'état CARTE (cohérent).
4. Vérif visuelle obligatoire (meeshy.sh run + /ios-simulator) : ouverture tray→carte, toggle plein écran
   aller/retour, swipe-dismiss intact, multi-slides/groupes intacts.
→ À implémenter en itération dédiée (contexte frais), TDD sur le pur framing + ressort, review.

### Audit viewer (findings explore it.31 — à trier/corriger)
- [ ] BUG#1 (HIGH) : pause canvas pas resync au changement de slide si overlay commentaires ouvert →
      nouvelle slide silencieusement en pause (StoryViewerView+Content.swift:435-443 / +Canvas.swift). PROUVABLE.
- [ ] BUG#2 (MED) : `markViewed` fire-and-forget catch vide (StoryViewModel.swift:389-397) → échec réseau
      silencieux, ring « vu » localement mais pas serveur. Logger + (option) feedback sur 4xx permanent.
- [ ] BUG#4 (MED) : `updateStoryDuration` passe `preferredLanguages: []` → durée calculée sur texte non-résolu
      vs canvas résolu (langue) → désync progress bar / auto-advance pour stories texte auto-durée multilingues.
- [x] Vérifié OK : tap-zones (gauche=prev/droite=next), bornes de groupe, hold-to-pause, audio lifecycle outgoing.

## it.32 — Reader carte→plein écran : TENTATIVE #1 (revertée, non vérifiée) — blocage identifié
Approche tentée (pattern composer, mutualisé) : `readerCanvasFraming = StoryCanvasFraming.resolve(viewport:
geometry.size, headerInset: topInset+56, bottomInset: safeBottom+88, sideInset:12, state: fullscreen ? .free :
.carded, corner:22)` puis `.scaleEffect(framing.scale).offset(y:).clipShape(RoundedRectangle(corner))` appliqué
au canvas courant + loader + canvas sortant dans `StoryCardView` (StoryViewerView+Canvas.swift). Build vert (26s).
RÉSULTAT VISUEL : canvas TOUJOURS plein bord (drawings bord-à-bord) — le scaleEffect ne carde PAS visuellement.
→ REVERTÉ (ne pas shipper non-vérifié ; worktree partagé agent //).
ANALYSE : `scale` ne PEUT pas valoir 1 en `.carded` (scaleW=(393-24)/393=0.94<1 toujours). Donc soit (a)
`StoryReaderRepresentable` (UIViewRepresentable du reader) IGNORE la transform SwiftUI scaleEffect (sa updateUIView
re-cale peut-être la frame interne sur les bounds écran — cf. les nombreux commentaires « le canvas débordait /
ne se contraignait pas »), soit (b) un override de frame en aval ré-étend le canvas. Le composer (StoryCanvasRepresentable)
HONORE scaleEffect (it.29 vérifié) → les 2 représentables diffèrent.
PROCHAINE ITÉRATION (contexte frais) — diagnostic AVANT de recoder :
1. Instrumenter : `.overlay(Text("\(readerCanvasFraming.scale) \(geometry.size)"))` temporaire → confirmer scale≈0.88.
2. Test transform brut : hardcoder `.scaleEffect(0.5)` sur le canvas reader → SI le canvas ne rétrécit pas de moitié,
   le représentable ignore la transform → la carte doit passer par la FRAME (canvasFitSize * framing) et NON scaleEffect,
   en re-vérifiant la projection design→render (les bugs offset 77pt historiques).
3. Sinon (transform honorée) → revoir pourquoi framing.scale=1 (geometry.size/safeArea runtime).
Chrome (header/footer) reste fixe (séparé du canvas) ; `chromeVisible = !isFullscreenStorySession` déjà câblé.

## it.33 IMPLÉMENTÉ — reader carte→plein écran (fbd3ce54c) — carte VÉRIFIÉE visuellement
- [x] DIAGNOSTIC : le scaleEffect cardait DÉJÀ en it.32 (readout s=0.94) — invisible car la carte se fondait
      dans le `storyBlurredBackdrop` plein cadre (même contenu flouté). it.32 reverté à tort. Insets relevés → 0.86.
- [x] `readerCanvasFraming` = StoryCanvasFraming.resolve(headerInset topInset+72, bottomInset 128, sideInset 16,
      state fullscreen? .free : .carded, corner 22) appliqué (scaleEffect/offset/clipShape) au canvas+loader+sortant
      DANS StoryCardView (transform visuel pur, frame canvasFitSize inchangée → projection intacte). Outer
      cardScale/offset (tray-open + swipe-dismiss) NON touchés → transitions préservées.
- [x] Scrim noir (opacity repos 0.55 / plein écran 0) sur le backdrop flou → la carte se détache du viewport.
- [x] VÉRIFIÉ simulateur (clean build) : ouverture reader = carte arrondie nette, marges sombres, sous le header.
      ✅ « état normal (carte) » du mock livré.
- [~] Toggle plein écran : CÂBLÉ à l'identique (même flag → framing .free + scrim 0 + chrome masqué, animés 1 ressort).
      Confirmation device du zoom EN ATTENTE (nav menu « … » flaky en accessibilité ce tour). Logique sûre (state SwiftUI pur).
- ⚠️ Agent // corrompt l'incremental build partagé (erreur spurious GlobalSearchViewModel) → seuls les CLEAN builds fiables.

## REPLENISHED backlog — post it.33
- [ ] Confirmer device : toggle « Plein écran » anime carte→plein bord (coins 22→0, chrome fade) + retour.
- [ ] Polish carte reader : (a) sidebar réactions dans la marge droite (pas sur la carte) en mode carte ;
      (b) voice caption position en mode carte ; (c) tuning insets/scrim si besoin (0.86 / 0.55).
- [ ] Viewer audit (it.31) : BUG#1 pause-desync overlay commentaires, BUG#2 markViewed silencieux, BUG#4 durée lang-mismatch.
- [ ] Ops multi-slides (add/delete/reorder/duplicate) + sync thumbHash/index.

## it.34 — reader carte : ThumbHash en fond + bord arrondi (dd4e0cd9b) + BUG#4 écarté
- [x] User feedback : « bords arrondis + mettre en fond le ThumbHash ». it.33 cachait le ThumbHash sous un
      scrim noir 0.55. → scrim 0.55→0.18 (le `storyBlurredBackdrop` ThumbHash est maintenant visible en marge) ;
      la carte se distingue par son BORD arrondi (coins 22) + une OMBRE portée (au lieu du voile sombre).
      Ombre + scrim coupés en plein écran. Vérifié simulateur (clean build).
- [x] BUG#4 (durée lang-mismatch) ÉCARTÉ — faux positif de l'audit : `contentDerivedDuration` compte les mots
      de `text.text` (texte ORIGINAL, pas `resolvedText`), donc `toRenderableSlide([])` = `toRenderableSlide(langs)`
      pour la durée. Le `preferredLanguages: []` est CORRECT. (Leçon : audit doit cross-checker le code.)
- [x] Confirmé : le binaire installé garde la carte it.33 (persistance OK).

## REPLENISHED backlog — post it.34
- [ ] Polish carte reader : sidebar réactions (Envoyer/eye/Exporter) chevauche le bord droit de la carte →
      la décaler dans la marge droite en mode carte. Caption voix idem.
- [ ] BUG#1 (HIGH) pause-desync : changer de slide avec overlay commentaires ouvert → nouvelle slide en pause
      silencieuse. Investiguer l'interaction pause/overlay/timer + fix + vérif.
- [ ] BUG#2 markViewed silencieux : catch vide → Logger.stories.error (trivial, observability ; commencé it.34 puis
      dépriorisé pour le feedback user). Logger.stories existe (Logger+Categories.swift).
- [ ] Confirmation DEVICE du toggle plein écran (carte→plein bord) — nav menu accessibilité non fiable en simu.
- [ ] Ops multi-slides (add/delete/reorder/duplicate) + sync thumbHash/index.
- [ ] ⚠️ Résoudre le partage de worktree avec l'agent // (corruption incremental build récurrente).

## it.35 — BUG#2 fixé, BUG#1 écarté, sidebar = décision design
- [x] BUG#2 markViewed (d24b56086) : catch vide → `Logger.stories.error`. L'état « vu » local reste optimiste
      (local-first) ; pas de toast (effet de fond, pas action user). Clean build vert.
- [x] BUG#1 (pause-desync) ÉCARTÉ — faux positif : `shouldPauseTimer` est une computed property RÉACTIVE
      incluant `showCommentsOverlay` ; le changement de slide appelle `restartTimer → startTimer` qui remet
      `showCommentsOverlay = false` → SwiftUI ré-évalue → le canvas reprend au render suivant. Pas de pause
      figée. (L'audit it.31 ignorait la réactivité SwiftUI — comme BUG#4. Audit = spéculatif, à cross-checker.)
- [ ] **Polish sidebar réactions (décision design requise)** : en mode carte, la carte (scale 0.86 → 346pt large,
      centrée → bord droit ~374) chevauche la sidebar réactions (trailing ~x350-400). Géométrie : 402 − sidebar(~50)
      − margeGauche(28) = 324 max → la carte (346) est ~22pt TROP LARGE pour tenir À CÔTÉ de la sidebar. Options :
      (A) carte plus étroite en mode carte (inset latéral asymétrique : petit à gauche, grand à droite pour la
          sidebar) — change StoryCanvasFraming (offset.width) ; (B) déplacer les réactions en RANGÉE dans le footer
          sous la carte (le mock montre « répondre » en footer) ; (C) accepter le léger chevauchement de la sidebar
          translucide (Instagram-like). → choix user + itération visuelle (verif flaky en simu).
- [ ] Confirmation DEVICE toggle plein écran (carte→plein bord).
- [ ] Ops multi-slides (add/delete/reorder/duplicate) + sync thumbHash/index.

## it.36 — audit ops multi-slides : WIRED ops SOLIDES, moveSlide NON BRANCHÉ
- [x] add/delete/duplicate VÉRIFIÉS solides : nettoyage des side-caches (slideImages/loadedImages/loadedVideoURLs/
      loadedAudioURLs/mediaAspectRatios/zIndexMap/backgroundTransformCache) + ajustement `currentSlideIndex`
      (decrement si index<current, clamp) + re-keying complet au duplicate. 31 tests verts
      (DuplicateSlideTests 26 + ComposerViewModelTests 5). Mini-preview réactive + thumbHash au publish → sync OK.
- [ ] **moveSlide NON BRANCHÉ** (feature non branché — directive) : impl existe (StoryComposerViewModel:976) mais
      ZÉRO call site, AUCUN test. Reorder de slides pas câblé à l'UI (le strip de vignettes n'offre que
      add/delete/duplicate via menu contextuel). + bug latent : guard `destination < slides.count` rejette le
      move-to-end ; remove+insert ambigu vs convention SwiftUI `.onMove` (offset post-suppression).
      DÉCISION PRODUIT : (A) câbler un reorder UI (drag/.onMove sur le strip → moveSlide, corriger la convention,
      vérif visuelle) OU (B) supprimer moveSlide (code mort — touche protocol + MockStoryComposerViewModel).
- NOTE : sous-système story largement sain. Restant = décisions user (sidebar A/B/C, moveSlide A/B) ou vérif
  visuelle flaky (toggle plein écran device). Bugs provables autonomes ~épuisés côté story.

## it.37 — reorder gesture câblé + contraste boutons élégant (user-directed)
- [x] REORDER (ee35bda5c, moveSlide option A) : `moveSlide` réécrit en `slides.move(fromOffsets:toOffset:)`
      (convention `.onMove`, accepte move-to-end, currentSlideIndex suit le slide ÉDITÉ par id) + câblé via
      `.draggable(slide.id)/.dropDestination` sur le slide strip (même UX que la liste média). +2 tests (28 verts).
      Drag UX = confirmation device.
- [x] CONTRASTE (78dd209d1) : boutons d'action droite (React/Envoyer/Vues/Exporter) invisibles sur fond clair.
      User a rejeté le scrim gradient → solution ÉLÉGANTE : halo sombre (drop-shadow) sur l'icône (0.2→0.55) +
      le label (avant sans ombre) — style flottant Instagram, lisible sur N'IMPORTE QUEL fond, sans cartouche.
      Vérifié simulateur (story photo colorée). S'applique reader + preview (composant partagé).

## REPLENISHED backlog — post it.37
- [ ] Sidebar OVERLAP (distinct de la visibilité, désormais réglée) : en mode carte reader, la sidebar chevauche
      le bord droit de la carte. Décision A/B/C encore ouverte (A carte plus étroite / B footer / C accepter).
      Le halo rend les boutons visibles même en chevauchement → priorité abaissée.
- [ ] Confirmation DEVICE : drag-reorder des slides + toggle plein écran (carte→plein bord).
- [ ] Publication (runStoryUpload / TUS / offline queue) — audit reporté d'it.37.

## it.38 — audit PUBLICATION : SOLIDE (aucun bug provable)
- [x] Gate online/offline au publish (`NetworkMonitor.isOffline` → `StoryPublishQueue.enqueue` sinon `launchUploadTask`).
- [x] Partial-failure multi-slides : `publishedPostIds` accumulés sur `activeUpload` → `alreadyPublishedCount`
      skip au retry (pas de doublon). `cancelUpload` SUPPRIME les slides orphelins déjà commit (Task.detached).
- [x] Auto-retry sur reconnexion socket (observeReconnectionForRetry : removeDuplicates+dropFirst+filter, délai
      2s de stabilisation, guard `.failed` → pas de double-fire) + retry manuel via bannière. `retryUpload` relit
      `activeUpload` (publishedPostIds à jour). Temp files gardés on-failure (le retry les réutilise).
- [x] TUS within-slide : un upload média qui throw → la slide n'atteint pas createStory → non publiée → reprise au retry.
- CONCLUSION : sous-système story (création + visualisation + publication) MATURE. Bugs provables autonomes
  ÉPUISÉS. Restant = décisions user (sidebar A/B/C overlap) ou confirmation DEVICE (drag-reorder, toggle plein écran).
  Pistes fraîches éventuelles : expiry 24h, repost composer, perf/fluidité affichage, Phase 2 cover baké (viewers).

## it.39 — audit EXPIRY 24h viewer : SOLIDE
- [x] `StoryItem.isExpired(at:)` (explicit expiresAt <= now, sinon createdAt+24h <= now) — correct, pinné par
      StoryItemExpirationTests (8 tests).
- [x] `skipExpiredStoriesIfNeeded` (StoryViewerView:751) : skip forward depuis currentStoryIndex, dismiss si toute
      la queue restante expirée, re-déclenché sur changement de slide (onChange) → expirées jamais rendues dans le viewer.

## it.40 — fix TRAY : groupes entièrement expirés masqués (PROVABLE, shipped 7935b608c)
- [x] BUG provable : `toStoryGroups` ne filtre PAS l'expiration + `loadStories` sert le cache `.fresh/.stale`
      directement (TTL cache > 24h intentionnel) → un groupe dont TOUTES les stories sont expirées (cache cold-start,
      OU story expirée en cours de session sans re-fetch) restait dans le tray → tap → viewer ouvre+ferme aussitôt
      (skipExpiredStoriesIfNeeded) = tap-puis-flash. AUCUN filtre expiry au niveau tray.
- [x] FIX : `StoryGroup.isFullyExpired(at:)` (pur SDK, allSatisfy isExpired, single source of truth) ; tray "others"
      filtre `!isFullyExpired()` ; MyStoryButton traite un groupe perso 100% expiré comme « pas de story » (bouton +).
      `storyGroups` intact (indices viewer préservés, filtre display-only) → défense en profondeur avec le viewer.
      +4 tests (StoryItemExpirationTests : all-expired/latest-active/all-active/empty), 12/12 verts. Build app 42s OK.
- NOTE incohérence mineure NON corrigée (pas un bug live) : `toStoryGroups` fallback `effectiveExpiresAt` = createdAt+21h
  alors que `isExpired` interne défaut = +24h. Sans effet (effectiveExpiresAt toujours posé → branche +24h jamais atteinte
  pour ces items). À surveiller si un jour expiresAt devient nil sur ce chemin.
- Cible it.41 : repost composer (UnifiedPostComposer story import/repost) OU perf/fluidité affichage — rendements
  décroissants, rester rigoureux (preuve avant fix). Restant user/device : sidebar A/B/C, drag-reorder, toggle plein écran.

## it.41 — fix REPOST-of-REPOST : badges d'attribution empilés (PROVABLE, shipped ba25f5bf4)
- [x] BUG provable : `StoryComposerViewModel(reposting:authorHandle:)` cloné `story.storyEffects` puis APPENDait un
      badge locked "Reposté de @X" sans strip. Or `sanitizedForServerPublish` ne strip QUE les `file://` mediaURLs
      (pas les text objects locked) → le badge est persisté en base et réimporté tel quel. Reposter un repost
      (Alice→Bob→Charlie) empilait donc 2 badges locked au même point (x:0.5, y:0.92) = chevauchement / incohérence compo.
- [x] FIX : filtre `effects.textObjects.filter { $0.isLocked != true }` avant d'append. Sûr car `isLocked: true`
      n'a qu'UN site producteur (ce badge) → texte éditable de l'auteur préservé. Racine tracée via `originalRepostOfId`.
      Badge attribue à la source immédiate (`authorHandle`). +2 tests (no-stacking + préservation texte éditable), 7/7 verts.
      Build app 11s OK.
- AUDIT repost (C.1 repost-as-story / C.2 edit-repost-as-post / direct) globalement sain : root-flatten IDs corrects
  (repostOfId=immédiat, originalRepostOfId=racine), preload média 3-tier cancellable, deinit annule la Task.
  NOTE lossy connue (documentée) : repost-as-story ne clone QUE la slide active (multi-slide source → 1 slide) — choix produit assumé.
- Cible it.42 : perf/fluidité affichage (prefetch média tray, re-renders, ThumbHash) OU UnifiedPostComposer import path (C.2).
  Rendements décroissants — preuve avant fix. Restant user/device inchangé.

## it.42 — fix CRITIQUE markViewed : perte de données StoryItem (PROVABLE, shipped f96b3e299)
- [x] BUG provable (data corruption) : `StoryViewModel.markViewed` posait l'état « vu » en RECONSTRUISANT le
      StoryItem via init partiel (7 champs : id/content/media/storyEffects/createdAt/expiresAt/isViewed) → les ~13
      autres champs retombaient à leur défaut nil/0 (l'init `StoryItem.init` les défaut tous). Champs perdus à CHAQUE
      visionnage : `translations` (→ Prisme Linguistique cassé, viewer re-rend en langue originale), `currentUserReactions`
      + `reactionCount` (→ réaction perdue), `repostOfId`/`originalRepostOfId`/`repostAuthorName` (→ chaîne d'attribution
      effacée, casse it.41), `audioUrl`/`backgroundAudio`, `comment/share/view/repostCount`. Pire : `persistStoryCache()`
      gravait l'état gutté en cache → corruption persistée au cold-start.
- [x] FIX : flip `isViewed` EN PLACE (`updated[j].isViewed = true`, c'est un `var`) — pattern idiomatique déjà utilisé
      dans `fetchStoriesFromNetwork` (l.276-278). Tous les autres champs préservés. +1 test
      (markViewed préserve translations/réactions/chaîne repost/audio/compteurs). Suite app 1738 tests, 0 failure (46s).
- AUDIT perf affichage : `prefetchAllStoryMedia` sain (prefix 5 groupes, 1er non-vu + 3 upcoming, pas de preroll
  AVPlayer en utility). Bien borné, respecte « afficher uniquement le nécessaire ».
- Cible it.43 : autres mutations in-place de StoryGroup/StoryItem (deleteStory, reactions, addStory) — vérifier qu'aucune
  ne reconstruit partiellement (même classe de bug) ; OU UnifiedPostComposer import C.2. Preuve avant fix.

## it.43 — audit mutations/reconstructions StoryItem/StoryGroup : CLEAN (0 nouveau bug)
- [x] `mutateStoryItem(byPostId:)` (l.1379) : mutation `inout` EN PLACE, aucune reconstruction. Les handlers réaction/comment
      (applyPostReactionDelta, applyStoryReactionDelta, applyStoryCommentCountDelta) mutent les champs en place → SAINS.
- [x] `insertOrAppendStoryItem` (l.1407) : insert/replace d'un item COMPLET + dédup par id → SAIN.
- [x] Constructions optimistes publish (l.486/580/972) : items NEUFS de l'auteur (isViewed:true), champs vides corrects
      (fresh story → 0 réactions, pas de translations encore). PAS de la classe it.42 (pas une reconstruction d'existant).
      Note mineure : repostOfId/repostAuthorName droppés sur l'optimiste repost, mais le badge locked baké dans effects
      masque l'attribution + refresh serveur corrige → transitoire, non bloquant.
- [x] Synthetic reader inits `StoryReaderRepresentable.init(post:)`/`init(repost:)` : droppent `StoryItem.translations`.
      PROUVÉ NON-VISIBLE : `StorySlide.content` n'est JAMAIS rendu comme layer texte (StorySlideRenderer : 0 read de `.content` ;
      le texte visible vient exclusivement de `effects.textObjects[].translations`, qui EST passé). Donc pas de bug Prisme.
      LATENT (non corrigé, invisible aujourd'hui) : divergence vs toStoryGroups (qui set translations) — ne deviendrait
      visible QUE si un affichage de caption `slide.content` était ajouté au reader. À garder en tête, pas de fix spéculatif.
- CONCLUSION it.43 : surface mutation/reconstruction StoryItem/StoryGroup SAINE. Seul markViewed (it.42) portait le bug.
- Cible it.44 : UnifiedPostComposer import path (C.2 edit-repost-as-post) OU StoryRepostEmbedCell/feed-embed rendering
  OU deleteStory/optimistic-sync edge cases. Rendements décroissants — preuve avant fix.

## it.44 — audit C.2 import + deleteStory : deleteStory CLEAN, C.2 import = SCAFFOLDING NON BRANCHÉ (décision user)
- [x] `deleteStory` (l.1091) : delete serveur PUIS retrait local en place (remove(at:) + cleanup groupe vide) + persist.
      Pas de reconstruction partielle. SAIN. (Non-optimiste = attend confirmation serveur ; choix défendable, pas un bug.)
- [x] C.2 « Éditer et republier en post » (StoryViewerView:529) : FONCTIONNEL comme quote-repost — `PostService.repost`
      (targetType:.post, content, isQuote) + le feed rend l'original via `StoryRepostEmbedCell` (FeedPostCard:240).
- [!] FINDING (décision produit, PAS un bug autonome) : `UnifiedPostComposer.autoImportFromRepostSource` (l.393) reprojette
      texts/media/stickers/drawing story 9:16 → post 1:1 (`importFromStory` + `CanvasReprojector`), pose `reprojectionWarnings`
      et appelle `onStoryImported(result)`. MAIS le composer « has no canvas-overlay state » et l'UNIQUE consommateur
      (StoryViewerView:548) ne fait que LOGGER le result. Donc : items reprojetés jamais affichés/éditables ; la bannière
      « items clampés » peut s'afficher pour du contenu invisible (confusion UX mineure). C'est du scaffolding partiellement
      branché. Preuve avant fix → pas de fix spéculatif (compléter un éditeur post-canvas = feature, ou retirer le
      scaffolding + bannière = risqué si futur-facing). À ARBITRER PAR USER (cf. EN ATTENTE USER ci-dessous).
- Cible it.45 : StoryRepostEmbedCell rendu feed-embed (Prisme/thumbHash/aspect) OU socket story:created/updated sinks
  OU StoryPublishQueue offline replay. Preuve avant fix.

## it.45 — fix socket story:updated reverte l'état vu local (PROVABLE, shipped e184e767a)
- [x] BUG provable (local-first violation) : le sink `socialSocket.storyUpdated` remplaçait la story par celle
      reconstruite via `toStoryGroups` → `isViewed = post.isViewedByMe ?? false`. markViewed est optimiste +
      fire-and-forget (serveur peut lagger) ; un story:updated (ex: bump reactionCount) arrivant avec isViewedByMe
      stale reverterait l'anneau « vu » → « non-vu ». Le chemin REST (fetchStoriesFromNetwork) protège déjà via
      `buildLocallyViewedSet` ; le chemin socket DIVERGEAIT (pas de garde).
- [x] FIX : `isViewed` MONOTONE — on préserve l'état local `true` lors du remplacement (`if stories[idx].isViewed
      && !replacement.isViewed { replacement.isViewed = true }`). Parité REST/temps-réel. +1 test
      (storyUpdated avec isViewedByMe stale ne reverte pas). Suite app 1739 tests, 0 failure (~50s).
- AUDIT sinks socket SAIN par ailleurs : storyCreated (dedup id + sort asc), storyViewed (in-place isViewed=true),
  storyTranslationUpdated (mergingTextObjectTranslations in-place), réactions/comment (mutateStoryItem inout). OK.
- GOTCHA infra (relevé) : `meeshy.sh test` exit 64 si `test-results/unit-tests.xcresult` existe déjà (xcodebuild
  refuse d'écraser) — nettoyer le bundle entre deux runs. Évité les runs concurrents.
- Cible it.46 : StoryRepostEmbedCell rendu feed-embed (Prisme/thumbHash/aspect 9:16 dans cellule) OU StoryPublishQueue
  offline replay (StoryQueueMigrator, StoryOfflineQueueBootstrap). Preuve avant fix.

## it.46 — audit feed-embed + offline replay : CLEAN sauf 1 finding (backoff non branché → décision user)
- [x] `StoryRepostEmbedCell` : attribution single-level (handle reposter), `post.content` rendu, embed via
      `StoryReaderRepresentable(repost:)` 9:16 fit + maxWidth 420 + clip 16 + a11y. `preferredContentLanguages` wiré
      depuis `AuthManager.currentUser` (FeedPostCard:242) → Prisme des overlays OK. SAIN.
- [x] `StoryQueueMigrator` : one-shot idempotent, delete-after-forward (reprise si launch interrompu), quarantine
      JSON corrompu (.corrupted-<ts>), test seam `PublishQueueForwarding`. MATURE.
- [x] `StoryPublishQueue.processNext` : dispositions atomiques, missing-media → permanent fail, FIFO break sur retryable,
      retryCount++ → permanent à maxRetries(5), drop overflow (cap 50) surfacé via publishFailed. Boucle SAINE.
- [!] FINDING (décision, PAS fix autonome) : `retryDelays=[30,120,600,3600,7200]` (l.141) DÉCLARÉ mais JAMAIS lu → backoff
      exponentiel planifié NON branché. Retries seulement sur reconnexion socket OU launch. Conséquence : échec retryable
      (5xx/timeout) sur connexion STABLE bump retryCount+break puis attend reconnexion/restart (jamais de retry programmé).
      Le commentaire setPublishHandler reconnaît le trou « stable network may never [reconnect] ». Implémenter = feature
      (Task planifiée + isolation actor + seam DI pour TDD le délai 30s). Surfacé EN ATTENTE USER.
- Cible it.47 : StoryOfflineQueue (write-ahead offline, setOnPublish/flush) OU StorySlideRenderer thumbHash composite
      (toutes couches) OU mini-preview/cover sync. Preuve avant fix.

## it.47 — fix crash-trap reverse() clés dupliquées (PROVABLE défense-profondeur, shipped 64fc110e7)
- [x] BUG (crash trap au trust boundary) : `StoryQueueItemConverter.reverse` consomme un `StoryPublishQueueItem`
      DÉCODÉ DU DISQUE → `mediaReferences` = JSON sans invariant d'unicité. `reverse` fusionne image+video dans
      `mediaPairs` (`filter != "audio"`) puis `Dictionary(uniqueKeysWithValues:)` → TRAPPE sur clé dupliquée. Un
      elementId partagé entre ref image et ref video (ou payload corrompu / schéma futur) crashait le chemin publish
      (`setOnPublish` appelle `reverse` PAR ITEM via processNext) ET `pendingItems`.
- [x] FIX défensif : `Dictionary(_, uniquingKeysWith: { _, last in last })` pour mediaPaths + audioPaths. +1 test
      (refs dupliquées image+video / audio ne trappent pas, last-wins). MeeshySDK-Package 7/7 verts.
- AUDIT autres : `StoryOfflineQueue` = adapter THIN propre sur StoryPublishQueue (enqueue/flush/setOnPublish/dequeue,
      test seam). `StoryRepostEmbedCell` propre (Prisme wiré, 9:16/clip/a11y). `StoryQueueMigrator` mature (it.46).
- Note : « commit tout » (user, mid-it.47) → committé le travail filtre cohérent de l'agent // (2266da708) + bump build.
- Cible it.48 : StorySlideRenderer couches NON-filtre (drawTextObject/drawMediaObject/drawSticker projection+rotation)
      OU StoryStrokeRasterizer (dessin) OU SlideMiniPreview sync. Preuve avant fix. NE PAS toucher zone filtre (agent //).

## it.48 — fix composite ignore rotation overlays (PROVABLE, shipped 897818f24)
- [x] BUG : `renderComposite` (cover tray + thumbHash) ignorait le champ `rotation` de text/media/sticker, alors que
      le canvas l'applique (StoryTextLayer/StoryMediaLayer/StoryStickerLayer `CATransform3DMakeRotation`) ET que l'user
      pivote via `UIRotationGestureRecognizer` (StoryCanvasUIView:316/2343 → updateRotation:2905 écrit text/media/sticker.rotation).
      → overlay pivoté apparaissait DROIT dans la vignette tray. Viole « thumbHash de TOUTE la story avec toutes les couches ».
- [x] FIX : helper `drawRotated` (saveGState→translate center→rotate(°→rad horaire = parité CALayer)→translate back→
      draw→restore, no-op si ≈0) appliqué à drawTextObject/drawMediaObject/drawSticker. +3 tests (rotation texte/sticker
      change le composite + déterminisme). MeeshySDK-Package 15/15 renderer verts. Direction parité = déductif + device.
- LEAD it.49 (même classe) : `drawTextObject` applique SEULEMENT `fontSize` (resolvedSize), PAS `textObj.scale` — alors
      que drawMediaObject (`scale*0.6`) et drawSticker (`scale*0.15`) appliquent scale. Si StoryTextLayer applique un
      scale de pinch séparé (transform) en plus de fontSize → composite raterait le pinch-scale du texte. À PROUVER
      (StoryTextLayer applique-t-il text.scale ? le pinch écrit-il scale ou fontSize ?) avant fix.
- Note : agent // a maintenant des modifs canvas-framing non commitées (StoryViewerView+Canvas, StoryCanvasUIView,
      StoryCanvasFraming + test) — NE PAS toucher.

## it.49 — fix composite rate le pinch-scale du texte (PROVABLE, shipped c36413f34)
- [x] BUG (prédit it.48) : `drawTextObject` projetait `resolvedSize` (= fontSize de BASE) SANS `text.scale`, alors que
      le canvas calcule `designFontSize = fontSize * scale` (StoryTextLayer:62) et que le pinch écrit `text.scale`
      (StoryCanvasUIView.updateScale, 0.3…4.0). Texte pinch-scalé → taille de BASE dans cover/thumbHash (≠ canvas).
      drawMediaObject (`scale*0.6`) / drawSticker (`scale*0.15`) appliquaient déjà scale → seul le texte divergeait.
- [x] FIX : `designFontSize = resolvedSize * textObj.scale` (parité StoryTextLayer). +2 tests (scale change la taille
      rendue + déterminisme). MeeshySDK-Package 9/9 renderer verts. → text/media/sticker appliquent maintenant TOUS scale+rotation.
- LEAD it.50 (même classe parité) : `StoryBackgroundLayer` applique un transform zoom+pan+rotation sur le FOND
      (commentaire l.5 « zoom + pan + rotation »). Le composite dessine-t-il le bg full-bleed en IGNORANT ce transform ?
      Si l'user a zoomé/pané/pivoté le fond, le cover/thumbHash le montrerait non-transformé. À PROUVER (le composite
      lit-il backgroundTransform/zoom/offset/rotation ?) avant fix.

## it.50 — audit parité TRANSFORM DU FOND : gap PROUVÉ, fix différé (risque > full-bleed sans device)
- [x] GAP prouvé : `renderComposite` dessine le fond FULL-BLEED (`bgMediaImage.draw(in: rect)`, l.53-58) en ignorant
      le transform zoom/pan/rotation. Le canvas l'applique : source moderne = bg `StoryMediaObject` → `BackgroundTransform(
      scale: bg.scale, offsetX: (bg.x-0.5)*renderW, offsetY: (bg.y-0.5)*renderH, rotation: bg.rotation)` (StoryCanvasUIView:1260-1267),
      appliqué via `caTransform()` au `contentLayer` (anchor centre, frame=bounds). L'user zoome/pane/pivote le fond
      (pinch/pan/rotation → updateScale/Position/Rotation sur le bg media object). → fond zoomé/pané/pivoté apparaît
      DROIT & full-bleed dans cover/thumbHash.
- [!] FIX DIFFÉRÉ (pas de fix spéculatif) : porter `caTransform` dans le raster exige de fixer l'ORDRE de composition
      CATransform3D (Translate→Rotate→Scale : pan en screen-space ou en espace scalé/rotaté ?) — un test pngData prouve
      « appliqué » mais PAS « ordre/direction correct », et un transform FAUX est PIRE que le full-bleed actuel (cover
      cassé). Non vérifiable sans device. + caveat aspect : `draw(in:rect)` STRETCH vs `contentsGravity` aspectFill du
      canvas (parité OK seulement pour fond 9:16 ; landscape diverge — pré-existant). À IMPLÉMENTER prudemment avec
      vérif visuelle device : translate(center)→translate(offset)→rotate→scale→translate(-center)→draw(in:rect), offset=
      (bg.x-0.5)*size.w / (bg.y-0.5)*size.h, en validant l'ordre contre le rendu canvas réel.
- AUTRES couches composite OK : rotation (it.48) + scale text/media/sticker (it.49) shippés ; bg color/image/media full-bleed,
      texte, fg media, stickers, dessin (StoryStrokeRasterizer design→rect) tous dessinés.
- Cible it.51 : StoryStrokeRasterizer (parité dessin design→bounds) OU SlideMiniPreview (sync mini-preview vs canvas/cover)
      OU sortir de la série composite. Preuve avant fix.

## it.51 — fix transform du FOND dans le composite (RÉSOUT le différé it.50, shipped b1359956f)
- [x] `StoryStrokeRasterizer` audité PROPRE : rasterise à la taille design (1080×1920, traits déjà en coords design)
      puis le composite étire dans `rect` — exactement le mapping design→bounds du canvas/SlideMiniPreview. Parité OK.
- [x] DÉBLOCAGE it.50 : `SlideMiniPreview` (l.137-139) applique le transform du fond via SwiftUI NON-AMBIGU :
      `.scaleEffect(scale)` + `.rotationEffect(rotation)` autour du centre + `.position(x·w, y·h)` (pan screen-space).
      → référence qui tranche l'ordre que CATransform3D rendait ambigu. Porté en CGContext (translate(center+pan)→
      rotate→scale→translate(-center)→draw ; scale uniforme commute avec rotation). Garde `isTransformed` → no-op aux
      défauts (full-bleed commun préservé). +4 tests (zoom/pan/rotation/déterminisme). MeeshySDK-Package 13/13 verts.
- BILAN série « parité composite cover/thumbHash vs canvas » COMPLÈTE : rotation (it.48) + scale texte (it.49) +
      transform fond (it.51) + dessin (StoryStrokeRasterizer propre). Caveat résiduel mineur : `draw(in:rect)` STRETCH
      vs `contentsGravity`/scaledToFill du canvas pour un fond NON-9:16 (parité partielle, séparé, faible impact).
- Cible it.52 (HORS composite) : StoryService decode (robustesse parsing) OU sync realtime comment/reaction count
      OU StatusEntry (moods, expiry, realtime) OU aspectFill caveat. Preuve avant fix.

## it.52 — fix realtime viewCount drop dans story:viewed (PROVABLE, shipped daa3cd572)
- [x] BUG (callback mal branché) : sink `socialSocket.storyViewed` posait `isViewed=true` mais IGNORAIT
      `viewedData.viewCount` (total autoritatif porté par l'event). → compteur de vues (StoryViewerView:933 lit
      `currentStory?.viewCount`) stale chez l'auteur pendant l'arrivée de viewers temps réel, jusqu'au prochain fetch.
- [x] FIX : `updatedStories[j].viewCount = viewedData.viewCount` (viewCount est `var`). +1 test (viewCount realtime appliqué).
      StoryViewModelTests 54/54 verts.
- [!] ÉCARTÉ (preuve avant fix) : gate `isViewed` sur `viewerId == myId` (ne marquer lu que pour MA vue) — sémantiquement
      plus correct MAIS régressait `dropsAllViewedGroupBelowUnviewedPeers` (le test envoie `viewerId:"me"` ≠ currentUser
      en test) et repose sur un scope de broadcast gateway NON prouvé. Comportement `isViewed=true` inconditionnel inchangé.
- GOTCHA infra : `build.db is locked` quand l'agent // build en parallèle dans la même DerivedData → réessayer (transitoire).
- Cible it.53 : StoryService decode (robustesse parsing) OU StatusEntry (moods expiry/realtime) OU comment count realtime
      OU aspectFill caveat non-9:16. Rendements TRÈS décroissants (story subsystem très mature, it.40-52). Preuve avant fix.

## it.53 — fix comment:deleted drift commentCount (PROVABLE, shipped 582b6cd81)
- [x] BUG (it.52-class) : sink `commentDeleted` faisait `item.commentCount = max(0, commentCount - 1)`, ignorant le
      `commentCount` autoritatif porté par `SocketCommentDeletedData.commentCount` — alors que `commentAdded` l'utilise
      déjà (asymétrie). Le `-1` dérive sur events manqués / hors-ordre / doublons.
- [x] FIX : routé via `applyStoryCommentCountDelta(postId:newCount: data.commentCount)` — symétrique commentAdded, total
      serveur drift-free. +1 test (commentCount 5 + event=3 → 3, pas 4). StoryViewModelTests 55/55 verts.
- [x] Finding 2 NON-BUG : `applyPostReactionDelta` utilise un delta ±1 ; l'event `SocketPostReactionUpdateEvent` porte
      une `aggregation` PAR-EMOJI (pas un total story) → delta correct. Le total autoritatif vit sur `postReactionSync`
      (totalCount + userReactions), déjà appliqué par son sink. Pas de changement.
- Cible it.54 : storyReacted/storyUnreacted (porte-t-il un count autoritatif ignoré ?) OU StoryService decode
      (robustesse parsing) OU StatusEntry. Rendements TRÈS décroissants. Preuve avant fix.

## it.54 — audit storyReacted + double-count : CLEAN (cross-check gateway, 0 bug)
- [x] `storyReacted`/`storyUnreacted` : `SocketStoryReactedData` ne porte que storyId/userId/emoji — AUCUN count
      autoritatif → `applyStoryReactionDelta` ±1 est correct (pas it.52-class). SAIN.
- [x] Double-count REFUTÉ (cross-check gateway) : `routes/posts/interactions.ts:76-96` — une réaction STORY émet
      EXCLUSIVEMENT `broadcastStoryReacted` (chaîne if/else-if par type), JAMAIS `broadcastPostLiked`/post:reaction-added
      (réservé POST/MOOD). Donc une réaction story → seul `applyStoryReactionDelta(+1)`, pas de +2.
- BILAN sync realtime story FULLY AUDITÉ end-to-end (client sinks + gateway emits) : viewCount (it.52 fixé),
      comment add/delete (it.53 fixé), reactions story/post (delta/sync corrects). Plus de bug realtime provable.
- Finding différé (défense, scope large) : `StoryService.list` → `PaginatedAPIResponse<[APIPost]>` decode all-or-nothing :
      1 post malformé ferait échouer TOUT le feed stories. Lenient-decode = best-practice trust-boundary MAIS le decode
      est dans le générique `api.paginatedRequest` (toucherait TOUTES les réponses paginées) → trop large pour un fix
      story-loop ; pas de payload échouant prouvé. Noté, non implémenté.
- ÉTAT : story subsystem TRÈS mature (it.40-54). Bugs provables autonomes ~épuisés ; restant = décisions user/device +
      findings scope-large/spéculatifs. Cible it.55 : re-sweep léger (perf affichage, nouveaux commits agent //) ou conclure.

## it.55 — re-sweep perf viewer : CLEAN + conclusion backlog autonome ÉPUISÉ
- [x] Timer progression story viewer (StoryViewerView+Content `startTimer`/`StoryProgressDisplayLinkProxy`) :
      CADisplayLink wall-clock (CACurrentMediaTime), commit `progress` THROTTLÉ (≥ 1/300 delta, l.602) — pas 60Hz,
      gated `isContentReady` + `shouldPauseTimer`, prefetch N+1 à 2ᵉ moitié, goToNext one-shot. BIEN CONÇU.
      Pas de bug perf provable sans profiling Instruments (hors portée autonome).
- [x] Aucun nouveau commit agent // depuis it.54 (rien à reviewer pour régression).
- CONCLUSION (honnête) : backlog de bugs PROVABLES autonomes ÉPUISÉ. Couvert : parité composite (48/49/51), sync
      realtime end-to-end (52/53/54), mutations/reconstruction (42/43), expiry/tray (40), repost (41), crash-trap (47),
      publication/offline (38/46), markViewed (42), socket revert (45), timer viewer (55). RESTANT = NON-autonome :
      • décisions produit USER (C.2 import, StoryPublishQueue backoff retryDelays),
      • vérif DEVICE (drag-reorder, toggle plein écran),
      • findings scope-large/spéculatifs sans preuve (StoryService lenient decode, bg aspectFill non-9:16, perf timer profiling),
      • zone agent // active (canvas/composer/filtre) — ne pas toucher.
      → Prochaines itérations : sans nouvel angle provable, rester en veille (audits clean) ; le vrai progrès demande
      l'input USER (décisions) ou un DEVICE. Pas de fix spéculatif.

## EN ATTENTE USER (décisions produit — ne pas fixer en autonomie)
- ~~Sidebar A/B/C overlap (carte reader)~~ → RÉSOLU 2026-06-03 : **option C retenue** (chevauchement accepté,
  le halo sombre it.37 assure la lisibilité, story reste grande). AUCUN changement code — état actuel = voulu.
- DEVICE (pas une décision, juste à tester sur vrai iPhone) : drag-reorder slides (logique testée, ressenti tactile
  à confirmer) + toggle plein écran carte→bord (animation spring à confirmer). Le simulateur ne suffit pas.
- **C.2 repost-as-post import (it.44)** : (A) compléter un éditeur post-canvas qui consomme `RepostImportResult`
  (texts/media/stickers/drawing reprojetés éditables) ; OU (B) retirer le scaffolding reprojection + bannière
  `reprojectionWarnings` (garder le quote-repost pur via embed). Aujourd'hui : calculé, loggé, jamais affiché.
- **StoryPublishQueue backoff (it.46)** : (A) brancher le backoff exponentiel planifié (`retryDelays`) avec seam DI
  testable + retryTask annulable + scheduleNextRetryIfNeeded en fin de processNext ; OU (B) retirer la constante morte +
  acter que les retries sont reconnect/launch-driven. Aujourd'hui : déclaré, jamais lu.

## it.56 — veille (dry well confirmé)
- [x] Aucun nouveau commit story de l'agent // depuis it.55. `ReaderAudioMixer` audité = mixer AVAudioEngine sample-accurate (host-time anchored, fade-in/out, loop) — mature, bug non prouvable sans profiling audio runtime. Pas de fix.
- VEILLE : backlog provable autonome épuisé (cf. it.55). Cadence idle allongée (30 min) en attendant input USER (décision C.2/backoff), nouveau commit agent, ou nouvel angle prouvable.
- [x] it.57 — story REPLY flow audité CLEAN : bouton gated (`!isOwnStory && onReplyToStory != nil`, Sidebar:155) → `onReplyToStory?(.story(...))` (Sidebar:164) → providers réels (RootView:373 dismiss+navigateToStoryReply, ConversationView, iPad, RootViewComponents). Callback bien branché, pas inerte. Aucun bug.

## it.58 — RÉGRESSION PROUVÉE (migration filtre agent //) : scope filtre composite ≠ canvas
- [!] L'agent // a migré le filtre canvas overlay→bake (commits a4290753b→34c588707, HEAD compile OK — build SDK vert).
      `StoryBackgroundLayer.swift:146-152` : filtre BAKÉ dans le bitmap de FOND — « Applies to image backgrounds ONLY
      (text/sticker overlays intentionally NOT filtered — standard photo-filter behaviour) ».
- [!] MAIS `StorySlideRenderer.renderComposite` step 7 filtre TOUJOURS LE COMPOSITE ENTIER
      (`applyActiveFilter(to: base)` = bg+texte+fg+stickers+dessin). NON touché par la migration. → cover/thumbHash d'une
      story vintage/bw montre texte+dessin sépia/mono alors que le live ne filtre QUE le fond. Incohérence cover↔canvas
      (régression introduite par la migration).
- AMBIGUÏTÉ : `StoryCanvasUIView` garde encore `captureFilterSourceTexture` / `StoryFilteredLayer` /
      `_captureFilterSourceForTesting` (chemin overlay whole-canvas) → scope filtre canvas FINAL incertain (bake bg-only
      ET overlay coexistent ?). Migration possiblement encore en cours.
- FIX (à COORDONNER avec l'agent, PAS unilatéral mid-migration) : aligner renderComposite sur la sémantique finale — si
      bg-only, filtrer bgImage/bgMediaImage AVANT de dessiner les overlays (idéalement via `StoryFilterProcessor.apply`
      = parité exacte canvas), retirer step 7, + RÉÉCRIRE `StorySlideRendererFilterTests` (encodent l'ancienne sémantique
      whole-composite sur fond COULEUR → un fond couleur ne serait plus filtré). Zone filtre = agent // active → ne pas
      toucher tant que la migration n'est pas figée.
- ACTION : surfacé à l'user (régression live sur main issue du travail parallèle).
