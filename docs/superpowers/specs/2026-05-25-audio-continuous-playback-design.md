# iOS — Audio Continuous Playback & Auto-Play Queue

**Date** : 2026-05-25 (révisé après code review)
**Statut** : Design v2 validé, prêt pour writing-plans
**Branche cible** : `feat/ios-audio-playback-persistence`
**Auteur** : Claude (Opus 4.7) en pair avec @smpceo

---

## 1. Contexte et problème

Aujourd'hui, lorsqu'un utilisateur écoute un message audio dans une conversation :

- **Scroll** : si la bulle audio sort du viewport, la cellule SwiftUI est recyclée par `LazyVStack`, le `@StateObject` `AudioPlaybackManager` est détruit, et l'audio s'arrête.
- **Sortie de conversation** : la `NavigationStack` démonte la vue, idem, audio coupé.
- **App en background** : `UIBackgroundModes` contient déjà `audio` et `voip`, donc l'OS autoriserait la lecture en background, mais `BackgroundTransitionCoordinator.enterBackground()` invoque `MediaLifecycleBridge.prepareForBackground()` qui appelle `PlaybackCoordinator.shared.stopAll()` + `MediaSessionCoordinator.shared.deactivateForBackground()` sans aucun guard → l'audio est systématiquement coupé.
- **Aucun auto-play** : un mécanisme `autoplayRegistry` static existe dans `AudioPlaybackManager` (SDK) mais il est registré/déregistré dans `AudioPlayerView.onAppear/onDisappear`, donc limité aux cellules visibles. Si on scroll, la queue se vide.

**Demande utilisateur (verbatim)** :

> Lorsque je scroll et qu'un audio était entrain de jouer, l'audio s'arrête, il faut que l'audio continue de jouer même si je quitte la conversation et poursuive jusqu'à la fin et si un audio non lu se trouve à la suite, passer au suivant ! Même si je quitte l'application l'audio doit continuer à jouer en arrière plan.

---

## 2. Décisions UX validées avec l'utilisateur

| Question | Réponse retenue |
|---|---|
| Périmètre auto-play | **Conv courante uniquement** (chronologique, top-down) |
| UI hors conv | **Mini-player flottant + `MPNowPlayingInfoCenter`** (lock-screen, control center, AirPods) |
| Définition « non lu » | **Pas encore écouté à 100 %** (cohérent avec `reportListenProgress(complete: true)` actuel) |
| Tap audio d'une autre conv pendant lecture | **Interrompre, jouer le nouveau** (la queue se reset sur la nouvelle conv) |
| Nouveau message audio realtime pendant lecture | **Append à la queue si même conv que celle en cours de lecture** |
| Fermeture mini-player | **Pause + bouton X explicite** ; auto-fade quand queue vide en fin de dernier audio |
| Coexistence Spotify / autre app musique | **`.duckOthers`** (comportement actuel préservé) |

---

## 3. Architecture

### 3.1 Vue d'ensemble — révision v2 post-review

La v1 du spec proposait d'exposer une instance singleton `sharedConversation` côté SDK et de placer la queue dans `ConversationViewModel`. Une review indépendante a identifié 3 défauts bloquants :

1. **Le ViewModel meurt avec la NavigationStack** → la closure `onPlaybackFinished` capturée `[weak self]` devient nil → pas d'auto-play hors-conv (la promesse principale).
2. **Le nommage des champs SDK** (`activeConversationId`, `activeSenderName`…) encode la sémantique Meeshy → viole SDK Purity (précédent `83e55297c`).
3. **Un second chemin** (`MediaLifecycleBridge.prepareForBackground`) coupe l'audio en background sans aucun guard.

**Nouvelle architecture** :

- **Zéro modification SDK.** L'orchestration (singleton, queue, contexte, NowPlaying, mini-player, hook auth, guard CallManager) vit 100% côté app.
- **Nouveau pivot** : `ConversationAudioCoordinator.shared` (app, `@MainActor`, `ObservableObject`). Il possède :
  - Une instance interne `AudioPlaybackManager()` (le moteur SDK reste un atome opaque, instancié comme propriété privée)
  - La queue (`audioQueue: [QueuedAudio]`)
  - Un `@Published var activeContext: ActiveAudioContext?` (struct Meeshy-product Equatable)
  - La closure `onPlaybackFinished` câblée à `self.advanceQueue()` → survit au démontage des vues
  - Un hook `AuthManager` qui appelle `stopAndClear` sur logout
  - Un guard explicite `CallManager.shared.callState.isActive` avant d'activer la session
- **Réutilisation maximale** : `AudioPlaybackManager` (SDK), `PlaybackCoordinator.shared` (SDK), `MediaSessionCoordinator.shared` (SDK), `CacheCoordinator.shared.audio` (SDK), pattern visuel `ConnectionBanner`/`OfflineBanner` (app).
- **Anti-pollution tests** : protocol `AudioPlaybackEngineDriving` injectable dans le coordinator, avec une implémentation par défaut wrappant `AudioPlaybackManager`. Permet `MockAudioPlaybackEngine` dans les tests.
- **Anti-rerender** : wrapper `ActiveAudioBubble` vs `InactiveAudioBubble`. Seule la bulle dont `attachmentId == coordinator.activeContext?.attachmentId` observe le coordinator ; les autres lisent un `let` figé. Préserve « Zero Unnecessary Re-render ».

### 3.2 Composants existants réutilisés (sans modification)

| Composant | Path | Rôle |
|---|---|---|
| `AudioPlaybackManager` | `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` | Moteur AVAudioPlayer (cache, play/pause/seek/speed, delegate, progress, `reportListenProgress`) — instancié comme propriété privée du coordinator |
| `PlaybackCoordinator.shared` | `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift` | Stop concurrent entre players (vérifié L47-56 : safe quand caller IS le shared) |
| `MediaSessionCoordinator.shared` | `packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift` | AVAudioSession + interruptions système |
| `CacheCoordinator.shared.audio` | `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` | Cache disque audio |
| `PlaybackSpeed` | `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTypes.swift` | Enum vitesses |
| `AttachmentStatusBody` + `reportListenProgress` | `AudioPlayerView.swift` (SDK MeeshyUI) | POST `/attachments/:id/status` action=`listened` |
| `CallManager.shared` | `apps/ios/Meeshy/Features/Main/Services/CallManager.swift` | Guard pour ne pas casser l'audio CallKit |
| `AuthManager` (publisher logout) | `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift` | Hook reset coordinator |
| Pattern `ConnectionBanner` / `OfflineBanner` | `apps/ios/Meeshy/Features/Main/Components/` | Inspiration visuelle mini-player |
| `Router.shared` | `apps/ios/Meeshy/Features/Main/Navigation/Router.swift` | Navigation depuis le tap mini-player |
| `BackgroundTransitionCoordinator` + `MediaLifecycleBridge` | `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift` | À modifier pour guarder le bridge background |

### 3.3 Aucune modification SDK

La v1 proposait d'ajouter `static let sharedConversation` + 5 champs de contexte au SDK. **Retiré**. Le SDK reste 100% intact :

- Pas de risque sur le test bundle SDK cassé (cf. `project_sdk_test_bundle_preexisting_breakage`)
- SDK Purity respectée à 100%
- Pas de coupling sémantique conv/sender côté SDK

### 3.4 Modifications app

#### 3.4.1 Nouveau — `ConversationAudioCoordinator.swift`

Fichier : `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift`

```swift
import Foundation
import Combine
import MeeshyUI
import MeeshySDK

@MainActor
public protocol AudioPlaybackEngineDriving: AnyObject {
    var isPlayingPublisher: Published<Bool>.Publisher { get }
    var currentTimePublisher: Published<TimeInterval>.Publisher { get }
    var durationPublisher: Published<TimeInterval>.Publisher { get }
    var progressPublisher: Published<Double>.Publisher { get }

    var isPlaying: Bool { get }
    var currentTime: TimeInterval { get }
    var duration: TimeInterval { get }
    var progress: Double { get }
    var currentUrl: String? { get }

    var attachmentId: String? { get set }
    var onPlaybackFinished: (() -> Void)? { get set }

    func play(urlString: String)
    func playLocal(url: URL)
    func togglePlayPause()
    func stop()
    func seek(to fraction: Double)
    func skip(seconds: Double)
    func setSpeed(_ speed: PlaybackSpeed)
}

// L'implémentation par défaut wrappe AudioPlaybackManager (SDK).
extension AudioPlaybackManager: AudioPlaybackEngineDriving {
    public var isPlayingPublisher: Published<Bool>.Publisher { $isPlaying }
    public var currentTimePublisher: Published<TimeInterval>.Publisher { $currentTime }
    public var durationPublisher: Published<TimeInterval>.Publisher { $duration }
    public var progressPublisher: Published<Double>.Publisher { $progress }
}

public struct ActiveAudioContext: Equatable, Sendable {
    public let attachmentId: String
    public let messageId: String
    public let conversationId: String
    public let conversationName: String
    public let conversationArtworkURL: String?
    public let senderName: String
    public let senderAvatarURL: String?
    public let durationMs: Int
}

public struct QueuedAudio: Equatable, Identifiable, Sendable {
    public let attachmentId: String
    public let messageId: String
    public let conversationId: String
    public let fileUrl: String
    public let durationMs: Int
    public let senderName: String
    public let senderAvatarURL: String?
    public let receivedAt: Date
    public var id: String { attachmentId }
}

@MainActor
public final class ConversationAudioCoordinator: ObservableObject {
    public static let shared = ConversationAudioCoordinator()

    @Published public private(set) var activeContext: ActiveAudioContext?
    @Published public private(set) var queueCount: Int = 0
    @Published public private(set) var isPlaying: Bool = false
    @Published public private(set) var progress: Double = 0
    @Published public private(set) var currentTime: TimeInterval = 0
    @Published public private(set) var duration: TimeInterval = 0

    private let engine: AudioPlaybackEngineDriving
    private var queue: [QueuedAudio] = []
    private var conversationName: String = ""
    private var conversationArtworkURL: String?
    private var cancellables = Set<AnyCancellable>()

    public init(engine: AudioPlaybackEngineDriving = AudioPlaybackManager()) {
        self.engine = engine
        wireEngineForwarding()
        wireAuthLogoutHook()
    }

    // MARK: - Public API

    public func play(
        current: QueuedAudio,
        tail: [QueuedAudio],
        conversationName: String,
        conversationArtworkURL: String?
    )

    public func togglePlayPause()
    public func playNext()                  // skip courant → advance
    public func close()                     // X mini-player → stop + clear
    public func seek(toFraction: Double)
    public func setSpeed(_ s: PlaybackSpeed)
    public func appendUpcoming(_ audio: QueuedAudio)   // realtime hook

    public func isActive(attachmentId: String) -> Bool {
        activeContext?.attachmentId == attachmentId
    }

    // MARK: - Internals

    private func wireEngineForwarding() {
        engine.isPlayingPublisher.assign(to: &$isPlaying)
        engine.currentTimePublisher.assign(to: &$currentTime)
        engine.durationPublisher.assign(to: &$duration)
        engine.progressPublisher.assign(to: &$progress)
        engine.onPlaybackFinished = { [weak self] in self?.advanceQueue() }
    }

    private func wireAuthLogoutHook() {
        // AuthManager n'expose pas de publisher logout dédié. Solution :
        // observer la propriété @Published `$isAuthenticated` existante.
        // Quand elle passe à false → close() + clear NowPlaying.
        // Évite d'ajouter un PassthroughSubject côté SDK (préserve la règle
        // « zéro modif SDK » §3.3).
        AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .dropFirst()                      // ignore l'état initial
            .filter { !$0 }                    // déclenche uniquement sur logout
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.close() }
            .store(in: &cancellables)
    }

    private func advanceQueue() {
        // Pop next, set activeContext, engine.play(...)
        // Si queue vide → activeContext = nil + NowPlaying clear (le
        // mini-player observera et déclenchera son auto-fade 5s)
    }
}
```

**Guard CallManager** dans `play(...)` :

```swift
public func play(current: QueuedAudio, tail: [QueuedAudio], ...) {
    guard !CallManager.shared.callState.isActive else {
        Logger.audioPlayback.info("Audio Meeshy ignoré pendant appel CallKit actif")
        return
    }
    // … reste de la logique
}
```

**Throttling NowPlaying** : `MPNowPlayingInfoCenter` est throttlé à 1Hz côté système. Inutile de push à chaque tick 50ms. Le coordinator garde un sample interne `lastNowPlayingPush: Date?` et ne pousse que si `Date().timeIntervalSince(last) >= 0.25s` (limite à 4Hz, marge confortable sous le throttle système).

**Initialisation au démarrage** : `MeeshyApp.init()` est synchrone et non-`@MainActor`, donc accéder à `ConversationAudioCoordinator.shared` (`@MainActor`) y poserait un warning Swift 6. Solution : forcer l'init paresseuse dans le `.task` de `AdaptiveRootView` (ou équivalent root view qui exécute déjà en `@MainActor`) :

```swift
.task {
    _ = ConversationAudioCoordinator.shared  // déclenche register PlaybackCoordinator
}
```

Évite le coût `PlaybackCoordinator.shared.register(self)` au premier tap utilisateur, et reste compatible Swift 6.

#### 3.4.2 Nouveau — `AudioQueueBuilder.swift`

Fichier : `apps/ios/Meeshy/Features/Main/Services/AudioQueueBuilder.swift`

```swift
import Foundation
import MeeshySDK

public enum AudioQueueBuilder {
    /// Construit la queue d'audios non écoutés à 100% pour une conv,
    /// chronologique top-down. Si `startingAfterAttachmentId` est fourni,
    /// la queue ne contient que les audios reçus strictement après cet
    /// attachment (tail). Fonction pure, testable sans @MainActor.
    public static func build(
        from messages: [MeeshyMessage],
        startingAfterAttachmentId: String?,
        currentUserId: String,
        listenedAttachmentIds: Set<String>
    ) -> [QueuedAudio]
}
```

Règles de filtrage :
1. Type d'attachment = `audio`
2. `senderId != currentUserId` (on ne s'auto-écoute pas en auto-play, mais le caller peut forcer en appelant `play` directement avec un current quelconque)
3. `attachmentId ∉ listenedAttachmentIds`
4. Tri primaire = `receivedAt` ascendant (chronologique)
5. Tri secondaire = `attachmentId` lexicographique (ordre stable si timestamps égaux)
6. Si `startingAfterAttachmentId` fourni, ne retient que les audios reçus strictement après l'attachment cible
7. Un message peut avoir plusieurs audios (attachments multiples) → chacun devient un `QueuedAudio` distinct, ordonnés par index dans le message

#### 3.4.3 Modif — `ConversationViewModel`

Ajouts limités au strict nécessaire :

- `private var listenedAttachmentIds: Set<String>` — hydraté depuis le serveur (status `listened` complete=true) et mis à jour à chaque `reportListenProgress`
- `var currentConversationName: String` — computed qui lit `CacheCoordinator.shared.conversations` via le `conversationId` que le VM détient déjà ; fallback `""` si cache vide (race à l'ouverture cold start)
- `var currentConversationArtworkURL: String?` — idem, lit `conversation.avatarUrl` depuis le cache
- `var currentAccentColorHex: String` — déjà calculable via `conversation.accentColor` (cf. `MeeshyConversation` SDK), forwarded ici pour les sous-vues bulle
- `func playAudio(attachmentId: String)` — single entry point appelé par `InactiveAudioBubble.onPlayTap`. Construit `QueuedAudio` pour current + tail via `AudioQueueBuilder.build`, puis `ConversationAudioCoordinator.shared.play(current:tail:conversationName:conversationArtworkURL:)`. Le coordinator gère le reste.
- Hook realtime dans le handler `message:new` existant → si l'audio reçu appartient à la conv et que le coordinator joue cette conv, `coordinator.appendUpcoming(QueuedAudio.from(message))`

**Source de données conversation metadata** : le `ConversationViewModel` actuel détient `conversationId: String` mais pas un objet `MeeshyConversation` complet. Les sources canoniques sont :
- `CacheCoordinator.shared.conversations.get(id: conversationId)` (cache GRDB, hydraté au démarrage de la conv)
- En fallback : `ConversationListViewModel.conversations.first(where: { $0.id == conversationId })` si la liste est en mémoire

Le VM expose les computed via cette résolution. Si cold start avec cache vide, le mini-player affichera initialement un nom/artwork vide puis se mettra à jour quand le cache se peuple (1 re-render via `@Published activeContext` quand le coordinator est appelé avec les valeurs résolues).

Le VM ne détient PLUS la queue. Il ne détient PLUS de closure `onPlaybackFinished`. Il ne survit pas hors-conv et c'est OK : tout est dans le coordinator.

#### 3.4.4 Nouveau — `AudioBubbleRouter` + `ActiveAudioBubble` + `InactiveAudioBubble`

Fichiers : `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift`, `ActiveAudioBubble.swift`, `InactiveAudioBubble.swift`

Le `AudioMediaView` (wrapper conv qui rend une bulle audio) délègue à `AudioBubbleRouter`. **Contrat Bubble du `apps/ios/CLAUDE.md` respecté** : les sous-vues `Active`/`InactiveAudioBubble` n'ont AUCUN `@ObservedObject` sur un singleton global. Seul le `AudioBubbleRouter` parent observe le coordinator, lit les `@Published`, et passe des `let` primitifs Equatable aux sous-vues.

```swift
struct AudioMediaView: View {
    let attachment: MeeshyMessageAttachment
    let viewModel: ConversationViewModel

    var body: some View {
        AudioBubbleRouter(
            attachmentId: attachment.id,
            attachment: attachment,
            viewModel: viewModel
        )
    }
}

// AudioBubbleRouter : seul point d'observation du coordinator pour les
// bulles audio. Lit les @Published, les transforme en let primitifs, et
// dispatche vers Active ou Inactive sub-view. C'est le PARENT du contrat
// Bubble, pas une Bubble sub-view elle-même — l'observation y est légitime.
struct AudioBubbleRouter: View {
    let attachmentId: String
    let attachment: MeeshyMessageAttachment
    let viewModel: ConversationViewModel
    @ObservedObject private var coordinator = ConversationAudioCoordinator.shared

    var body: some View {
        let isActive = coordinator.activeContext?.attachmentId == attachmentId
        if isActive {
            ActiveAudioBubble(
                attachment: attachment,
                isPlaying: coordinator.isPlaying,
                progress: coordinator.progress,
                currentTime: coordinator.currentTime,
                duration: coordinator.duration,
                speed: coordinator.speed,
                accentColorHex: viewModel.currentAccentColorHex,
                onTogglePlayPause: { coordinator.togglePlayPause() },
                onSeek: { coordinator.seek(toFraction: $0) },
                onSpeedCycle: { coordinator.cycleSpeed() }
            )
        } else {
            InactiveAudioBubble(
                attachment: attachment,
                accentColorHex: viewModel.currentAccentColorHex,
                onPlayTap: { viewModel.playAudio(attachmentId: attachmentId) }
            )
        }
    }
}

// InactiveAudioBubble : Equatable sub-view. Inputs primitifs (String hex,
// closure). Aucun ObservedObject. Affiche état neutre (ready).
struct InactiveAudioBubble: View, Equatable {
    let attachment: MeeshyMessageAttachment
    let accentColorHex: String
    let onPlayTap: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        // Closures non-Equatable : on diff sur les inputs data uniquement.
        lhs.attachment.id == rhs.attachment.id
            && lhs.accentColorHex == rhs.accentColorHex
    }

    var body: some View { /* waveform statique + play button + durée meta */ }
}

// ActiveAudioBubble : Equatable sub-view aussi (sur les inputs primitifs).
// Re-rendue UNIQUEMENT quand un de ses let bouge (1 bulle/conv à la fois).
struct ActiveAudioBubble: View, Equatable {
    let attachment: MeeshyMessageAttachment
    let isPlaying: Bool
    let progress: Double
    let currentTime: TimeInterval
    let duration: TimeInterval
    let speed: PlaybackSpeed
    let accentColorHex: String
    let onTogglePlayPause: () -> Void
    let onSeek: (Double) -> Void
    let onSpeedCycle: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.isPlaying == rhs.isPlaying
            && lhs.progress == rhs.progress
            && lhs.currentTime == rhs.currentTime
            && lhs.duration == rhs.duration
            && lhs.speed == rhs.speed
            && lhs.accentColorHex == rhs.accentColorHex
    }

    var body: some View { /* waveform live + play/pause + seek + speed chip */ }
}
```

**Anti-duplication visuelle** : `Active` et `Inactive` partagent l'apparence visuelle d'`AudioPlayerView` SDK. Pour éviter la divergence silencieuse lors de futures évolutions du SDK, la Phase 1.5 du plan d'implémentation extrait 4 helpers app-side partagés (`AudioWaveformBars`, `AudioPlayButton`, `AudioTimeRow`, `AudioSpeedChip`) que les deux bulles consomment. Ces helpers reproduisent fidèlement le look de `AudioPlayerView` ; si le SDK l'évolue, on adapte les helpers en un point unique.

**Décision documentée dans `apps/ios/decisions.md`** : conformément à la règle Bubble (CLAUDE.md), les sous-vues `Active`/`InactiveAudioBubble` n'observent jamais le coordinator. L'exception au pattern « Bubble sub-views Equatable » n'est PAS introduite — le `AudioBubbleRouter` n'est PAS une Bubble sub-view, c'est le wrapper parent dans la chaîne `BubbleStandardLayout → BubbleAttachmentView → AudioMediaView → AudioBubbleRouter → ActiveAudioBubble | InactiveAudioBubble`.

#### 3.4.5 Modif — `MeeshyApp.swift` + `BackgroundTransitionCoordinator.swift`

**`MeeshyApp.adaptiveOnChange(of: scenePhase)`** : guard simple

```swift
case .background:
    if !ConversationAudioCoordinator.shared.isPlaying {
        await MediaSessionCoordinator.shared.deactivateForBackground()
    }
```

**Crucial** : `BackgroundTransitionCoordinator.enterBackground()` ligne 51-53 actuellement :

```swift
await withBudget("audio.prepareForBackground") {
    await MediaLifecycleBridge.shared.prepareForBackground()
}
```

Et `MediaLifecycleBridge.prepareForBackground()` ligne 171-173 :

```swift
func prepareForBackground() async {
    PlaybackCoordinator.shared.stopAll()       // ← coupe le shared audio
    await MediaSessionCoordinator.shared.deactivateForBackground()
}
```

Modification :

```swift
func prepareForBackground() async {
    if ConversationAudioCoordinator.shared.isPlaying {
        // Audio Meeshy en cours → on ne coupe rien. UIBackgroundModes "audio"
        // permet à l'OS de continuer la lecture. Le coordinator garde
        // l'engine et la session active. Les autres players (story preview,
        // composer preview) sont déjà inactifs quand on entre en background
        // car leurs vues sont démontées.
        return
    }
    PlaybackCoordinator.shared.stopAll()
    await MediaSessionCoordinator.shared.deactivateForBackground()
}
```

Le symétrique côté foreground est `MediaLifecycleBridge.resumeFromBackground()` (vérifié L176). Modification analogue : si le coordinator était actif pendant le background, ne pas re-activer la session puisqu'elle l'est déjà ; sinon comportement actuel préservé.

#### 3.4.6 Nouveau — `ConversationAudioCoordinator+NowPlaying.swift`

Fichier : `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator+NowPlaying.swift`

Extension qui branche `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter` :

- Subscribe Combine à `$activeContext`, `$isPlaying`, `$currentTime` du coordinator
- Throttle à 0.25s sur les ticks `$currentTime` (sample window pour éviter de spammer MPNowPlayingInfoCenter)
- Push vers `MPNowPlayingInfoCenter.default().nowPlayingInfo` : `title = senderName`, `albumTitle = conversationName`, `artwork` chargée async via `CacheCoordinator.shared.images` à partir de `conversationArtworkURL`, `playbackDuration`, `elapsedPlaybackTime`, `playbackRate`
- Install commandes : `playCommand → togglePlayPause`, `pauseCommand → togglePlayPause`, `nextTrackCommand → playNext`, `changePlaybackPositionCommand → seek(toFraction:)`
- Reset clean sur `activeContext == nil`

Init : appelé une fois depuis le constructeur du coordinator (`init()` privé) ou explicitement depuis `MeeshyApp.init()`.

#### 3.4.7 Nouveau — `MiniAudioPlayerBar.swift`

Fichier : `apps/ios/Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift`

```swift
struct MiniAudioPlayerBar: View {
    @ObservedObject private var coordinator = ConversationAudioCoordinator.shared
    @State private var autoFadeTask: Task<Void, Never>?

    var body: some View {
        Group {
            if let context = coordinator.activeContext {
                content(for: context)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8),
                   value: coordinator.activeContext)
        .onChange(of: coordinator.activeContext) { newContext in
            // Auto-fade : si activeContext passe à nil (queue vide), attendre
            // 5s avant de cacher (mais SwiftUI cache déjà tout de suite via
            // le if). Au lieu de ça : si isPlaying passe à false ET queueCount=0,
            // garder une grace period de 5s avant de signaler "fini".
            // Implémentation pragmatique : tracker `lastActiveContext` en @State
            // et retarder le set à nil.
        }
    }

    @ViewBuilder
    private func content(for context: ActiveAudioContext) -> some View {
        // Layout horizontal :
        //  avatar conv (32pt) | sender + conv name (2 lignes) | progress fine bar
        //  | play/pause | next | X
        // Background .ultraThinMaterial + tint indigo subtle
        // Hauteur 56pt + safe area bottom + 8pt padding au-dessus du tab bar
    }
}
```

Intégration dans `AdaptiveRootView.swift` : overlay `ZStack` bottom-aligned, juste au-dessus du tab bar. Coexistence avec `ConnectionBanner` : si les deux sont actifs, le mini-player en bas, le banner au-dessus.

Le tap-to-route route via `Router.shared.push(.conversation(id: context.conversationId))` (à confirmer la route enum exacte).

---

## 4. Flots de données

### 4.1 Tap play sur une bulle audio

```
ActiveAudioBubble (ou InactiveAudioBubble si pas la cellule active)
    └─ onPlayTap()
       └─ viewModel.playAudio(attachmentId:)
          ├─ current = QueuedAudio.from(messages[i].attachments[j])
          ├─ tail = AudioQueueBuilder.build(
          │       from: viewModel.messages,
          │       startingAfterAttachmentId: current.attachmentId,
          │       currentUserId: AuthManager.shared.currentUser.id,
          │       listenedAttachmentIds: viewModel.listenedAttachmentIds)
          └─ ConversationAudioCoordinator.shared.play(
                current: current,
                tail: tail,
                conversationName: viewModel.currentConversationName,
                conversationArtworkURL: viewModel.currentConversationArtworkURL)
             ├─ guard !CallManager.shared.callState.isActive
             ├─ queue = [current] + tail; queueCount publish
             ├─ activeContext = ActiveAudioContext(... current ...)  // @Published
             ├─ engine.attachmentId = current.attachmentId
             ├─ engine.play(urlString: current.fileUrl)
             │  ├─ PlaybackCoordinator.shared.willStartPlaying(audio: engine)
             │  │  └─ caller excluded via ObjectIdentifier comparison (L50)
             │  ├─ AVAudioSession.setCategory(.playback, options: [.duckOthers])
             │  ├─ CacheCoordinator.shared.audio.data(for:) → AVAudioPlayer
             │  └─ player.play() + startProgressTimer
             └─ NowPlaying extension push metadata (sender, conv, durée, artwork)
```

### 4.2 Fin de lecture → next

```
AVAudioPlayer.audioPlayerDidFinishPlaying
    └─ AudioPlaybackManager (engine).handlePlaybackFinished
       ├─ reportListenProgress(complete: true) → POST /attachments/:id/status
       └─ onPlaybackFinished?() → ConversationAudioCoordinator.advanceQueue()
          ├─ pop currentHead from queue ; queueCount publish
          ├─ if let next = queue.first:
          │     activeContext = ActiveAudioContext(... next ...)
          │     engine.attachmentId = next.attachmentId
          │     engine.play(urlString: next.fileUrl)
          │  else:
          │     activeContext = nil    // mini-player observe, auto-fade 5s
          │     NowPlaying cleared
```

### 4.3 Nouveau audio realtime arrive pendant lecture

```
MessageSocketManager → ConversationViewModel.handleSocketMessageNew(msg)
    ├─ existing : insert msg dans messages[]
    └─ NEW : if msg has audio attachment(s)
              && msg.conversationId == ConversationAudioCoordinator.shared.activeContext?.conversationId
              && msg.senderId != currentUser.id
              && !viewModel.listenedAttachmentIds.contains(att.id)
              → for each audio attachment in msg.attachments:
                  ConversationAudioCoordinator.shared.appendUpcoming(QueuedAudio.from(att, msg))
                  └─ if !queue.contains(where: { $0.attachmentId == att.id })
                       queue.append(audio); queueCount publish
```

### 4.4 Tap mini-player → retour à la conv

```
MiniAudioPlayerBar.onTapBody()
    └─ Router.shared.push(.conversation(id: coordinator.activeContext!.conversationId))
       └─ ConversationView se monte (nouveau VM)
          └─ Bulles audio rendues via AudioMediaView → AudioBubbleRouter
             └─ Active si attachmentId == coordinator.activeContext.attachmentId
                else Inactive
          └─ ScrollViewReader.scrollTo(coordinator.activeContext.messageId, anchor: .center)
             (à câbler dans onAppear via task)
```

### 4.5 Background → l'app reste muette pendant la lecture

```
scenePhase → .background
    │
    ├─ MeeshyApp.adaptiveOnChange:
    │   if !ConversationAudioCoordinator.shared.isPlaying:
    │       await MediaSessionCoordinator.deactivateForBackground()
    │   else: ne rien faire
    │
    └─ BackgroundTransitionCoordinator.enterBackground →
       MediaLifecycleBridge.prepareForBackground (MODIFIÉ):
       if ConversationAudioCoordinator.shared.isPlaying:
           return       // skip stopAll + deactivate
       else:
           PlaybackCoordinator.shared.stopAll()
           await MediaSessionCoordinator.deactivateForBackground()
```

Pendant la lecture en background :
- `AudioPlaybackManager` engine continue à driver l'AVAudioPlayer
- `audioPlayerDidFinishPlaying` est appelé normalement (l'OS laisse tourner les delegates AV en background pour les apps avec `UIBackgroundModes: audio`)
- `coordinator.advanceQueue()` s'exécute, next audio démarre
- `MPNowPlayingInfoCenter` reste à jour via les Combine sinks du coordinator → le lock-screen affiche le bon titre / progression
- Les commandes Remote (play, pause, next, seek) sont traitées par les handlers MPRemoteCommandCenter installés dans la NowPlaying extension

### 4.6 Logout pendant lecture

```
AuthManager.logout()
    └─ AuthManager.didLogoutPublisher.send()
       └─ ConversationAudioCoordinator subscribe (wireAuthLogoutHook)
          └─ close()
             ├─ engine.stop()
             ├─ queue = []; queueCount = 0
             ├─ activeContext = nil
             └─ NowPlaying cleared
```

### 4.7 Conversation supprimée pendant lecture

**Localisation du hook** : aucun handler centralisé `conversation:deleted` iOS n'existe à ce jour. Vérifié par grep. Trois options :

1. **Recommandée** : le coordinator se branche directement sur `SocialSocketManager.shared` (publisher dédié à créer si pas déjà publié) et écoute `conversation:deleted`. Lifecycle = coordinator singleton, donc reçoit même si aucun `ConversationView` n'est monté.
2. Le coordinator écoute `ConversationListViewModel.shared.didDeleteConversationPublisher` (à créer côté liste).
3. Un nouveau singleton léger `ConversationLifecycleObserver.shared` centralise les events lifecycle (deleted, archived, blocked).

Le spec retient l'option 1 : ajouter un `conversationDeletedPublisher: AnyPublisher<String, Never>` à `SocialSocketManager` (publish déjà émis pour d'autres consumers), le coordinator s'y abonne dans `wireSocketLifecycleHooks()`.

```
SocialSocketManager → conversationDeletedPublisher emits convId
    └─ ConversationAudioCoordinator (via sink dans cancellables):
       if activeContext?.conversationId == convId:
          self.close()
```

### 4.8 Message audio supprimé/édité pendant lecture

Même principe que 4.7 : le coordinator s'abonne à `MessageSocketManager.shared.messageDeletedPublisher` (déjà émis L1845 du fichier) et `messageUpdatedPublisher`.

```
MessageSocketManager → messageDeletedPublisher emits messageId
    └─ ConversationAudioCoordinator:
       if activeContext?.messageId == messageId:
          self.close()
       else if queue.contains(where: { $0.messageId == messageId }):
          queue.removeAll(where: { $0.messageId == messageId })
          queueCount publish
```

**Décision** : `close()` sur active match (comportement prévisible) ; **filtrage silencieux** de la queue sur upcoming match (l'utilisateur ne voit rien, juste un audio sauté).

---

## 5. Tests TDD

### 5.1 Tests purs

**`AudioQueueBuilderTests.swift`** (nouveau, `apps/ios/MeeshyTests/Unit/Services/`)

- `test_build_filtersAudioOnly_ignoresImageAndVideo`
- `test_build_excludesCurrentUserSelfAudios`
- `test_build_excludesListenedAttachments`
- `test_build_sortsChronologicallyAscending`
- `test_build_stableTieBreaker_byAttachmentId_whenReceivedAtEqual`
- `test_build_startingAfterAttachmentId_returnsOnlyAudiosReceivedAfterCursor`
- `test_build_messageWithMultipleAudios_eachBecomesQueuedAudio`
- `test_build_messageWithMultipleAudios_orderedByAttachmentIndex`
- `test_build_empty_returnsEmpty`
- `test_build_allListened_returnsEmpty`

### 5.2 Tests `ConversationAudioCoordinator`

**`ConversationAudioCoordinatorTests.swift`** (nouveau, `apps/ios/MeeshyTests/Unit/Services/`)

Uses **`MockAudioPlaybackEngine`** conformant à `AudioPlaybackEngineDriving` (zéro pollution singleton, zéro AVAudioPlayer réel) — pattern aligné avec « iOS TDD Requirements » du CLAUDE.md.

- `test_play_setsActiveContext_andCallsEngine`
- `test_play_buildsQueueWithTail_publishedQueueCount`
- `test_play_whileCallActive_isNoOp`
- `test_engineFinished_advancesQueue_playsNext`
- `test_engineFinished_emptyQueue_clearsActiveContext`
- `test_appendUpcoming_idempotent_byAttachmentId`
- `test_appendUpcoming_increasesQueueCount`
- `test_playNext_skipsToFollowingAudio`
- `test_close_stopsEngine_clearsQueueAndContext`
- `test_authLogout_triggersClose`
- `test_play_secondCall_resetsQueueToNewConv`
- `test_setSpeed_propagatesToEngine`

### 5.3 Tests UI

**`AudioBubbleRouterTests.swift`** (nouveau)

- `test_renderInactive_whenActiveAttachmentNil`
- `test_renderInactive_whenActiveAttachmentDifferent`
- `test_renderActive_whenActiveAttachmentMatches`
- `test_noBodyReinvocation_whenProgressChangesButActiveAttachmentSame` — utilise un counter de body invocations, vérifie que le router n'est pas re-évalué sur les ticks progress

**`MiniAudioPlayerBarTests.swift`** (nouveau)

- `test_visibility_hiddenWhenActiveContextNil`
- `test_visibility_visibleWhenContextSet`
- `test_tapPlayPause_invokesCoordinator`
- `test_tapNext_invokesCoordinator`
- `test_tapClose_invokesCoordinator`
- `test_tapBody_invokesRouterPush_withConversationId`
- `test_autoFade_afterQueueEmptyAndPause_5seconds`

### 5.4 Tests background

**`MediaLifecycleBridgeTests.swift`** (nouveau ou extension)

- `test_prepareForBackground_whileCoordinatorPlaying_doesNotCallStopAll`
- `test_prepareForBackground_whileCoordinatorPlaying_doesNotDeactivateSession`
- `test_prepareForBackground_whileIdle_callsStopAllAndDeactivate`

**`MeeshyAppScenePhaseTests.swift`** (extension existant)

- `test_background_whileCoordinatorPlaying_doesNotDeactivateSession`
- `test_background_whileIdle_deactivatesSession`

### 5.5 Pas de tests automatisés pour

- `ConversationAudioCoordinator+NowPlaying` (interaction avec `MPNowPlayingInfoCenter` singleton système → checklist QA manuelle)

---

## 6. Plan d'implémentation (phases TDD)

| Phase | Description | Tests | Commit prévu |
|---|---|---|---|
| 0 | Setup branche + baseline tests verts + **prototype `MockAudioPlaybackEngine` + `assign(to: &$isPlaying)`** dans un test isolé pour valider P-v2-4 du review | 1 test prototype | `chore(ios/audio): mock engine prototype` |
| 1 | `AudioQueueBuilder` + `QueuedAudio` + `ActiveAudioContext` (types purs) | 10 tests RED→GREEN | `feat(ios/audio): pure queue logic + types` |
| 1.5 | **Extraction 4 helpers app-side** (`AudioWaveformBars`, `AudioPlayButton`, `AudioTimeRow`, `AudioSpeedChip`) consommés par Active+Inactive bubbles, évite duplication visuelle vs `AudioPlayerView` SDK | snapshot smoke | `refactor(ios/audio): shared bubble render helpers` |
| 2 | `AudioPlaybackEngineDriving` protocol + retroactive conformance `AudioPlaybackManager` | build only | `feat(ios/audio): engine driving protocol` |
| 3 | `ConversationAudioCoordinator` (sans NowPlaying, sans mini-player) + hook `$isAuthenticated` + hooks sockets (`conversationDeletedPublisher`, `messageDeletedPublisher`) | 12 tests RED→GREEN | `feat(ios/audio): shared coordinator with queue` |
| 4 | `ConversationViewModel.playAudio` + `listenedAttachmentIds` + computed `currentConversation*` lus depuis `CacheCoordinator.shared.conversations` + hook realtime `message:new` | tests VM ajoutés | `feat(ios/audio): VM drives coordinator` |
| 5 | `AudioBubbleRouter` + `ActiveAudioBubble` + `InactiveAudioBubble` (sub-views Equatable, ZERO ObservedObject, contrat Bubble respecté) | 4 router tests + smoke manuel scroll | `feat(ios/audio): bubble router split for zero re-render` |
| 6 | Modif `MediaLifecycleBridge.prepareForBackground` + `resumeFromBackground` + `MeeshyApp.scenePhase` guard + init coordinator dans `.task` root view | 5 tests RED→GREEN | `feat(ios/audio): keep playback on scene background` |
| 7 | `MiniAudioPlayerBar` + intégration `AdaptiveRootView` + auto-fade 5s logic | 7 tests RED→GREEN + smoke navigation | `feat(ios/audio): floating mini-player` |
| 8 | `ConversationAudioCoordinator+NowPlaying` extension + MPRemoteCommandCenter + throttle 0.25s | smoke manuel lock-screen + AirPods | `feat(ios/audio): MPNowPlaying + RemoteCommandCenter` |
| 9 | QA checklist complète + polish + `apps/ios/decisions.md` entry (retroactive conformance + Bubble exception) | — | `chore(ios/audio): QA pass + decisions log` |

**Ordre revisé** : Phase 7 (mini-player) AVANT Phase 8 (NowPlaying) pour permettre le QA visuel intra-app de la queue avant d'ajouter les contrôles système.

**Estimation** : 5.5 à 7 jours pour un dev iOS confirmé, hors review et hors hotfix. Phase 8 est la plus longue (~1.5j à cause du QA manuel lock-screen / control center / AirPods / CarPlay simulé).

---

## 7. Risques et mitigations (révisés post-review)

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| `MediaLifecycleBridge.prepareForBackground` coupe l'audio | **Identifié post-review** | Bloquant | Modification explicite du bridge avec guard `coordinator.isPlaying`. Tests `MediaLifecycleBridgeTests` |
| ViewModel meurt avec NavigationStack → pas d'auto-play | **Identifié post-review** | Bloquant | Queue dans le coordinator singleton app, jamais dans le VM. Closure `onPlaybackFinished` capturée par le coordinator lui-même |
| Re-render 20Hz de toutes les bulles audio visibles | **Identifié post-review** | Élevé (perf) | Wrapper `ActiveAudioBubble` / `InactiveAudioBubble`. Seule la bulle active observe le coordinator. Test no-rerender |
| Pollution singleton entre tests | **Identifié post-review** | Moyen | Protocol `AudioPlaybackEngineDriving` injectable. `MockAudioPlaybackEngine` utilisé partout. Cf. memory `feedback_ios_test_suite_flaky` |
| SDK Purity franchie | **Identifié post-review** | Moyen | v2 : zéro modif SDK. Toute la sémantique Meeshy reste app-side |
| Conflit avec `CallManager` (CallKit en cours) | Faible | Élevé | Guard explicite `CallManager.shared.callState.isActive` dans `coordinator.play()`. Test `test_play_whileCallActive_isNoOp` |
| Interruption Siri / appel téléphonique | Faible | Moyen | `MediaSessionCoordinator` existant émet `.interruptionBegan` ; `AudioPlaybackManager` (engine interne) écoute déjà |
| Logout pendant lecture | Faible | Moyen | Hook `AuthManager.didLogoutPublisher` câblé dans `wireAuthLogoutHook` → `coordinator.close()` |
| Conv supprimée pendant lecture | Faible | Moyen | Handler global `conversation:deleted` → si activeContext.conversationId match → `coordinator.close()` |
| Message audio supprimé/édité pendant lecture | Faible | Moyen | Handler `message:deleted` / `message:updated` → si attachmentId actif référencé → `coordinator.close()` |
| Throttle `MPNowPlayingInfoCenter` à 1Hz système | Cosmétique | — | Sample 0.25s côté coordinator avant push |
| Mémoire — queue de 100 audios | Très faible | Moyen | `QueuedAudio` ≈ 200 bytes. Aucun pré-fetch. Cache disque à la demande |
| Durée Now Playing imprécise avant load | Cosmétique | — | Seed avec `attachment.duration` metadata, update après `playData(_:)` |
| Race queue + realtime append | Très faible | Bug subtil | Tout `@MainActor`. Pas de threading manuel |
| Multi-player conflit (caller IS shared) | Validé safe | — | `PlaybackCoordinator.willStartPlaying(audio:)` exclut le caller via ObjectIdentifier (L50). `resetState()` interne au `play()` stop l'audio actuel proprement |
| Mini-player + ConnectionBanner se chevauchent | Cosmétique | — | Stack vertical dans `AdaptiveRootView` : ConnectionBanner top, mini-player bottom |
| User force play rapidement (debounce) | Cosmétique | — | `engine.play(urlString:)` appelle `stop()` en début → idempotent par construction |
| Auto-fade mini-player timing | Cosmétique | — | Grace 5s après `activeContext == nil ET !isPlaying`, cancellable si re-play |

---

## 8. Hors scope (explicitement)

- **Cross-conversation auto-play** : on reste sur la conv courante uniquement
- **Téléchargement préventif de la queue** : seul l'audio en cours est fetché. Pas de prefetch
- **Réordonnancement de queue par l'utilisateur** : pas de UI
- **Persistance de la queue entre sessions d'app** : queue volatile, repart de zéro au cold start (le tracking serveur `listened complete=true` évite les répétitions)
- **CarPlay UI dédiée** : `MPRemoteCommandCenter` couvre CarPlay automatiquement
- **Story audio / Voice posts / Composer preview / Fullscreen audio** : strictement préservés (paths `@StateObject` locaux intacts)
- **Background fetch pour audios non lus arrivés app killed** : hors scope. Le polling reconnexion socket suffit
- **Refactor `AudioPlayerView` SDK pour extraire les helpers de rendu partagés entre Active et Inactive** : optimisation Phase 9+ si duplication visuelle devient gênante

---

## 9. Checklist QA

Tests manuels à exécuter avant de marquer fini :

- [ ] **Scroll pendant lecture** : audio continue, mini-player apparaît dès que la bulle sort du viewport
- [ ] **Quitter la conv pendant lecture** : audio continue, mini-player visible au-dessus du tab bar
- [ ] **Auto-play next intra-conv** : queue de 3 audios non lus → enchaînement automatique
- [ ] **Auto-play next hors-conv** : démarrer audio dans conv A, quitter, attendre fin → next démarre automatiquement (test du fix B2)
- [ ] **Auto-play skip read** : marquer 2e audio comme écouté → saut direct au 3e
- [ ] **Tap audio d'une autre conv** : conv A en lecture → conv B → tap play B → A stop, queue reset
- [ ] **Realtime append** : recevoir nouvel audio dans la conv active → enchaîne après les audios initiaux
- [ ] **Background app pendant lecture** : lock l'iPhone → lecture continue, Now Playing sur lock screen
- [ ] **Background + advance queue** : laisser un audio finir en background → next démarre automatiquement (test critique du fix B2 + P6)
- [ ] **Lock screen play/pause** : pause / resume depuis lock screen
- [ ] **Lock screen next** : tap next-track → passe à l'audio suivant
- [ ] **AirPods double-tap** : pause/play via AirPods
- [ ] **Control Center scrubbing** : seek via la progression Control Center
- [ ] **Interruption appel téléphonique** : audio en pause, fin d'appel → pause (user reprend manuellement)
- [ ] **Interruption Siri** : audio en pause
- [ ] **Appel CallKit Meeshy entrant pendant lecture** : audio arrêté, AVAudioSession non corrompue (test fix B1)
- [ ] **Tentative play audio Meeshy pendant appel CallKit actif** : aucune lecture, log info (test guard CallManager)
- [ ] **Logout pendant lecture** : audio arrêté, mini-player disparaît, NowPlaying cleared
- [ ] **Conv supprimée pendant lecture** : audio arrêté, mini-player disparaît
- [ ] **Message audio supprimé pendant lecture** : audio arrêté, mini-player disparaît
- [ ] **Spotify joue + démarre audio Meeshy** : Spotify duck (volume baissé), reprend à fin du clip
- [ ] **Mini-player tap body** : route vers la conv source, scroll auto à la bulle en cours
- [ ] **Mini-player X** : audio stop, queue vidée, mini-player disparaît
- [ ] **Mini-player auto-fade** : queue se vide naturellement → mini-player disparaît 5s après le dernier audio
- [ ] **Composer preview non affecté** : enregistrer + play preview composer → joue, ne déclenche pas le mini-player, n'observe pas le coordinator
- [ ] **Fullscreen audio non affecté** : ouvrir fullscreen → joue dans la vue, un seul player actif via PlaybackCoordinator
- [ ] **Story audio non affectée** : story avec audio joue normalement
- [ ] **Perf scroll** : 20 audios dans la liste, scroll rapide pendant lecture → 60 FPS maintenu, pas de hitch (test fix P2)

---

## 10. Décisions documentées

| # | Décision | Justification |
|---|---|---|
| 1 | Réutiliser `AudioPlaybackManager` (SDK) comme moteur, jamais comme singleton | Le moteur AVAudioPlayer est battle-tested. Singleton côté app respecte SDK Purity |
| 2 | Coordinator côté app (`ConversationAudioCoordinator`) plutôt que dans le SDK | Toute la sémantique Meeshy (conv, sender, queue, NowPlaying metadata) est produit-spécifique. Test du grain SDK Purity → app |
| 3 | Queue dans le coordinator, jamais dans le ViewModel | Le VM meurt en quittant la conv → la queue mourrait avec lui. Le coordinator est le seul propriétaire qui survit |
| 4 | Protocol `AudioPlaybackEngineDriving` injectable | Anti-pollution singleton dans les tests. Aligné avec « iOS TDD Requirements » CLAUDE.md (`{ServiceName}Providing`) |
| 5 | Wrapper `ActiveAudioBubble` / `InactiveAudioBubble` | « Zero Unnecessary Re-render » : seule la bulle active observe le coordinator. 20Hz de tick ne touchent qu'une cellule |
| 6 | `@Published var activeContext: ActiveAudioContext?` (struct) plutôt que 5 vars | SwiftUI re-rend au changement d'audio. Equatable struct + diff propre |
| 7 | Modifier `MediaLifecycleBridge.prepareForBackground` en plus de `MeeshyApp.scenePhase` | Second chemin identifié post-review. Sans cette modif, l'audio est systématiquement coupé en background |
| 8 | `.duckOthers` (préservé) | Comportement actuel + cohérent WhatsApp/Telegram. Validé avec utilisateur |
| 9 | Throttle NowPlaying à 0.25s | `MPNowPlayingInfoCenter` throttle système à 1Hz. Inutile de push à 20Hz |
| 10 | Init lazy du coordinator forcée au démarrage app | `_ = ConversationAudioCoordinator.shared` dans `MeeshyApp.init()`. Évite le coût `PlaybackCoordinator.register` au premier tap utilisateur |
| 11 | Mini-player Phase 7 AVANT NowPlaying Phase 8 | QA intra-app de la queue avant d'ajouter les contrôles système |
| 12 | Auto-fade 5s après queue vide ET pause | Évite mini-player vissé en bas d'écran. Pause = reste visible ; vide = fade |
| 13 | Pas de tests automatisés sur `MPNowPlayingInfoCenter` | Singleton système non mockable. QA manuelle dans la checklist |
| 14 | Logout / conv supprimée / message supprimé actif → `close()` | Comportement prévisible. L'utilisateur peut relancer manuellement |
| 15 | Logout via observation `AuthManager.$isAuthenticated`, pas un publisher dédié | `didLogoutPublisher` n'existe pas (vérifié post-review). `$isAuthenticated` est déjà `@Published`, donc on s'y abonne directement. Évite une modif SDK |
| 16 | Sub-views bulles Equatable avec `let` primitifs, observation au parent `AudioBubbleRouter` | Respect strict du contrat Bubble (`apps/ios/CLAUDE.md`). Aucun `@ObservedObject` sur singleton dans Active/Inactive |
| 17 | Phase 1.5 d'extraction de helpers visuels app-side | Évite la divergence silencieuse avec `AudioPlayerView` SDK lors de futures évolutions |
| 18 | Source canonique conv metadata = `CacheCoordinator.shared.conversations` | Le VM ne stocke pas l'objet `MeeshyConversation` complet, juste l'id. Cache GRDB est le SoT |
| 19 | Init forcée du coordinator dans `.task` root view, pas `MeeshyApp.init()` | Compatible Swift 6 (`@MainActor` singleton non accessible depuis init synchrone) |
| 20 | Handlers lifecycle (conv/message delete) sur publishers `SocialSocketManager` / `MessageSocketManager` | Aucun handler centralisé existant à ce jour — on étend les publishers existants. Le coordinator s'y abonne globalement |

---

## 11. Fichiers touchés (récap)

**Modifiés**

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` — ajout `listenedAttachmentIds: Set<String>`, computed `currentConversationName`/`currentConversationArtworkURL` (si manquants), méthode `playAudio(attachmentId:)`, hook realtime dans handler `message:new`
- `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift` — guard dans `MediaLifecycleBridge.prepareForBackground` (et `prepareForForeground` symétrique si pertinent)
- `apps/ios/Meeshy/MeeshyApp.swift` — guard scenePhase `.background` + init forcée du coordinator
- `apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift` — overlay `MiniAudioPlayerBar`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` (ou wrapper `AudioMediaView`) — switch `AudioBubbleRouter` au lieu de `AudioPlayerView` direct pour le contexte conv

**Nouveaux** (app-side, zéro SDK)

- `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift` (+ protocol `AudioPlaybackEngineDriving`, structs `ActiveAudioContext` / `QueuedAudio`)
- `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator+NowPlaying.swift` (extension MPNowPlaying + RemoteCommands)
- `apps/ios/Meeshy/Features/Main/Services/AudioQueueBuilder.swift` (fonction static pure)
- `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/ActiveAudioBubble.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/InactiveAudioBubble.swift` (peut wrapper `AudioPlayerView` SDK avec usesSharedManager=false implicite)
- `apps/ios/Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift`
- `apps/ios/MeeshyTests/Unit/Services/AudioQueueBuilderTests.swift`
- `apps/ios/MeeshyTests/Unit/Services/ConversationAudioCoordinatorTests.swift` (+ `Mocks/MockAudioPlaybackEngine.swift`)
- `apps/ios/MeeshyTests/Unit/Services/MediaLifecycleBridgeTests.swift`
- `apps/ios/MeeshyTests/Unit/Views/AudioBubbleRouterTests.swift`
- `apps/ios/MeeshyTests/Unit/Components/MiniAudioPlayerBarTests.swift`
- `apps/ios/MeeshyTests/Unit/MeeshyAppScenePhaseTests.swift` (ou extension existant)

**SDK touché** : ZÉRO fichier modifié. Le SDK reste 100% intact. Le test bundle SDK cassé n'est pas un blocage.

**Total** : 5 fichiers app modifiés, 13 nouveaux (dont 6 tests + 1 mock + 4 helpers de rendu).

**Vérifications complémentaires** (à effectuer en Phase 0 avant le premier code) :

1. `AuthManager.$isAuthenticated` est-il bien `@Published` et observable depuis l'app ? Si non, modif SDK minimale ciblée à acter avant Phase 3
2. `SocialSocketManager` publie-t-il déjà `conversation:deleted` via un Combine publisher accessible ? Si non, ajout de `conversationDeletedPublisher: AnyPublisher<String, Never>` à acter avant Phase 3
3. `MessageSocketManager.messageDeletedPublisher` existe-t-il ? Vérifier que `message:deleted` (vu L1845 par le reviewer) est exposé via Combine
4. `CacheCoordinator.shared.conversations.get(id:)` est-elle l'API correcte ? Lire la signature avant Phase 4
5. Prototyper `assign(to: &$isPlaying)` avec un `MockAudioPlaybackEngine` conformant en Phase 0 pour valider l'approche
