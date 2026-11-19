import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Le bouton à côté du sélecteur de faces (#19553, planches `Main`, `Moi-Liens`, `Moi-Actions`) : partager ma vitrine
/// sur la Vitrine, créer un lien sur les Liens, rien sur les Actions — chacun avec son propre libellé lu.
@MainActor
final class ProfileFaceAccessoryTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    func test_accessory_onTheVitrine_isTheShare_whenMyLinkExists() {
        XCTAssertEqual(ProfileFace.vitrine.accessory(canShare: true), .share)
    }

    func test_accessory_onTheVitrine_withoutMyLink_isAbsent() {
        XCTAssertNil(ProfileFace.vitrine.accessory(canShare: false))
    }

    func test_accessory_onTheLinks_isTheLinkCreation_withOrWithoutMyLink() {
        XCTAssertEqual(ProfileFace.links.accessory(canShare: true), .createLink)
        XCTAssertEqual(ProfileFace.links.accessory(canShare: false), .createLink)
    }

    func test_accessory_onTheActions_isAbsent() {
        XCTAssertNil(ProfileFace.actions.accessory(canShare: true))
        XCTAssertNil(ProfileFace.actions.accessory(canShare: false))
    }

    func test_accessories_eachSayTheirOwnLabel_andDrawTheGlyphOfThePlanche() {
        XCTAssertEqual(ProfileFaceAccessory.share.label, ProfileFace.shareLabel)
        XCTAssertEqual(ProfileFaceAccessory.createLink.label, ProfileLinksCopy.createLink)
        XCTAssertNotEqual(ProfileFaceAccessory.share.label, ProfileFaceAccessory.createLink.label)
        XCTAssertEqual(ProfileFaceAccessory.share.systemImage, "square.and.arrow.up")
        XCTAssertEqual(ProfileFaceAccessory.createLink.systemImage, "plus")
    }

    func test_selector_drawsTheAccessoryOfTheFace_withTheKitButton_andMovesWithK26() throws {
        let face = try code("Meeshy/Features/Profile/Faces/ProfileFace.swift")
        XCTAssertTrue(face.contains("face.accessory(canShare: canShare)"), "l'accessoire se lit de la face courante")
        XCTAssertTrue(face.contains("MeeshyGlassButton("), "le bouton du kit, jamais redessiné")
        XCTAssertTrue(face.contains(".meeshyMotion(.morph, value: accessory)"), "le changement suit la table K26")
        XCTAssertTrue(face.contains(".meeshyTransition("), "réduit par « Réduire les animations »")
        XCTAssertFalse(face.contains("systemImage: \"square.and.arrow.up\""), "plus de partage figé")
    }

    func test_faceChange_contentSlidesInTheOrderOfTheFaces_vitrineThenLinksThenActions() {
        let order = ProfileFace.allCases
        func travel(_ from: ProfileFace, _ to: ProfileFace) -> MeeshySegmentedTravel {
            MeeshySegmentedLaw.travel(from: order.firstIndex(of: from), to: order.firstIndex(of: to))
        }
        XCTAssertEqual(travel(.vitrine, .links), .forward)
        XCTAssertEqual(travel(.vitrine, .actions), .forward)
        XCTAssertEqual(travel(.actions, .links), .backward)
        XCTAssertEqual(travel(.links, .vitrine), .backward)
        XCTAssertEqual(travel(.links, .links), MeeshySegmentedTravel.none)
    }

    /// #19782 — ma fiche n'a plus que la Vitrine : ni sélecteur de faces, ni face Liens, ni face Actions ; « Partager
    /// mon profil » reste, seul, en bas à droite.
    func test_myProfile_showsTheVitrineOnly_andKeepsTheShareButton() throws {
        let view = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertFalse(view.contains("ProfileFaceSelector("), "plus de sélecteur de faces sur ma fiche")
        XCTAssertFalse(view.contains("ProfileLinksFace("), "« Mes liens » vit dans son hub")
        XCTAssertFalse(view.contains("ProfileActionsFace("), "plus de face Actions sur ma fiche")
        XCTAssertFalse(view.contains("MeeshySegmentedPages("))
        XCTAssertTrue(view.contains("systemImage: ProfileFaceAccessory.share.systemImage"))
        XCTAssertTrue(view.contains("action: { shareShown = true }"))
    }
}
