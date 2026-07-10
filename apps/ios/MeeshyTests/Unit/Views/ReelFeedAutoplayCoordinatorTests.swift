import XCTest
import Combine
@testable import Meeshy

@MainActor
final class ReelFeedAutoplayCoordinatorTests: XCTestCase {

    private func frame(_ id: String, midY: CGFloat) -> ReelFrame {
        ReelFrame(id: id, midY: midY, height: 400, kind: .video)
    }

    /// SUT without the default `CallManager` publisher (deterministic tests must
    /// not touch the singleton). Pass an explicit publisher where needed.
    private func makeSUT(
        isCallActive: @escaping () -> Bool = { false },
        callStatePublisher: AnyPublisher<Bool, Never>? = nil
    ) -> ReelFeedAutoplayCoordinator {
        ReelFeedAutoplayCoordinator(isCallActive: isCallActive, callStatePublisher: callStatePublisher)
    }

    /// `update()` coalesces via a ~100 ms debounce (I2), so settling requires
    /// awaiting past that window before asserting on `activeReelId`. Polls toward
    /// an expected value to stay robust against MainActor contention (app startup
    /// network/decode work can starve the debounce Task well past 100 ms).
    private func waitForActiveReel(
        _ sut: ReelFeedAutoplayCoordinator,
        toEqual expected: String?,
        timeout: TimeInterval = 2.0
    ) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if sut.activeReelId == expected { return }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    /// Awaits past the debounce window without asserting a target (used when the
    /// expected outcome is "no change" — `nil`).
    private func waitForDebounce() async {
        try? await Task.sleep(nanoseconds: 300_000_000)
    }

    func test_update_setsActiveToMostCenteredReel() async {
        let sut = makeSUT()
        sut.update(frames: [frame("a", midY: 100), frame("b", midY: 400)],
                   viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.activeReelId, "b")
    }

    func test_update_whenCallActive_clearsActiveImmediately() async {
        var callActive = false
        let sut = makeSUT(isCallActive: { callActive })
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.activeReelId, "b")

        callActive = true
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        // No debounce wait: call-active clears synchronously inside update().
        XCTAssertNil(sut.activeReelId)
    }

    func test_update_noVisibleReel_clearsActive() async {
        let sut = makeSUT()
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.activeReelId, "b")
        sut.update(frames: [], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: nil)
        XCTAssertNil(sut.activeReelId)
    }

    // MARK: - I2 — throttle / debounce

    func test_update_rapidCalls_onlyLastWins() async {
        let sut = makeSUT()
        // Rapid churn: only the final frame set should be elected (earlier tasks
        // are cancelled before they fire).
        sut.update(frames: [frame("a", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        sut.update(frames: [frame("c", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        // Before the debounce fires, nothing is elected yet.
        XCTAssertNil(sut.activeReelId)
        await waitForActiveReel(sut, toEqual: "c")
        XCTAssertEqual(sut.activeReelId, "c")
    }

    // MARK: - C1 — live call-awareness (publisher driven, no scroll)

    func test_callBecomesActive_viaPublisher_clearsActiveWithoutScroll() async {
        let subject = PassthroughSubject<Bool, Never>()
        var callActive = false
        let sut = makeSUT(isCallActive: { callActive }, callStatePublisher: subject.eraseToAnyPublisher())
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        await waitForActiveReel(sut, toEqual: "b")
        XCTAssertEqual(sut.activeReelId, "b")

        // A call starts while the feed is immobile: no further update() is called,
        // yet the publisher push must suspend autoplay.
        callActive = true
        subject.send(true)
        // sink hops to main; poll until the suspension lands.
        await waitForActiveReel(sut, toEqual: nil)
        XCTAssertNil(sut.activeReelId)
    }

    func test_clear_cancelsPendingDebounce() async {
        let sut = makeSUT()
        sut.update(frames: [frame("a", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        sut.clear()
        await waitForDebounce()
        // The pending election must not resurrect an active reel after clear().
        XCTAssertNil(sut.activeReelId)
    }
}
