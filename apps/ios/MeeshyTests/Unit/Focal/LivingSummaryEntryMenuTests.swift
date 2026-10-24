import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le menu d'appui long d'une entrée du Résumé** (#11225) — Aller au message ·
/// Répondre, sur un visage de la rampe comme sur un épisode. « Répondre » n'est
/// offert que si la loi d'actions du SDK (`MessageActionPolicy`, projetée par
/// `MessageMenuContext.make`) l'admet pour le message que l'entrée désigne, et
/// le choix la RELIT : un droit retiré entre l'ouverture et le geste ne cite rien.
/// Miroir de `summary-exits.ts` (web).
@MainActor
final class LivingSummaryEntryMenuTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let viewerId = "6a0ad86a6e21a483b4443d01"

    // MARK: - Fabriques

    private func viewer(
        conversationRole: String? = "member",
        guest: Bool = false,
        canSendMessages: Bool = true
    ) -> ConversationViewerAuthority {
        ConversationViewerAuthority(
            id: guest ? "6a0ad86a6e21a483b4443d0f" : viewerId,
            participantId: guest ? "6a0ad86a6e21a483b4443d0f" : nil,
            hasAccount: !guest,
            isAnonymous: guest,
            platformRoleRaw: guest ? nil : "USER",
            conversationRoleRaw: conversationRole,
            isActiveMember: true,
            canSendMessages: canSendMessages,
            isDeclaredMinor: false
        )
    }

    private func authority(
        _ viewer: ConversationViewerAuthority? = nil,
        conversation: MessageActionPolicy.Conversation = MessageActionPolicy.Conversation(type: "group")
    ) -> ConversationMenuAuthority {
        ConversationMenuAuthority(viewer: viewer ?? self.viewer(), conversation: conversation)
    }

    private func message(id: String = "6a0ad86a6e21a483b4443d11", deletedAt: Date? = nil) -> Message {
        Message(
            id: id,
            conversationId: "6a0ad86a6e21a483b4443d99",
            senderId: "6a0ad86a6e21a483b4443da2",
            content: "On se voit demain ?",
            deletedAt: deletedAt,
            createdAt: now.addingTimeInterval(-3600),
            updatedAt: now.addingTimeInterval(-3600),
            senderUserId: "6a0ad86a6e21a483b4443d02",
            isMe: false
        )
    }

    private func offered(_ message: Message?, _ authority: ConversationMenuAuthority) -> [SummaryEntryAction] {
        SummaryEntryAction.offered(for: message, authority: authority, now: now)
    }

    private func face(evidence: [String]) -> FaceRampEntry {
        FaceRampEntry(
            id: "u2", displayName: "Sarah", avatarURL: nil, colorHex: "#31B6BA", presence: .online,
            awaitingCount: evidence.count, needScore: 5, evidenceMessageIds: evidence
        )
    }

    private func episode(messageIds: [String]) -> ConversationEpisode {
        ConversationEpisode(
            id: "e1", start: now, end: now, messageIds: messageIds,
            participantIds: ["u2"], deterministicTitle: "Hier · 4 messages"
        )
    }

    // MARK: - Ce que l'entrée désigne : là où son toucher mène

    func test_target_ofAFace_isItsFirstEvidence() {
        XCTAssertEqual(SummaryEntryAction.target(of: face(evidence: ["m1", "m2"])), "m1")
        XCTAssertNil(SummaryEntryAction.target(of: face(evidence: [])), "un visage sans preuve n'a pas de menu")
    }

    func test_target_ofAnEpisode_isItsFirstMessage() {
        XCTAssertEqual(SummaryEntryAction.target(of: episode(messageIds: ["m3", "m4"])), "m3")
        XCTAssertNil(SummaryEntryAction.target(of: episode(messageIds: [])))
    }

    // MARK: - Ce que le menu offre : la loi du SDK

    func test_offered_aLiveMessageInAnOpenConversation_goesToAndReplies() {
        XCTAssertEqual(offered(message(), authority()), [.goToMessage, .reply])
    }

    func test_offered_aDeletedMessage_goesToWithoutReply() {
        XCTAssertEqual(offered(message(deletedAt: now.addingTimeInterval(-60)), authority()), [.goToMessage],
                       "un message supprimé se rejoint, il ne se cite pas")
    }

    func test_offered_aMessageNoLongerInTheWindow_onlyGoesTo() {
        XCTAssertEqual(offered(nil, authority()), [.goToMessage], "aucun message, aucune loi pour l'ouvrir : on n'y cite rien")
    }

    func test_offered_endToEnd_followsTheLaw() {
        let e2ee = authority(conversation: MessageActionPolicy.Conversation(type: "group", encryptionMode: "e2ee"))
        let law = MessageMenuContext.make(message: message(), facts: MessageMenuFacts(), authority: e2ee, now: now)
        XCTAssertEqual(offered(message(), e2ee).contains(.reply), law.canReply, "le Résumé ne réécrit pas la loi : il la lit")
        XCTAssertEqual(offered(message(), e2ee), [.goToMessage, .reply],
                       "le chiffrement retire au serveur le clair, pas au lecteur le droit de répondre")
    }

    func test_offered_aClosedConversation_goesToWithoutReply() {
        let closed = authority(conversation: MessageActionPolicy.Conversation(type: "group", isActive: false))
        XCTAssertEqual(offered(message(), closed), [.goToMessage])
    }

    func test_offered_aMemberOfAnAnnouncementChannel_goesToWithoutReply() {
        let channel = authority(conversation: MessageActionPolicy.Conversation(type: "group", isAnnouncementChannel: true))
        XCTAssertEqual(offered(message(), channel), [.goToMessage], "dans un canal d'annonces, seul un administrateur écrit")
    }

    func test_offered_aGuestWithoutTheRightToSend_goesToWithoutReply() {
        let guest = authority(viewer(guest: true, canSendMessages: false))
        XCTAssertEqual(offered(message(), guest), [.goToMessage])
    }

    // MARK: - Le choix relit la loi

    private final class Exits {
        var wentTo: [String] = []
        var repliedTo: [String] = []
    }

    private func menu(_ exits: Exits, offered: @escaping (String) -> [SummaryEntryAction]) -> SummaryEntryMenu {
        SummaryEntryMenu.make(
            offered: offered,
            goTo: { exits.wentTo.append($0) },
            reply: { exits.repliedTo.append($0) }
        )
    }

    func test_run_goToMessage_goesThereAndCitesNothing() {
        let exits = Exits()
        menu(exits) { _ in [.goToMessage, .reply] }.run(.goToMessage, "m1")
        XCTAssertEqual(exits.wentTo, ["m1"])
        XCTAssertEqual(exits.repliedTo, [])
    }

    func test_run_reply_goesThereAndCitesTheMessage() {
        let exits = Exits()
        menu(exits) { _ in [.goToMessage, .reply] }.run(.reply, "m1")
        XCTAssertEqual(exits.wentTo, ["m1"])
        XCTAssertEqual(exits.repliedTo, ["m1"])
    }

    func test_run_reply_aRightWithdrawnSinceTheMenuOpened_citesNothing() {
        let exits = Exits()
        menu(exits) { _ in [.goToMessage] }.run(.reply, "m1")
        XCTAssertEqual(exits.wentTo, ["m1"], "le geste mène encore au message")
        XCTAssertEqual(exits.repliedTo, [], "le droit de répondre se relit au moment du choix")
    }

    func test_actionsOf_readsTheLawForTheDesignatedMessage() {
        let exits = Exits()
        let built = menu(exits) { $0 == "m1" ? [.goToMessage, .reply] : [.goToMessage] }
        XCTAssertEqual(built.actionsOf("m1"), [.goToMessage, .reply])
        XCTAssertEqual(built.actionsOf("m2"), [.goToMessage])
    }

    // MARK: - Le vocabulaire : la table des verbes (#11234)

    func test_actions_areNamedByTheVerbTable() {
        XCTAssertEqual(SummaryEntryAction.goToMessage.verb, .goToMessage)
        XCTAssertEqual(SummaryEntryAction.reply.verb, .reply)
        XCTAssertEqual(SummaryEntryAction.reply.verb.label, PrimaryAction.reply.verb.label, "« Répondre » dit le même mot que le menu d'un message")
        XCTAssertFalse(MessageActionVerb.goToMessage.label.isEmpty)
        XCTAssertFalse(MessageActionVerb.goToMessage.symbol.isEmpty)
    }

    // MARK: - Le câblage : chaque visage, chaque épisode, l'hôte

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_everyFaceAndEveryEpisode_carriesTheMenu() throws {
        for path in ["Features/Main/Focal/Summary/FaceRampView.swift", "Features/Main/Focal/Summary/EpisodeListView.swift"] {
            XCTAssertTrue(try source(path).contains("SummaryEntryMenuModifier(target:"), "`\(path)` n'ouvre aucun menu à l'appui long")
        }
        let modifier = try source("Features/Main/Focal/Summary/SummaryEntryMenu.swift")
        XCTAssertTrue(modifier.contains(".contextMenu"), "l'appui long ouvre le menu système")
        XCTAssertTrue(modifier.contains(".accessibilityActions"), "VoiceOver atteint les mêmes actions sans l'appui long")
    }

    func test_theHost_buildsTheMenuFromTheLaw_andTheFaceTapRepliesOnlyWhenAdmitted() throws {
        let layer = try source("Features/Main/Views/ConversationView+ReaderLayers.swift")
        XCTAssertTrue(layer.contains("SummaryEntryMenu.make("), "l'hôte du Résumé construit le menu")
        XCTAssertTrue(layer.contains("SummaryEntryAction.offered("), "l'hôte lit la loi d'actions du SDK")
        XCTAssertTrue(layer.contains("entryMenu.run(.reply"), "le toucher d'un visage cite par la même porte que le menu")
    }
}
