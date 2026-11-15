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

    func test_theGlyphPill_isRemoved_fromTheBandSource() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Primitives/AvatarListeningBand.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(source.contains("glyphBody"), "la pastille sans appelant se retire (#17084)")
        XCTAssertFalse(source.contains("glyphDiameter"), "la pastille sans appelant se retire (#17084)")
    }
}
