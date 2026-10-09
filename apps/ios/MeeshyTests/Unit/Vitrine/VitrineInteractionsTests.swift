import XCTest
import MeeshySDK
@testable import Meeshy

/// Les vraies interactions que la vitrine filme (#9810) : chaque scène ouvre le vrai écran, puis joue l'interaction par
/// le MÊME chemin que le geste, contre une passerelle fictive.
@MainActor
final class VitrineInteractionsTests: XCTestCase {
    private var echantillon: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Resources/VitrineFixtures-fr.json")
    }

    private func fixtures() throws -> VitrineFixtures {
        try VitrineFixtures.decoder(Data(contentsOf: echantillon))
    }

    private var depot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ chemin: String) throws -> String {
        try String(contentsOf: depot.appendingPathComponent(chemin), encoding: .utf8)
    }

    private func scene(_ argument: String) -> VitrineScene? {
        VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", argument])
    }

    // MARK: - interaction-frappe

    func test_interactionFrappe_parses_andOpensASession() {
        XCTAssertEqual(scene("interaction-frappe"), .interactionFrappe)
        XCTAssertEqual(VitrineScene.interactionFrappe.interaction, .frappe)
        XCTAssertTrue(VitrineScene.interactionFrappe.ouvreUneSession)
    }

    /// La scène part du COMPTEUR de Meeshes, sur Progression : aucune fiche n'est ouverte au lancement.
    func test_interactionFrappe_startsOnProgression_notOnTheFiche() {
        XCTAssertNil(VitrineScene.interactionFrappe.celebration)
        XCTAssertEqual(VitrineScene.interactionFrappe.rendusAttendus(conversationId: nil, appareil: .iphone), [.progression])
        XCTAssertEqual(VitrineScene.interactionFrappe.rendusAttendus(conversationId: nil, appareil: .ipad), [.progression, .fil])
    }

    /// Le compteur ouvre la fiche des Meeshes (#9564), où la frappe a son unique site : la passerelle sert la frappe.
    func test_interactionFrappe_servesTheStrike_onTheMeeshFiche() {
        XCTAssertEqual(VitrineScene.interactionFrappe.jeuServi, .frappe)
        XCTAssertEqual(VitrineScene.interactionFrappe.jeuServi?.concept, .meesh)
    }

    func test_jeuServi_ofAGameScene_isItsCelebration() {
        XCTAssertEqual(VitrineScene.jeuCoffre.jeuServi, .coffre)
        XCTAssertNil(VitrineScene.global.jeuServi)
        XCTAssertNil(VitrineScene.jeuRang.interaction)
    }

    // MARK: - interaction-emoji (un message, par le menu unifié)

    func test_interactionEmoji_parses_andOpensTheLoveConversation() throws {
        let f = try fixtures()
        XCTAssertEqual(scene("interaction-emoji"), .interactionEmoji)
        XCTAssertEqual(VitrineScene.interactionEmoji.interaction, .emoji)
        XCTAssertTrue(VitrineScene.interactionEmoji.ouvreUneSession)
        XCTAssertEqual(VitrineScene.interactionEmoji.sceneDuKit, .amour)
        let destination = try XCTUnwrap(f.destination(VitrineScene.interactionEmoji.sceneDuKit))
        XCTAssertEqual(
            VitrineScene.interactionEmoji.rendusAttendus(conversationId: destination.conversationId, appareil: .ipad),
            [.conversation(destination.conversationId)]
        )
    }

    /// Le lecteur réagit à un message REÇU, écrit : jamais au sien, ni à un vocal ou une photo sans texte.
    func test_messageAReagir_isTheLastReceivedTextMessage() throws {
        let f = try fixtures()
        let conversationId = try XCTUnwrap(f.destination(.amour)?.conversationId)

        let id = try XCTUnwrap(VitrineInteractions.messageAReagir(f, conversationId: conversationId))

        let message = try XCTUnwrap(f.messages[conversationId]?.first { $0.id == id })
        XCTAssertNotEqual(message.senderId, f.lecteur.id)
        XCTAssertFalse((message.content ?? "").isEmpty)
        XCTAssertTrue(message.attachments?.isEmpty ?? true)
        let suivants = try XCTUnwrap(f.messages[conversationId]?.drop(while: { $0.id != id }).dropFirst())
        XCTAssertFalse(suivants.contains { $0.senderId != f.lecteur.id && !($0.content ?? "").isEmpty && ($0.attachments?.isEmpty ?? true) })
    }

    /// Le menu s'ouvre par le MÊME chemin que l'appui long : le gestionnaire que la liste remet à la conversation.
    func test_emoji_opensTheMenuThroughTheListLongPressHandler() throws {
        let liste = try source("apps/ios/Meeshy/Features/Main/Views/MessageListViewController+SeenTracking.swift")
        XCTAssertTrue(liste.contains("VitrineRendu.shared.listeDeMessagesAffichee"))
        XCTAssertTrue(liste.contains("self.onLongPress?(messageId, self.cellFrameInWindow(messageId: messageId))"))
    }

    /// L'émoji part par le MÊME geste que la bande du menu : `reagirDepuisLaBande`, que la bande et la vitrine appellent.
    func test_emoji_reactsThroughTheMenuBandItself() throws {
        let menu = try source("apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift")
        XCTAssertTrue(menu.contains("onReact: reagirDepuisLaBande"))
        XCTAssertTrue(menu.contains("VitrineRendu.shared.menuDeReactionsAffiche(reagir: reagirDepuisLaBande)"))
    }

    func test_rendu_relaysTheLongPressAndTheMenuBand() {
        let rendu = VitrineRendu(actif: true)
        var appuye: String?
        var reagi: String?
        rendu.listeDeMessagesAffichee { appuye = $0 }
        rendu.menuDeReactionsAffiche { reagi = $0 }

        rendu.appuyerLongtemps?("m1")
        rendu.reagirAuMenu?("🥰")

        XCTAssertEqual(appuye, "m1")
        XCTAssertEqual(reagi, "🥰")
        XCTAssertTrue(rendu.observes.contains(.menuDeReactions))
    }

    func test_rendu_outsideTheVitrine_keepsNoHandler() {
        let rendu = VitrineRendu(actif: false)
        rendu.listeDeMessagesAffichee { _ in }
        rendu.menuDeReactionsAffiche { _ in }
        XCTAssertNil(rendu.appuyerLongtemps)
        XCTAssertNil(rendu.reagirAuMenu)
    }
}
