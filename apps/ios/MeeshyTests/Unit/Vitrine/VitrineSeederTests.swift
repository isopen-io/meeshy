import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

@MainActor
final class VitrineSeederTests: XCTestCase {
    private var echantillon: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Resources/VitrineFixtures-fr.json")
    }

    private func fixtures() throws -> VitrineFixtures {
        try VitrineFixtures.decoder(Data(contentsOf: echantillon))
    }

    func test_remplir_kitSample_writesEveryDomainForTheCurrentReader() async throws {
        let f = try fixtures()
        let cibles = CiblesEnregistreuses()
        try await VitrineSeeder.remplir(f, dans: cibles)

        XCTAssertEqual(cibles.conversations.count, f.conversations.count)
        XCTAssertTrue(cibles.conversations.contains { $0.type == .global })
        XCTAssertEqual(cibles.languesParLot, Array(repeating: ["fr"], count: f.messages.count))
        XCTAssertEqual(cibles.cleProgression, "engagement:\(f.lecteur.id)")
    }

    func test_remplir_kitSample_fixeLeModeScriptPourMeeshyGlobal() async throws {
        let f = try fixtures()
        let cibles = CiblesEnregistreuses()
        try await VitrineSeeder.remplir(f, dans: cibles)
        let global = try XCTUnwrap(f.conversations.first { $0.type == "global" })
        XCTAssertEqual(cibles.modes[global.id], .script)
        XCTAssertEqual(cibles.modesUserId, f.lecteur.id)
    }

    /// Relu par les VRAIS chemins de lecture : `MessageRecord.toMessage` et les traductions que
    /// le Prisme sert au lecteur.
    func test_remplir_messagesAndTranslations_areReadBackByTheRealReadPaths() async throws {
        let f = try fixtures()
        let base = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: base)
        try await VitrineSeeder.remplir(f, dans: CiblesMessagesReels(persistence: MessagePersistenceActor(dbWriter: base)))

        let attendus = f.messages.values.flatMap { $0 }
        let lus = try await base.read { db in try MessageRecord.fetchAll(db) }.map { $0.toMessage(currentUserId: f.lecteur.id) }
        XCTAssertEqual(Set(lus.map(\.content)), Set(attendus.compactMap(\.content)))
        let traductions = try await base.read { db in try TranslationRecord.fetchAll(db) }
        for message in attendus where message.messageType == "text" && message.originalLanguage != f.lang {
            let servie = traductions.first { $0.messageServerId == message.id && $0.targetLanguage == f.lang }
            XCTAssertEqual(servie?.translatedContent, message.translations?.first { $0.targetLanguage == f.lang }?.translatedContent,
                           "Le Prisme n'aurait rien à servir au lecteur pour \(message.id).")
        }
    }
}

@MainActor
private final class CiblesEnregistreuses: VitrineSeedTargets {
    nonisolated deinit {}

    private(set) var conversations: [MeeshyConversation] = []
    private(set) var languesParLot: [[String]] = []
    private(set) var cleProgression: String?
    private(set) var modes: [String: ReadingModeOrchestrator.ConversationReadingMode] = [:]
    private(set) var modesUserId: String?

    func enregistrerConversations(_ conversations: [MeeshyConversation]) async throws { self.conversations = conversations }
    func enregistrerMessages(_ messages: [APIMessage], langues: [String]) async throws { languesParLot.append(langues) }
    func enregistrerProgression(_ progression: APIEngagementProgress, cle: String) async throws { cleProgression = cle }
    func fixerModeDeLecture(_ mode: ReadingModeOrchestrator.ConversationReadingMode, conversationId: String, userId: String) {
        modes[conversationId] = mode
        modesUserId = userId
    }
}

@MainActor
private struct CiblesMessagesReels: VitrineSeedTargets {
    let persistence: MessagePersistenceActor

    func enregistrerConversations(_ conversations: [MeeshyConversation]) async throws {}
    func enregistrerMessages(_ messages: [APIMessage], langues: [String]) async throws {
        try await persistence.upsertFromAPIMessages(messages, preferredLanguages: langues)
    }
    func enregistrerProgression(_ progression: APIEngagementProgress, cle: String) async throws {}
    func fixerModeDeLecture(_ mode: ReadingModeOrchestrator.ConversationReadingMode, conversationId: String, userId: String) {}
}
