import XCTest
import GRDB
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// Le fil lit, sur les lignes GRDB d'une conversation chiffrée, le clair que
/// CET appareil a ouvert (#3707), et seulement à SA place (#11232, B1 de la
/// revue de #12722). Une ligne d'un PAIR ne porte pas `senderUserId` :
/// `MessageRecord.toMessage` ne le pose que pour MES messages, et son
/// `senderId` est l'utilisateur résolu à l'ingestion. C'est donc lui qui dit
/// l'auteur annoncé, et un serveur qui présente mon message comme celui du
/// pair n'obtient qu'une bulle scellée.
@MainActor
final class ConversationThreadDecryptionTests: XCTestCase {

    private let conversationId = "000000000000000000000c71"
    private let messageId = "000000000000000000000a71"
    private let readerId = "user-me"
    private let peerId = "user-other"

    // MARK: - Fabriques

    private func makeRow(localId: String? = nil, senderId: String? = nil, encrypted: Bool = true, content: String? = nil) -> MessageRecord {
        let id = localId ?? messageId
        var record = SendingRowFixture.record(localId: id, conversationId: conversationId)
        record.serverId = id
        record.senderId = senderId ?? peerId
        record.isEncrypted = encrypted
        record.encryptionMode = encrypted ? E2EEWire.mode : nil
        record.content = content ?? E2EEWire.contentPlaceholder
        record.state = .delivered
        return record
    }

    private func opened(_ text: String, by author: String, in conversation: String? = nil) -> E2EEPlaintextEntry {
        .readable(
            E2EEContent(text: text, language: "fr", replyTo: nil, conversationId: conversation ?? conversationId, clientMessageId: nil, sentAt: Date()),
            senderUserId: author
        )
    }

    private func makeSUT(endToEnd: MockEndToEndMessaging) async throws -> ConversationViewModel {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: readerId, username: "me", displayName: "Me"))
        let messageService = MockMessageService()
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let viewModel = ConversationViewModel(
            conversationId: conversationId,
            isDirect: true,
            participantUserId: peerId,
            encryptionMode: E2EEWire.mode,
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(
                persistence: persistence,
                collaborators: ConversationCollaborators(
                    persistence: persistence, syncEngine: ConversationSyncEngine.shared, messageService: messageService
                )
            ),
            networkMonitor: FakeNetworkMonitor(isOnline: false),
            endToEnd: endToEnd
        )
        viewModel.start()
        return viewModel
    }

    private func shown(_ id: String, in viewModel: ConversationViewModel) -> Message? {
        viewModel.messages.first { $0.id == id }
    }

    // MARK: - La règle, sur la forme exacte d'une ligne GRDB

    func test_storeRowOfThePeer_announcesThePeerAsItsAuthor() {
        let message = makeRow().toMessage(currentUserId: readerId)

        XCTAssertNil(message.senderUserId, "précondition : la ligne d'un pair ne porte pas senderUserId")
        XCTAssertEqual(EndToEndThreadPlaintexts.announcedAuthor(of: message), peerId)
    }

    func test_storeRowOfMine_announcesTheReader() {
        let message = makeRow(senderId: readerId).toMessage(currentUserId: readerId)

        XCTAssertEqual(EndToEndThreadPlaintexts.announcedAuthor(of: message), readerId)
    }

    // MARK: - Le fil, de bout en bout

    /// À chaque `messagesDidChange`, la ligne entrante (le littéral servi)
    /// gagne la fusion : le fil relit le clair, sinon la bulle repasse au scellé.
    func test_peerRow_isShownInClear_andStaysInClearAcrossStoreChanges() async throws {
        let endToEnd = MockEndToEndMessaging()
        endToEnd.store(opened("Rendez-vous à midi", by: peerId), for: messageId)
        let viewModel = try await makeSUT(endToEnd: endToEnd)
        let row = makeRow()

        viewModel.messageStore.apply(records: [row])
        let clear = await MessageStoreObservationHelper.awaitMessage(in: viewModel) {
            $0.id == self.messageId && $0.content == "Rendez-vous à midi"
        }
        XCTAssertNotNil(clear, "la ligne GRDB du pair se lit en clair")
        XCTAssertEqual(clear?.isContentDecryptedOnDevice, true)

        let other = makeRow(localId: "000000000000000000000a72", encrypted: false, content: "Salut")
        viewModel.messageStore.apply(records: [row, other])
        let settled = await MessageStoreObservationHelper.awaitCondition {
            self.shown("000000000000000000000a72", in: viewModel) != nil
        }
        XCTAssertTrue(settled, "précondition : une seconde publication du store est arrivée")

        XCTAssertEqual(shown(messageId, in: viewModel)?.content, "Rendez-vous à midi", "jamais le littéral servi")
    }

    func test_myOwnRow_isShownInClear() async throws {
        let endToEnd = MockEndToEndMessaging()
        endToEnd.store(opened("J'arrive", by: readerId), for: messageId)
        let viewModel = try await makeSUT(endToEnd: endToEnd)

        viewModel.messageStore.apply(records: [makeRow(senderId: readerId)])

        let clear = await MessageStoreObservationHelper.awaitMessage(in: viewModel) {
            $0.id == self.messageId && $0.content == "J'arrive"
        }
        XCTAssertNotNil(clear)
    }

    /// Un serveur compromis qui présente MON message comme celui du pair, ou
    /// le message du pair comme celui d'un tiers, n'obtient qu'une bulle scellée.
    func test_rowPresentedUnderAnotherAuthor_staysSealed() async throws {
        let endToEnd = MockEndToEndMessaging()
        endToEnd.store(opened("Mon secret", by: readerId), for: messageId)
        endToEnd.store(opened("Volé", by: peerId), for: "000000000000000000000a73")
        let viewModel = try await makeSUT(endToEnd: endToEnd)

        viewModel.messageStore.apply(records: [
            makeRow(), makeRow(localId: "000000000000000000000a73", senderId: "user-eve"), controlRow(in: endToEnd)
        ])
        await awaitControl(in: viewModel)

        XCTAssertNotEqual(shown(messageId, in: viewModel)?.content, "Mon secret")
        XCTAssertEqual(shown(messageId, in: viewModel)?.isContentDecryptedOnDevice, false)
        XCTAssertNotEqual(shown("000000000000000000000a73", in: viewModel)?.content, "Volé")
    }

    /// Le clair d'une autre conversation, rejoué ici sous le même identifiant,
    /// ne s'y adopte pas.
    func test_plaintextOfAnotherConversation_staysSealed() async throws {
        let endToEnd = MockEndToEndMessaging()
        endToEnd.store(opened("Ailleurs", by: peerId, in: "000000000000000000000c72"), for: messageId)
        let viewModel = try await makeSUT(endToEnd: endToEnd)

        viewModel.messageStore.apply(records: [makeRow(), controlRow(in: endToEnd)])
        await awaitControl(in: viewModel)

        XCTAssertNotEqual(shown(messageId, in: viewModel)?.content, "Ailleurs")
        XCTAssertEqual(shown(messageId, in: viewModel)?.isContentDecryptedOnDevice, false)
    }

    // MARK: - Témoin : le clair du lot a bien été lu

    private let controlId = "000000000000000000000a7f"

    /// Une ligne légitime du MÊME lot : tant qu'elle n'est pas en clair, la
    /// lecture n'a pas eu lieu et un « reste scellé » ne prouverait rien.
    private func controlRow(in endToEnd: MockEndToEndMessaging) -> MessageRecord {
        endToEnd.store(opened("Témoin", by: peerId), for: controlId)
        return makeRow(localId: controlId)
    }

    private func awaitControl(in viewModel: ConversationViewModel) async {
        let control = await MessageStoreObservationHelper.awaitMessage(in: viewModel) {
            $0.id == self.controlId && $0.content == "Témoin"
        }
        XCTAssertNotNil(control, "précondition : le lot a été lu dans la base scellée")
    }
}
