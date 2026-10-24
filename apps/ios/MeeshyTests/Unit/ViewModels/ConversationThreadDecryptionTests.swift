import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

/// Le fil déchiffre les lignes GRDB d'une conversation directe (#11232, B1 de
/// la revue de #12722). Une ligne d'un PAIR ne porte pas `senderUserId` :
/// `MessageRecord.toMessage` ne le pose que pour MES messages, et son
/// `senderId` est déjà l'identifiant utilisateur résolu à l'ingestion. La clé
/// se cherche sous le pair que la conversation connaît localement
/// (`participantUserId`), jamais sous un expéditeur affirmé par message.
@MainActor
final class ConversationThreadDecryptionTests: XCTestCase {

    private let conversationId = "000000000000000000000c71"
    private let messageId = "000000000000000000000a71"
    private let readerId = "user-me"
    private let peerId = "user-other"
    private let ciphertext = Data([1, 2, 3, 4]).base64EncodedString()

    private var peer: DirectSessionPeer { DirectSessionPeer(peerUserId: peerId, readerUserId: readerId)! }

    // MARK: - Fabriques

    private func makeRow(localId: String? = nil, senderId: String? = nil, encrypted: Bool = true, content: String? = nil) -> MessageRecord {
        let id = localId ?? messageId
        var record = SendingRowFixture.record(localId: id, conversationId: conversationId)
        record.serverId = id
        record.senderId = senderId ?? peerId
        record.isEncrypted = encrypted
        record.content = content ?? ciphertext
        record.state = .delivered
        return record
    }

    private func makeSUT(
        decryptor: any OnDeviceMessageDecrypting,
        participantUserId: String? = "user-other",
        isDirect: Bool = true
    ) async throws -> ConversationViewModel {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: readerId, username: "me", displayName: "Me"))
        let messageService = MockMessageService()
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let viewModel = ConversationViewModel(
            conversationId: conversationId,
            isDirect: isDirect,
            participantUserId: participantUserId,
            encryptionMode: "e2ee",
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(
                dbPool: pool, persistence: persistence,
                collaborators: ConversationCollaborators(
                    persistence: persistence, syncEngine: ConversationSyncEngine.shared,
                    messageService: messageService, decryptor: decryptor
                )
            ),
            networkMonitor: FakeNetworkMonitor(isOnline: false)
        )
        viewModel.start()
        return viewModel
    }

    private func shown(_ id: String, in viewModel: ConversationViewModel) -> Message? {
        viewModel.messages.first { $0.id == id }
    }

    // MARK: - La règle, sur la forme exacte d'une ligne GRDB

    func test_storeRowOfPeerEncryptedMessage_buildsAPayloadUnderThePeerUserId() throws {
        let message = makeRow().toMessage(currentUserId: readerId)
        XCTAssertNil(message.senderUserId, "précondition : la ligne d'un pair ne porte pas senderUserId")

        let payload = try XCTUnwrap(DecryptionPayload(decrypting: message, under: peer))

        XCTAssertEqual(payload.senderId, "user-other")
    }

    func test_storeRowOfMyEncryptedMessage_opensUnderThePeerSession() throws {
        let message = makeRow(senderId: readerId).toMessage(currentUserId: readerId)

        XCTAssertEqual(try XCTUnwrap(DecryptionPayload(decrypting: message, under: peer)).senderId, "user-other")
    }

    func test_storeRowOfAThirdParty_buildsNoPayload() {
        let message = makeRow(senderId: "user-eve").toMessage(currentUserId: readerId)

        XCTAssertNil(DecryptionPayload(decrypting: message, under: peer))
    }

    // MARK: - Le fil, de bout en bout

    /// À chaque `messagesDidChange`, la ligne entrante (cryptogramme) gagne la
    /// fusion : le fil doit la redemander sous le pair, sinon la bulle repasse
    /// au cryptogramme.
    func test_peerRow_isShownInClear_andStaysInClearAcrossStoreChanges() async throws {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi"])
        let viewModel = try await makeSUT(decryptor: decryptor)
        let row = makeRow()

        viewModel.messageStore.apply(records: [row])
        let clear = await MessageStoreObservationHelper.awaitMessage(in: viewModel) {
            $0.id == self.messageId && $0.content == "Rendez-vous à midi"
        }
        XCTAssertNotNil(clear, "la ligne GRDB du pair se déchiffre")
        XCTAssertEqual(clear?.isContentDecryptedOnDevice, true)

        let other = makeRow(localId: "000000000000000000000a72", encrypted: false, content: "Salut")
        viewModel.messageStore.apply(records: [row, other])
        let settled = await MessageStoreObservationHelper.awaitCondition {
            self.shown("000000000000000000000a72", in: viewModel) != nil
        }
        XCTAssertTrue(settled, "précondition : une seconde publication du store est arrivée")

        XCTAssertEqual(shown(messageId, in: viewModel)?.content, "Rendez-vous à midi", "jamais le cryptogramme")
        let payloads = await decryptor.receivedPayloads
        XCTAssertFalse(payloads.isEmpty)
        XCTAssertTrue(payloads.allSatisfy { $0.senderId == "user-other" }, "la clé se cherche sous le pair local")
    }

    /// Mon propre message, relu de GRDB après l'écho, s'ouvre sous la session
    /// du pair (m3) au lieu de rester au cryptogramme.
    func test_myOwnRow_isShownInClear() async throws {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "J'arrive"])
        let viewModel = try await makeSUT(decryptor: decryptor)

        viewModel.messageStore.apply(records: [makeRow(senderId: readerId)])

        let clear = await MessageStoreObservationHelper.awaitMessage(in: viewModel) {
            $0.id == self.messageId && $0.content == "J'arrive"
        }
        XCTAssertNotNil(clear)
    }

    /// Pair local inconnu ⇒ aucune demande ; un tiers annoncé ⇒ aucune demande.
    func test_unknownPeer_orThirdPartyAuthor_neverReachesTheDecryptor() async throws {
        let decryptor = MockPreviewDecryptor(plaintexts: [messageId: "Rendez-vous à midi", "000000000000000000000a73": "Volé"])
        let orphan = try await makeSUT(decryptor: decryptor, participantUserId: nil)
        orphan.messageStore.apply(records: [makeRow()])
        _ = await MessageStoreObservationHelper.awaitCondition { self.shown(self.messageId, in: orphan) != nil }

        let viewModel = try await makeSUT(decryptor: decryptor)
        viewModel.messageStore.apply(records: [makeRow(localId: "000000000000000000000a73", senderId: "user-eve")])
        _ = await MessageStoreObservationHelper.awaitCondition { self.shown("000000000000000000000a73", in: viewModel) != nil }

        let calls = await decryptor.callCount
        XCTAssertEqual(calls, 0)
        XCTAssertNotEqual(shown(messageId, in: orphan)?.content, "Rendez-vous à midi")
        XCTAssertNotEqual(shown("000000000000000000000a73", in: viewModel)?.content, "Volé")
    }
}
