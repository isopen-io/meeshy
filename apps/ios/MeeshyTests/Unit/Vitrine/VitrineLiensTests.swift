import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Le LIEN dans l'en-tête de la fiche (#9904) : la conversation anonyme des proches, la liste des SAV, et le client qui
/// arrive par le lien d'un SAV sans compte — chacun par le chemin réel de l'app.
@MainActor
final class VitrineLiensTests: XCTestCase {
    private var echantillon: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Resources/VitrineFixtures-fr.json")
    }

    private func fixtures() throws -> VitrineFixtures {
        try VitrineFixtures.decoder(Data(contentsOf: echantillon))
    }

    /// L'invitation se filme SANS session, sur le lien d'un SAV : c'est ce que voit le client qui reçoit le lien.
    func test_invite_parses_opensNoSession_andWaitsForTheServedInvitation() throws {
        let f = try fixtures()
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "interaction-invite"]), .interactionInvite)
        XCTAssertEqual(VitrineScene.interactionInvite.interaction, .invite)
        XCTAssertFalse(VitrineScene.interactionInvite.ouvreUneSession)
        XCTAssertEqual(VitrineScene.interactionInvite.rendusAttendus(conversationId: nil, appareil: .iphone), [.lien])
        XCTAssertNil(VitrineScene.interactionInvite.jeuServi)
        let sav = try XCTUnwrap(f.lienSav)
        XCTAssertNotEqual(sav.linkId, f.lienInvitation.linkId)
        XCTAssertFalse(sav.requireAccount)
        XCTAssertEqual(VitrineInteractions.nomDeLInvite(f).prenom, f.lecteur.firstName)
    }

    /// « Dis-moi tout » : une conversation que seule sa scène montre, remplie de messages d'invités SANS compte, chacun
    /// dans une autre langue que celle du lecteur et traduit dans la sienne.
    func test_sonde_opensItsConversation_fullOfAnonymousGuests() throws {
        let f = try fixtures()
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "interaction-sonde"]), .interactionSonde)
        XCTAssertEqual(VitrineScene.interactionSonde.interaction, .sonde)
        XCTAssertTrue(VitrineScene.interactionSonde.ouvreUneSession)
        let destination = try XCTUnwrap(f.destination(.interactionSonde))
        XCTAssertEqual(VitrineScene.interactionSonde.rendusAttendus(conversationId: destination.conversationId, appareil: .iphone),
                       [.conversation(destination.conversationId)])
        XCTAssertTrue(f.conversationsServies(pour: .interactionSonde).contains { $0.id == destination.conversationId })
        XCTAssertFalse(f.conversationsServies().contains { $0.id == destination.conversationId }, "« Dis-moi tout » déborde sur les autres scènes.")
        let messages = try XCTUnwrap(f.messages[destination.conversationId])
        let invites = messages.filter { $0.sender?.isAnonymous == true }
        XCTAssertGreaterThanOrEqual(invites.count, 4)
        XCTAssertGreaterThanOrEqual(Set(invites.map(\.originalLanguage)).count, 4)
        for message in invites {
            XCTAssertNotEqual(message.originalLanguage, f.lang)
            XCTAssertTrue((message.translations ?? []).contains { $0.targetLanguage == f.lang })
        }
    }

    /// La liste des SAV : une conversation par produit, que seule la scène du SAV ajoute à la liste.
    func test_sav_addsItsConversationsToTheListOnly() throws {
        let f = try fixtures()
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "interaction-sav"]), .interactionSav)
        XCTAssertEqual(VitrineScene.interactionSav.interaction, .sav)
        XCTAssertEqual(VitrineScene.interactionSav.rendusAttendus(conversationId: nil, appareil: .iphone), [.racine])
        let sav = try XCTUnwrap(f.conversationsDeScene?["interaction-sav"])
        XCTAssertGreaterThanOrEqual(sav.count, 4)
        XCTAssertEqual(f.conversationsServies(pour: .interactionSav).count, f.conversations.count + sav.count)
        XCTAssertEqual(f.conversationsServies().count, f.conversations.count)
    }

    /// Le parcours servi est remis à la vitrine — et à elle seule.
    func test_rendu_keepsTheServedInvitation_onlyInsideTheVitrine() {
        let parcours = JoinFlowViewModel(identifier: "sav-lampe")
        let actif = VitrineRendu(actif: true)
        actif.invitationServie(parcours)
        XCTAssertTrue(actif.invitation === parcours)
        XCTAssertTrue(actif.observes.contains(.lien))

        let inactif = VitrineRendu(actif: false)
        inactif.invitationServie(parcours)
        XCTAssertNil(inactif.invitation)
        XCTAssertTrue(inactif.observes.isEmpty)
    }
}
