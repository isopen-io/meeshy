import Foundation
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

    public func togglePlayPause() {
        guard !CallManager.shared.isCallActiveForAudioGuard else {
            Self.log.info("togglePlayPause() ignored: a CallKit call is active")
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

    // MARK: - Internals

    private func startCurrentHead() {
        guard !CallManager.shared.isCallActiveForAudioGuard else {
            Self.log.info("startCurrentHead() ignored: a CallKit call is active")
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
        } else {
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
