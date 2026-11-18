import XCTest
@testable import MeeshyUI

/// #18870 — la fiche d'un autre est le profil d'une relation en trois faces (loi 1, loi 3), le sélecteur en bas (loi 5).
/// Ce que les anciens onglets portaient (Détails, Conversations, Publications) se range dans la Vitrine (loi 11).
@MainActor
final class RelationFaceTests: XCTestCase {

    func test_allCases_readVitrineThenLinksThenActions() {
        XCTAssertEqual(RelationFace.allCases, [.vitrine, .links, .actions])
    }

    func test_faceChange_contentSlidesInTheOrderOfTheFaces() {
        let order = RelationFace.allCases
        func travel(_ from: RelationFace, _ to: RelationFace) -> MeeshySegmentedTravel {
            MeeshySegmentedLaw.travel(from: order.firstIndex(of: from), to: order.firstIndex(of: to))
        }
        XCTAssertEqual(travel(.vitrine, .links), .forward)
        XCTAssertEqual(travel(.links, .actions), .forward)
        XCTAssertEqual(travel(.actions, .vitrine), .backward)
        XCTAssertEqual(travel(.vitrine, .vitrine), MeeshySegmentedTravel.none)
    }

    func test_selector_showsOnTheProfileOfAnother() {
        XCTAssertTrue(RelationFace.showsSelector(isCurrentUser: false, isBlocked: false, loadFailed: false))
    }

    func test_selector_isAbsent_onMyOwnSheet_whenBlocked_orWithoutAProfile() {
        XCTAssertFalse(RelationFace.showsSelector(isCurrentUser: true, isBlocked: false, loadFailed: false))
        XCTAssertFalse(RelationFace.showsSelector(isCurrentUser: false, isBlocked: true, loadFailed: false))
        XCTAssertFalse(RelationFace.showsSelector(isCurrentUser: false, isBlocked: false, loadFailed: true))
    }

    func test_shown_isAlwaysTheVitrine_onMyOwnSheet() {
        XCTAssertEqual(RelationFace.shown(.actions, isCurrentUser: true), .vitrine)
        XCTAssertEqual(RelationFace.shown(.links, isCurrentUser: true), .vitrine)
        XCTAssertEqual(RelationFace.shown(.actions, isCurrentUser: false), .actions)
    }

    func test_relationPill_sitsUnderTheName_ofAnotherOnly_neverWhenBlocked() {
        XCTAssertTrue(RelationFace.showsRelationPill(isCurrentUser: false, isBlocked: false))
        XCTAssertFalse(RelationFace.showsRelationPill(isCurrentUser: true, isBlocked: false))
        XCTAssertFalse(RelationFace.showsRelationPill(isCurrentUser: false, isBlocked: true))
    }

    func test_writeShortcut_sitsBesideTheSelector_onTheVitrineOnly() {
        XCTAssertTrue(RelationFace.vitrine.offersWriteShortcut(isInteractionDisabled: false))
        XCTAssertFalse(RelationFace.links.offersWriteShortcut(isInteractionDisabled: false))
        XCTAssertFalse(RelationFace.actions.offersWriteShortcut(isInteractionDisabled: false))
        XCTAssertFalse(RelationFace.vitrine.offersWriteShortcut(isInteractionDisabled: true))
    }

    func test_everyFace_hasATitleAndTwoGlyphs() {
        for face in RelationFace.allCases {
            XCTAssertFalse(face.title.isEmpty)
            XCTAssertFalse(face.option.systemImage?.isEmpty ?? true)
            XCTAssertFalse(face.option.currentSystemImage?.isEmpty ?? true)
        }
    }

    func test_writing_isARequest_untilALinkIsShownOrTheConnectionAccepted() {
        XCTAssertTrue(RelationFace.writesARequest(linked: false, connection: .none))
        XCTAssertTrue(RelationFace.writesARequest(linked: false, connection: .pendingSent(requestId: "r")))
        XCTAssertFalse(RelationFace.writesARequest(linked: true, connection: .none))
        XCTAssertFalse(RelationFace.writesARequest(linked: false, connection: .connected))
    }

    /// Loi 12 — la face Actions est faite du kit : actions libellées K32, boutons K40, l'échelle « Pour aller plus loin »
    /// en médaillons K45 ; plus aucun bouton dessiné sur place, plus d'onglets en haut. Plus aucune rangée verrouillée
    /// (#19674) : la fiche d'un autre ne montre pas ce que le cercle tient fermé, elle dit le chemin.
    func test_faces_areMadeOfTheKit() throws {
        let actions = try source("UserProfileSheet+ActionsFace.swift")
        XCTAssertTrue(actions.contains("MeeshyActionGrid"))
        XCTAssertTrue(actions.contains("ProfileTalkAction("))
        XCTAssertTrue(actions.contains("ProfileNextCircles("))
        XCTAssertFalse(actions.contains("ProfileLockedCapabilities("))
        XCTAssertTrue(try source("ProfileTalkAction.swift").contains("MeeshyLabeledAction("))
        XCTAssertTrue(try source("ProfileActionsFaceParts.swift").contains("MeeshyButton("))
        XCTAssertTrue(try source("ProfileNextCircles.swift").contains("MeeshyMedallion("))
        for file in ["UserProfileSheet+ActionsFace.swift", "UserProfileSheet+LinksFace.swift", "ProfileInCommonSection.swift",
                     "ProfileNextCircles.swift"] {
            XCTAssertFalse(try source(file).contains("MeeshyLockedRow("), "\(file)")
            XCTAssertFalse(try source(file).contains("LockedRows("), "\(file)")
        }
        XCTAssertTrue(try source("UserProfileSheet+LinksFace.swift").contains("MeeshyTicket("))
        let sheet = try source("UserProfileSheet.swift")
        XCTAssertTrue(sheet.contains("RelationFaceSelector(face: $face"))
        XCTAssertFalse(sheet.contains("pinnedTabBar"))
        for file in ["UserProfileSheet.swift", "UserProfileSheet+DetailsTab.swift", "UserProfileSheet+ActionsFace.swift"] {
            XCTAssertFalse(try source(file).contains("func profileActionButton"), "\(file)")
        }
    }

    /// Loi 11 — la Vitrine garde ce que les onglets Conversations et Publications montraient.
    func test_vitrine_keepsTheFormerConversationsAndPostsTabs() throws {
        let vitrine = try source("UserProfileSheet+DetailsTab.swift")
        XCTAssertTrue(vitrine.contains("conversationsTab"))
        XCTAssertTrue(vitrine.contains("postsTab"))
    }

    private func source(_ name: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Profile/\(name)")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
