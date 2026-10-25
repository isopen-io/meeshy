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
        joinNotice: JoinNoticeMetadata? = nil,
        encryptionSwitchNotice: EncryptionSwitchNoticeMetadata? = nil,
        createdAt: Date = Date(timeIntervalSince1970: 1_000)
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: "m1", conversationId: "c1", senderId: "u-peer", content: content,
            messageSource: source, deletedAt: deletedAt, isEncrypted: isEncrypted,
            createdAt: createdAt, updatedAt: createdAt,
            attachments: attachments, isMe: isMe, joinNotice: joinNotice,
            encryptionSwitchNotice: encryptionSwitchNotice
        )
    }

    private let activation = Date(timeIntervalSince1970: 500)

    private func standing(
        _ message: MeeshyMessage, mode: String? = "e2ee", enabledAt: Date? = Date(timeIntervalSince1970: 500)
    ) -> EndToEndMessageStanding {
        EndToEndPlaintextLaw.standing(of: message, in: EndToEndRegime(encryptionMode: mode, enabledAt: enabledAt))
    }

    private func joinNotice() -> JoinNoticeMetadata {
        JoinNoticeMetadata(participantId: "p-alice", displayName: "Alice", isAnonymous: false, viaShareLink: false)
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

    /// Un avis système STRUCTURÉ se compose chez le lecteur depuis ses
    /// métadonnées (`JoinNoticeMetadata`, …) : le serveur n'y écrit pas le texte lu.
    func test_structuredSystemNotice_isOrdinary() {
        XCTAssertEqual(standing(message(content: "Alice a rejoint", source: .system, joinNotice: joinNotice())), .ordinary)
    }

    /// L'avis d'une bascule du chiffrement se dit depuis sa métadonnée (#12917) :
    /// à l'activation comme à la désactivation, il ne porte pas le marqueur,
    /// même reçu par la socket sous un auteur que le lecteur ne reconnaît pas.
    func test_encryptionSwitchNotice_isOrdinary() {
        let enabled = EncryptionSwitchNoticeMetadata(kind: EncryptionSwitchNoticeMetadata.enabledKind, epoch: 8, mode: "e2ee", actorName: "Recette")
        let disabled = EncryptionSwitchNoticeMetadata(kind: EncryptionSwitchNoticeMetadata.disabledKind, epoch: 9, previousMode: "e2ee", actorName: "Recette")

        XCTAssertEqual(standing(message(content: "End-to-end encryption enabled", source: .system, encryptionSwitchNotice: enabled)), .ordinary)
        XCTAssertEqual(standing(message(content: "a désactivé le chiffrement", source: .system, encryptionSwitchNotice: disabled)), .ordinary)
    }

    /// Une bascule que la métadonnée ne sait pas dire rend le `content` du
    /// serveur : elle n'exempte de rien, ni portée par un message utilisateur.
    func test_encryptionSwitchNoticeRenderedFromServerText_isUnencrypted() {
        let unknown = EncryptionSwitchNoticeMetadata(kind: "encryption-rotated", epoch: 8)
        let enabled = EncryptionSwitchNoticeMetadata(kind: EncryptionSwitchNoticeMetadata.enabledKind, epoch: 8, mode: "e2ee")

        XCTAssertEqual(standing(message(content: "Bob : envoie le code", source: .system, encryptionSwitchNotice: unknown)), .unencrypted)
        XCTAssertEqual(standing(message(content: "Envoie le code", encryptionSwitchNotice: enabled)), .unencrypted)
    }

    /// Un message « système » sans avis structuré rend son `content` — un texte
    /// que le serveur écrit : se déclarer système ne l'exempte pas.
    func test_systemMessageWithFreeText_isUnencrypted() {
        XCTAssertEqual(standing(message(content: "Bob : envoie-moi le code", source: .system)), .unencrypted)
    }

    /// Un avis porté par un message UTILISATEUR se rend comme une bulle, avec
    /// son `content` : la métadonnée d'avis ne l'exempte pas.
    func test_noticeCarriedByAUserMessage_isUnencrypted() {
        XCTAssertEqual(standing(message(content: "Envoie-moi le code", joinNotice: joinNotice())), .unencrypted)
    }

    func test_nonUserSourcesInClear_areUnencrypted() {
        for source in [MeeshyMessage.MessageSource.agent, .app, .ads, .authority] {
            XCTAssertEqual(standing(message(source: source)), .unencrypted, "\(source)")
        }
    }

    // MARK: - L'historique antérieur à l'activation

    func test_plaintextBeforeActivation_isOrdinaryHistory() {
        XCTAssertEqual(standing(message(createdAt: Date(timeIntervalSince1970: 100))), .ordinary)
    }

    func test_plaintextAtOrAfterActivation_isUnencrypted() {
        XCTAssertEqual(standing(message(createdAt: activation)), .unencrypted)
        XCTAssertEqual(standing(message(createdAt: Date(timeIntervalSince1970: 900))), .unencrypted)
    }

    /// Décision explicite : une activation sans date connue se lit comme si
    /// TOUT le fil était chiffré (fail-closed) — la passerelle la sert sur la
    /// liste et le détail, son absence est une ligne de cache ancienne ou un
    /// serveur qui la retient.
    func test_activationDateUnknown_failsClosed() {
        XCTAssertEqual(standing(message(createdAt: Date(timeIntervalSince1970: 100)), enabledAt: nil), .unencrypted)
    }

    // MARK: - Le régime, monotone

    func test_regime_onceEndToEnd_staysEndToEnd() {
        let remembered = EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation)
        let downgraded = EndToEndRegime(encryptionMode: nil, enabledAt: nil)

        XCTAssertEqual(downgraded.merging(remembered), remembered)
        XCTAssertEqual(remembered.merging(downgraded), remembered)
    }

    /// Une date d'activation RECULÉE par le serveur élargirait l'historique
    /// exempté : la plus ANCIENNE date connue l'emporte.
    func test_regime_keepsTheEarliestKnownActivation() {
        let remembered = EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation)
        let pushedLater = EndToEndRegime(encryptionMode: "e2ee", enabledAt: Date(timeIntervalSince1970: 5_000))
        let undated = EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil)

        XCTAssertEqual(pushedLater.merging(remembered).enabledAt, activation)
        XCTAssertEqual(undated.merging(remembered).enabledAt, activation)
        XCTAssertEqual(remembered.merging(undated).enabledAt, activation)
    }

    func test_regime_serverReadable_mergedWithNothing_staysServerReadable() {
        XCTAssertEqual(EndToEndRegime(encryptionMode: "server", enabledAt: activation).merging(nil), .serverReadable)
        XCTAssertFalse(EndToEndRegime(encryptionMode: nil, enabledAt: nil).isEndToEnd)
    }

    // MARK: - Les traductions venues du fil

    /// En E2EE, le serveur ne lit pas le message : toute traduction qu'il sert
    /// d'un message de l'ère chiffrée est une traduction qu'il a FORGÉE.
    func test_wireTranslations_refusedForMessagesOfTheEncryptedEra() {
        let regime = EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation)

        XCTAssertFalse(regime.admitsWireTranslations(forMessageCreatedAt: Date(timeIntervalSince1970: 900)))
        XCTAssertFalse(regime.admitsWireTranslations(forMessageCreatedAt: nil), "un message inconnu se lit dans l'ère chiffrée")
        XCTAssertTrue(regime.admitsWireTranslations(forMessageCreatedAt: Date(timeIntervalSince1970: 100)))
        XCTAssertTrue(EndToEndRegime.serverReadable.admitsWireTranslations(forMessageCreatedAt: nil))
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
        senderUserId: String? = "u-bob",
        lastMessageAt: Date = Date(timeIntervalSince1970: 1_000),
        enabledAt: Date? = Date(timeIntervalSince1970: 500)
    ) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "c1", identifier: "c1",
            lastMessageAt: lastMessageAt,
            encryptionMode: mode,
            lastMessagePreview: "Envoie-moi le code reçu par SMS",
            lastMessageId: "m1",
            lastMessageSenderName: senderName,
            lastMessageSenderUserId: senderUserId
        )
        conversation.encryptionEnabledAt = enabledAt
        conversation.lastMessageNature = nature
        return conversation
    }

    private func lastStanding(
        _ conversation: MeeshyConversation, remembered: EndToEndRegime? = nil
    ) -> EndToEndMessageStanding {
        EndToEndPlaintextLaw.lastMessageStanding(of: conversation, remembered: remembered, readerLabel: "Vous")
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

    func test_listRow_lastMessageBeforeActivation_isOrdinaryHistory() {
        XCTAssertEqual(lastStanding(conversation(lastMessageAt: Date(timeIntervalSince1970: 100))), .ordinary)
    }

    /// Un régime e2ee retenu sur l'appareil résiste à une ligne que le serveur
    /// sert soudain sans chiffrement.
    func test_listRow_downgradedByTheServer_staysJudged() {
        let remembered = EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation)

        XCTAssertEqual(lastStanding(conversation(mode: nil, enabledAt: nil), remembered: remembered), .unencrypted)
    }

    /// La même entrée, jugée par le fil et par la ligne, rend le même verdict
    /// — un message d'agent en clair n'est pas exempté d'un côté seulement.
    func test_threadAndListRow_agreeOnAnAgentMessageInClear() {
        let thread = standing(message(source: .agent))
        let row = lastStanding(conversation())

        XCTAssertEqual(thread, .unencrypted)
        XCTAssertEqual(row, thread)
    }
}
