import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #18870 — la fiche d'un autre est le profil d'une relation en trois faces (loi 1, loi 3), le sélecteur en bas (loi 5).
/// Ce que les anciens onglets portaient (Détails, Conversations, Publications) se range dans la Vitrine (loi 11).
@MainActor
final class RelationFaceTests: XCTestCase {

    /// #20177 — deux faces : ce que la face Liens portait se range dans la Vitrine (ses adresses, ses communautés) et
    /// dans les Actions (« Sa fiche » : envoyer, copier, son QR).
    func test_allCases_areTheVitrineThenTheActions_theLinksFaceIsGone() {
        XCTAssertEqual(RelationFace.allCases, [.vitrine, .actions])
    }

    func test_faceChange_contentSlidesInTheOrderOfTheFaces() {
        let order = RelationFace.allCases
        func travel(_ from: RelationFace, _ to: RelationFace) -> MeeshySegmentedTravel {
            MeeshySegmentedLaw.travel(from: order.firstIndex(of: from), to: order.firstIndex(of: to))
        }
        XCTAssertEqual(travel(.vitrine, .actions), .forward)
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
        XCTAssertEqual(RelationFace.shown(.actions, isCurrentUser: false), .actions)
    }

    func test_relationPill_sitsUnderTheName_ofAnotherOnly_neverWhenBlocked() {
        XCTAssertTrue(RelationFace.showsRelationPill(isCurrentUser: false, isBlocked: false))
        XCTAssertFalse(RelationFace.showsRelationPill(isCurrentUser: true, isBlocked: false))
        XCTAssertFalse(RelationFace.showsRelationPill(isCurrentUser: false, isBlocked: true))
    }

    /// #20177 — à droite du sélecteur : « Parler » sur la Vitrine, « Partager le profil » sur les Actions.
    func test_accessory_onTheVitrine_isTalk_whenWritingIsReachable() {
        XCTAssertEqual(RelationFace.vitrine.accessory(isInteractionDisabled: false, canTalk: true, hasLink: true), .talk)
        XCTAssertEqual(RelationFace.vitrine.accessory(isInteractionDisabled: false, canTalk: true, hasLink: false), .talk)
    }

    func test_accessory_onTheVitrine_isAbsent_whenBlockedOrUnreachable() {
        XCTAssertNil(RelationFace.vitrine.accessory(isInteractionDisabled: true, canTalk: true, hasLink: true))
        XCTAssertNil(RelationFace.vitrine.accessory(isInteractionDisabled: false, canTalk: false, hasLink: true))
    }

    func test_accessory_onTheActions_isShareTheProfile_whenItHasALink() {
        XCTAssertEqual(RelationFace.actions.accessory(isInteractionDisabled: false, canTalk: true, hasLink: true), .share)
        XCTAssertEqual(RelationFace.actions.accessory(isInteractionDisabled: true, canTalk: false, hasLink: true), .share)
        XCTAssertNil(RelationFace.actions.accessory(isInteractionDisabled: false, canTalk: true, hasLink: false))
    }

    func test_accessories_sayTalkAndShare_withTheirOwnGlyphs() {
        XCTAssertEqual(RelationFaceAccessory.talk.label, RelationFaceAccessory.talkLabel)
        XCTAssertEqual(RelationFaceAccessory.share.label, RelationFaceAccessory.shareLabel)
        XCTAssertNotEqual(RelationFaceAccessory.talk.label, RelationFaceAccessory.share.label)
        XCTAssertEqual(RelationFaceAccessory.talk.systemImage, "bubble.left.fill")
        XCTAssertEqual(RelationFaceAccessory.share.systemImage, "square.and.arrow.up")
    }

    /// Une action n'a qu'une place : « Écrire » ne vit plus qu'au bouton « Parler », Appeler, Vidéo et la carte ne vivent
    /// plus que sur la face Actions, et « Sa fiche » est le seul endroit d'Envoyer, Copier et QR.
    func test_noActionIsRepeated_acrossTheTwoFaces() throws {
        let vitrine = try source("UserProfileSheet+DetailsTab.swift")
        XCTAssertFalse(vitrine.contains("withThemSection"), "la carte « Avec X » redisait Écrire, Appeler, Vidéo, Carte")
        let actions = try source("UserProfileSheet+ActionsFace.swift")
        XCTAssertFalse(actions.contains("operation: .write"), "Écrire vit au bouton Parler de la Vitrine")
        XCTAssertFalse(FileManager.default.fileExists(atPath: sourceURL("UserProfileSheet+LinksFace.swift").path))
        XCTAssertTrue(vitrine.contains("RelationReachSection.of(self)"), "ses adresses et ses communautés sur la Vitrine")
    }

    func test_everyFace_hasATitleAndTwoGlyphs() {
        for face in RelationFace.allCases {
            XCTAssertFalse(face.title.isEmpty)
            XCTAssertFalse(face.option.systemImage?.isEmpty ?? true)
            XCTAssertFalse(face.option.currentSystemImage?.isEmpty ?? true)
        }
    }

    func test_writing_isARequest_untilALinkIsShownOrTheConnectionAccepted() {
        let stranger = ProfileRelationStanding(linked: false, toolLevel: .public)
        let linked = ProfileRelationStanding(linked: true, toolLevel: .friend)
        XCTAssertTrue(RelationFace.writesARequest(standing: stranger, connection: .none))
        XCTAssertTrue(RelationFace.writesARequest(standing: stranger, connection: .pendingSent(requestId: "r")))
        XCTAssertFalse(RelationFace.writesARequest(standing: linked, connection: .none))
        XCTAssertFalse(RelationFace.writesARequest(standing: stranger, connection: .connected))
    }

    /// #16623 — entre deux comptes de l'équipe, sans lien, la passerelle sert le Sang aux outils de cercle : écrire
    /// n'est pas une demande, au même niveau que ce que l'app propose.
    func test_standing_aServedBloodToolLevelWithoutALink_writingIsNotARequest() {
        let team = ProfileRelationStanding(linked: false, toolLevel: .blood)

        XCTAssertFalse(RelationFace.writesARequest(standing: team, connection: .none))
    }

    /// Tant que l'app n'a rien lu, la fiche ne dit pas « demande » : un Proche ne voit jamais, le temps d'un
    /// chargement, la mention d'un inconnu.
    func test_standing_unresolved_saysNoRequest() {
        XCTAssertFalse(RelationFace.writesARequest(standing: .unresolved, connection: .none))
    }

    /// Sans hôte (ni emplacement de cercle ni pilule), la fiche reste au cercle Public d'avant : écrire part en demande.
    func test_standing_unhosted_staysPublic() {
        XCTAssertTrue(RelationFace.writesARequest(standing: .unhosted, connection: .none))
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
        for file in ["UserProfileSheet+ActionsFace.swift", "RelationReachSection.swift", "ProfileInCommonSection.swift",
                     "ProfileNextCircles.swift"] {
            XCTAssertFalse(try source(file).contains("MeeshyLockedRow("), "\(file)")
            XCTAssertFalse(try source(file).contains("LockedRows("), "\(file)")
        }
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

    private func sourceURL(_ name: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Profile/\(name)")
    }

    private func source(_ name: String) throws -> String {
        try String(contentsOf: sourceURL(name), encoding: .utf8)
    }
}
