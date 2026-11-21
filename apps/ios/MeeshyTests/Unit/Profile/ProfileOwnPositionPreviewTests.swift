import XCTest
import MeeshySDK
@testable import Meeshy

/// « Ma position » montre une vraie carte avant tout toucher (#20199) : la carte seulement quand ma position PART et que
/// l'appareil la connaît déjà (cache, jamais une attente) ; sinon la rangée le dit, sans carte vide. Sur la carte, la
/// feuille d'une personne n'offre que les gestes permis.
@MainActor
final class ProfileOwnPositionPreviewTests: XCTestCase {

    private func fix() -> SharedLocationFix {
        SharedLocationFix(latitude: 48.8566, longitude: 2.3522, accuracy: 12)!
    }

    func test_resolve_sharedWithAKnownFix_showsTheMap() {
        XCTAssertEqual(ProfileOwnPositionPreview.resolve(recipients: 2, isGhost: false, fix: fix()), .map(fix()))
    }

    func test_resolve_notShared_saysItWithoutAMap() {
        XCTAssertEqual(ProfileOwnPositionPreview.resolve(recipients: 0, isGhost: false, fix: fix()), .note)
    }

    func test_resolve_ghost_hidesTheMapEvenWhenShared() {
        XCTAssertEqual(ProfileOwnPositionPreview.resolve(recipients: 3, isGhost: true, fix: fix()), .note)
    }

    func test_resolve_sharedButNoKnownFix_neverDrawsAnEmptyMap() {
        XCTAssertEqual(ProfileOwnPositionPreview.resolve(recipients: 1, isGhost: false, fix: nil), .note)
    }

    func test_talkie_isOfferedFromCloseOnly() {
        XCTAssertFalse(PersonLocationCard.offersTalkie(nil))
        XCTAssertFalse(PersonLocationCard.offersTalkie(.friend))
        XCTAssertTrue(PersonLocationCard.offersTalkie(.close))
        XCTAssertTrue(PersonLocationCard.offersTalkie(.blood))
    }
}
