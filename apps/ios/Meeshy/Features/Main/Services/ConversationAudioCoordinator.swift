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

    private static let log = Logger(subsystem: "me.meeshy.app", category: "audio-coordinator")

    /// Beyond this elapsed time, `playPrevious()` restarts the CURRENT track
    /// (standard media-player convention) instead of jumping to the prior one.
    static let previousRestartThreshold: TimeInterval = 3.0
    /// Cap on the played-history stack (lock-screen "previous" depth).
    private static let maxHistory = 100

    // MARK: - Init

    public init(engine: AudioPlaybackEngineDriving = AudioPlaybackManager()) {
        self.engine = engine
        // Bubble taps and lock-screen commands call the engine directly, bypassing
        // the coordinator's guards. Setting playbackPermissionGuard closes that gap
        // without the SDK ever depending on CallManager.
        if let manager = engine as? AudioPlaybackManager {
            manager.playbackPermissionGuard = { !CallManager.shared.isCallActiveForAudioGuard }
        }
        wireEngineForwarding()
        wireAuthLogoutHook()
        wireSocketLifecycleHooks()
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
    public func playNext() { advanceQueue() }

    /// `true` when a prior track is available to jump back to. Drives the
    /// lock-screen `previousTrackCommand` enablement.
    public var hasPrevious: Bool { !history.isEmpty }

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
