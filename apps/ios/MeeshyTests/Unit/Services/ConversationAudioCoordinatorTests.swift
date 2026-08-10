import XCTest
import UIKit
import Combine
@testable import Meeshy
import MeeshySDK
import MeeshyUI

@MainActor
final class ConversationAudioCoordinatorTests: XCTestCase {

    private var cancellables: Set<AnyCancellable>!

    override func setUp() async throws {
        try await super.setUp()
        cancellables = []
    }

    private func makeQueuedAudio(
        attachmentId: String,
        conversationId: String = "conv-1",
        messageId: String = "msg-1",
        fileUrl: String = "https://cdn/a.m4a",
        senderName: String = "Alice"
    ) -> QueuedAudio {
        QueuedAudio(
            attachmentId: attachmentId,
            messageId: messageId,
            conversationId: conversationId,
            fileUrl: fileUrl,
            durationMs: 5_000,
            senderName: senderName,
            senderAvatarURL: nil,
            receivedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func makeSUT() -> (ConversationAudioCoordinator, MockAudioPlaybackEngine) {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        return (sut, engine)
    }

    func test_play_setsActiveContext_andCallsEngine() async {
        let (sut, engine) = makeSUT()
        let current = makeQueuedAudio(attachmentId: "a1")
        sut.play(current: current, tail: [], conversationName: "Team", conversationArtworkURL: nil)
        await Task.yield()
        XCTAssertEqual(sut.activeContext?.attachmentId, "a1")
        XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/a.m4a")
        XCTAssertEqual(engine.playCallCount, 1)
    }

    func test_play_buildsQueueWithTail_publishesQueueCount() {
        let (sut, _) = makeSUT()
        let current = makeQueuedAudio(attachmentId: "a1")
        let tail = [makeQueuedAudio(attachmentId: "a2"), makeQueuedAudio(attachmentId: "a3")]
        sut.play(current: current, tail: tail, conversationName: "T", conversationArtworkURL: nil)
        XCTAssertEqual(sut.queueCount, 3)
    }

    func test_play_whileCallActive_isNoOp() {
        let (sut, engine) = makeSUT()
        CallManager.shared.testOverrideCallActive = true
        defer { CallManager.shared.testOverrideCallActive = false }

        let current = makeQueuedAudio(attachmentId: "a1")
        sut.play(current: current, tail: [], conversationName: "T", conversationArtworkURL: nil)
        XCTAssertNil(sut.activeContext)
        XCTAssertEqual(engine.playCallCount, 0)
    }

    func test_playVariant_swapsUrl_keepsContextAndQueue() {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        let now = Date()
        let make = { (id: String) in
            QueuedAudio(attachmentId: id, messageId: "m-\(id)", conversationId: "c",
                        fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                        senderName: "S", senderAvatarURL: nil, receivedAt: now)
        }
        sut.play(current: make("a"), tail: [make("b")],
                 conversationName: "Conv", conversationArtworkURL: nil)
        let contextBefore = sut.activeContext

        sut.playVariant(urlString: "https://x/a-es.m4a")

        XCTAssertEqual(engine.lastPlayedUrl, "https://x/a-es.m4a")
        XCTAssertEqual(sut.activeContext, contextBefore)
        XCTAssertEqual(sut.queueCount, 2)
    }

    func test_playVariant_withoutActiveContext_isNoOp() {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)

        sut.playVariant(urlString: "https://x/a-es.m4a")

        XCTAssertEqual(engine.playCallCount, 0)
    }

    /// Régression : `resumeAfterSystemCall()` rejoue `queue.first.fileUrl` via
    /// `startCurrentHead()`. Sans reconstruire la tête de file avec l'URL de la
    /// variante, `playVariant` était annulé par tout chemin qui rejoue la tête —
    /// la reprise d'appel ramenait l'audio à sa langue d'origine.
    func test_playVariant_survivesSystemCallResume() async {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        let now = Date()
        let make = { (id: String) in
            QueuedAudio(attachmentId: id, messageId: "m-\(id)", conversationId: "c",
                        fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                        senderName: "S", senderAvatarURL: nil, receivedAt: now)
        }
        sut.play(current: make("a"), tail: [make("b")],
                 conversationName: "Conv", conversationArtworkURL: nil)

        sut.playVariant(urlString: "https://x/a-es.m4a")
        engine.isPlaying = true
        await Task.yield()

        sut.suspendForSystemCall()
        sut.resumeAfterSystemCall()

        XCTAssertEqual(engine.lastPlayedUrl, "https://x/a-es.m4a")
    }

    // MARK: - playKeepingQueue

    func test_playKeepingQueue_targetInQueue_preservesNameAndTail() {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        let now = Date()
        let make = { (id: String) in
            QueuedAudio(attachmentId: id, messageId: "m-\(id)", conversationId: "c",
                        fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                        senderName: "S", senderAvatarURL: nil, receivedAt: now)
        }
        let b = make("b")
        sut.play(current: make("a"), tail: [b, make("c")],
                 conversationName: "Conv", conversationArtworkURL: nil)

        sut.playKeepingQueue(b)

        XCTAssertEqual(sut.activeContext?.attachmentId, "b")
        XCTAssertEqual(sut.queueCount, 2)
        XCTAssertEqual(sut.activeContext?.conversationName, "Conv")
        XCTAssertTrue(sut.hasPrevious)
    }

    func test_playKeepingQueue_targetNotInQueue_insertsAtHead() {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        let now = Date()
        let make = { (id: String) in
            QueuedAudio(attachmentId: id, messageId: "m-\(id)", conversationId: "c",
                        fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                        senderName: "S", senderAvatarURL: nil, receivedAt: now)
        }
        sut.play(current: make("a"), tail: [make("b")],
                 conversationName: "Conv", conversationArtworkURL: nil)
        let x = make("x")

        sut.playKeepingQueue(x)

        XCTAssertEqual(sut.activeContext?.attachmentId, "x")
        XCTAssertEqual(sut.queueCount, 3)
        XCTAssertEqual(sut.activeContext?.conversationName, "Conv")
    }

    func test_playKeepingQueue_withoutActiveContext_isNoOp() {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        let x = QueuedAudio(attachmentId: "x", messageId: "m-x", conversationId: "c",
                             fileUrl: "https://x/x.m4a", durationMs: 1000,
                             senderName: "S", senderAvatarURL: nil, receivedAt: Date())

        sut.playKeepingQueue(x)

        XCTAssertEqual(engine.playCallCount, 0)
    }

    func test_engineFinished_advancesQueue_playsNext() async {
        let (sut, engine) = makeSUT()
        let current = makeQueuedAudio(attachmentId: "a1", fileUrl: "https://cdn/a1.m4a")
        let next = makeQueuedAudio(attachmentId: "a2", fileUrl: "https://cdn/a2.m4a")
        sut.play(current: current, tail: [next], conversationName: "T", conversationArtworkURL: nil)
        XCTAssertEqual(engine.playCallCount, 1)
        engine.simulateFinishPlayback()
        await Task.yield()
        XCTAssertEqual(sut.activeContext?.attachmentId, "a2")
        XCTAssertEqual(engine.playCallCount, 2)
        XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/a2.m4a")
    }

    func test_engineFinished_emptyQueue_clearsActiveContext() async {
        let (sut, engine) = makeSUT()
        let current = makeQueuedAudio(attachmentId: "a1")
        sut.play(current: current, tail: [], conversationName: "T", conversationArtworkURL: nil)
        XCTAssertNotNil(sut.activeContext)
        engine.simulateFinishPlayback()
        await Task.yield()
        XCTAssertNil(sut.activeContext)
        XCTAssertEqual(sut.queueCount, 0)
    }

    func test_appendUpcoming_idempotent_byAttachmentId() {
        let (sut, _) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        XCTAssertEqual(sut.queueCount, 1)
        sut.appendUpcoming(makeQueuedAudio(attachmentId: "a2"))
        sut.appendUpcoming(makeQueuedAudio(attachmentId: "a2"))
        XCTAssertEqual(sut.queueCount, 2)
    }

    func test_appendUpcoming_increasesQueueCount() {
        let (sut, _) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        sut.appendUpcoming(makeQueuedAudio(attachmentId: "a2"))
        sut.appendUpcoming(makeQueuedAudio(attachmentId: "a3"))
        XCTAssertEqual(sut.queueCount, 3)
    }

    func test_playNext_skipsToFollowingAudio() async {
        let (sut, engine) = makeSUT()
        let next = makeQueuedAudio(attachmentId: "a2", fileUrl: "https://cdn/a2.m4a")
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [next],
                 conversationName: "T", conversationArtworkURL: nil)
        sut.playNext()
        await Task.yield()
        XCTAssertEqual(sut.activeContext?.attachmentId, "a2")
        XCTAssertEqual(engine.playCallCount, 2)
    }

    func test_close_stopsEngine_clearsQueueAndContext() {
        let (sut, engine) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"),
                 tail: [makeQueuedAudio(attachmentId: "a2")],
                 conversationName: "T", conversationArtworkURL: nil)
        sut.close()
        XCTAssertNil(sut.activeContext)
        XCTAssertEqual(sut.queueCount, 0)
        XCTAssertEqual(engine.stopCallCount, 1)
    }

    func test_authLogout_triggersClose() async {
        let (sut, engine) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        XCTAssertNotNil(sut.activeContext)

        // Forcer la valeur initiale a true puis a false pour declencher le filter !$0
        AuthManager.shared.isAuthenticated = true
        AuthManager.shared.isAuthenticated = false
        // Combine sink dispatched via DispatchQueue.main → laisse 2 ticks
        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertNil(sut.activeContext)
        XCTAssertEqual(engine.stopCallCount, 1)
    }

    func test_play_secondCall_resetsQueueToNewConv() {
        let (sut, _) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1", conversationId: "conv-A"),
                 tail: [makeQueuedAudio(attachmentId: "a2", conversationId: "conv-A")],
                 conversationName: "A", conversationArtworkURL: nil)
        XCTAssertEqual(sut.queueCount, 2)
        sut.play(current: makeQueuedAudio(attachmentId: "b1", conversationId: "conv-B"),
                 tail: [], conversationName: "B", conversationArtworkURL: nil)
        XCTAssertEqual(sut.queueCount, 1)
        XCTAssertEqual(sut.activeContext?.conversationId, "conv-B")
    }

    func test_setSpeed_propagatesToEngine() {
        let (sut, engine) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        sut.setSpeed(.x1_5)
        XCTAssertEqual(engine.setSpeedCalls, [.x1_5])
        XCTAssertEqual(engine.speed, .x1_5)
    }

    // MARK: - B5 — Engine load failure advances the queue

    /// When `AudioPlaybackManager.play(urlString:)` cannot fetch the audio
    /// (404 CDN, offline, malformed URL), the engine MUST fire
    /// `onPlaybackFinished` so the coordinator advances past the broken
    /// head. Without that, the queue stalls indefinitely on the failed
    /// audio and the mini-player stays frozen on its loading spinner.
    func test_engineLoadFailure_advancesQueue() async {
        let (sut, engine) = makeSUT()
        let head = makeQueuedAudio(attachmentId: "a1", fileUrl: "https://cdn/a1.m4a")
        let next = makeQueuedAudio(attachmentId: "a2", fileUrl: "https://cdn/a2.m4a")
        sut.play(current: head, tail: [next], conversationName: "T", conversationArtworkURL: nil)
        XCTAssertEqual(engine.playCallCount, 1)

        engine.simulateLoadFailure()
        await Task.yield()

        XCTAssertEqual(sut.activeContext?.attachmentId, "a2",
                       "queue must advance to the next audio when the head fails to load")
        XCTAssertEqual(engine.playCallCount, 2)
    }

    /// Same as above but with an empty tail — the failure on the last audio
    /// must clear `activeContext` so the mini-player disappears rather than
    /// spinning forever on a stuck head.
    func test_engineLoadFailure_emptyQueue_clearsActiveContext() async {
        let (sut, engine) = makeSUT()
        let head = makeQueuedAudio(attachmentId: "a1", fileUrl: "https://cdn/a1.m4a")
        sut.play(current: head, tail: [], conversationName: "T", conversationArtworkURL: nil)
        XCTAssertNotNil(sut.activeContext)

        engine.simulateLoadFailure()
        await Task.yield()

        XCTAssertNil(sut.activeContext)
    }

    // MARK: - B2 — Empty-queue advance stops the engine

    /// When the user taps "next" on the last queued audio, the coordinator
    /// MUST call `engine.stop()`. Before the fix, only `activeContext`
    /// was cleared — the underlying engine kept playing until natural end,
    /// so the mini-player disappeared while audio continued in the
    /// background. Asserted via `MockAudioPlaybackEngine.stopCallCount`.
    func test_playNext_lastAudio_stopsEngine() {
        let (sut, engine) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        let baseline = engine.stopCallCount
        sut.playNext()
        XCTAssertNil(sut.activeContext)
        XCTAssertEqual(engine.stopCallCount, baseline + 1,
                       "advancing past the last queued audio must stop the engine")
    }

    // MARK: - B1 — attachmentFinishedPublisher

    /// The coordinator MUST emit an `AttachmentFinishedEvent` exactly once
    /// — with the id + conversationId of the audio that just finished —
    /// BEFORE advancing the queue. Each `ConversationViewModel` subscribes
    /// to this publisher and filters by `conversationId` to enrich its
    /// `listenedAttachmentIds`. Replaces the legacy mutable
    /// `onAttachmentFinished` closure which let the most-recent VM stomp
    /// on the previous subscriber (cross-VM pollution).
    func test_engineFinished_firesAttachmentFinishedPublisherWithFinishedId() async {
        let (sut, engine) = makeSUT()
        var notified: [ConversationAudioCoordinator.AttachmentFinishedEvent] = []
        sut.attachmentFinishedPublisher
            .sink { event in notified.append(event) }
            .store(in: &cancellables)
        let head = makeQueuedAudio(attachmentId: "a1", conversationId: "conv-1", fileUrl: "https://cdn/a1.m4a")
        let next = makeQueuedAudio(attachmentId: "a2", conversationId: "conv-1", fileUrl: "https://cdn/a2.m4a")
        sut.play(current: head, tail: [next], conversationName: "T", conversationArtworkURL: nil)

        engine.simulateFinishPlayback()
        await Task.yield()

        XCTAssertEqual(notified.map(\.attachmentId), ["a1"],
                       "must report exactly the finished head id, not the next one")
        XCTAssertEqual(notified.map(\.conversationId), ["conv-1"],
                       "event must carry the conversationId of the finished audio")
        XCTAssertEqual(sut.activeContext?.attachmentId, "a2")
    }

    /// Same publisher contract for the failure path: the broken head id is
    /// reported via `attachmentFinishedPublisher` (so subscribed VMs still
    /// mark it as listened — equivalent to "do not retry this in auto-builds").
    func test_engineLoadFailure_firesAttachmentFinishedPublisherWithBrokenId() async {
        let (sut, engine) = makeSUT()
        var notified: [ConversationAudioCoordinator.AttachmentFinishedEvent] = []
        sut.attachmentFinishedPublisher
            .sink { event in notified.append(event) }
            .store(in: &cancellables)
        let head = makeQueuedAudio(attachmentId: "broken", conversationId: "conv-1", fileUrl: "https://cdn/broken.m4a")
        sut.play(current: head, tail: [], conversationName: "T", conversationArtworkURL: nil)

        engine.simulateLoadFailure()
        await Task.yield()

        XCTAssertEqual(notified.map(\.attachmentId), ["broken"])
        XCTAssertEqual(notified.map(\.conversationId), ["conv-1"])
    }

    // MARK: - engineForBubble contract (mock coverage gap)

    /// `engineForBubble` casts the protocol-bound engine to the concrete
    /// `AudioPlaybackManager`. The cast succeeds only when the coordinator
    /// owns a real manager — production behaviour. This test pins the
    /// contract so a future protocol refactor that breaks the cast surfaces
    /// here (the bubble would otherwise silently lose its external-engine
    /// binding and fall back to a per-bubble owned engine).
    func test_engineForBubble_returnsManager_whenEngineIsRealAudioPlaybackManager() {
        let realEngine = AudioPlaybackManager(registerWithCoordinator: false)
        let coordinator = ConversationAudioCoordinator(engine: realEngine)
        XCTAssertNotNil(coordinator.engineForBubble,
                        "engineForBubble must expose the concrete AudioPlaybackManager backing the coordinator")
        XCTAssertTrue(coordinator.engineForBubble === realEngine,
                      "engineForBubble must return the exact instance, not a clone")
    }

    /// Documents the mock case: with a `MockAudioPlaybackEngine` the cast
    /// fails and `engineForBubble` returns nil. Bubbles in this case must
    /// route through the protocol-level coordinator API (toggle/seek/etc.)
    /// rather than expecting the manager handle.
    func test_engineForBubble_returnsNil_whenEngineIsMock() {
        let mockEngine = MockAudioPlaybackEngine()
        let coordinator = ConversationAudioCoordinator(engine: mockEngine)
        XCTAssertNil(coordinator.engineForBubble,
                     "engineForBubble must be nil under a mock engine — the cast to AudioPlaybackManager fails")
    }

    // MARK: - playPrevious — Now Playing "previous track"

    /// Past the restart threshold, `playPrevious()` restarts the CURRENT track
    /// (standard media-player convention): it seeks to 0 and does NOT start a
    /// different audio.
    func test_playPrevious_pastThreshold_restartsCurrentTrack() async {
        let (sut, engine) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1", fileUrl: "https://cdn/a1.m4a"),
                 tail: [], conversationName: "T", conversationArtworkURL: nil)
        let playsBefore = engine.playCallCount
        engine.duration = 30
        engine.currentTime = ConversationAudioCoordinator.previousRestartThreshold + 1
        await Task.yield()

        sut.playPrevious()
        await Task.yield()

        XCTAssertEqual(engine.seekFractions.last, 0)
        XCTAssertEqual(engine.playCallCount, playsBefore,
                       "restart must not start a different track")
        XCTAssertEqual(sut.activeContext?.attachmentId, "a1")
    }

    /// A transport "previous" must RESUME playback, not just rewind: past the
    /// threshold while paused, `playPrevious()` seeks to 0 AND restarts the
    /// engine (otherwise the lock-screen button appears to do nothing).
    func test_playPrevious_pastThreshold_whilePaused_resumesPlayback() async {
        let (sut, engine) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1", fileUrl: "https://cdn/a1.m4a"),
                 tail: [], conversationName: "T", conversationArtworkURL: nil)
        engine.duration = 30
        engine.currentTime = ConversationAudioCoordinator.previousRestartThreshold + 1
        engine.isPlaying = false   // user paused on the lock screen
        await Task.yield()

        let togglesBefore = engine.togglePlayPauseCallCount
        sut.playPrevious()
        await Task.yield()

        XCTAssertEqual(engine.seekFractions.last, 0)
        XCTAssertEqual(engine.togglePlayPauseCallCount, togglesBefore + 1,
                       "restart while paused must resume playback")
    }

    /// Below the threshold with history present, `playPrevious()` re-heads the
    /// previously played track and keeps the just-left one available as next.
    func test_playPrevious_belowThreshold_replaysPreviousTrack() async {
        let (sut, engine) = makeSUT()
        let a1 = makeQueuedAudio(attachmentId: "a1", fileUrl: "https://cdn/a1.m4a")
        let a2 = makeQueuedAudio(attachmentId: "a2", fileUrl: "https://cdn/a2.m4a")
        sut.play(current: a1, tail: [a2], conversationName: "T", conversationArtworkURL: nil)

        sut.playNext()              // advance a1 -> a2, pushing a1 onto history
        await Task.yield()
        XCTAssertEqual(sut.activeContext?.attachmentId, "a2")

        engine.duration = 30
        engine.currentTime = 1      // below threshold
        await Task.yield()

        let playsBefore = engine.playCallCount
        sut.playPrevious()
        await Task.yield()

        XCTAssertEqual(sut.activeContext?.attachmentId, "a1",
                       "previous must re-head the prior track")
        XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/a1.m4a")
        XCTAssertEqual(engine.playCallCount, playsBefore + 1)
        XCTAssertFalse(sut.hasPrevious, "history is consumed by stepping back")
    }

    /// With no history (still on the first track), below-threshold
    /// `playPrevious()` falls back to restarting the current track.
    func test_playPrevious_noHistory_restartsCurrentTrack() async {
        let (sut, engine) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1", fileUrl: "https://cdn/a1.m4a"),
                 tail: [], conversationName: "T", conversationArtworkURL: nil)
        let playsBefore = engine.playCallCount
        engine.duration = 30
        engine.currentTime = 1
        await Task.yield()

        sut.playPrevious()
        await Task.yield()

        XCTAssertEqual(engine.seekFractions.last, 0)
        XCTAssertEqual(engine.playCallCount, playsBefore)
        XCTAssertEqual(sut.activeContext?.attachmentId, "a1")
    }

    func test_hasPrevious_falseInitially_trueAfterAdvance() async {
        let (sut, _) = makeSUT()
        let a1 = makeQueuedAudio(attachmentId: "a1", fileUrl: "https://cdn/a1.m4a")
        let a2 = makeQueuedAudio(attachmentId: "a2", fileUrl: "https://cdn/a2.m4a")
        sut.play(current: a1, tail: [a2], conversationName: "T", conversationArtworkURL: nil)
        XCTAssertFalse(sut.hasPrevious)

        sut.playNext()
        await Task.yield()
        XCTAssertTrue(sut.hasPrevious)
    }

    // MARK: - consumedAttachmentIds invariant

    /// `appendUpcoming` must silently skip an id that `advanceQueue` already
    /// consumed this session. Without this guard a $messages re-emission could
    /// add a just-finished audio back into the tail before the VM's
    /// `listenedAttachmentIds` set updates, looping the queue indefinitely.
    func test_appendUpcoming_skipsConsumedAttachmentId() async {
        let (sut, _) = makeSUT()
        sut.play(
            current: makeQueuedAudio(attachmentId: "a1"),
            tail: [makeQueuedAudio(attachmentId: "a2")],
            conversationName: "T", conversationArtworkURL: nil
        )
        sut.playNext()      // a1 leaves head, enters consumedAttachmentIds
        await Task.yield()
        XCTAssertEqual(sut.queueCount, 1)

        sut.appendUpcoming(makeQueuedAudio(attachmentId: "a1"))
        XCTAssertEqual(sut.queueCount, 1, "consumed id must not be re-queued")
    }

    /// A fresh `play()` call clears the consumed-id set so tracks from a prior
    /// session can be replayed.
    func test_freshPlay_clearsConsumedIds_allowsPriorTrackReappend() async {
        let (sut, _) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        sut.playNext()      // a1 consumed
        await Task.yield()

        // New session — a1 must be appendable again
        sut.play(current: makeQueuedAudio(attachmentId: "b1"), tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        sut.appendUpcoming(makeQueuedAudio(attachmentId: "a1"))
        XCTAssertEqual(sut.queueCount, 2, "fresh play() must clear consumed ids")
    }

    /// After `playPrevious()` re-inserts a prior track as the new head, its id
    /// must be removed from the consumed set so the queue can advance through
    /// it again (otherwise the re-advanced track would be permanently skipped by
    /// a subsequent `appendUpcoming`).
    func test_playPrevious_removesIdFromConsumed_allowsSubsequentAdvance() async {
        let (sut, engine) = makeSUT()
        let a1 = makeQueuedAudio(attachmentId: "a1")
        let a2 = makeQueuedAudio(attachmentId: "a2")
        sut.play(current: a1, tail: [a2], conversationName: "T", conversationArtworkURL: nil)

        sut.playNext()      // a1 consumed, a2 active
        await Task.yield()
        XCTAssertEqual(sut.activeContext?.attachmentId, "a2")

        engine.duration = 30
        engine.currentTime = 1      // below previousRestartThreshold
        await Task.yield()

        sut.playPrevious()          // pops a1 from history, removes from consumed
        await Task.yield()
        XCTAssertEqual(sut.activeContext?.attachmentId, "a1")

        // Advance past a1 a second time — should emit normally and not be blocked
        var finished: [String] = []
        sut.attachmentFinishedPublisher
            .sink { finished.append($0.attachmentId) }
            .store(in: &cancellables)
        sut.playNext()
        await Task.yield()
        XCTAssertEqual(finished, ["a1"], "a1 must be re-consumable after playPrevious")
    }

    // MARK: - CallKit guard — togglePlayPause and playPrevious

    func test_togglePlayPause_whileCallActive_isNoOp() {
        let (sut, engine) = makeSUT()
        sut.play(current: makeQueuedAudio(attachmentId: "a1"), tail: [],
                 conversationName: "T", conversationArtworkURL: nil)
        CallManager.shared.testOverrideCallActive = true
        defer { CallManager.shared.testOverrideCallActive = false }

        sut.togglePlayPause()
        XCTAssertEqual(engine.togglePlayPauseCallCount, 0,
                       "togglePlayPause must be a no-op while a CallKit call is active")
    }

    func test_playPrevious_whileCallActive_isNoOp() async {
        let (sut, engine) = makeSUT()
        let a1 = makeQueuedAudio(attachmentId: "a1")
        let a2 = makeQueuedAudio(attachmentId: "a2")
        sut.play(current: a1, tail: [a2], conversationName: "T", conversationArtworkURL: nil)
        sut.playNext()
        await Task.yield()
        XCTAssertEqual(sut.activeContext?.attachmentId, "a2")
        let playsBefore = engine.playCallCount

        CallManager.shared.testOverrideCallActive = true
        defer { CallManager.shared.testOverrideCallActive = false }

        sut.playPrevious()
        await Task.yield()
        XCTAssertEqual(sut.activeContext?.attachmentId, "a2",
                       "playPrevious must not change track while a CallKit call is active")
        XCTAssertEqual(engine.playCallCount, playsBefore)
    }

    // MARK: - AudioSessionProfile — Now Playing eligibility

    /// The coordinator's default engine must opt into `.content` session profile
    /// so that Now Playing and lock-screen controls are eligible (vs. transient
    /// for UI sounds, alerts, etc.). Production engine: `AudioPlaybackManager()`
    /// defaults `.transient`, so the coordinator explicitly sets `.content`.
    func test_init_defaultEngine_optsIntoContentSessionProfile() {
        let coordinator = ConversationAudioCoordinator()
        XCTAssertEqual(coordinator.engineForBubble?.sessionProfile, .content)
    }

    // MARK: - Task 4 — Now Playing enriched card

    func test_nowPlayingTitle_containsConversationAndDate() {
        let date = Date(timeIntervalSince1970: 1_754_000_000)
        let title = ConversationAudioCoordinator.nowPlayingTitle(
            conversationName: "Ashley", receivedAt: date
        )
        XCTAssertTrue(title.hasPrefix("Ashley — "))
        XCTAssertGreaterThan(title.count, "Ashley — ".count)
    }

    func test_queuePosition_advancesWithHistory() {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        let now = Date()
        let make = { (id: String) in
            QueuedAudio(attachmentId: id, messageId: "m-\(id)", conversationId: "c",
                        fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                        senderName: "S", senderAvatarURL: nil, receivedAt: now)
        }
        sut.play(current: make("a"), tail: [make("b"), make("c")],
                 conversationName: "Conv", conversationArtworkURL: nil)
        XCTAssertEqual(sut.queuePosition.index, 0)
        XCTAssertEqual(sut.queuePosition.count, 3)

        sut.playNext()
        XCTAssertEqual(sut.queuePosition.index, 1)
        XCTAssertEqual(sut.queuePosition.count, 3)
    }

    // MARK: - Task 6 — Background task covers queue-advance transition

    /// Drains the main queue via an `expectation` + `DispatchQueue.main.async` —
    /// `advanceQueue()` runs inside `Task { @MainActor … }` from
    /// `onPlaybackFinished`, so a synchronous assertion right after
    /// `simulateFinishPlayback()` can observe stale state before that hop runs.
    private func drainMainQueue() {
        let exp = expectation(description: "drain main queue")
        DispatchQueue.main.async { exp.fulfill() }
        wait(for: [exp], timeout: 1.0)
    }

    /// Strengthened per code review: the begin stub now returns INCREASING
    /// identifiers (a fixed `rawValue: 42` stub cannot distinguish "some end was
    /// called" from "the end call was paired with the correct begin"), and the
    /// end stub RECORDS every identifier it receives so the test can assert
    /// exact begin/end pairing, not just call counts.
    func test_advanceQueue_wrapsNextTrackStartInBackgroundTask() {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        var nextRawId: UIBackgroundTaskIdentifier.RawValue = 1
        var beganIds: [UIBackgroundTaskIdentifier] = []
        var endedIds: [UIBackgroundTaskIdentifier] = []
        sut.beginBackgroundTaskProvider = { _ in
            let id = UIBackgroundTaskIdentifier(rawValue: nextRawId)
            nextRawId += 1
            beganIds.append(id)
            return id
        }
        sut.endBackgroundTaskProvider = { id in endedIds.append(id) }

        let now = Date()
        let make = { (id: String) in
            QueuedAudio(attachmentId: id, messageId: "m-\(id)", conversationId: "c",
                        fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                        senderName: "S", senderAvatarURL: nil, receivedAt: now)
        }
        sut.play(current: make("a"), tail: [make("b")],
                 conversationName: "Conv", conversationArtworkURL: nil)

        engine.simulateFinishPlayback()   // fin de « a » → advanceQueue → play(« b »)

        drainMainQueue()
        XCTAssertEqual(beganIds.count, 1, "La transition a→b doit être couverte par un background task")
        // Le mock repasse isPlaying=true dans play() → la fin de tâche est
        // déclenchée par le sink isPlayingPublisher (asynchrone MainActor).
        drainMainQueue()
        XCTAssertEqual(endedIds, beganIds,
                       "le end doit recevoir EXACTEMENT l'identifiant du dernier begin, pas un identifiant arbitraire")
    }

    /// Code review finding: the two-advance case with NO intervening
    /// `isPlaying==true` edge (e.g. degraded network — the engine never actually
    /// reports having started before the next transition fires) must still end
    /// the FIRST task before beginning the second — `beginAdvanceBackgroundTask()`
    /// calls `endAdvanceBackgroundTask()` defensively before requesting a new id.
    /// `engine.autoPlayOnPlayCall = false` neutralizes the mock's `play()` (which
    /// normally flips `isPlaying = true`, see `MockAudioPlaybackEngine.swift`) so
    /// the `isPlayingPublisher` sink never fires between the two advances — this
    /// isolates `beginAdvanceBackgroundTask()`'s own pairing logic from that sink.
    /// This test is a characterization test: `beginAdvanceBackgroundTask()`
    /// already called `endAdvanceBackgroundTask()` unconditionally before Task 6's
    /// review, so this passes on the existing implementation — it pins the
    /// contract against regression rather than proving a fix.
    func test_advanceQueue_twoAdvancesWithoutIsPlayingEdge_endsPriorTaskBeforeNextBegin() {
        let engine = MockAudioPlaybackEngine()
        engine.autoPlayOnPlayCall = false
        let sut = ConversationAudioCoordinator(engine: engine)
        var nextRawId: UIBackgroundTaskIdentifier.RawValue = 1
        var trace: [String] = []
        sut.beginBackgroundTaskProvider = { _ in
            let id = UIBackgroundTaskIdentifier(rawValue: nextRawId)
            nextRawId += 1
            trace.append("begin:\(id.rawValue)")
            return id
        }
        sut.endBackgroundTaskProvider = { id in trace.append("end:\(id.rawValue)") }

        let now = Date()
        let make = { (id: String) in
            QueuedAudio(attachmentId: id, messageId: "m-\(id)", conversationId: "c",
                        fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                        senderName: "S", senderAvatarURL: nil, receivedAt: now)
        }
        sut.play(current: make("a"), tail: [make("b"), make("c")],
                 conversationName: "Conv", conversationArtworkURL: nil)

        engine.simulateFinishPlayback()   // a → b : begin #1 ; isPlaying suppressed, no end via sink
        drainMainQueue()
        engine.simulateFinishPlayback()   // b → c : begin #2, but must end #1 FIRST (defensive cleanup)
        drainMainQueue()

        XCTAssertEqual(trace, ["begin:1", "end:1", "begin:2"],
                       "begin #2 must be preceded by ending exactly the id opened by begin #1")
    }

    /// Code review finding 1: `advanceQueue()` calls `beginAdvanceBackgroundTask()`
    /// unconditionally before `startCurrentHead()`, but `startCurrentHead()`'s
    /// FIRST statement is the CallKit guard — if a track finishes while a Meeshy
    /// call is active, the task was opened but `engine.play()` is never reached,
    /// so the `isPlaying==true` sink never fires and nothing ever ends the task
    /// (only the ~30s OS expiration eventually would). Fix: the CallKit guard's
    /// `else` branch in `startCurrentHead()` now ends the pending task before
    /// returning — this covers ALL callers of `startCurrentHead()`, not just
    /// `advanceQueue()`. Verified via the `testOverrideCallActive` DEBUG seam
    /// already used by `test_play_whileCallActive_isNoOp` etc.
    func test_startCurrentHead_whileCallActive_endsPendingBackgroundTask() {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        var beginCount = 0
        var endCount = 0
        sut.beginBackgroundTaskProvider = { _ in
            beginCount += 1
            return UIBackgroundTaskIdentifier(rawValue: 7)
        }
        sut.endBackgroundTaskProvider = { _ in endCount += 1 }

        let now = Date()
        let make = { (id: String) in
            QueuedAudio(attachmentId: id, messageId: "m-\(id)", conversationId: "c",
                        fileUrl: "https://x/\(id).m4a", durationMs: 1000,
                        senderName: "S", senderAvatarURL: nil, receivedAt: now)
        }
        sut.play(current: make("a"), tail: [make("b")],
                 conversationName: "Conv", conversationArtworkURL: nil)
        let playsBefore = engine.playCallCount

        CallManager.shared.testOverrideCallActive = true
        defer { CallManager.shared.testOverrideCallActive = false }

        engine.simulateFinishPlayback()   // a finishes mid-call → advanceQueue → begin, then startCurrentHead blocked
        drainMainQueue()
        drainMainQueue()

        XCTAssertEqual(beginCount, 1, "the transition still opens a background task before hitting the CallKit guard")
        XCTAssertEqual(engine.playCallCount, playsBefore,
                       "engine.play() must never be reached while a CallKit call is active")
        XCTAssertEqual(endCount, 1,
                       "the CallKit guard's early return must end the task it cannot hand off to the isPlaying sink")
    }
}
