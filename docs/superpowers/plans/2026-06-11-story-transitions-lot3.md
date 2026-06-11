# Story Reader — Transitions niveau reels (Lot 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transitions auteur→auteur au niveau des reels : première frame du groupe voisin sans rebuild perceptible, geste interruptible/réversible avec vrai rendu deux-faces, et zéro recalcul de slide dans le render path.

**Spec:** `docs/superpowers/specs/2026-06-11-story-stack-fluidity-design.md` (§S3, Lot 3).

### Task 3a : Mémoïsation `toRenderableSlide` dans le render path

**Files:** `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift` (sites :834, :1324, :1387)

- [ ] Cache à 1 entrée (`RenderableSlideCache`, classe boxée en `@State` de `StoryCardView`) keyé par fingerprint `story.id | chaîne de langues | counts de traductions par textObject` (invalide sur merge de traductions temps réel). Les 3 sites consomment le cache. Build + tests + commit.

### Task 3b : Prefetch inter-groupes

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderPrefetcher.swift` (paramètre opaque `extraWarmItems`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` (`refreshPrefetchWindowAndTimer` passe le 1er slide non-vu du groupe suivant + le slide d'entrée du groupe précédent)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryReader_PrefetchTests.swift`

- [ ] TDD SDK : `updateWindow(items:currentIndex:context:preferredLanguages:extraWarmItems:)` — les extras sont bootstrappés en `.edit` et protégés de l'éviction tant qu'ils restent passés ; défaut `[]` non-cassant.
- [ ] App : câbler les voisins de groupe. Build + tests + commit.

### Task 3c : Transition de groupe interactive réversible (deux faces)

**Files:** `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` (`unifiedDragGesture`, `groupTransition`), `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift` (face entrante), `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` (état drag)

Principe (parité reels) : pendant le drag horizontal inter-groupes, la face ENTRANTE est un rendu statique léger du 1er slide du groupe voisin (canvas préfetché 3b via snapshot, sinon cover/thumbHash) — jamais une 2ᵉ StoryCardView interactive (états mono-slide du viewer + coût). Les deux faces tournent autour de l'arête commune (vrai cube : sortante 0→−90°, entrante +90°→0, anchor sur les bords opposés). Le geste suit le doigt en continu, seuil distance OU vélocité pour commit, sinon snap-back spring. Le swap vers la vraie StoryCardView se fait au commit (comme aujourd'hui — invisible car la face entrante affiche déjà le même contenu).

- [ ] État : `groupDragProgress: CGFloat` (−1…1) remplace le lock binaire pendant le drag ; `isTransitioning` ne s'arme qu'au commit.
- [ ] Face entrante : `neighborGroupPreview(direction:)` — image du canvas préfetché (`prefetcher.view(for:)` → `drawHierarchy` snapshot) sinon thumbHash/cover du 1er slide voisin.
- [ ] Géométrie cube : `rotation3DEffect` des deux faces, anchors `.leading`/`.trailing`, perspective 0.6 — remplace le « lean » mono-carte.
- [ ] Commit/annulation : seuil 60 pt OU vélocité prédite 150 pt (inchangés) ; snap-back spring réversible à tout moment avant release.
- [ ] Build + smoke visuel simulateur (aller-retour mi-geste, commit, vélocité) + commit.
