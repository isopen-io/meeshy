# Story Reader — Horloge unique + coordination audio (Lot 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un seul pilote de progression pour le reader (suppression du display-link legacy `StoryProgressDisplayLinkProxy`), pause cohérente sur toutes les sources (UI, long-press, préemption, interruption), enregistrement audio routé par la source unique de session.

**Architecture:** `StoryReaderTimerController` (SDK, gated content-ready, déjà instancié et câblé en no-op) devient l'unique horloge de progression. Il gagne une API `setPaused(_:)` (TDD). Côté app, `startTimer()` conserve ses resets d'état de slide mais délègue progression/auto-advance/prefetch-threshold aux callbacks du controller. Les sites `timerCancellable` migrent vers le controller.

**Spec:** `docs/superpowers/specs/2026-06-11-story-stack-fluidity-design.md` (§S2, Lot 2).

**⚠️ Déviation documentée vs spec :** l'asservissement intégral de la barre au temps canvas (`onPlaybackTime` sample-accurate) est ABANDONNÉ après lecture du code : (a) le clock canvas clampe à la durée de slide, donc toute pause « timer-only » pendant que le canvas continue (sheets, composer — sémantique voulue, cf. `shouldPauseTimer` doc 2026-05-28) bloquerait l'auto-advance à jamais ; (b) le wall-clock est documenté comme « l'autorité de la durée slide » précisément à cause des loops vidéo. Le gating `markContentReady` (déjà actif) couvre le seul cas de dérive visible (timer qui court avant contenu). Résultat net : 2 display-links de progression → 1, pause unifiée, zéro changement de sémantique produit.

---

### Task 1 : SDK — `setPaused(_:)` sur `StoryReaderTimerController` (TDD)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderTimerController.swift`
- Test: suite SDK existante du controller (chercher `StoryReaderTimerController` dans `packages/MeeshySDK/Tests/`)

- [ ] **Step 1.1 : Tests RED**

```swift
func test_setPaused_freezesProgress() { /* active → advance 2s → pause → advance 3s → progress inchangé */ }
func test_setPaused_resume_doesNotJump() { /* pause 3s → resume → advance 1s → progress = (2+1)/duration */ }
func test_setPaused_whilePending_staysPending() { /* pas de start implicite */ }
func test_setPaused_true_blocksCompletion() { /* elapsed≈duration, pause, advance → onCompletion non tiré */ }
```

- [ ] **Step 1.2 : Implémentation**

```swift
public private(set) var isPaused: Bool = false

public func setPaused(_ paused: Bool) {
    guard paused != isPaused else { return }
    isPaused = paused
    if !paused { lastTick = nil }   // resume sans saut
}
```
+ `guard isActive, !isPaused, duration > 0` dans `advanceClock` ; `isPaused = false` dans `setCurrentSlide` et `reset()` ; exposer `isPaused`/`setPaused` dans le protocole `StoryReaderTimerControlling`.

- [ ] **Step 1.3 : Tests verts + commit**

### Task 2 : App — migration du timer legacy vers le controller

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` (suppr. `StoryProgressDisplayLinkProxy` :15-54, réécriture `startTimer()` :548-622, `dismissViewer` :494)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` (`installPrefetchPipelineIfNeeded` :625-641 → callbacks réels ; sites `timerCancellable` :142/408/423 ; pause via `adaptiveOnChange(of: shouldPauseTimer)` ; `markContentReady` aussi depuis le canvas VISIBLE)

- [ ] **Step 2.1 :** `installPrefetchPipelineIfNeeded` câble les vrais callbacks :

```swift
t.onProgressChange = { p in
    let raw = CGFloat(min(1.0, p))
    if abs(raw - progress) >= 1.0 / 300.0 || raw >= 1.0 { progress = raw }
    let duration = computedStoryDuration
    let threshold = max(0.5, 1.0 - (5.0 / max(duration, 0.1)))
    if p >= threshold && !hasFiredNextPrefetch {
        hasFiredNextPrefetch = true
        _ = prefetchStory(at: currentStoryIndex + 1)
    }
}
t.onCompletion = { goToNext() }
```

- [ ] **Step 2.2 :** `startTimer()` garde les resets d'état de slide (progress=0, comments, reactions, durée) et se termine par `refreshPrefetchWindowAndTimer()` (qui fait `setCurrentSlide`) — plus aucun proxy. Supprimer `timerCancellable`, `StoryProgressDisplayLinkProxy`, et remplacer ses 5 sites (`cancel()` → `slideTimer.reset()` ; `dismissViewer` → `slideTimer.setPaused(true)`).
- [ ] **Step 2.3 :** Pause : `.adaptiveOnChange(of: shouldPauseTimer) { slideTimer.setPaused($0) }` sur le contenu du viewer (+ état initial à l'install).
- [ ] **Step 2.4 :** Readiness du canvas visible : dans la closure `onContentReady` existante (Canvas:778, qui pose `isContentReady = true`), appeler aussi `slideTimer.markContentReady(slideId:)` (idempotent) — le signal du canvas préfetché reste câblé, premier arrivé gagne.
- [ ] **Step 2.5 :** Build + suite tests + smoke reader (image statique 6 s auto-advance, vidéo, long-press pause, sheet pause, swipe groupe) + commit.

### Task 3 : Préemption — `stopHandler` réel — **ABANDONNÉE (exécution 2026-06-11)**

Le `stopHandler` vide est INTENTIONNEL et documenté dans le code
(StoryViewerView onAppear) : le canvas se préempte LUI-MÊME à chaque
`startAudioPlayback` (`willStartPlaying(external: audioMixer)` sweep →
stop de `StoryMediaCoordinator` → handler). Un handler actif mettrait le
viewer en pause/muted à CHAQUE démarrage de slide (bug historique
« viewer s'ouvre toujours muted »). Les vraies interruptions externes
passent par `observeAudioSessionEvents` (couvert par Task 4). La revue
initiale avait flaggé ce point sans cross-checker le commentaire du code
— leçon `feedback-audit-must-cross-check-git-log` reconfirmée.

### Task 4 : SDK — resume post-interruption respecte la pause

**Files:** `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` (:1084-1088)

- [ ] `case .interruptionEndedShouldResume` : ajouter le guard sur le flag de pause posé par `setStoryPlaybackPaused` (vérifier le nom du bool interne, :2016). Build + commit.

### Task 5 : SDK — `DefaultSDKAudioRecorder` via `MediaSessionCoordinator`

**Files:** `packages/MeeshySDK/Sources/MeeshySDK/Audio/DefaultSDKAudioRecorder.swift` (:27-34), `packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift`

- [ ] Ajouter `activateRecordingSync()` au coordinator (symétrique à `activatePlaybackSync`, catégorie `.playAndRecord` mode `.default` options `[.defaultToSpeaker, .allowBluetoothA2DP]`, no-op si `callActive`) ; `startRecording()` l'utilise au lieu de toucher `AVAudioSession` directement. Build + tests + commit.

### Task 6 : Vérification finale Lot 2

- [ ] Suite complète + smoke reader sur simulateur + PR (stackée sur `feat/story-surfaces-lot1`).
