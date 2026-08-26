import Foundation
import UIKit
import Combine
import MeeshyUI
import MeeshySDK
import os

/// Orchestrates sequential playback of audio attachments across a conversation.
///
/// Owns a single underlying `AudioPlaybackEngineDriving` engine and a queue of
/// `QueuedAudio`. Honors three lifecycle hooks that close playback automatically:
///  1. CallKit guard: refuses to start playback while a call is active.
///  2. Auth logout: closes when `AuthManager.isAuthenticated` flips to false.
///  3. Socket events: closes when the active conversation is deleted server-side
///     or when the currently playing message is deleted (drops queued items for
///     deleted messages).
///
/// Pure UX orchestration — kept app-side per SDK purity rule.
/// Reference: Phase 3 of `docs/superpowers/plans/2026-05-26-audio-playback-persistence-plan.md`.
@MainActor
public final class ConversationAudioCoordinator: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public static let shared = ConversationAudioCoordinator()

    // MARK: - Published State

    @Published public private(set) var activeContext: ActiveAudioContext?
    @Published public private(set) var queueCount: Int = 0
    @Published public private(set) var isPlaying: Bool = false
    @Published public private(set) var progress: Double = 0
    @Published public private(set) var currentTime: TimeInterval = 0
    @Published public private(set) var duration: TimeInterval = 0
    @Published public private(set) var speed: PlaybackSpeed = .x1_0

    // MARK: - Public publishers

    /// Event payload emitted on `attachmentFinishedPublisher` when an audio
    /// finishes natural playback or fails to load. Carries the
    /// `conversationId` so subscribers (typically `ConversationViewModel`s
    /// hooked on a process-wide singleton coordinator) can filter events
    /// that don't belong to their conversation — avoiding the cross-VM
    /// callback pollution that the previous mutable closure-based slot
    /// caused (most-recent setter wins, callback fires into the wrong VM).
    public struct AttachmentFinishedEvent: Sendable, Equatable {
        public let attachmentId: String
        public let conversationId: String

        public init(attachmentId: String, conversationId: String) {
            self.attachmentId = attachmentId
            self.conversationId = conversationId
        }
    }

    private let attachmentFinishedSubject = PassthroughSubject<AttachmentFinishedEvent, Never>()

    /// Fires with the `AttachmentFinishedEvent` of the audio that just
    /// finished or failed to load — BEFORE the queue advances to the next
    /// head. Each `ConversationViewModel` subscribes once in its `init`
    /// and filters by `event.conversationId == self.conversationId`. The
    /// `PassthroughSubject` is multi-subscriber safe and each VM's
    /// subscription auto-cleans on deinit via `cancellables`.
    public var attachmentFinishedPublisher: AnyPublisher<AttachmentFinishedEvent, Never> {
        attachmentFinishedSubject.eraseToAnyPublisher()
    }

    // MARK: - Private

    private let engine: AudioPlaybackEngineDriving
    /// Exposes the underlying concrete `AudioPlaybackManager` (when present) so
    /// that `AudioPlayerView` instances in the bubble can attach to the same
    /// engine via `externalPlayer:` and reflect coordinator-driven state.
    public var engineForBubble: AudioPlaybackManager? {
        engine as? AudioPlaybackManager
    }

    /// URL de la piste en TÊTE de file (variante de langue comprise, cf.
    /// `playVariant`) — permet aux bascules de langue de détecter qu'elles
    /// ne changeraient rien et de ne pas relancer la même piste à zéro.
    public var activeTrackUrl: String? {
        queue.first?.fileUrl
    }

    private var queue: [QueuedAudio] = []
    /// Ids of attachments that finished or failed this session. `appendUpcoming`
    /// skips these to close the race window where a re-emitted `$messages` could
    /// re-queue an audio before the VM's `listenedAttachmentIds` set updates.
    /// Cleared on fresh `play()` so prior tracks can be replayed in a new session.
    private var consumedAttachmentIds: Set<String> = []
    /// Already-played tracks enabling `playPrevious()` — the queue is forward-only.
    /// Most-recent is `history.last`. Capped at `Self.maxHistory`; reset on `close()`.
    private var history: [QueuedAudio] = []
    private var currentName: String = ""
    private var currentArtwork: String?
    private var cancellables = Set<AnyCancellable>()
    // `assign(to: &$)` does not cancel a prior subscription — a second call to
    // `wireEngineForwarding()` would race two publishers on the same @Published
    // properties. The precondition below enforces single-wire.
    private var isEngineWired = false

    // MARK: - NowPlaying bridge state
    // Written by `ConversationAudioCoordinator+NowPlaying.swift` (same-module extension).
    // `internal` access + `_` prefix signals extension-only usage.
    var _isNowPlayingActivated = false
    var _nowPlayingCancellables = Set<AnyCancellable>()
    // Opaque tokens from MPRemoteCommand.addTarget, kept for future deactivation symmetry.
    var _remoteCommandTokens: [Any] = []
    /// Gate lue par `pushNowPlayingInfo()`. Sans elle, le premier tick de
    /// progression republierait la carte que la suspension vient d'effacer.
    var _isSuspendedBySystemCall = false
    /// Mémo de l'artwork composé (avatar + badge icône) : `pushNowPlayingInfo`
    /// tire à 4Hz — sans mémo, chaque tick relancerait la résolution d'avatar
    /// et la composition. Clé = URL d'avatar retenue ("" = icône seule).
    var _nowPlayingArtworkKey: String?
    var _nowPlayingArtwork: UIImage?
    /// Capturé À L'ENTRÉE de la suspension, avant que `PlaybackCoordinator.stopAll()`
    /// n'écrase `isPlaying`. Décide si la fin d'appel relance la lecture.
    private var _wasPlayingBeforeSystemCall = false

    private static let log = Logger(subsystem: "me.meeshy.app", category: "audio-coordinator")

    /// Beyond this elapsed time, `playPrevious()` restarts the CURRENT track
    /// (standard media-player convention) instead of jumping to the prior one.
    static let previousRestartThreshold: TimeInterval = 3.0
    /// Cap on the played-history stack (lock-screen "previous" depth).
    private static let maxHistory = 100

    // MARK: - Init

    public init(
        engine: AudioPlaybackEngineDriving = AudioPlaybackManager(),
        sessionEvents: AnyPublisher<MediaSessionCoordinator.Event, Never>? = nil
    ) {
        self.engine = engine
        // Bubble taps and lock-screen commands call the engine directly, bypassing
        // the coordinator's guards. Setting playbackPermissionGuard closes that gap
        // without the SDK ever depending on CallManager.
        if let manager = engine as? AudioPlaybackManager {
            manager.sessionProfile = .content
            manager.playbackPermissionGuard = { !CallManager.shared.isCallActiveForAudioGuard }
        }
        wireEngineForwarding()
        wireAuthLogoutHook()
        wireSocketLifecycleHooks()
        wireSessionInterruptionHooks(
            sessionEvents ?? MediaSessionCoordinator.shared.events.eraseToAnyPublisher()
        )
    }

    // MARK: - Public API

    public func play(
        current: QueuedAudio, tail: [QueuedAudio],
        conversationName: String, conversationArtworkURL: String?
    ) {
        guard !CallManager.shared.isCallActiveForAudioGuard else {
            Self.log.info("play() ignored: a CallKit call is active")
            return
        }
        queue = [current] + tail
        queueCount = queue.count
        // Fresh session: clear consumed ids so prior tracks can be replayed.
        consumedAttachmentIds = []
        history = []
        currentName = conversationName
        currentArtwork = conversationArtworkURL
        startCurrentHead()
    }

    /// Change la piste jouée pour l'attachment ACTIF (variante traduite Prisme
    /// ou retour à l'original) en CONSERVANT le contexte et la file — le
    /// sélecteur de langue du plein écran route ici pour que la carte système
    /// et l'enchaînement survivent au changement de langue.
    public func playVariant(urlString: String) {
        guard !CallManager.shared.isCallActiveForAudioGuard else { return }
        guard activeContext != nil, !urlString.isEmpty, let head = queue.first else { return }
        // Rejoue la tête avec la nouvelle URL — SANS ça, tout chemin qui
        // rejoue `queue.first.fileUrl` (ex: `resumeAfterSystemCall()` via
        // `startCurrentHead()`) ramènerait silencieusement l'audio à sa
        // langue d'origine. `QueuedAudio` est immuable : rebuild champ à
        // champ, seul `fileUrl` change. `ActiveAudioContext` ne porte pas
        // d'URL — `activeContext` reste donc identique, comme attendu.
        queue[0] = QueuedAudio(
            attachmentId: head.attachmentId,
            messageId: head.messageId,
            conversationId: head.conversationId,
            fileUrl: urlString,
            durationMs: head.durationMs,
            senderName: head.senderName,
            senderAvatarURL: head.senderAvatarURL,
            receivedAt: head.receivedAt
        )
        engine.play(urlString: urlString)
    }

    /// Fait SUIVRE la piste active à une bascule de langue (drapeau-toggle),
    /// quel que soit l'état de lecture :
    /// - en LECTURE : `playVariant` — la nouvelle piste part immédiatement,
    ///   file et carte système conservées ;
    /// - en PAUSE/arrêt : la tête de file est mise à jour et le moteur
    ///   DÉCHARGÉ (`engine.stop()`) — la reprise (`togglePlayPause` sur
    ///   moteur déchargé, ou re-tap play → `startCurrentHead`) rejoue la
    ///   NOUVELLE piste. Sans ce déchargement, la reprise ressortait
    ///   l'ancienne langue sous un karaoké déjà basculé (revue adversariale
    ///   2026-08-18). La position n'est pas transposable entre deux pistes
    ///   (durées et découpes différentes) : repartir de zéro est le
    ///   comportement honnête.
    /// No-op quand la bascule résout la piste déjà en tête (jamais de replay
    /// à zéro pour rien).
    public func syncActiveTrack(urlString: String) {
        guard activeContext != nil, !urlString.isEmpty,
              let head = queue.first, head.fileUrl != urlString else { return }
        if isPlaying {
            playVariant(urlString: urlString)
            return
        }
        queue[0] = QueuedAudio(
            attachmentId: head.attachmentId,
            messageId: head.messageId,
            conversationId: head.conversationId,
            fileUrl: urlString,
            durationMs: head.durationMs,
            senderName: head.senderName,
            senderAvatarURL: head.senderAvatarURL,
            receivedAt: head.receivedAt
        )
        engine.stop()
    }

    /// Change l'attachment ACTIF sans réinitialiser la session (nom de
    /// conversation, historique) — le plein écran route ici quand on swipe
    /// vers une AUTRE page pendant que le coordinator joue déjà la même
    /// conversation, pour que la carte système et la file de secours
    /// (« suivant ») survivent au changement de page.
    ///
    /// - Si `queued.attachmentId` est DÉJÀ dans la file : les entrées
    ///   strictement avant lui basculent en historique (permet un
    ///   `playPrevious()` cohérent), la file recommence à ce titre.
    /// - Sinon : insère `queued` en tête, l'ancienne tête devient la suivante.
    ///
    /// `currentName`/`currentArtwork` ne sont JAMAIS touchés ici — c'est ce
    /// qui garde le titre de conversation stable pendant la navigation.
    public func playKeepingQueue(_ queued: QueuedAudio) {
        guard !CallManager.shared.isCallActiveForAudioGuard else {
            Self.log.info("playKeepingQueue() ignored: a CallKit call is active")
            return
        }
        guard activeContext != nil else { return }

        if let idx = queue.firstIndex(where: { $0.attachmentId == queued.attachmentId }) {
            let skipped = queue[..<idx]
            history.append(contentsOf: skipped)
            while history.count > Self.maxHistory { history.removeFirst() }
            consumedAttachmentIds.formUnion(skipped.map(\.attachmentId))
            queue.removeFirst(idx)
        } else {
            queue.insert(queued, at: 0)
            consumedAttachmentIds.remove(queued.attachmentId)
        }
        queueCount = queue.count
        startCurrentHead()
    }

    public func togglePlayPause() {
        guard !CallManager.shared.isCallActiveForAudioGuard else {
            Self.log.info("togglePlayPause() ignored: a CallKit call is active")
            return
        }
        // Un lecteur transitoire (préversion composer, statut, réel) a pu
        // stopper le moteur via PlaybackCoordinator.willStartPlaying pendant
        // que la file restait affichée (activeContext non-nil) : le moteur n'a
        // plus de player chargé et un toggle serait un no-op silencieux — le
        // bouton play de la carte système et du mini-player serait mort.
        // Recharger la tête re-acquiert aussi la session .content (le flag
        // sessionRequested a été remis à zéro par stop()). Même piège documenté
        // sur resumeAfterSystemCall().
        if activeContext != nil, engine.currentUrl == nil {
            startCurrentHead()
            return
        }
        engine.togglePlayPause()
    }
    public func playNext() {
        // `advanceQueue()` consomme la tête de file, l'ajoute à
        // `consumedAttachmentIds` et peut nil-er `activeContext`. Sans cette
        // garde, un tap « suivant » sur la carte Control Center périmée pendant
        // un appel DÉTRUISAIT la file — les autres transports étaient gardés,
        // celui-ci ne l'était pas.
        guard !CallManager.shared.isCallActiveForAudioGuard else {
            Self.log.info("playNext() ignored: a CallKit call is active")
            return
        }
        advanceQueue()
    }

    // MARK: - Suspension pendant un appel système

    /// Suspend la publication vers les surfaces système le temps d'un appel.
    ///
    /// À appeler AVANT `PlaybackCoordinator.stopAll()` : celui-ci détruit le
    /// lecteur (`player = nil`, `isPlaying = false`), donc la capture de « la
    /// lecture était-elle en cours » doit le précéder. `@Published` émettant en
    /// `willSet`, un abonné différé par `.receive(on:)` lirait déjà `false` —
    /// d'où un push synchrone depuis `CallManager` plutôt qu'un abonnement.
    ///
    /// La file, l'historique et `activeContext` sont PRÉSERVÉS : c'est ce qui
    /// rend la reprise possible. La position, elle, est déjà persistée par
    /// `stop()` et restaurée par `applyResumePositionIfAvailable()`.
    public func suspendForSystemCall() {
        guard !_isSuspendedBySystemCall else { return }
        _isSuspendedBySystemCall = true
        _wasPlayingBeforeSystemCall = isPlaying
        // Symétrique de `close()` : si une transition de piste était en vol
        // quand l'appel Meeshy arrive, `PlaybackCoordinator.stopAll()` va
        // annuler le chargement et l'edge isPlaying==true qui termine
        // normalement ce background task ne surviendra jamais — sans cette
        // ligne, la tâche survivrait jusqu'à l'expiration OS (~30s).
        endAdvanceBackgroundTask()
        // Une interruption système armée avant l'appel (Siri, autre appel) ne
        // doit pas survivre à la frontière : sans ce reset, un
        // `.interruptionEndedShouldResume` tardif renverserait la décision de
        // `resumeAfterSystemCall()`.
        wasPlayingBeforeInterruption = false
        clearNowPlayingForSystemCall()
        setRemoteCommandsEnabled(false)
    }

    /// Rétablit les surfaces système à la fin d'un appel, et relance la lecture
    /// si elle était en cours au moment de l'interruption.
    ///
    /// La reprise passe par `startCurrentHead()` — un vrai `play(urlString:)`.
    /// `togglePlayPause()` et `seek(to:)` sont des no-op ici : `stopAll()` a mis
    /// `player` à nil et les deux gardent dessus.
    ///
    /// C'est `CallManager` qui décide QUAND appeler cette méthode (au retour à
    /// `.idle`, différé d'un tour de runloop) : le coordinateur n'a pas à
    /// connaître les états d'appel ni leurs fenêtres de settle.
    public func resumeAfterSystemCall() {
        guard _isSuspendedBySystemCall else { return }
        _isSuspendedBySystemCall = false
        setRemoteCommandsEnabled(true)

        let shouldRestart = _wasPlayingBeforeSystemCall
        _wasPlayingBeforeSystemCall = false

        guard shouldRestart, activeContext != nil else {
            pushNowPlayingForSystemCall()
            return
        }
        // Le canvas story consomme le même front de fin d'appel et coupe tout
        // autre lecteur via `PlaybackCoordinator.willStartPlaying`. S'il a repris,
        // il est prioritaire — reprendre ici les couperait mutuellement.
        guard !PlaybackCoordinator.shared.isAnyPlaying else {
            pushNowPlayingForSystemCall()
            return
        }
        startCurrentHead()
    }

    // MARK: - Interruptions système (Siri, appel cellulaire, route perdue)

    /// Armé par `.interruptionBegan` UNIQUEMENT si la lecture était en cours ;
    /// consommé par la fin d'interruption. Une pause déclenchée par un retrait
    /// d'AirPods (`routeChangedOldDeviceUnavailable`) ne l'arme PAS —
    /// convention iOS : débrancher = pause, sans reprise automatique.
    private var wasPlayingBeforeInterruption = false

    private func wireSessionInterruptionHooks(
        _ events: AnyPublisher<MediaSessionCoordinator.Event, Never>
    ) {
        events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.handleSessionEvent(event) }
            .store(in: &cancellables)
    }

    /// `internal` : appelé en synchrone par les tests, par le sink en prod.
    /// Les appels Meeshy (CallKit) ont leur propre chemin
    /// `suspendForSystemCall`/`resumeAfterSystemCall` piloté par CallManager ;
    /// pendant cette suspension, RTCAudioSession peut générer des
    /// interruptions parasites — tout est ignoré ici.
    func handleSessionEvent(_ event: MediaSessionCoordinator.Event) {
        guard !_isSuspendedBySystemCall else { return }
        guard activeContext != nil else { return }
        switch event {
        case .interruptionBegan:
            guard isPlaying else { return }
            wasPlayingBeforeInterruption = true
            engine.pause()
        case .interruptionEndedShouldResume:
            guard wasPlayingBeforeInterruption else { return }
            wasPlayingBeforeInterruption = false
            guard !CallManager.shared.isCallActiveForAudioGuard else { return }
            engine.resumeFromInterruption()
        case .interruptionEndedShouldNotResume:
            wasPlayingBeforeInterruption = false
        case .routeChangedOldDeviceUnavailable:
            // Désarme INCONDITIONNELLEMENT, avant le guard `isPlaying` : une
            // interruption déjà armée (ex. Siri en cours) ne doit pas survivre
            // à un retrait d'AirPods pendant cette même interruption — sinon
            // `.interruptionEndedShouldResume` relance la lecture alors que le
            // périphérique de sortie vient d'être débranché. Convention iOS :
            // débrancher = pause, sans reprise automatique.
            wasPlayingBeforeInterruption = false
            guard isPlaying else { return }
            engine.pause()
        case .routeChangedOther, .callEndedShouldResume:
            break
        }
    }

    /// `true` when a prior track is available to jump back to. Drives the
    /// lock-screen `previousTrackCommand` enablement.
    public var hasPrevious: Bool { !history.isEmpty }

    /// Position 0-based dans la file complète (déjà joués + courant + à venir),
    /// publiée à la carte système (`MPNowPlayingInfoPropertyPlaybackQueueIndex`).
    var queuePosition: (index: Int, count: Int) {
        (history.count, history.count + queueCount)
    }

    /// Titre de carte « {conversation} — {date} » (parité WhatsApp : la date
    /// du vocal est le repère principal quand on rattrape une file).
    nonisolated static func nowPlayingTitle(
        conversationName: String, receivedAt: Date
    ) -> String {
        "\(conversationName) — \(receivedAt.formatted(date: .numeric, time: .shortened))"
    }

    /// Lock-screen / AirPods "previous". Mirrors the standard media convention:
    /// past `previousRestartThreshold` it restarts the current track; otherwise
    /// it pops the played-history stack and re-heads the prior track. With no
    /// history it falls back to restarting the current track from 0.
    public func playPrevious() {
        guard !CallManager.shared.isCallActiveForAudioGuard else {
            Self.log.info("playPrevious() ignored: a CallKit call is active")
            return
        }
        guard activeContext != nil else { return }

        if currentTime > Self.previousRestartThreshold {
            restartCurrent()
            return
        }

        guard let previous = history.popLast() else {
            restartCurrent()
            return
        }

        // Re-insert the current head so the just-left track becomes "next"
        // again, then head the popped previous track.
        queue.insert(previous, at: 0)
        queueCount = queue.count
        consumedAttachmentIds.remove(previous.attachmentId)
        startCurrentHead()
    }

    /// Restarts the current track from the beginning. As a transport command
    /// (lock screen / AirPods), it must also RESUME playback if the engine was
    /// paused — seeking alone would leave a paused track silently rewound, so
    /// "previous" would appear to do nothing.
    private func restartCurrent() {
        engine.seek(to: 0)
        if !isPlaying { engine.togglePlayPause() }
    }

    public func close() {
        engine.stop()
        endAdvanceBackgroundTask()
        queue = []
        queueCount = 0
        history = []
        activeContext = nil
    }

    public func seek(toFraction fraction: Double) { engine.seek(to: fraction) }
    public func setSpeed(_ s: PlaybackSpeed) { engine.setSpeed(s) }
    public func cycleSpeed() { engine.cycleSpeed() }

    public func appendUpcoming(_ audio: QueuedAudio) {
        guard !queue.contains(where: { $0.attachmentId == audio.attachmentId }) else { return }
        guard !consumedAttachmentIds.contains(audio.attachmentId) else { return }
        queue.append(audio)
        queueCount = queue.count
    }

    public func isActive(attachmentId: String) -> Bool {
        activeContext?.attachmentId == attachmentId
    }

    // MARK: - Background task d'avance de file
    //
    // Entre deux pistes, le moteur peut toucher le réseau (cache miss). App en
    // background, dès que l'audio se tait, l'OS peut suspendre le process AVANT
    // le démarrage de la piste suivante — la file mourrait sur place. La
    // transition est donc couverte par un beginBackgroundTask court, terminé au
    // premier front isPlaying==true (ou à la fermeture/expiration).

    var beginBackgroundTaskProvider: (@escaping @Sendable () -> Void) -> UIBackgroundTaskIdentifier = { handler in
        UIApplication.shared.beginBackgroundTask(
            withName: "meeshy.audio.queue-advance", expirationHandler: handler
        )
    }
    var endBackgroundTaskProvider: (UIBackgroundTaskIdentifier) -> Void = { id in
        UIApplication.shared.endBackgroundTask(id)
    }
    private var advanceTaskId: UIBackgroundTaskIdentifier = .invalid

    private func beginAdvanceBackgroundTask() {
        endAdvanceBackgroundTask()
        advanceTaskId = beginBackgroundTaskProvider { [weak self] in
            Task { @MainActor in self?.endAdvanceBackgroundTask() }
        }
    }

    private func endAdvanceBackgroundTask() {
        guard advanceTaskId != .invalid else { return }
        endBackgroundTaskProvider(advanceTaskId)
        advanceTaskId = .invalid
    }

    // MARK: - Internals

    private func startCurrentHead() {
        guard !CallManager.shared.isCallActiveForAudioGuard else {
            Self.log.info("startCurrentHead() ignored: a CallKit call is active")
            // A pending advance-queue background task (opened by advanceQueue()
            // before calling this method) would otherwise never see the
            // isPlaying==true edge that normally ends it — engine.play() is never
            // reached. Ending it here covers ALL callers of startCurrentHead(),
            // not just advanceQueue().
            endAdvanceBackgroundTask()
            return
        }
        guard let head = queue.first else {
            activeContext = nil
            return
        }
        activeContext = ActiveAudioContext(
            from: head, conversationName: currentName, conversationArtworkURL: currentArtwork
        )
        engine.attachmentId = head.attachmentId
        engine.play(urlString: head.fileUrl)
    }

    private func advanceQueue() {
        // Capture before removal so the publisher reports the audio that finished,
        // not the next head.
        let finishedHead = queue.first
        if !queue.isEmpty { queue.removeFirst() }
        queueCount = queue.count
        if let finishedHead {
            // Guard against $messages re-emitting before the VM records the listen.
            consumedAttachmentIds.insert(finishedHead.attachmentId)
            history.append(finishedHead)
            if history.count > Self.maxHistory { history.removeFirst() }
            attachmentFinishedSubject.send(AttachmentFinishedEvent(
                attachmentId: finishedHead.attachmentId,
                conversationId: finishedHead.conversationId
            ))
        }
        if queue.isEmpty {
            // Stop engine explicitly — without this, audio continues after the mini-player vanishes.
            engine.stop()
            activeContext = nil
            endAdvanceBackgroundTask()
        } else {
            beginAdvanceBackgroundTask()
            startCurrentHead()
        }
    }

    private func wireEngineForwarding() {
        precondition(
            !isEngineWired,
            "wireEngineForwarding called more than once — engine forwarding subscriptions are non-cancellable, double-wiring would cause value loops"
        )
        isEngineWired = true
        engine.isPlayingPublisher.assign(to: &$isPlaying)
        engine.currentTimePublisher.assign(to: &$currentTime)
        engine.durationPublisher.assign(to: &$duration)
        engine.progressPublisher.assign(to: &$progress)
        engine.speedPublisher.assign(to: &$speed)
        engine.onPlaybackFinished = { [weak self] in
            guard let self else { return }
            Task { @MainActor in self.advanceQueue() }
        }
        engine.isPlayingPublisher
            .filter { $0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.endAdvanceBackgroundTask() }
            .store(in: &cancellables)
    }

    private func wireAuthLogoutHook() {
        AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.close() }
            .store(in: &cancellables)
    }

    private func wireSocketLifecycleHooks() {
        SocialSocketManager.shared.conversationDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] convId in
                guard let self else { return }
                if self.activeContext?.conversationId == convId { self.close() }
            }
            .store(in: &cancellables)

        MessageSocketManager.shared.messageDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                let messageId = event.messageId
                if self.activeContext?.messageId == messageId {
                    self.close()
                } else if let idx = self.queue.firstIndex(where: { $0.messageId == messageId }) {
                    self.queue.remove(at: idx)
                    self.queueCount = self.queue.count
                }
            }
            .store(in: &cancellables)
    }
}

#if DEBUG
extension ConversationAudioCoordinator {
    /// Seeds `activeContext` for tests without driving the full `play()` + queue path.
    func test_setActiveContext(
        attachmentId: String,
        conversationId: String = "test-conv",
        messageId: String = "test-msg"
    ) {
        self.activeContext = ActiveAudioContext(
            attachmentId: attachmentId,
            messageId: messageId,
            conversationId: conversationId,
            conversationName: "Test",
            conversationArtworkURL: nil,
            senderName: "S",
            senderAvatarURL: nil,
            durationMs: 1000
        )
    }

    // `nonisolated(unsafe)` so tests running on @MainActor can set it synchronously.
    nonisolated(unsafe) private static var _testOverride: ConversationAudioCoordinator?

    @MainActor
    static func testSetShared(_ instance: ConversationAudioCoordinator) {
        _testOverride = instance
    }

    @MainActor
    static func testResetShared() {
        _testOverride = nil
    }

    @MainActor
    static var sharedForTesting: ConversationAudioCoordinator {
        _testOverride ?? .shared
    }
}
#else
extension ConversationAudioCoordinator {
    @MainActor
    static var sharedForTesting: ConversationAudioCoordinator { .shared }
}
#endif
