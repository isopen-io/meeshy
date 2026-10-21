import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// **Un vocal confirmé garde son lecteur (#10690).**
///
/// La confirmation d'un envoi remplace les pièces LOCALES du message par celles
/// du serveur, en une écriture qui ne change ni le nombre de messages, ni le
/// premier, ni le dernier identifiant. La liste des pièces audio, gardée en
/// mémoire, ne se vidait que sur un changement de structure : elle gardait
/// l'identifiant local, et la rangée Focal ou Script, qui cherche son vocal par
/// l'identifiant servi, ne dessinait plus de lecteur. Seule la transcription,
/// qui vide cette mémoire, le faisait revenir.
@MainActor
final class ConversationViewModelMediaCacheTests: XCTestCase {

    private static let conversationId = "000000000000000000000c01"

    private func makeSUT() throws -> ConversationViewModel {
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: "000000000000000000000d01", username: "bob", displayName: "Bob"))
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let sut = ConversationViewModel(
            conversationId: Self.conversationId, unreadCount: 0, isDirect: false,
            participantUserId: nil, anonymousSession: nil, authManager: auth,
            messageService: MockMessageService(), conversationService: MockConversationService(),
            reactionService: MockReactionService(), reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool))
        )
        sut.start()
        return sut
    }

    private func audio(_ id: String, url: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, messageId: nil, fileName: "\(id).m4a", originalName: "\(id).m4a",
                                mimeType: "audio/mp4", fileSize: 1_234, filePath: "", fileUrl: url,
                                duration: 3_000, uploadedBy: "000000000000000000000d01")
    }

    private func voice(_ id: String, _ attachment: MeeshyMessageAttachment, at seconds: TimeInterval) -> Message {
        Message(id: id, conversationId: Self.conversationId, senderId: "000000000000000000000d01", content: "",
                messageType: .audio, createdAt: Date(timeIntervalSince1970: seconds),
                attachments: [attachment], senderName: "Bob")
    }

    func test_allAudioItems_followsTheServerPieces_whenTheStructureDoesNotChange() throws {
        let sut = try makeSUT()
        let first = voice("srv-1", audio("srv-att-1", url: "https://cdn.example/1.m4a"), at: 1)
        sut.messages = [first, voice("srv-2", audio("local-att-2", url: "file:///tmp/2.m4a"), at: 2)]
        XCTAssertEqual(sut.allAudioItems.map(\.id), ["srv-att-1", "local-att-2"])

        sut.messages = [first, voice("srv-2", audio("srv-att-2", url: "https://cdn.example/2.m4a"), at: 2)]

        XCTAssertEqual(sut.allAudioItems.map(\.id), ["srv-att-1", "srv-att-2"],
                       "la pièce servie remplace la locale : la rangée retrouve son vocal")
        XCTAssertEqual(sut.allAudioItems.last?.attachment.fileUrl, "https://cdn.example/2.m4a")
    }

    func test_allAudioItems_isKeptWhenNothingChanges() throws {
        let sut = try makeSUT()
        let messages = [voice("srv-1", audio("srv-att-1", url: "https://cdn.example/1.m4a"), at: 1)]
        sut.messages = messages
        XCTAssertEqual(sut.allAudioItems.map(\.id), ["srv-att-1"])

        sut.messages = messages

        XCTAssertEqual(sut.allAudioItems.map(\.id), ["srv-att-1"])
    }

    // MARK: - #10801 — chaque piste garde SA transcription

    private func transcription(of attachmentId: String, _ text: String) -> MessageTranscription {
        MessageTranscription(attachmentId: attachmentId, text: text, language: "fr")
    }

    func test_allAudioItems_threeVoicesOnlyTheFirstTranscribed_servesNoTranscriptionToTheOthers() throws {
        let sut = try makeSUT()
        let first = transcription(of: "att-1", "Ceci est le vocal numéro 1")
        sut.messageTranscriptions = ["msg-3v": first]
        sut.messageTranscriptionsByAttachment = ["att-1": first]
        sut.messages = [Message(id: "msg-3v", conversationId: Self.conversationId, senderId: "000000000000000000000d01",
                                content: "", messageType: .audio, createdAt: Date(timeIntervalSince1970: 1),
                                attachments: [audio("att-1", url: "https://cdn.example/1.m4a"),
                                              audio("att-2", url: "https://cdn.example/2.m4a"),
                                              audio("att-3", url: "https://cdn.example/3.m4a")],
                                senderName: "Bob")]

        XCTAssertEqual(sut.allAudioItems.map { $0.transcription?.text },
                       ["Ceci est le vocal numéro 1", nil, nil])
    }

    func test_allAudioItems_singleVoiceTranscribedOnlyByMessage_keepsItsTranscription() throws {
        let sut = try makeSUT()
        sut.messageTranscriptions = ["srv-1": transcription(of: "srv-att-1", "Bonjour")]
        sut.messages = [voice("srv-1", audio("srv-att-1", url: "https://cdn.example/1.m4a"), at: 1)]

        XCTAssertEqual(sut.allAudioItems.map { $0.transcription?.text }, ["Bonjour"])
    }
}
