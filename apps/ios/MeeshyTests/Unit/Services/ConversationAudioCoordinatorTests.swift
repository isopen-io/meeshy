import XCTest
import Combine
@testable import Meeshy
import MeeshySDK
import MeeshyUI

@MainActor
final class ConversationAudioCoordinatorTests: XCTestCase {

    private var cancellables: Set<AnyCancellable>!

    override func setUp() {
        super.setUp()
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
}
