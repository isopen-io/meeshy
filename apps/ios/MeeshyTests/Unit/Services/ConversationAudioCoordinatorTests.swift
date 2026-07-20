import XCTest
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
}
