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

    // MARK: - #iPad — la carte se mesure à SA colonne, jamais à la fenêtre

    /// Le rapport largeur / hauteur de la carte : la même loi que `reelCardHeight`, sans largeur à deviner — la carte
    /// en déduit sa hauteur de SA largeur réelle (colonne d'iPad, fenêtre détachée, Split View).
    func test_aspectRatio_isTheSameLawAsTheHeight_atAnyWidth() {
        for width: CGFloat in [343, 420, 700] {
            let ratio = reelCardAspectRatio(mediaWidth: 1080, mediaHeight: 1920)
            XCTAssertEqual(width / ratio, reelCardHeight(mediaWidth: 1080, mediaHeight: 1920, cardWidth: width), accuracy: 1)
        }
        XCTAssertEqual(reelCardAspectRatio(mediaWidth: nil, mediaHeight: nil), 1 / 1.25, accuracy: 0.0001)
        XCTAssertEqual(reelCardAspectRatio(mediaWidth: 1920, mediaHeight: 1080), 1 / 0.75, accuracy: 0.0001)
    }

    /// 11" en paysage : une colonne de ~420 pt recevait une carte de ~1 450 pt de haut, calculée sur la fenêtre.
    func test_theCard_neverSizesItselfFromTheWindow() throws {
        let card = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ReelFeedCard.swift"))
        XCTAssertFalse(card.contains("DeviceLayout.windowSize"))
        XCTAssertTrue(card.contains(".aspectRatio(reelCardAspectRatio("))
    }
}
