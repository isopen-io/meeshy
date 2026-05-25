# iOS — Audio Continuous Playback & Auto-Play Queue

**Date** : 2026-05-25
**Statut** : Design validé, prêt pour writing-plans
**Branche cible** : `feat/ios-audio-continuous-playback`
**Auteur** : Claude (Opus 4.7) en pair avec @smpceo

---

## 1. Contexte et problème

Aujourd'hui, lorsqu'un utilisateur écoute un message audio dans une conversation :

- **Scroll** : si la bulle audio sort du viewport, la cellule SwiftUI est recyclée par `LazyVStack`, le `@StateObject` `AudioPlaybackManager` est détruit, et l'audio s'arrête.
- **Sortie de conversation** : la `NavigationStack` démonte la vue, idem, audio coupé.
- **App en background** : `UIBackgroundModes` contient déjà `audio` et `voip`, donc l'OS autoriserait la lecture en background, mais aucun `MPNowPlayingInfoCenter` n'est configuré et le `scenePhase .background` peut désactiver l'`AVAudioSession`.
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

---

## 3. Architecture

### 3.1 Vue d'ensemble

Le moteur de lecture (`AudioPlaybackManager`, SDK MeeshyUI) est aujourd'hui couplé au cycle de vie de la cellule SwiftUI. On le **détache** en exposant une instance partagée `AudioPlaybackManager.sharedConversation` qui survit indépendamment des vues. Le `ConversationViewModel` (app) orchestre la queue. Le `AudioPlayerView` devient un consommateur passif quand il est rendu dans le contexte d'une bulle de conversation.

**Règle SDK Purity respectée** : aucune décision UX produit (queue, auto-play, mini-player, NowPlaying intégration) n'est mise dans le SDK. Le SDK fournit le bloc atomique (`AudioPlaybackManager`) ; l'app compose. Seule modification SDK : 1 ligne pour exposer l'instance partagée.

### 3.2 Composants existants réutilisés (sans modification)

| Composant | Path | Rôle |
|---|---|---|
| `AudioPlaybackManager` | `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` | Moteur AVAudioPlayer (cache, play/pause/seek/speed, delegate, progress, `reportListenProgress`) |
| `PlaybackCoordinator.shared` | `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift` | Stop concurrent entre players |
| `MediaSessionCoordinator.shared` | `packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift` | AVAudioSession + interruptions système |
| `CacheCoordinator.shared.audio` | `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` | Cache disque audio (déjà utilisé par `AudioPlaybackManager`) |
| `PlaybackSpeed` | `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTypes.swift` | Enum vitesses (1.0, 1.5, 2.0, …) |
| `AttachmentStatusBody` + `reportListenProgress` | `AudioPlayerView.swift` (SDK MeeshyUI) | POST `/attachments/:id/status` action=`listened` |
| Pattern `ConnectionBanner` / `OfflineBanner` | `apps/ios/Meeshy/Features/Main/Components/` | Inspiration visuelle pour le mini-player flottant |
| `Router.shared` | `apps/ios/Meeshy/Features/Main/Navigation/Router.swift` | Navigation depuis le tap mini-player |

### 3.3 Modification SDK (minimale)

**Fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`

Ajout dans la déclaration de `AudioPlaybackManager` :

```swift
@MainActor public class AudioPlaybackManager: NSObject, ObservableObject {
    // … toutes les @Published, init, méthodes existantes restent identiques

    /// Instance partagée pour le contexte « bulle de conversation ».
    /// Détachée du cycle de vie de la cellule SwiftUI pour permettre
    /// la lecture continue lors du scroll, du changement de vue, et du
    /// passage en background. Le ConversationViewModel orchestre la queue
    /// via cette instance. Les autres contextes (composer preview, story,
    /// AudioFullscreenView) continuent à utiliser leur @StateObject local.
    public static let sharedConversation = AudioPlaybackManager()

    /// Identifiants de contexte associés à l'audio en cours. Définis
    /// au moment du play par le ViewModel orchestrateur. Permettent au
    /// mini-player et au hook realtime de savoir à quelle conversation
    /// le moteur est actuellement rattaché, sans coupler le SDK au
    /// concept de conversation Meeshy (ce sont juste des strings opaques).
    public var activeConversationId: String?
    public var activeMessageId: String?
    public var activeSenderName: String?
    public var activeConversationName: String?
    public var activeArtworkURL: String?
}
```

`attachmentId: String?` existe déjà sur la classe (utilisé par `reportListenProgress`). On ajoute les champs frères pour le contexte. Ce sont des `var` simples (non-@Published) : le ViewModel les set juste avant `play(urlString:)` ; le mini-player les lit au moment où il rend (et SwiftUI re-rend déjà via les `@Published` `isPlaying` / `currentTime`).

Aucune méthode existante n'est touchée. Aucun test SDK ne dépend de ces ajouts. Le test bundle SDK actuellement cassé (cf. `project_sdk_test_bundle_preexisting_breakage`) reste tel quel ; on vérifie l'ajout via `xcodebuild build -scheme MeeshySDK-Package` (build only, pas test).

### 3.4 Modifications app

#### 3.4.1 `ConversationViewModel` (`apps/ios/Meeshy/Features/Main/ViewModels/`)

Ajouts (struct interne + propriétés + méthodes) :

```swift
extension ConversationViewModel {
    struct QueuedAudio: Equatable, Identifiable {
        let attachmentId: String
        let messageId: String
        let conversationId: String
        let fileUrl: String
        let durationMs: Int
        let senderName: String
        let senderAvatarUrl: String?
        let receivedAt: Date
        var id: String { attachmentId }
    }

    // État queue (privé au ViewModel)
    // ...

    func playAudio(attachmentId: String)         // user tap sur play d'une bulle
    func advanceAudioQueue()                     // appelé sur onPlaybackFinished
    func appendUpcomingAudio(from message: MeeshyMessage)   // hook realtime
    func stopAndClearAudioQueue()                // tap X mini-player
}
```

**Build helper testable** — `enum AudioQueueBuilder` avec une fonction static pure, dans son propre fichier pour permettre les tests isolés sans `@MainActor` :

```swift
enum AudioQueueBuilder {
    static func build(
        from messages: [MeeshyMessage],
        startingAfter currentAttachmentId: String?,
        currentUserId: String,
        listenedAttachmentIds: Set<String>
    ) -> [ConversationViewModel.QueuedAudio]
}
```

Règles de filtrage :
1. Type d'attachment = `audio`
2. `senderId != currentUserId` (on ne s'auto-écoute pas)
3. `attachmentId ∉ listenedAttachmentIds`
4. Ordre = `receivedAt` croissant (chronologique top-down)
5. Si `currentAttachmentId` fourni, ne retient que les audios reçus strictement après

#### 3.4.2 `AudioPlayerView` (SDK MeeshyUI)

Le fichier reste où il est, mais sa logique d'observation est conditionnée par le `MediaPlayerContext`. Deux cas :

- **Cas A — Contexte bulle conversation** (nouveau `case .conversationBubble` à ajouter ou via détection sur context existant) :
  - `player` n'est plus un `@StateObject` local mais une référence vers `AudioPlaybackManager.sharedConversation`
  - Les propriétés UI (`isPlaying`, `progress`, `currentTime`) sont lues live MAIS affichées à zéro si `sharedConversation.currentUrl != attachment.fileUrl` (la cellule représente un autre audio que celui actuellement joué)
  - `.onDisappear` ne fait PLUS rien (pas de `unregisterFromCoordinator`, pas de `unregisterAutoplay`)
  - `.onAppear` ne fait PLUS de `registerAutoplay` (la queue est dans le ViewModel)
  - Le tap play délègue à un callback `onPlayRequest: (() -> Void)?` que `BubbleAttachmentView` câble vers `viewModel.playAudio(attachmentId:)`

- **Cas B — Tous les autres contextes** (composer preview, `AudioFullscreenView`, story) :
  - Comportement actuel **strictement préservé** : `@StateObject` local, `registerAutoplay`/`unregisterAutoplay`, `.onDisappear` stop. Aucune modification de code, aucune régression possible.

**Détection du cas A** : le plus simple = ajouter un init param explicite `usesSharedManager: Bool = false` à `AudioPlayerView`. Le wrapper `AudioMediaView` (côté app, qui rend les bulles conversation) le passe à `true`. Tout le reste reste à `false` par défaut.

Cette décision élimine toute ambiguïté sur les contextes existants (`MediaPlayerContext` actuel ne permet pas de distinguer bubble vs composer attachment sans relire toute la matrice de cas).

#### 3.4.3 `MeeshyApp.swift` — scenePhase

```swift
.adaptiveOnChange(of: scenePhase) { _, newPhase in
    Task {
        switch newPhase {
        case .background:
            // Ne désactive PAS la session audio tant qu'un audio joue.
            // UIBackgroundModes "audio" autorise la lecture continue.
            if !AudioPlaybackManager.sharedConversation.isPlaying {
                await MediaSessionCoordinator.shared.deactivateForBackground()
            }
        case .active:
            // … comportement existant préservé
        // …
        }
    }
}
```

#### 3.4.4 `AudioPlaybackManager+NowPlaying.swift` — extension app

Fichier : `apps/ios/Meeshy/Features/Main/Services/AudioPlaybackManager+NowPlaying.swift`

```swift
import Foundation
import Combine
import MediaPlayer
import MeeshyUI

// Extension app-side (pas SDK) — la configuration de
// MPNowPlayingInfoCenter et MPRemoteCommandCenter est une décision UX
// produit Meeshy (« quand un audio Meeshy joue, on publie tel titre + tel
// album = nom de la conv »), donc app-side selon SDK Purity.
extension AudioPlaybackManager {
    /// Active la liaison Now Playing + Remote Commands sur cette instance.
    /// À appeler une fois au démarrage de l'app pour
    /// `AudioPlaybackManager.sharedConversation`.
    public func activateNowPlayingBridge(
        metadataProvider: @escaping () -> NowPlayingMetadata?,
        onNext: @escaping () -> Void,
        onClose: @escaping () -> Void
    )
}

public struct NowPlayingMetadata {
    public let title: String          // ex: "Audio de Alice"
    public let artist: String         // ex: nom de la conversation
    public let durationSeconds: Double
    public let artworkURL: String?    // avatar conv
}
```

Internals :
- Subscribe via Combine aux `@Published` `isPlaying`, `currentTime`, `duration`, `speed` du manager
- Push vers `MPNowPlayingInfoCenter.default().nowPlayingInfo`
- Install commandes : `playCommand`, `pauseCommand`, `nextTrackCommand`, `changePlaybackPositionCommand`
- `nextTrackCommand` → invoque `onNext` (qui pointera vers `ConversationViewModel.advanceAudioQueue()`)
- Artwork chargée async via `CacheCoordinator.shared.images` quand `artworkURL` fourni

Initialisation : dans `MeeshyApp.init()` ou au premier `play()`, on appelle `AudioPlaybackManager.sharedConversation.activateNowPlayingBridge(...)` avec les closures pointant vers le ViewModel actif (capture weak).

#### 3.4.5 `MiniAudioPlayerBar.swift` — nouvelle vue app

Fichier : `apps/ios/Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift`

```swift
struct MiniAudioPlayerBar: View {
    @ObservedObject var player: AudioPlaybackManager = .sharedConversation
    let metadata: NowPlayingMetadata?    // injected via parent (root view)
    let onTap: () -> Void                 // route vers la conv
    let onTogglePlayPause: () -> Void
    let onNext: () -> Void
    let onClose: () -> Void

    var body: some View {
        // Visible UNIQUEMENT si player.currentUrl != nil ET metadata != nil
        // Layout horizontal : avatar conv | titre + sous-titre | progress bar fine | play/pause | next | X
        // Background .ultraThinMaterial + tinted indigo
        // Transition .move(edge: .bottom).combined(with: .opacity)
        // Hauteur ~56pt, padding horizontal 12pt
        // Au-dessus du tab bar / safe area bottom
    }
}
```

Intégration dans `AdaptiveRootView.swift` : overlay `ZStack` en bottom, juste au-dessus du tab bar, et au-dessus du `ConnectionBanner` (qui est plus haut dans la stack).

Le tap-to-route route via `Router.shared.push(.conversation(id: player.activeConversationId))`. L'ID conv est porté par la metadata fournie par le ViewModel via une closure capturée dans `activateNowPlayingBridge`.

---

## 4. Flots de données

### 4.1 Tap play sur une bulle audio

```
AudioPlayerView (usesSharedManager: true)
    └─ onPlayRequest()
       └─ AudioMediaView capture viewModel
          └─ ConversationViewModel.playAudio(attachmentId:)
             ├─ tail = AudioQueueBuilder.build(...) après attachmentId
             ├─ self.audioQueue = [current] + tail
             ├─ self.currentAudioIndex = 0
             ├─ AudioPlaybackManager.sharedConversation.attachmentId = current.attachmentId
             ├─ AudioPlaybackManager.sharedConversation.activeConversationId = current.conversationId
             ├─ AudioPlaybackManager.sharedConversation.activeMessageId = current.messageId
             ├─ AudioPlaybackManager.sharedConversation.activeSenderName = current.senderName
             ├─ AudioPlaybackManager.sharedConversation.activeConversationName = self.conversationName
             ├─ AudioPlaybackManager.sharedConversation.activeArtworkURL = self.conversationAvatarURL
             ├─ AudioPlaybackManager.sharedConversation.onPlaybackFinished = { [weak self] in
             │     self?.advanceAudioQueue()
             │  }
             ├─ AudioPlaybackManager.sharedConversation.play(urlString: current.fileUrl)
             │  ├─ PlaybackCoordinator.shared.willStartPlaying(audio:) → stop autres
             │  ├─ AVAudioSession.setCategory(.playback)
             │  ├─ CacheCoordinator.shared.audio.data(for:) → AVAudioPlayer
             │  └─ player.play() + startProgressTimer
             └─ NowPlaying bridge publie metadata (titre, conv, durée, artwork)
```

### 4.2 Fin de lecture → next

```
audioPlayerDidFinishPlaying (AudioPlaybackManager AVAudioPlayerDelegate)
    └─ handlePlaybackFinished (existant)
       ├─ reportListenProgress(complete: true) → POST /attachments/:id/status
       ├─ onPlaybackFinished?() ← ConversationViewModel.advanceAudioQueue()
       │   ├─ currentAudioIndex += 1
       │   ├─ if currentAudioIndex < audioQueue.count:
       │   │     next = audioQueue[currentAudioIndex]
       │   │     AudioPlaybackManager.sharedConversation.play(urlString: next.fileUrl)
       │   │  else:
       │   │     enterIdleState()  // mini-player auto-fade après 5s
       └─ … (l'ancien triggerAutoplayNext via autoplayRegistry n'est plus invoqué dans ce path)
```

### 4.3 Nouveau audio realtime arrive

```
MessageSocketManager → ConversationViewModel.handleSocketMessageNew(msg)
    ├─ existing : insert msg dans messages[]
    └─ NEW : if msg has audio attachment
              && msg.conversationId == AudioPlaybackManager.sharedConversation.activeConversationId
              && msg.senderId != currentUser.id
              && !listenedAttachmentIds.contains(att.id)
              && !audioQueue.contains(where: { $0.attachmentId == att.id })
              → audioQueue.append(QueuedAudio.from(msg))
```

### 4.4 Tap mini-player → retour à la conv

```
MiniAudioPlayerBar.onTap()
    └─ Router.shared.push(.conversation(id: activeConversationId))
       └─ ConversationView se monte
          └─ AudioPlayerView (usesSharedManager: true) pour la bulle de l'audio actif
             observe AudioPlaybackManager.sharedConversation → affiche progress live
             (les autres bulles audio rendent état neutre car currentUrl ≠ leur fileUrl)
```

### 4.5 Background

```
scenePhase → .background
    └─ if !AudioPlaybackManager.sharedConversation.isPlaying:
          await MediaSessionCoordinator.shared.deactivateForBackground()
       else:
          // ne rien faire — UIBackgroundModes "audio" autorise l'OS à continuer
          // MPNowPlayingInfoCenter reste à jour via les Combine subscriptions
```

Quand un audio finit en background, `audioPlayerDidFinishPlaying` est appelé normalement (l'OS laisse tourner les delegates AV), `advanceAudioQueue()` est invoqué, et le next audio démarre — sans interaction utilisateur.

---

## 5. Tests TDD

### 5.1 Tests purs (no AV, no UI)

**`AudioQueueBuilderTests.swift`** (nouveau, `apps/ios/MeeshyTests/Unit/Services/`)

- `test_build_filtersAudioOnly`
- `test_build_excludesCurrentUserSelfAudios`
- `test_build_excludesListenedAttachments`
- `test_build_sortsChronologicallyAscending`
- `test_build_startingAfter_returnsOnlyAudiosReceivedAfterCursor`
- `test_build_empty_returnsEmpty`

### 5.2 Tests d'intégration ViewModel

**`ConversationViewModelAudioQueueTests.swift`** (nouveau)

- `test_playAudio_setsSharedManagerAttachmentId_andStartsPlayback`
- `test_playAudio_buildsQueueWithTail`
- `test_advanceAudioQueue_playsNextInQueue`
- `test_advanceAudioQueue_atEnd_entersIdleState`
- `test_handleSocketMessageNew_audioInActiveConv_appendsToQueue`
- `test_handleSocketMessageNew_audioInOtherConv_doesNothing`
- `test_handleSocketMessageNew_duplicateAttachmentId_doesNotAppendTwice`
- `test_playAudio_onDifferentConversation_resetsQueue`
- `test_stopAndClearAudioQueue_emptiesQueueAndStopsManager`

### 5.3 Tests UI

**`MiniAudioPlayerBarTests.swift`** (nouveau)

- `test_visibility_hiddenWhenManagerCurrentUrlNil`
- `test_visibility_visibleWhenPlaying`
- `test_visibility_visibleWhenPaused`
- `test_tapPlayPause_invokesCallback`
- `test_tapClose_invokesCallback`
- `test_tapBody_invokesRouteCallback`

### 5.4 Tests scenePhase

**`MeeshyAppScenePhaseTests.swift`** (nouveau ou extension de l'existant)

- `test_background_whilePlaying_doesNotDeactivateSession`
- `test_background_whileIdle_deactivatesSession`
- `test_active_resumesPresenceOnline` (préservation comportement actuel)

### 5.5 Pas de tests automatisés pour

- `AudioPlaybackManager+NowPlaying` (interaction avec singleton système `MPNowPlayingInfoCenter` → vérification manuelle dans la checklist QA)
- `AudioPlaybackManager.sharedConversation` (instance singleton, rien à tester unitairement — tous les tests passent par le ViewModel ou via mocks)

---

## 6. Plan d'implémentation (phases TDD)

| Phase | Description | Tests | Commit prévu |
|---|---|---|---|
| 0 | Setup branche + baseline tests verts | — | — |
| 1 | Pure queue logic (`AudioQueueBuilder` + `QueuedAudio`) | 6 tests RED→GREEN | `feat(ios/audio): pure queue logic` |
| 2 | SDK : `AudioPlaybackManager.sharedConversation` (+1 ligne) | build SDK only | `feat(sdk/audio): expose shared conversation manager` |
| 3 | `ConversationViewModel` orchestration queue + realtime hook | 9 tests RED→GREEN | `feat(ios/audio): VM drives playback queue` |
| 4 | `AudioPlayerView` consumer mode + suppression autoplayRegistry path | smoke manuel | `feat(ios/audio): bubble player observes shared manager` |
| 5 | `MeeshyApp` scenePhase guard | 3 tests RED→GREEN | `feat(ios/audio): keep playback on scene background` |
| 6 | `AudioPlaybackManager+NowPlaying` extension | smoke manuel lock-screen | `feat(ios/audio): MPNowPlaying + RemoteCommandCenter` |
| 7 | `MiniAudioPlayerBar` + intégration `AdaptiveRootView` | 6 tests RED→GREEN | `feat(ios/audio): floating mini-player bar` |
| 8 | QA checklist + polish | — | `chore(ios/audio): QA pass` |

---

## 7. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Test bundle SDK cassé bloque build | Faible | Bloquant | 1 seule ligne ajoutée au SDK, vérifiée via `xcodebuild build` sans `test`. Si le bundle test SDK est repassé vert avant cette phase, on peut tester ; sinon on reste sur build only |
| Régression composer preview / fullscreen / story | Très faible | Élevé | Path `usesSharedManager: false` (défaut) = comportement actuel strictement préservé. Branche conditionnelle uniquement déclenchée par `AudioMediaView` côté bulle conv |
| `AVAudioSession` désactivée pendant lecture background | Moyen | Bloquant | Guard `if !sharedConversation.isPlaying` avant `deactivateForBackground()`. Test `test_background_whilePlaying_doesNotDeactivateSession` |
| Conflit avec `CallManager` (appel CallKit en cours) | Faible | Élevé | Le guard `if !CallManager.shared.callState.isActive` existe déjà dans `AudioPlaybackManager.play(urlString:)`. Pas de changement |
| Interruption Siri / appel téléphonique pendant lecture | Faible | Moyen | `MediaSessionCoordinator` existant émet `.interruptionBegan` → `AudioPlaybackManager` existant écoute déjà. Pas de changement nécessaire |
| Mémoire — queue de 100 audios | Très faible | Moyen | `QueuedAudio` ≈ 200 bytes (que des strings + Int + Date). Aucun audio pré-loadé. Fetch à la demande au moment `play(next)` via cache disque |
| Durée Now Playing imprécise avant load | Faible | Cosmétique | Seed avec `attachment.duration` (metadata serveur) ; update après `playData(_:)` quand `player.duration` réel est connu |
| Race condition queue + realtime append | Faible | Bug subtil | Tout est `@MainActor` (ViewModel + sharedConversation + AVAudioPlayerDelegate via `Task { @MainActor in }`). Pas de threading manuel |
| Mini-player + ConnectionBanner se chevauchent visuellement | Moyen | Cosmétique | Stack vertical dans `AdaptiveRootView` : ConnectionBanner top, mini-player bottom (au-dessus tab bar). À polir en phase 7 |
| User quitte l'app pendant lecture → revient → désynchronisation | Très faible | Cosmétique | `@Published` Combine → SwiftUI re-rend automatiquement. Le `AudioPlayerView` à l'écran lit l'état live du manager. Pas d'état à reconcilier |
| Tap répété rapide sur play (debounce) | Moyen | Cosmétique | `AudioPlaybackManager.play(urlString:)` appelle déjà `stop()` en début de méthode → idempotent par construction |

---

## 8. Hors scope (explicitement)

- **Cross-conversation auto-play** : on reste sur la conv courante uniquement. Si l'utilisateur quitte la conv source pendant la lecture, la queue continue mais ne s'étend pas aux autres convs (décision UX validée)
- **Téléchargement préventif de la queue** : seul l'audio en cours est fetché. Les next sont fetchés à la demande au moment du `advance`. Pas de prefetch, pas de download manager
- **Réordonnancement de queue par l'utilisateur** : pas de UI pour ça. Queue chronologique stricte
- **Persistance de la queue entre sessions d'app** : si l'app est killée et relancée, la queue repart de zéro. Le tracking serveur via `reportListenProgress` garantit qu'on ne rejouera pas un audio déjà écouté à 100 %
- **CarPlay** : `MPRemoteCommandCenter` fournit déjà la base pour CarPlay automatiquement, mais aucune UI dédiée CarPlay
- **Story audio / Voice posts** : hors scope. Story / feed restent sur leur path actuel `@StateObject` local
- **Composer audio preview** : strictement préservé, `@StateObject` local intact
- **Background fetch pour audios non lus arrivés pendant que l'app est tuée** : hors scope. Le polling sur reconnexion socket suffit déjà

---

## 9. Checklist QA (Phase 8)

Tests manuels à exécuter avant de marquer fini :

- [ ] **Scroll pendant lecture** : démarrer un audio dans une conv avec ≥20 messages, scroll vers le haut → l'audio continue, le mini-player apparaît dès que la bulle sort du viewport
- [ ] **Quitter la conv pendant lecture** : démarrer un audio, revenir au listing conv → audio continue, mini-player visible au-dessus du tab bar
- [ ] **Auto-play next** : démarrer un audio dans une conv avec ≥3 audios non lus → en fin de lecture, le suivant démarre automatiquement
- [ ] **Auto-play skip read** : marquer le 2e audio comme écouté à 100 %, démarrer le 1er → en fin de lecture, on saute directement au 3e
- [ ] **Tap audio d'une autre conv** : démarrer un audio dans conv A, naviguer vers conv B, tap play sur un audio B → A s'arrête immédiatement, queue resetée sur B
- [ ] **Realtime append** : démarrer un audio dans conv A, recevoir un nouvel audio realtime dans A pendant la lecture → en fin de lecture des audios initiaux, le nouveau audio s'enchaîne
- [ ] **Background app pendant lecture** : démarrer un audio, lock l'iPhone → lecture continue, Now Playing visible sur lock screen avec titre + artwork + progression
- [ ] **Lock screen play/pause** : pause depuis lock screen → audio en pause dans l'app ; resume → reprend
- [ ] **Lock screen next** : tap next-track depuis lock screen → passe à l'audio suivant de la queue
- [ ] **AirPods double-tap** : pause/play via AirPods → fonctionne
- [ ] **Control Center scrubbing** : seek via la progression Control Center → AVAudioPlayer suit
- [ ] **Interruption appel téléphonique** : recevoir un appel pendant lecture → audio en pause, fin d'appel → audio reste en pause (l'utilisateur reprend manuellement)
- [ ] **Interruption Siri** : déclencher Siri pendant lecture → audio en pause
- [ ] **Appel CallKit Meeshy** : passer un appel Meeshy pendant lecture → audio arrêté, AVAudioSession non corrompue (vérifier que la voix d'appel passe correctement)
- [ ] **Mini-player tap body** : tap sur le mini-player → route vers la conv source, scroll automatique à la bulle en cours
- [ ] **Mini-player X** : tap sur X → audio s'arrête, queue vidée, mini-player disparaît
- [ ] **Mini-player auto-fade** : laisser la queue se vider naturellement → mini-player disparaît avec animation 5s après le dernier audio
- [ ] **Composer preview non affecté** : enregistrer un audio dans le composer, tap play preview → joue, ne déclenche pas le mini-player
- [ ] **Fullscreen audio non affecté** : ouvrir un audio en fullscreen, jouer → joue dans la vue fullscreen, pas dans le mini-player (un seul player actif via PlaybackCoordinator)
- [ ] **Story audio non affectée** : jouer une story avec audio → comportement inchangé

---

## 10. Décisions documentées (récap)

| # | Décision | Justification |
|---|---|---|
| 1 | Réutiliser `AudioPlaybackManager` plutôt que créer un service nouveau | Le moteur AVAudioPlayer est complet et battle-tested. Pas de duplication |
| 2 | Singleton `sharedConversation` côté SDK (1 ligne) plutôt que service shared côté app | Évite de dupliquer le code moteur. La règle SDK Purity est respectée : exposer une instance partagée d'un atome ≠ encoder une décision UX. La décision UX (queue, NowPlaying, mini-player) reste côté app |
| 3 | Queue dans `ConversationViewModel`, pas un nouveau service | La queue est une décision UX produit liée au contexte d'une conversation. Le ViewModel est le bon owner |
| 4 | `usesSharedManager: Bool` init param plutôt que enum context | Le `MediaPlayerContext` actuel ne distingue pas bubble vs composer attachment sans ambiguïté. Un bool explicite passé par `AudioMediaView` est sans équivoque |
| 5 | Extension `AudioPlaybackManager+NowPlaying` app-side, pas SDK | C'est de l'orchestration UX produit Meeshy (« titre = sender, album = conv ») — règle SDK Purity |
| 6 | Pas de prefetch de la queue | YAGNI — le cache disque + temps de fetch typique <500ms = transition imperceptible entre 2 audios |
| 7 | Mini-player auto-fade après 5s | Évite que le mini-player reste vissé en bas d'écran après que tout est écouté. Pause = reste affiché ; queue vide = fade |
| 8 | Suppression `autoplayRegistry` path dans `AudioPlayerView` quand `usesSharedManager: true` | Le mécanisme `autoplayRegistry` static est intrinsèquement lié aux vues visibles. La queue ViewModel le remplace fonctionnellement et corrige son bug de fond |
| 9 | Aucun test automatisé sur `MPNowPlayingInfoCenter` | Singleton système non mockable proprement. Vérifié via QA manuelle |

---

## 11. Fichiers touchés (récap)

**Modifiés**

- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` — ajout `static let sharedConversation` + champs de contexte (`activeConversationId`, `activeMessageId`, `activeSenderName`, `activeConversationName`, `activeArtworkURL`) + nouveau param `usesSharedManager: Bool = false` sur `AudioPlayerView.init` + branche conditionnelle dans `body`/`onAppear`/`onDisappear`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` — ajout struct `QueuedAudio`, propriétés queue, méthodes `playAudio`, `advanceAudioQueue`, `appendUpcomingAudio`, `stopAndClearAudioQueue`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` (ou wrapper `AudioMediaView` réel) — passe `usesSharedManager: true` + câble `onPlayRequest` vers `viewModel.playAudio(attachmentId:)`
- `apps/ios/Meeshy/MeeshyApp.swift` — guard scenePhase `.background`
- `apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift` — overlay `MiniAudioPlayerBar`

**Nouveaux**

- `apps/ios/Meeshy/Features/Main/Services/AudioPlaybackManager+NowPlaying.swift` — extension MPNowPlaying + RemoteCommands
- `apps/ios/Meeshy/Features/Main/Services/AudioQueueBuilder.swift` — fonction static pure (helper de queue)
- `apps/ios/Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift` — vue flottante
- `apps/ios/MeeshyTests/Unit/Services/AudioQueueBuilderTests.swift`
- `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelAudioQueueTests.swift`
- `apps/ios/MeeshyTests/Unit/Components/MiniAudioPlayerBarTests.swift`
- `apps/ios/MeeshyTests/Unit/MeeshyAppScenePhaseTests.swift` (ou extension existant)

**Total** : 5 fichiers modifiés, 7 nouveaux (dont 4 fichiers de tests).
