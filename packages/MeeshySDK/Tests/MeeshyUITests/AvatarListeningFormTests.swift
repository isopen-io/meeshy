import XCTest
@testable import MeeshyUI

/// Le bandeau d'écoute n'existe qu'à la taille où son texte se lit (#17084) : aucun écran ne pose d'avatar sous
/// 40 pt avec une écoute, donc la pastille-glyphe (#16733) est retirée au lieu de rester sans appelant.
@MainActor
final class AvatarListeningFormTests: XCTestCase {

    func test_overlay_atOrAboveMinimum_paintsForAKnownUser() {
        XCTAssertTrue(AvatarListeningOverlay.paints(userId: "u1", avatarSize: 52))
        XCTAssertTrue(AvatarListeningOverlay.paints(userId: "u1", avatarSize: 40))
    }

    func test_overlay_belowMinimum_paintsNothing() {
        XCTAssertFalse(AvatarListeningOverlay.paints(userId: "u1", avatarSize: 39))
        XCTAssertFalse(AvatarListeningOverlay.paints(userId: "u1", avatarSize: 28))
    }

    func test_overlay_withoutUser_paintsNothing() {
        XCTAssertFalse(AvatarListeningOverlay.paints(userId: nil, avatarSize: 52))
        XCTAssertFalse(AvatarListeningOverlay.paints(userId: "", avatarSize: 52))
    }

    // MARK: - L'orbite (#19854)

    func test_orbit_lettersStartBeyondTheStoryRing_andNeverCoverTheAvatar() {
        for size: CGFloat in [40, 52, 64, 96] {
            let font = AvatarListeningOrbitLayout.fontSize(avatarSize: size)
            let innerEdge = AvatarListeningOrbitLayout.radius(avatarSize: size) - font / 2
            XCTAssertGreaterThan(innerEdge, AvatarListeningOrbitLayout.storyRingOuterRadius(avatarSize: size))
            XCTAssertGreaterThan(AvatarListeningOrbitLayout.storyRingOuterRadius(avatarSize: size), size / 2)
            XCTAssertGreaterThan(AvatarListeningOrbitLayout.side(avatarSize: size), size)
        }
    }

    func test_orbit_aShortTitle_isKeptWhole() {
        let characters = Array("♪ Formidable")
        let widths = characters.map { _ in CGFloat(5) }
        XCTAssertEqual(AvatarListeningOrbitLayout.fitted(characters, widths: widths, circumference: 200, ellipsisWidth: 5),
                       characters)
    }

    func test_orbit_aLongTitle_isCutToTheTurn_withAnEllipsis_leavingTheClosingGap() {
        let characters = Array(String(repeating: "a", count: 100))
        let widths = characters.map { _ in CGFloat(5) }
        let shown = AvatarListeningOrbitLayout.fitted(characters, widths: widths, circumference: 200, ellipsisWidth: 5)
        XCTAssertEqual(shown.last, "…")
        XCTAssertLessThanOrEqual(CGFloat(shown.count) * 5, 200 * (1 - AvatarListeningOrbitLayout.closingGap))
    }

    func test_theLiveListening_turnsAroundTheAvatar_insteadOfCoveringItsBottom() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Profile/AvatarListeningSource.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(source.contains("AvatarListeningOrbit(listening: band"))
        XCTAssertFalse(source.contains("AvatarListeningBand(listening: band"))
    }

    func test_theGlyphPill_isRemoved_fromTheBandSource() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Primitives/AvatarListeningBand.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(source.contains("glyphBody"), "la pastille sans appelant se retire (#17084)")
        XCTAssertFalse(source.contains("glyphDiameter"), "la pastille sans appelant se retire (#17084)")
    }
}
