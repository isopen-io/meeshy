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
    /// BUG C — ids of attachments that have already finished/failed and been
    /// removed from the head in `advanceQueue()`. `appendUpcoming` skips these
    /// in addition to the live `queue`, closing the narrow window where a
    /// re-emitted `$messages` could re-queue a just-finished audio before the
    /// VM-side `listenedAttachmentIds` set updates. Cleared on a fresh
    /// `play(...)` so replaying a track later in a new session still works.
    private var consumedAttachmentIds: Set<String> = []
    /// Tracks already played (advanced-past) so `playPrevious()` can walk back —
    /// the queue itself is forward-only. Most-recent is `history.last`. Capped
    /// at `Self.maxHistory`; reset on a fresh `play(...)` / `close()`.
    private var history: [QueuedAudio] = []
    private var currentName: String = ""
    private var currentArtwork: String?
    private var cancellables = Set<AnyCancellable>()
    /// Defensive guard: `assign(to: &$)` does NOT auto-cancel a previous
    /// subscription. If a future refactor accidentally calls
    /// `wireEngineForwarding()` twice (e.g. after swapping engines), two
    /// publishers would race to write the same `@Published` properties and
    /// trigger value loops. The init is the single legitimate caller — any
    /// subsequent call is a programmer error and must crash in DEBUG.
    private var isEngineWired = false

    // MARK: - NowPlaying bridge state (Phase 8)
    // Accessed from `ConversationAudioCoordinator+NowPlaying.swift` (same
    // module, separate file) — internal access required so the extension can
    // read/write these. The `_` prefix signals extension-only usage.
    var _isNowPlayingActivated = false
    var _nowPlayingCancellables = Set<AnyCancellable>()
    /// Opaque tokens returned by `MPRemoteCommand.addTarget`. Stored for
    /// future `deactivateNowPlayingBridge()` symmetry — currently unused
    /// since the bridge is process-long (`activateNowPlayingBridge` is
    /// called once at root mount and never torn down). The storage locks
    /// the contract so a future deactivation path can call `removeTarget(_:)`
    /// without first re-discovering the handlers.
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
        // BUG A (round 4) — wire the app-side CallKit policy into the raw
        // engine the bubbles talk to directly (`engineForBubble`). The bubble
        // tap (and the lock-screen remote command) resolve to this concrete
        // `AudioPlaybackManager` and call `togglePlayPause()` / `play()`
        // straight on it, routing around the coordinator's own guards. Setting
        // an opaque predicate on the engine closes that gap WITHOUT the SDK
        // ever depending on `CallManager`.
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
        // BUG C — a fresh play session starts a new lifecycle: previously
        // consumed ids must be forgotten so the user can replay them.
        consumedAttachmentIds = []
        // A fresh session has no "previous" — drop the prior session's history.
        history = []
        currentName = conversationName
        currentArtwork = conversationArtworkURL
        startCurrentHead()
    }

    public func togglePlayPause() {
        // BUG E fix — same CallKit guard as `play()`. Without it, toggling
        // play on an already-loaded engine steals the VoIP audio session
        // during a call.
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
        // BUG C — also skip ids already consumed (finished/failed) this session,
        // even if they've already been removed from the live `queue`.
        guard !consumedAttachmentIds.contains(audio.attachmentId) else { return }
        queue.append(audio)
        queueCount = queue.count
    }

    public func isActive(attachmentId: String) -> Bool {
        activeContext?.attachmentId == attachmentId
    }

    // MARK: - Internals

    private func startCurrentHead() {
        // BUG E fix — guard auto-advance + initial play here (the single
        // engine-start chokepoint reached by both `play()` and
        // `advanceQueue()`). Without it, a track finishing during a call would
        // auto-advance and steal the VoIP audio session.
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
        // B1 — capture the id + conversationId of the audio leaving the
        // head BEFORE we mutate the queue so the VM-side subscribers can
        // record exactly the attachment that just finished/failed in
        // their `listenedAttachmentIds` set. Without this enrichment the
        // auto-built queues would loop on the same audios indefinitely.
        let finishedHead = queue.first
        if !queue.isEmpty { queue.removeFirst() }
        queueCount = queue.count
        if let finishedHead {
            // BUG C — record the consumed id so a re-emitted `$messages` can't
            // re-`appendUpcoming` it before the VM updates `listenedAttachmentIds`.
            consumedAttachmentIds.insert(finishedHead.attachmentId)
            // Remember the track we just left so `playPrevious()` can return to
            // it. Keep the stack bounded (drop the oldest beyond the cap).
            history.append(finishedHead)
            if history.count > Self.maxHistory { history.removeFirst() }
            attachmentFinishedSubject.send(AttachmentFinishedEvent(
                attachmentId: finishedHead.attachmentId,
                conversationId: finishedHead.conversationId
            ))
        }
        if queue.isEmpty {
            // B2 fix — when the queue empties, the engine was still alive
            // and would play the just-loaded audio to natural end while the
            // mini-player vanished. Explicitly stop it so playback halts
            // atomically with the UI dismissal.
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
    /// Test seam: directly seed `activeContext` so unit tests can exercise
    /// router/observer behavior without driving the full play() + queue
    /// machinery. `internal` + DEBUG-only so it's never reachable from a
    /// release binary. The setter writes to the same `private(set)` storage
    /// via this same-file extension, preserving production immutability.
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

    /// Storage backing the test override. `nonisolated(unsafe)` because the
    /// coordinator is `@MainActor` and we want a synchronous setter from
    /// tests already running on the main actor without crossing actor hops.
    /// The override is only read by `sharedForTesting`, also `@MainActor`.
    nonisolated(unsafe) private static var _testOverride: ConversationAudioCoordinator?

    /// Install an alternate instance as the "shared" coordinator visible to
    /// the background-transition lifecycle. Call `testResetShared()` from
    /// `tearDown` so the next test starts from a clean slate.
    @MainActor
    static func testSetShared(_ instance: ConversationAudioCoordinator) {
        _testOverride = instance
    }

    /// Drops any installed test override so production code goes back to
    /// reading the real `.shared` instance.
    @MainActor
    static func testResetShared() {
        _testOverride = nil
    }

    /// Single accessor used by the app-side background lifecycle so that
    /// tests can substitute the engine without forking the production code
    /// path. Returns the installed override when present, otherwise the
    /// canonical `.shared` instance.
    @MainActor
    static var sharedForTesting: ConversationAudioCoordinator {
        _testOverride ?? .shared
    }
}
#else
extension ConversationAudioCoordinator {
    /// Release builds never substitute the coordinator — `sharedForTesting`
    /// is a pure alias for `.shared` and the override storage doesn't exist.
    @MainActor
    static var sharedForTesting: ConversationAudioCoordinator {
        .shared
    }
}
#endif
