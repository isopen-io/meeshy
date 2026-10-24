import XCTest
@testable import MeeshySDK

/// **Dans une conversation chiffrée, un message qui arrive EN CLAIR se dit tel**
/// (#11380, constat H2 de l'audit adversarial de #11378).
///
/// Une passerelle compromise peut injecter `isEncrypted: false` et un texte en
/// clair sous le nom de l'interlocuteur. Sceller ce message rendrait illisibles
/// les envois en clair légitimes des anciens clients (#8221, #11404) : on le
/// SIGNALE, et on n'y sert aucune traduction du serveur. Une seule loi, que le
/// fil, l'aperçu d'appui long et la ligne de liste lisent.
final class EndToEndPlaintextLawTests: XCTestCase {

    private func message(
        content: String = "Envoie-moi le code reçu par SMS",
        isEncrypted: Bool = false,
        source: MeeshyMessage.MessageSource = .user,
        isMe: Bool = false,
        deletedAt: Date? = nil,
        attachments: [MeeshyMessageAttachment] = [],
        joinNotice: JoinNoticeMetadata? = nil
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: "m1", conversationId: "c1", senderId: "u-peer", content: content,
            messageSource: source, deletedAt: deletedAt, isEncrypted: isEncrypted,
            createdAt: Date(timeIntervalSince1970: 1_000), updatedAt: Date(timeIntervalSince1970: 1_000),
            attachments: attachments, isMe: isMe, joinNotice: joinNotice
        )
    }

    private func standing(_ message: MeeshyMessage, mode: String? = "e2ee") -> EndToEndMessageStanding {
        EndToEndPlaintextLaw.standing(of: message, conversationEncryptionMode: mode)
    }

    // MARK: - Le fil

    func test_forgedPlaintextInEndToEndDirect_isUnencrypted() {
        XCTAssertEqual(standing(message()), .unencrypted)
        XCTAssertTrue(standing(message()).isUnencrypted)
    }

    func test_messageDecryptedOnDevice_isOrdinary() {
        var decrypted = message(content: "Q2lwaGVydGV4dGU=", isEncrypted: true)
        decrypted.adoptDecryptedContent("Rendez-vous à midi")

        XCTAssertEqual(standing(decrypted), .ordinary)
    }

    /// Un message chiffré que l'appareil n'a pas encore déchiffré est SCELLÉ par
    /// sa propre loi (provenance, #11382) : il n'est pas « en clair ».
    func test_encryptedNotYetDecrypted_isOrdinary() {
        XCTAssertEqual(standing(message(content: "Q2lwaGVydGV4dGU=", isEncrypted: true)), .ordinary)
    }

    func test_systemMessage_isOrdinary() {
        XCTAssertEqual(standing(message(content: "Alice a rejoint la conversation", source: .system)), .ordinary)
    }

    func test_noticeCarriedByAUserMessage_isOrdinary() {
        let notice = message(content: "Alice a rejoint", joinNotice: JoinNoticeMetadata(
            participantId: "p-alice", displayName: "Alice", isAnonymous: false, viaShareLink: false
        ))

        XCTAssertEqual(standing(notice), .ordinary)
    }

    func test_myOwnMessage_isOrdinary() {
        XCTAssertEqual(standing(message(isMe: true)), .ordinary)
    }

    func test_deletedMessage_isOrdinary() {
        XCTAssertEqual(standing(message(deletedAt: Date(timeIntervalSince1970: 2_000))), .ordinary)
    }

    func test_conversationWithoutEndToEnd_isUnchanged() {
        XCTAssertEqual(standing(message(), mode: nil), .ordinary)
        XCTAssertEqual(standing(message(), mode: "server"), .ordinary)
        XCTAssertEqual(standing(message(), mode: " Hybrid "), .ordinary)
    }

    /// Le mode se lit sans blancs ni casse, et un régime inconnu se lit comme un
    /// régime que le serveur ne lit pas — la règle de
    /// `DeviceTranslationEligibility.serverReadsMessage`.
    func test_endToEndModeSpelledDifferentlyOrUnknown_isStillJudged() {
        XCTAssertEqual(standing(message(), mode: " E2EE "), .unencrypted)
        XCTAssertEqual(standing(message(), mode: "mls"), .unencrypted)
    }

    func test_clearMediaWithoutText_isUnencrypted() {
        let photo = MeeshyMessageAttachment(id: "a1", mimeType: "image/jpeg")

        XCTAssertEqual(standing(message(content: "", attachments: [photo])), .unencrypted)
    }

    func test_encryptedMediaWithoutText_isOrdinary() {
        let sealedPhoto = MeeshyMessageAttachment(id: "a1", mimeType: "image/jpeg", isEncrypted: true)

        XCTAssertEqual(standing(message(content: "", attachments: [sealedPhoto])), .ordinary)
    }

    func test_emptyMessage_isOrdinary() {
        XCTAssertEqual(standing(message(content: "  ")), .ordinary)
    }

    // MARK: - La ligne de liste

    private func conversation(
        mode: String? = "e2ee",
        nature: LastMessageNature? = LastMessageNature(messageType: "text"),
        senderName: String? = "Bob",
        senderUserId: String? = "u-bob"
    ) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "c1", identifier: "c1", encryptionMode: mode,
            lastMessagePreview: "Envoie-moi le code reçu par SMS",
            lastMessageId: "m1",
            lastMessageSenderName: senderName,
            lastMessageSenderUserId: senderUserId
        )
        conversation.lastMessageNature = nature
        return conversation
    }

    private func lastStanding(_ conversation: MeeshyConversation) -> EndToEndMessageStanding {
        EndToEndPlaintextLaw.lastMessageStanding(of: conversation, readerLabel: "Vous")
    }

    func test_listRow_peerPlaintextInEndToEnd_isUnencrypted() {
        XCTAssertEqual(lastStanding(conversation()), .unencrypted)
    }

    func test_listRow_encryptedLastMessage_isOrdinary() {
        XCTAssertEqual(lastStanding(conversation(nature: LastMessageNature(messageType: "text", isEncrypted: true))), .ordinary)
    }

    func test_listRow_systemEvent_isOrdinary() {
        let nature = LastMessageNature(messageType: "text", systemEvent: LastMessageSystemEvent(key: "member-joined"))

        XCTAssertEqual(lastStanding(conversation(nature: nature)), .ordinary)
    }

    func test_listRow_readerAuthor_isOrdinary() {
        XCTAssertEqual(lastStanding(conversation(senderName: "Vous", senderUserId: nil)), .ordinary)
    }

    /// Un auteur inconnu ne se désigne pas : la ligne ne l'accuse pas, le fil
    /// le juge sur le message entier.
    func test_listRow_unknownAuthor_isOrdinary() {
        XCTAssertEqual(lastStanding(conversation(senderName: nil, senderUserId: nil)), .ordinary)
    }

    /// Un serveur antérieur à la nature (#7545) ne dit pas si le message est
    /// chiffré : la ligne n'affirme rien.
    func test_listRow_natureUnknown_isOrdinary() {
        XCTAssertEqual(lastStanding(conversation(nature: nil)), .ordinary)
    }

    func test_listRow_conversationWithoutEndToEnd_isUnchanged() {
        XCTAssertEqual(lastStanding(conversation(mode: nil)), .ordinary)
        XCTAssertEqual(lastStanding(conversation(mode: "server")), .ordinary)
    }
}
