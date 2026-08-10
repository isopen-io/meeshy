import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

@MainActor
final class ConversationAudioInterruptionTests: XCTestCase {

    private func makeSUT() -> (sut: ConversationAudioCoordinator, engine: MockAudioPlaybackEngine) {
        let engine = MockAudioPlaybackEngine()
        let sut = ConversationAudioCoordinator(engine: engine)
        sut.test_setActiveContext(attachmentId: "att-1")
        return (sut, engine)
    }

    /// Laisse le pipeline `isPlayingPublisher → @Published isPlaying` se vider.
    private func drainMainQueue() async {
        for _ in 0..<3 { await Task.yield() }
    }

    func test_interruptionBegan_whilePlaying_pausesEngine() async {
        let (sut, engine) = makeSUT()
        engine.isPlaying = true
        await drainMainQueue()

        sut.handleSessionEvent(.interruptionBegan)

        XCTAssertEqual(engine.pauseCallCount, 1)
    }

    func test_interruptionEndedShouldResume_afterBegan_resumesEngine() async {
        let (sut, engine) = makeSUT()
        engine.isPlaying = true
        await drainMainQueue()
        sut.handleSessionEvent(.interruptionBegan)
        await drainMainQueue()

        sut.handleSessionEvent(.interruptionEndedShouldResume)

        XCTAssertEqual(engine.resumeFromInterruptionCallCount, 1)
    }

    func test_interruptionEndedShouldResume_withoutBegan_doesNotResume() async {
        let (sut, engine) = makeSUT()

        sut.handleSessionEvent(.interruptionEndedShouldResume)

        XCTAssertEqual(engine.resumeFromInterruptionCallCount, 0)
    }

    func test_routeChangedOldDeviceUnavailable_pausesWithoutArmedResume() async {
        let (sut, engine) = makeSUT()
        engine.isPlaying = true
        await drainMainQueue()

        sut.handleSessionEvent(.routeChangedOldDeviceUnavailable)
        await drainMainQueue()
        sut.handleSessionEvent(.interruptionEndedShouldResume)

        XCTAssertEqual(engine.pauseCallCount, 1)
        XCTAssertEqual(engine.resumeFromInterruptionCallCount, 0)
    }

    func test_eventsIgnored_whileSuspendedByMeeshyCall() async {
        let (sut, engine) = makeSUT()
        engine.isPlaying = true
        await drainMainQueue()
        sut.suspendForSystemCall()

        sut.handleSessionEvent(.interruptionBegan)

        XCTAssertEqual(engine.pauseCallCount, 0)
    }

    func test_callEndedShouldResume_isIgnored_noDoubleResume() async {
        let (sut, engine) = makeSUT()
        engine.isPlaying = true
        await drainMainQueue()

        sut.handleSessionEvent(.callEndedShouldResume)

        XCTAssertEqual(engine.resumeFromInterruptionCallCount, 0)
        XCTAssertEqual(engine.pauseCallCount, 0)
    }
}
