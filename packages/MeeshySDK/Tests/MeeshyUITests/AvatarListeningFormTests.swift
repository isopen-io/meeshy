import XCTest
@testable import MeeshyUI

/// La forme de l'écoute selon la taille de l'avatar (#16733) : le bandeau défilant tant que son texte est lisible,
/// sinon le seul glyphe de la catégorie — l'écoute ne se tait jamais à l'oeil, quelle que soit la taille.
final class AvatarListeningFormTests: XCTestCase {

    func test_form_atOrAboveMinimum_isBand() {
        XCTAssertEqual(AvatarListeningBand.form(avatarSize: 52), .band)
        XCTAssertEqual(AvatarListeningBand.form(avatarSize: 40), .band)
    }

    func test_form_belowMinimum_isGlyph() {
        XCTAssertEqual(AvatarListeningBand.form(avatarSize: 39), .glyph)
        XCTAssertEqual(AvatarListeningBand.form(avatarSize: 28), .glyph)
    }

    func test_glyphDiameter_neverBelowFourteen() {
        XCTAssertEqual(AvatarListeningBand.glyphDiameter(avatarSize: 28), 14)
        XCTAssertEqual(AvatarListeningBand.glyphDiameter(avatarSize: 20), 14)
    }

    func test_glyphDiameter_growsWithAvatar() {
        XCTAssertEqual(AvatarListeningBand.glyphDiameter(avatarSize: 38), 16)
    }
}
