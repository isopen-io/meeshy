import XCTest
@testable import Meeshy

@MainActor
final class ReelFeedAutoplayCoordinatorTests: XCTestCase {

    private func frame(_ id: String, midY: CGFloat) -> ReelFrame {
        ReelFrame(id: id, midY: midY, height: 400, kind: .video)
    }

    func test_update_setsActiveToMostCenteredReel() {
        let sut = ReelFeedAutoplayCoordinator(isCallActive: { false })
        sut.update(frames: [frame("a", midY: 100), frame("b", midY: 400)],
                   viewportMinY: 0, viewportMaxY: 800)
        XCTAssertEqual(sut.activeReelId, "b")
    }

    func test_update_whenCallActive_clearsActive() {
        var callActive = false
        let sut = ReelFeedAutoplayCoordinator(isCallActive: { callActive })
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        XCTAssertEqual(sut.activeReelId, "b")

        callActive = true
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        XCTAssertNil(sut.activeReelId)
    }

    func test_update_noVisibleReel_clearsActive() {
        let sut = ReelFeedAutoplayCoordinator(isCallActive: { false })
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        XCTAssertEqual(sut.activeReelId, "b")
        sut.update(frames: [], viewportMinY: 0, viewportMaxY: 800)
        XCTAssertNil(sut.activeReelId)
    }
}
