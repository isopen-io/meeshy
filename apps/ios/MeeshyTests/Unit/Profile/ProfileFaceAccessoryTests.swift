import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Ma fiche en deux faces (#20177, directive porteur du 2026-11-21, qui remplace #19553) : Vitrine et Actions. À droite
/// du sélecteur, rien sur ma Vitrine (« Parler » à soi-même n'a pas de sens), « Partager mon profil » sur les Actions.
/// Une action n'a qu'une place.
@MainActor
final class ProfileFaceAccessoryTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    func test_faces_areTheVitrineThenTheActions_theLinksFaceIsGone() {
        XCTAssertEqual(ProfileFace.allCases, [.vitrine, .actions])
    }

    func test_accessory_onMyVitrine_isAbsent_nothingToTalkToMyself() {
        XCTAssertNil(ProfileFace.vitrine.accessory(canShare: true))
        XCTAssertNil(ProfileFace.vitrine.accessory(canShare: false))
    }

    func test_accessory_onTheActions_isTheShare_whenMyLinkExists() {
        XCTAssertEqual(ProfileFace.actions.accessory(canShare: true), .share)
        XCTAssertNil(ProfileFace.actions.accessory(canShare: false))
    }

    func test_shareAccessory_saysItsLabel_andDrawsTheShareGlyph() {
        XCTAssertEqual(ProfileFaceAccessory.share.label, ProfileFace.shareLabel)
        XCTAssertEqual(ProfileFaceAccessory.share.systemImage, "square.and.arrow.up")
    }

    func test_selector_drawsTheAccessoryOfTheFace_withTheKitButton_andMovesWithK26() throws {
        let face = try code("Meeshy/Features/Profile/Faces/ProfileFace.swift")
        XCTAssertTrue(face.contains("face.accessory(canShare: canShare)"), "l'accessoire se lit de la face courante")
        XCTAssertTrue(face.contains("MeeshyGlassButton("), "le bouton du kit, jamais redessiné")
        XCTAssertTrue(face.contains(".meeshyMotion(.morph, value: accessory)"), "le changement suit la table K26")
        XCTAssertTrue(face.contains(".meeshyTransition("), "réduit par « Réduire les animations »")
    }

    func test_faceChange_contentSlidesInTheOrderOfTheFaces_vitrineThenActions() {
        let order = ProfileFace.allCases
        func travel(_ from: ProfileFace, _ to: ProfileFace) -> MeeshySegmentedTravel {
            MeeshySegmentedLaw.travel(from: order.firstIndex(of: from), to: order.firstIndex(of: to))
        }
        XCTAssertEqual(travel(.vitrine, .actions), .forward)
        XCTAssertEqual(travel(.actions, .vitrine), .backward)
        XCTAssertEqual(travel(.actions, .actions), MeeshySegmentedTravel.none)
    }

    func test_faceContent_isPagedByTheKit_andNoLongerMorphedWithoutDirection() throws {
        let view = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(view.contains("MeeshySegmentedPages(selection: ProfileFace.shown(face, isEditing: isEditing)"))
        XCTAssertFalse(view.contains(".meeshyMotion(.morph, value: face)"))
    }

    /// Ce que la face Liens portait se répartit : Mes adresses sur la Vitrine (ce qu'on voit de moi), mon lien de profil
    /// et mes liens créés sur les Actions (ce que j'en fais). La page « Mes liens » garde sa composition entière.
    func test_linksFaceContent_isSharedBetweenTheVitrineAndTheActions() throws {
        let view = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(view.contains("ProfileAddressesRail("), "Mes adresses sur la Vitrine")
        XCTAssertTrue(view.contains("ProfileLinksFace(user: user, accentColor: shownAccentHex, showsAddresses: false"),
                      "mon lien de profil et mes liens créés en tête des Actions")
        XCTAssertFalse(view.contains("linkCreateRequested"), "plus de bouton « Créer un lien » à côté du sélecteur")
        let hub = try code("Meeshy/Features/Links/Views/LinksHubView.swift")
        XCTAssertTrue(hub.contains("ProfileLinksFace("))
        XCTAssertFalse(hub.contains("showsAddresses: false"))
    }

    /// Une action n'a qu'une place : la bannière porte Réglages, « Vue par » et Modifier ; la Vitrine porte mon activité
    /// et ma Légende ; le billet de mon lien porte QR et Sans contact ; le bouton du sélecteur porte Partager.
    func test_actionsFace_repeatsNoActionThatLivesElsewhere() throws {
        let face = try code("Meeshy/Features/Profile/Faces/ProfileActionsFace.swift")
        for gone in ["onAction(.share)", "onAction(.seenAs)", "onAction(.edit)", "onAction(.settings)",
                     "onAction(.stats)", "onAction(.legend)", "ProfileActionsCopy.myQR", "presented = .card(.contactless)"] {
            XCTAssertFalse(face.contains(gone), "\(gone) vit déjà ailleurs")
        }
        XCTAssertTrue(face.contains("presented = .scanner"), "Scanner reste sur la face Actions")
        XCTAssertTrue(face.contains("onAction(.security)"), "la Sécurité reste sur la face Actions")
    }

    /// En édition, la Vitrine ne montre que ce qui s'y modifie.
    func test_editing_showsOnlyWhatIsEdited() {
        XCTAssertFalse(ProfileVitrineBlock.isShown(.circles, isEditing: true))
        XCTAssertFalse(ProfileVitrineBlock.isShown(.activity, isEditing: true))
        XCTAssertFalse(ProfileVitrineBlock.isShown(.legend, isEditing: true))
        XCTAssertFalse(ProfileVitrineBlock.isShown(.addresses, isEditing: true))
        XCTAssertTrue(ProfileVitrineBlock.allCases.allSatisfy { ProfileVitrineBlock.isShown($0, isEditing: false) })
    }
}
