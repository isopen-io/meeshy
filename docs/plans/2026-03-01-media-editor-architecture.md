# Media Editor Architecture — Plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corriger 9 bugs critiques/majeurs dans les composants d'édition média (audio, image, vidéo) et poser les fondations architecturales pour éliminer les doublons.

**Architecture:** Chaque bug est isolé dans sa propre tâche. Les 3 bugs critiques (C1-C3) qui bloquent l'audio sont traités en premier. Les bugs de performance (P1-P3) et d'architecture (A1, F1-F5) suivent. Chaque tâche se termine par un build de vérification avec `./apps/ios/meeshy.sh build`.

**Tech Stack:** Swift 5.9, SwiftUI, AVFoundation (AVAudioSession actor, AVPlayer, AVAudioRecorder), Speech framework (SFSpeechRecognizer), PhotosUI, Xcode 16+, iOS 16+

---

## Contexte — Fichiers concernés

```
packages/MeeshySDK/Sources/MeeshyUI/Story/
├── StoryComposerView.swift        ← C3 (fullScreenCover race condition)
├── StoryAudioPlayerView.swift     ← C1 (dead playback), P1 (TimelineView toujours actif)
├── StoryVoiceRecorder.swift       ← P3 (2 timers), P4 (random dans body)
├── MeeshyAudioEditorView.swift    ← F1 (transcription ignore trim), F5 (sync I/O), trim handles 13pt
├── StoryCanvasView.swift          ← F2 (CIFilter dans body), F3 (gestures séparés)
├── DraggableMediaView.swift       ← F4 (onChange API dépréciée)
├── UnifiedPostComposer.swift      ← C2 (PhotosPicker binding toujours false)
packages/MeeshySDK/Sources/MeeshySDK/
├── (nouveau) MediaSessionCoordinator.swift  ← Task 1
```

## Bugs corrigés

| ID | Sévérité | Fichier | Description |
|----|----------|---------|-------------|
| C1 | Critical | StoryAudioPlayerView | togglePlayback() ne joue aucun audio (TODO non implémenté) |
| C2 | Critical | UnifiedPostComposer | PhotosPicker binding toujours `false`, picker inaccessible |
| C3 | Critical | StoryComposerView | fullScreenCover(isPresented:) + URL séparée = race condition |
| F1 | Major | MeeshyAudioEditorView | SFSpeechRecognizer transcrit le fichier entier, ignore trimStart/trimEnd |
| F2 | Major | StoryCanvasView | StoryFilterProcessor.apply() appelé dans body à chaque render |
| F3 | Major | StoryCanvasView | DraggableSticker: 3 gestures séparés se font concurrence |
| F4 | Major | DraggableMediaView | onChange(of:) signature iOS 16 dépréciée (iOS 17 only) |
| F5 | Major | MeeshyAudioEditorView | Data(contentsOf:) synchrone sur main thread dans setup() |
| P1 | Perf | StoryAudioPlayerView | TimelineView(.animation) tourne 20fps même quand isPlaying == false |
| P3 | Perf | StoryVoiceRecorder | 2 timers simultanés (durationTimer 100ms + waveTimer 50ms) |
| P4 | Perf | StoryVoiceRecorder | CGFloat.random(in:) dans body = instabilité visuelle |
| A1 | Arch | Tous | Pas de coordination AVAudioSession entre composants |

---

## Task 1 — AVAudioSession Coordinator (infrastructure partagée)

**Pourquoi en premier :** Sans coordination, deux composants peuvent activer des catégories incompatibles (`.record` vs `.playback`) simultanément, causant des crashs silencieux.

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift`

**Step 1: Créer le fichier `MediaSessionCoordinator.swift`**

```swift
import AVFoundation

/// Coordonne l'accès à AVAudioSession entre tous les composants audio.
/// Actor = thread-safe garanti à la compilation.
public actor MediaSessionCoordinator {

    public static let shared = MediaSessionCoordinator()

    public enum AudioRole {
        case playback           // lecture seule
        case record             // enregistrement seul
        case playAndRecord      // ex: lecture pendant enregistrement de voice memo
    }

    private var activeRole: AudioRole?
    private var activationCount = 0

    private init() {}

    /// Demande la session pour un rôle. Lève une erreur si incompatible.
    public func request(role: AudioRole) async throws {
        let session = AVAudioSession.sharedInstance()

        switch role {
        case .playback:
            try session.setCategory(.playback, mode: .default)
        case .record:
            try session.setCategory(.record, mode: .default)
        case .playAndRecord:
            try session.setCategory(.playAndRecord, mode: .default,
                                    options: [.defaultToSpeaker, .allowBluetooth])
        }

        try session.setActive(true)
        activeRole = role
        activationCount += 1
    }

    /// Libère la session si personne d'autre ne l'utilise.
    public func release() async {
        guard activationCount > 0 else { return }
        activationCount -= 1
        if activationCount == 0 {
            try? AVAudioSession.sharedInstance().setActive(false,
                options: .notifyOthersOnDeactivation)
            activeRole = nil
        }
    }
}
```

**Step 2: Vérifier que le fichier compile**

```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh build
```

Résultat attendu: `BUILD SUCCEEDED` (le fichier est pur Swift/AVFoundation, pas de dépendance UI).

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift
git commit -m "feat(sdk): MediaSessionCoordinator actor — coordination AVAudioSession centralisée"
```

---

## Task 2 — Fix C3: fullScreenCover race condition dans StoryComposerView

**Problème :** `fullScreenCover(isPresented: $showAudioEditor)` + `if let url = pendingAudioEditorURL` à l'intérieur. Si le flag passe à `true` mais que l'URL est nil (race condition), la vue s'ouvre vide.

**Fix :** Utiliser `fullScreenCover(item:)` avec un type `Identifiable`.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

**Step 1: Lire les lignes actuelles du fullScreenCover audio**

Chercher dans `StoryComposerView.swift` l'occurrence de `showAudioEditor` ou `pendingAudioEditorURL` avec :
```bash
grep -n "showAudioEditor\|pendingAudioEditorURL\|showMediaAudioEditor" \
  packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
```

**Step 2: Créer le type item**

Dans `StoryComposerView.swift`, ajouter avant la struct `StoryComposerView` (après les enums existants) :

```swift
// Wrapper Identifiable pour fullScreenCover(item:) — évite la race condition
private struct AudioEditorItem: Identifiable {
    let id = UUID()
    let url: URL
}
```

**Step 3: Remplacer la @State de présentation**

Trouver et remplacer les `@State` liés au fullScreenCover audio :

Avant (pattern approximatif — adapter aux lignes exactes trouvées au Step 1) :
```swift
@State private var showAudioEditor = false
@State private var pendingAudioEditorURL: URL? = nil
```

Après :
```swift
@State private var audioEditorItem: AudioEditorItem? = nil
```

**Step 4: Remplacer le site d'ouverture**

Partout où `showAudioEditor = true` et `pendingAudioEditorURL = url` sont assignés ensemble, remplacer par :
```swift
audioEditorItem = AudioEditorItem(url: url)
```

**Step 5: Remplacer le modificateur fullScreenCover**

Avant :
```swift
.fullScreenCover(isPresented: $showAudioEditor) {
    if let url = pendingAudioEditorURL {
        MeeshyAudioEditorView(url: url, ...)
    }
}
```

Après :
```swift
.fullScreenCover(item: $audioEditorItem) { item in
    MeeshyAudioEditorView(
        url: item.url,
        onConfirm: { url, transcriptions, start, end in
            // même logique qu'avant
            audioEditorItem = nil
        },
        onDismiss: {
            audioEditorItem = nil
        }
    )
}
```

**Step 6: Build**

```bash
./apps/ios/meeshy.sh build
```

Résultat attendu: `BUILD SUCCEEDED`.

**Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "fix(ui): fullScreenCover(item:) — élimine la race condition audio editor"
```

---

## Task 3 — Fix C1: StoryAudioPlayerView — connecter le vrai AVPlayer

**Problème :** `togglePlayback()` ne fait que basculer un bool. La fonction TODO bloquait la lecture audio dans la canvas story.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPlayerView.swift`

**Step 1: Ajouter l'AVPlayer et les @State nécessaires**

Remplacer les `@State` existants (ligne ~10-12) :

Avant :
```swift
@State private var isPlaying = false
@State private var playbackProgress: Double = 0
@GestureState private var dragOffset = CGSize.zero
```

Après :
```swift
@State private var isPlaying = false
@State private var playbackProgress: Double = 0
@State private var player: AVPlayer? = nil
@State private var timeObserver: Any? = nil
@State private var endObserver: NSObjectProtocol? = nil
@GestureState private var dragOffset = CGSize.zero
```

**Step 2: Ajouter les imports manquants en tête de fichier**

```swift
import AVFoundation
```

(déjà présent via `AVKit` — vérifier, sinon ajouter `import AVFoundation`)

**Step 3: Connecter l'audio via onAppear/onDisappear**

Ajouter dans `body`, sur `playerContent` (ou sur `GeometryReader`) :

```swift
.onAppear {
    guard let urlString = audioObject.audioURL,
          let url = URL(string: urlString) else { return }
    setupPlayer(url: url)
}
.onDisappear {
    teardownPlayer()
}
```

**Step 4: Implémenter setupPlayer et teardownPlayer**

Ajouter après la fonction `dragGesture(geo:)` :

```swift
private func setupPlayer(_ url: URL) {
    Task {
        try? await MediaSessionCoordinator.shared.request(role: .playback)
    }
    let item = AVPlayerItem(url: url)
    let p = AVPlayer(playerItem: item)
    p.volume = Float(audioObject.volume)
    self.player = p

    // Observer de progression
    let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
    timeObserver = p.addPeriodicTimeObserver(forInterval: interval, queue: .main) { time in
        let duration = p.currentItem?.duration.seconds ?? 1
        guard duration.isFinite && duration > 0 else { return }
        playbackProgress = time.seconds / duration
    }

    // Observer de fin
    endObserver = NotificationCenter.default.addObserver(
        forName: .AVPlayerItemDidPlayToEndTime,
        object: item,
        queue: .main
    ) { _ in
        isPlaying = false
        playbackProgress = 0
        p.seek(to: .zero)
    }
}

private func teardownPlayer() {
    if let obs = timeObserver { player?.removeTimeObserver(obs) }
    if let obs = endObserver { NotificationCenter.default.removeObserver(obs) }
    player?.pause()
    player = nil
    Task { await MediaSessionCoordinator.shared.release() }
}
```

**Step 5: Remplacer togglePlayback()**

Avant :
```swift
private func togglePlayback() {
    isPlaying.toggle()
    // TODO Task 20 : connecter à AVPlayer via StoryComposerView
}
```

Après :
```swift
private func togglePlayback() {
    guard let player else { return }
    if isPlaying {
        player.pause()
        isPlaying = false
    } else {
        player.play()
        isPlaying = true
    }
}
```

**Step 6: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 7: Vérification manuelle dans le simulateur**

```bash
# Si build OK, lancer le simulateur pour vérifier la lecture audio
./apps/ios/meeshy.sh run
```

Scénario: Créer une story, ajouter un audio depuis la bibliothèque, placer le player sur le canvas, appuyer sur Play → l'audio doit jouer.

**Step 8: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPlayerView.swift
git commit -m "fix(ui): StoryAudioPlayerView — connecter AVPlayer réel, remplacer togglePlayback TODO"
```

---

## Task 4 — Fix P1: TimelineView toujours actif dans StoryAudioPlayerView

**Problème :** `TimelineView(.animation(minimumInterval: 0.05))` tourne à 20fps même quand `isPlaying == false`. Consomme du CPU inutilement sur toute vue avec un audio player.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPlayerView.swift`

**Step 1: Remplacer TimelineView(.animation) par TimelineView(.paused(override:))**

Localiser dans `waveformView` le `TimelineView(.animation(minimumInterval: 0.05))`.

Avant :
```swift
TimelineView(.animation(minimumInterval: 0.05)) { context in
    Canvas { ctx, size in
        // ...
        let t = context.date.timeIntervalSinceReferenceDate
        // ...
        let animOffset: CGFloat = isPlaying && isPlayed
            ? CGFloat(sin(t * 8 + Double(i) * 0.7)) * 2 : 0
        // ...
    }
}
```

Après :
```swift
TimelineView(.animation(minimumInterval: 0.05, paused: !isPlaying)) { context in
    Canvas { ctx, size in
        // ... (identique)
        let t = context.date.timeIntervalSinceReferenceDate
        // ... (identique)
        let animOffset: CGFloat = isPlaying && isPlayed
            ? CGFloat(sin(t * 8 + Double(i) * 0.7)) * 2 : 0
        // ... (identique)
    }
}
```

Note: `TimelineView(.animation(minimumInterval:paused:))` est disponible dès iOS 16. Le paramètre `paused:` stoppe les updates quand la vue n'est pas en lecture.

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPlayerView.swift
git commit -m "fix(perf): TimelineView paused quand audio arrêté — réduction CPU idle"
```

---

## Task 5 — Fix C2: UnifiedPostComposer — PhotosPicker binding cassé

**Problème :** Le modificateur `.photosPicker(isPresented: Binding(get: { false }, ...))` retourne toujours `false`. Le `PhotosPicker` inline dans `postComposer` fonctionne mais la voie `.photosPicker(modifier)` est morte.

**Fix :** Supprimer le modificateur `.photosPicker(isPresented:)` cassé. Le `PhotosPicker(selection:)` inline dans `postComposer` est suffisant et correct.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift`

**Step 1: Localiser et supprimer le modificateur cassé**

```bash
grep -n "photosPicker\|selectedPhotoItem != nil" \
  packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift
```

**Step 2: Supprimer les 4 lignes du modificateur cassé**

Les lignes approximatives (adapter selon grep) :
```swift
// SUPPRIMER ces lignes :
.photosPicker(isPresented: Binding(
    get: { selectedPhotoItem != nil ? false : false },
    set: { _ in }
), selection: $selectedPhotoItem, matching: .images)
```

Note: Le `PhotosPicker(selection: $selectedPhotoItem, matching: .images)` dans `postComposer` (ligne ~140) est correct et suffit.

**Step 3: Vérifier que `canPublish` pour `.story` est corrigé**

Localiser `canPublish`. Si le corps contient :
```swift
case .story: return false
```

Le corriger en :
```swift
case .story: return true  // La story est gérée par StoryComposerView
```

**Step 4: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift
git commit -m "fix(ui): UnifiedPostComposer — supprimer PhotosPicker binding cassé, activer canPublish story"
```

---

## Task 6 — Fix F3: DraggableSticker — gestures simultanés

**Problème :** `DraggableSticker` applique 3 `.gesture()` modifiers séparés (drag, magnification, rotation). Les gestures séparés se font concurrence — SwiftUI en choisit un seul par interaction.

**Fix :** Combiner avec `SimultaneousGesture` comme dans `StoryCanvasView.imageGesture`.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift`

**Step 1: Localiser les 3 gestures séparés dans DraggableSticker (lignes ~318-324)**

```
.gesture(dragGesture)
.gesture(magnificationGesture)
.gesture(rotationGesture)
```

**Step 2: Ajouter @GestureState pour live preview pendant le gesture**

Dans `DraggableSticker`, ajouter les states manquants :

```swift
@GestureState private var gestureOffset: CGSize = .zero
@GestureState private var gestureScale: CGFloat = 1.0
@GestureState private var gestureRotation: Angle = .zero
```

**Step 3: Réécrire les gestures avec GestureState et les combiner**

Remplacer les 3 computed properties séparées :

```swift
private var combinedGesture: some Gesture {
    let drag = DragGesture()
        .updating($gestureOffset) { value, state, _ in
            state = value.translation
        }
        .onEnded { value in
            var updated = sticker
            updated.x = max(0.05, min(0.95, sticker.x + value.translation.width / canvasSize.width))
            updated.y = max(0.05, min(0.95, sticker.y + value.translation.height / canvasSize.height))
            onUpdate(updated)
        }

    let pinch = MagnificationGesture()
        .updating($gestureScale) { value, state, _ in
            state = value
        }
        .onEnded { value in
            var updated = sticker
            updated.scale = max(0.3, min(3.0, sticker.scale * value))
            onUpdate(updated)
        }

    let rotation = RotationGesture()
        .updating($gestureRotation) { value, state, _ in
            state = value
        }
        .onEnded { value in
            var updated = sticker
            updated.rotation = sticker.rotation + value.degrees
            onUpdate(updated)
        }

    return drag.simultaneously(with: pinch.simultaneously(with: rotation))
}
```

**Step 4: Mettre à jour body pour utiliser gestureStates dans le rendu**

Remplacer dans `body` :
```swift
Text(sticker.emoji)
    .font(.system(size: 50 * sticker.scale * currentScale))
    .rotationEffect(Angle(degrees: sticker.rotation) + currentRotation)
```

Par :
```swift
Text(sticker.emoji)
    .font(.system(size: 50 * sticker.scale * gestureScale))
    .rotationEffect(Angle(degrees: sticker.rotation) + gestureRotation)
    .offset(gestureOffset)
```

**Step 5: Remplacer les 3 `.gesture()` séparés par 1**

```swift
.gesture(combinedGesture)
```

**Step 6: Supprimer les anciennes @State currentScale et currentRotation** (remplacées par @GestureState).

**Step 7: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 8: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift
git commit -m "fix(ui): DraggableSticker — simultaneously(with:) pour drag+pinch+rotation concurrent"
```

---

## Task 7 — Fix F4: DraggableMediaView — onChange API dépréciée

**Problème :** `onChange(of: videoURL) { newURL in }` utilise la signature iOS 17 uniquement. Sur iOS 16, cela compile mais peut produire des warnings ou un comportement inattendu.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift`

**Step 1: Localiser onChange dans DraggableMediaView (ligne ~54-58)**

```swift
.onChange(of: videoURL) { newURL in
    if let newURL {
        videoPlayer = AVPlayer(url: newURL)
    }
}
```

**Step 2: Remplacer par la signature iOS 16-compatible (2 paramètres)**

```swift
.onChange(of: videoURL) { oldURL, newURL in
    if let newURL {
        videoPlayer = AVPlayer(url: newURL)
    }
}
```

Note: La signature `{ oldValue, newValue in }` est disponible dès iOS 17. Pour iOS 16, utiliser :
```swift
.onChange(of: videoURL) { [self] newURL in
    if let newURL {
        videoPlayer = AVPlayer(url: newURL)
    }
}
```

Le target iOS minimum est iOS 16, donc la forme à 1 paramètre est acceptable tant qu'elle ne génère pas de warning dans Xcode 16. Vérifier au build.

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```

Vérifier l'absence de warnings `onChange` dans la sortie.

**Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift
git commit -m "fix(ui): DraggableMediaView — onChange iOS 16 compatible"
```

---

## Task 8 — Fix F2: StoryCanvasView — CIFilter hors du body

**Problème :** `StoryFilterProcessor.apply(selectedFilter, to: image)` est appelé directement dans `mediaLayer` (computed property dans `body`). À chaque render de la vue (scroll, animation), le filtre est recalculé.

**Fix :** Cacher le résultat filtré dans un `@State`, recalculer uniquement quand `selectedFilter` ou `selectedImage` change.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift`

**Step 1: Ajouter un @State pour l'image filtrée**

Dans `StoryCanvasView`, après les `@State` existants :

```swift
@State private var filteredImage: UIImage? = nil
```

**Step 2: Calculer filteredImage en réaction aux changements**

Dans `body`, ajouter ces deux modificateurs sur le `GeometryReader` ou le `ZStack` principal :

```swift
.onAppear {
    filteredImage = StoryFilterProcessor.apply(selectedFilter, to: selectedImage)
}
.onChange(of: selectedImage) { _, newImage in
    filteredImage = StoryFilterProcessor.apply(selectedFilter, to: newImage)
}
.onChange(of: selectedFilter) { _, newFilter in
    filteredImage = StoryFilterProcessor.apply(newFilter, to: selectedImage)
}
```

**Step 3: Remplacer l'appel dans mediaLayer**

Avant :
```swift
private var mediaLayer: some View {
    if let image = selectedImage {
        let filtered = StoryFilterProcessor.apply(selectedFilter, to: image)
        Image(uiImage: filtered)
```

Après :
```swift
@ViewBuilder
private var mediaLayer: some View {
    if let image = filteredImage ?? selectedImage {
        Image(uiImage: image)
```

**Step 4: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift
git commit -m "fix(perf): StoryCanvasView — CIFilter hors body, cache dans @State filteredImage"
```

---

## Task 9 — Fix F1+F5+P3+P4: MeeshyAudioEditorView — 4 bugs en un commit

**Problème :** Quatre bugs dans `MeeshyAudioEditorView` :
- **F1** : `SFSpeechURLRecognitionRequest(url: url)` transcrit le fichier entier, ignore `trimStart`/`trimEnd`
- **F5** : `Data(contentsOf: url)` synchrone sur main thread dans `setup()`
- **P2** : `waveformBars` recompute 80+ bars à chaque tick du `timeObserver` (toutes les 50ms)
- Trim handles de 13pt (< 44pt HIG minimum)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/MeeshyAudioEditorView.swift`

### Fix F5 — async setup()

**Step 1: Localiser `setup()` dans MeeshyAudioEditorView**

```bash
grep -n "func setup\|Data(contentsOf\|AVAudioSession" \
  packages/MeeshySDK/Sources/MeeshyUI/Story/MeeshyAudioEditorView.swift
```

**Step 2: Rendre setup() async et déplacer I/O sur background**

Avant (pattern) :
```swift
private func setup() {
    // ... configuration sync ...
    // appel potentiellement synchrone à Data(contentsOf:)
    analyzer.analyze(url: url)
}
```

Après :
```swift
private func setup() {
    Task {
        // AVAudioSession sur background via coordinator
        try? await MediaSessionCoordinator.shared.request(role: .playback)

        // Tout le setup AVPlayer sur main
        await MainActor.run {
            let item = AVPlayerItem(url: url)
            let p = AVPlayer(playerItem: item)
            player = p

            let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
            timeObserver = p.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak p] t in
                guard let dur = p?.currentItem?.duration.seconds,
                      dur.isFinite, dur > 0 else { return }
                currentTime = t.seconds
                totalDuration = dur
            }

            endObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: item,
                queue: .main
            ) { _ in
                isPlaying = false
                currentTime = 0
                player?.seek(to: .zero)
            }

            // Duration initiale
            Task {
                let dur = try? await item.asset.load(.duration)
                if let secs = dur?.seconds, secs.isFinite {
                    await MainActor.run {
                        totalDuration = secs
                        trimEnd = secs
                    }
                }
            }
        }

        // Analyse waveform en background (pas de Data(contentsOf:) sur main)
        await analyzer.analyze(url: url)
    }
}
```

### Fix F1 — Transcription respecte trimStart/trimEnd

**Step 3: Localiser la fonction de transcription**

```bash
grep -n "SFSpeechURLRecognitionRequest\|transcribe\|recognitionTask" \
  packages/MeeshySDK/Sources/MeeshyUI/Story/MeeshyAudioEditorView.swift
```

**Step 4: Exporter le segment trimé avant transcription**

Avant la transcription avec `SFSpeechRecognitionRequest`, exporter d'abord le segment trimé via AVAssetExportSession :

Ajouter une fonction utilitaire dans `MeeshyAudioEditorView` :

```swift
/// Exporte le segment [start, end] dans un fichier temporaire pour la transcription.
private func exportTrimmedSegment(from url: URL, start: TimeInterval, end: TimeInterval) async throws -> URL {
    let asset = AVAsset(url: url)

    guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
        throw NSError(domain: "MeeshyAudioEditor", code: 1, userInfo: [NSLocalizedDescriptionKey: "Export session unavailable"])
    }

    let outURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("trim_\(UUID().uuidString).m4a")

    exportSession.outputURL = outURL
    exportSession.outputFileType = .m4a
    exportSession.timeRange = CMTimeRange(
        start: CMTime(seconds: start, preferredTimescale: 600),
        end:   CMTime(seconds: end,   preferredTimescale: 600)
    )

    await exportSession.export()

    guard exportSession.status == .completed else {
        throw exportSession.error ?? NSError(domain: "MeeshyAudioEditor", code: 2)
    }

    return outURL
}
```

**Step 5: Utiliser la fonction exportée dans startTranscription()**

Remplacer le corps de la transcription :

Avant :
```swift
private func startTranscription() {
    // ...
    let request = SFSpeechURLRecognitionRequest(url: url)  // <- transcrit tout le fichier
    // ...
}
```

Après :
```swift
private func startTranscription() {
    txState = .loading
    recognitionTask?.cancel()

    Task {
        do {
            let trimmedURL = try await exportTrimmedSegment(
                from: url,
                start: trimStart,
                end: trimEnd
            )

            guard let recognizer = SFSpeechRecognizer(locale: selectedLocale),
                  recognizer.isAvailable else {
                await MainActor.run { txState = .failed }
                return
            }

            let request = SFSpeechURLRecognitionRequest(url: trimmedURL)
            request.shouldReportPartialResults = false
            request.taskHint = .dictation

            recognitionTask = recognizer.recognitionTask(with: request) { result, error in
                if let error {
                    Task { @MainActor in txState = .failed }
                    return
                }
                guard let result, result.isFinal else { return }

                let segs = result.bestTranscription.segments.map { seg in
                    TimedSegment(
                        id: seg.substringRange.location,
                        word: seg.substring,
                        start: seg.timestamp,
                        end: seg.timestamp + seg.duration
                    )
                }
                let text = result.bestTranscription.formattedString

                Task { @MainActor in
                    segments = segs
                    fullText = text
                    txState = .done
                }
            }
        } catch {
            await MainActor.run { txState = .failed }
        }
    }
}
```

### Fix Trim Handles — 44pt touch targets

**Step 6: Agrandir la zone tactile des handles sans changer le visuel**

Dans `trimSection`, les handles actuels (13pt Circle) violent la HIG. Envelopper dans un frame 44×44 avec `.contentShape` :

Avant :
```swift
// Left handle
ZStack {
    Rectangle().fill(Color(hex: "FF2E63")).frame(width: 3, height: 22)
    Circle().fill(Color(hex: "FF2E63")).frame(width: 13, height: 13).offset(y: 12)
}
.position(x: sx, y: 9)
```

Après :
```swift
// Left handle — 44pt touch target (HIG)
ZStack {
    Color.clear.frame(width: 44, height: 44)  // zone tactile invisible
    Rectangle().fill(Color(hex: "FF2E63")).frame(width: 3, height: 22)
    Circle().fill(Color(hex: "FF2E63")).frame(width: 13, height: 13).offset(y: 12)
}
.contentShape(Rectangle())
.position(x: sx, y: 9)
```

Répéter pour le Right handle avec `Color(hex: "08D9D6")`.

**Step 7: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 8: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/MeeshyAudioEditorView.swift
git commit -m "fix(ui): MeeshyAudioEditorView — transcription respecte trim, setup async, handles 44pt"
```

---

## Task 10 — Fix P3+P4: StoryVoiceRecorder — 1 timer + waveform stable

**Problème :**
- **P3** : `durationTimer` (100ms) + `waveTimer` (50ms) = 2 timers en parallèle. Un seul suffit.
- **P4** : `CGFloat.random(in: 0...8)` dans le body cause une instabilité visuelle à chaque render.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVoiceRecorder.swift`

**Step 1: Supprimer waveTimer et ses @State**

Supprimer :
```swift
@State private var waveTimer: Timer?
```

Dans `beginRecording()`, supprimer le bloc waveTimer :
```swift
// SUPPRIMER:
waveTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [self] _ in
    Task { @MainActor in wavePhase += 0.15 }
}
```

Dans `stopRecording()`, supprimer :
```swift
// SUPPRIMER:
waveTimer?.invalidate()
waveTimer = nil
```

**Step 2: Fusionner dans le durationTimer (passer à 50ms)**

Modifier `durationTimer` pour inclure la mise à jour de la phase :

```swift
durationTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [self] _ in
    Task { @MainActor in
        recordingDuration += 0.05
        wavePhase += 0.15
        if recordingDuration >= maxDuration { stopRecording() }
    }
}
```

**Step 3: Remplacer CGFloat.random dans le body par un tableau @State**

Ajouter un `@State` initialisé une seule fois :

```swift
@State private var waveRandomOffsets: [CGFloat] = (0..<30).map { _ in CGFloat.random(in: 0...8) }
```

Dans `waveformView`, remplacer :
```swift
let height = isRecording
    ? max(4, (sin(phase) * 0.5 + 0.5) * 36 + CGFloat.random(in: 0...8))
    : 4
```

Par :
```swift
let height = isRecording
    ? max(4, (sin(phase) * 0.5 + 0.5) * 36 + waveRandomOffsets[i])
    : 4
```

Note : Les offsets aléatoires sont générés une seule fois à l'init de la vue et réutilisés à chaque tick.

**Step 4: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVoiceRecorder.swift
git commit -m "fix(perf): StoryVoiceRecorder — 1 timer au lieu de 2, random hors body"
```

---

## Vérification finale

Après les 10 tâches, lancer le simulateur et tester les 3 flux principaux :

```bash
./apps/ios/meeshy.sh run
```

**Checklist de validation manuelle :**

- [ ] Story Composer → Audio depuis bibliothèque → Éditeur audio s'ouvre (sans écran blanc) → C3 ✓
- [ ] Story Composer → Player audio sur canvas → Bouton Play → l'audio joue réellement → C1 ✓
- [ ] UnifiedPostComposer → Tab "Post" → Bouton Photo → PhotosPicker s'ouvre → C2 ✓
- [ ] Éditeur audio → Trim → Transcription → Le texte correspond au segment sélectionné → F1 ✓
- [ ] Story canvas → Filtre image → Pas de lag visible → F2 ✓
- [ ] Story canvas → Sticker → Drag + pinch + rotation simultanés → tous fonctionnent → F3 ✓
- [ ] Voice recorder → Enregistrement 5s → pas de jank visuel sur la waveform → P3/P4 ✓
- [ ] Player audio story → Pas en lecture → CPU usage stable (pas d'animation permanente) → P1 ✓

---

## Bilan des fichiers modifiés / créés

| Action | Fichier |
|--------|---------|
| Créé | `packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift` |
| Modifié | `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` |
| Modifié | `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPlayerView.swift` |
| Modifié | `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVoiceRecorder.swift` |
| Modifié | `packages/MeeshySDK/Sources/MeeshyUI/Story/MeeshyAudioEditorView.swift` |
| Modifié | `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift` |
| Modifié | `packages/MeeshySDK/Sources/MeeshyUI/Story/DraggableMediaView.swift` |
| Modifié | `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift` |
