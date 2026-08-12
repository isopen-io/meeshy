import XCTest
@testable import Meeshy

@MainActor
final class ReelFeedLayoutTests: XCTestCase {

    // MARK: - reelCardHeight (plafond 4:5 = 1.25, plancher 4:3 = 0.75)

    func test_reelCardHeight_verticalNineSixteen_isCappedAtFourFive() {
        // 1080x1920 (9:16, ratio 1.777) plafonné à 1.25 → 336 * 1.25 = 420
        let h = reelCardHeight(mediaWidth: 1080, mediaHeight: 1920, cardWidth: 336)
        XCTAssertEqual(h, 420, accuracy: 0.5)
    }

    func test_reelCardHeight_landscape_isFlooredAtFourThree() {
        // 1920x1080 (ratio 0.5625) plancher à 0.75 → 336 * 0.75 = 252
        let h = reelCardHeight(mediaWidth: 1920, mediaHeight: 1080, cardWidth: 336)
        XCTAssertEqual(h, 252, accuracy: 0.5)
    }

    func test_reelCardHeight_square_keepsOneToOne() {
        let h = reelCardHeight(mediaWidth: 1000, mediaHeight: 1000, cardWidth: 336)
        XCTAssertEqual(h, 336, accuracy: 0.5)
    }

    func test_reelCardHeight_unknownDimensions_usesFourFiveDefault() {
        // audio / dimensions absentes → ratio par défaut 1.25
        let h = reelCardHeight(mediaWidth: nil, mediaHeight: nil, cardWidth: 336)
        XCTAssertEqual(h, 420, accuracy: 0.5)
    }

    // MARK: - mostCenteredReel

    private func frame(_ id: String, midY: CGFloat, height: CGFloat = 400) -> ReelFrame {
        ReelFrame(id: id, midY: midY, height: height, kind: .video)
    }

    func test_mostCenteredReel_picksClosestToViewportCenter() {
        // viewport [0, 800], centre = 400
        let frames = [frame("a", midY: 200), frame("b", midY: 420), frame("c", midY: 700)]
        let id = mostCenteredReel(frames: frames, viewportMinY: 0, viewportMaxY: 800)
        XCTAssertEqual(id, "b")
    }

    func test_mostCenteredReel_excludesBarelyVisible() {
        // "a" presque hors viewport (fraction < 0.5), "b" pleinement visible
        let frames = [frame("a", midY: -150, height: 400), frame("b", midY: 400, height: 400)]
        let id = mostCenteredReel(frames: frames, viewportMinY: 0, viewportMaxY: 800)
        XCTAssertEqual(id, "b")
    }

    func test_mostCenteredReel_noFrames_returnsNil() {
        XCTAssertNil(mostCenteredReel(frames: [], viewportMinY: 0, viewportMaxY: 800))
    }
}
