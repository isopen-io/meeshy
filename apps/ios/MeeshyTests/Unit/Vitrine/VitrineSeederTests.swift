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

    /// Chaque média sous la clé que lisent les vues — celle de l'atelier Imagine, comme celle
    /// des bulles (`MeeshyConfig.resolveMediaURL`, relative face à l'hôte mort).
    func test_remplirLesCaches_storesEveryMediaUnderTheKeyTheViewsRead() async throws {
        let f = try fixtures()
        let cibles = CiblesEnregistreuses()
        try await VitrineSeeder.remplirLesCaches(f, medias: try Self.dossierDeMedias(f), dans: cibles)
        XCTAssertEqual(cibles.medias.map(\.cle), f.medias.map { MessageCardMediaLoader.resolved($0.url) })
        XCTAssertEqual(cibles.medias.map(\.genre), f.medias.map(\.genre))
        XCTAssertTrue(cibles.medias.contains { $0.genre == .audio })
    }

    func test_remplirLesCaches_missingMedia_failsNamingIt() async throws {
        let f = try fixtures()
        let vide = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try await VitrineSeeder.remplirLesCaches(f, medias: vide, dans: CiblesEnregistreuses())
            XCTFail("Un média absent aurait dû arrêter la vitrine.")
        } catch {
            XCTAssertEqual(error as? VitrineSeederErreur, .mediaAbsent(f.medias[0].fichier))
        }
    }

    /// Le fil de l'iPad (#8922) : les posts du kit, servis par le Prisme dans la langue du lecteur.
    func test_remplirLesCaches_feedServesTheKitPostsInTheReadersLanguage() async throws {
        let f = try fixtures()
        let cibles = CiblesEnregistreuses()
        try await VitrineSeeder.remplirLesCaches(f, medias: try Self.dossierDeMedias(f), dans: cibles)
        XCTAssertEqual(cibles.cleDuFil, "main-feed")
        XCTAssertEqual(cibles.fil.map(\.id), f.posts.map(\.id))
        let japonais = try XCTUnwrap(cibles.fil.first { $0.originalLanguage == "ja" })
        XCTAssertEqual(japonais.displayContent, f.posts.first { $0.id == japonais.id }?.translations?["fr"]?.text)
    }

    func test_remplir_noConversationCarriesAnEncryptionLock() async throws {
        let cibles = CiblesEnregistreuses()
        try await VitrineSeeder.remplir(try fixtures(), dans: cibles)
        XCTAssertTrue(cibles.conversations.contains { $0.type == .direct })
        XCTAssertTrue(cibles.conversations.allSatisfy { $0.encryptionMode == nil })
    }

    /// Le vocal de la scène 1 relu par les VRAIS chemins : sa transcription et la piste que le
    /// Prisme sert à la lectrice, karaoké compris.
    func test_remplir_voiceNoteAndItsTrack_areReadBackByTheRealReadPaths() async throws {
        let f = try fixtures()
        let amour = try XCTUnwrap(f.scenes["amour"])
        let attendue = try XCTUnwrap(f.messages[amour.conversationId]?.first { $0.id == amour.messageId }?.attachments?.first?.translations?["fr"])
        let base = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: base)
        try await VitrineSeeder.remplir(f, dans: CiblesMessagesReels(persistence: MessagePersistenceActor(dbWriter: base)))

        let lus = try await base.read { db in try MessageRecord.fetchAll(db) }.map { $0.toMessage(currentUserId: f.lecteur.id) }
        let piece = try XCTUnwrap(lus.flatMap(\.attachments).first { $0.id == amour.attachmentId })
        XCTAssertEqual(piece.transcription?.language, "ko")
        XCTAssertEqual(piece.audioTranslations?["fr"]?.url, attendue.url)
        XCTAssertEqual(piece.audioTranslations?["fr"]?.segments?.count, attendue.segments?.count)
    }

    /// Un vocal resynthétisé garde son URL : le cache doit servir le NOUVEAU fichier. `seed` seul,
    /// idempotent, garderait l'ancien — et l'écran jouerait une piste que les fixtures ne décrivent plus.
    func test_remplacer_aMediaAlreadyCached_servesTheNewFile() async throws {
        let racine = FileManager.default.temporaryDirectory.appendingPathComponent("vitrine-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: racine, withIntermediateDirectories: true)
        let politique = CachePolicy(ttl: 3600, staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Vitrine", maxBytes: 10_000_000))
        let store = DiskCacheStore(policy: politique, baseDirectory: racine)
        let ancien = racine.appendingPathComponent("ancien.m4a")
        let nouveau = racine.appendingPathComponent("nouveau.m4a")
        try Data("ancien".utf8).write(to: ancien)
        try Data("nouveau".utf8).write(to: nouveau)
        let cle = "/api/v1/attachments/file/vitrine/vocal-minjun.p-fr.m4a"
        await store.seed(copyingLocalFile: ancien, for: cle)

        await VitrineSeeder.remplacer(nouveau, dans: store, cle: cle)

        let fichierServi = await store.localFileURL(for: cle)
        let servi = try XCTUnwrap(fichierServi)
        XCTAssertEqual(try Data(contentsOf: servi), Data("nouveau".utf8))
    }

    /// Un dossier où chaque média des fixtures existe — le script de capture y dépose les vrais.
    private static func dossierDeMedias(_ f: VitrineFixtures) throws -> URL {
        let dossier = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
        for media in f.medias { try Data([0]).write(to: dossier.appendingPathComponent(media.fichier)) }
        return dossier
    }
}

@MainActor
private final class CiblesEnregistreuses: VitrineSeedTargets {
    nonisolated deinit {}

    struct MediaRange: Equatable {
        let cle: String
        let genre: VitrineFixtures.Media.Genre
    }

    private(set) var conversations: [MeeshyConversation] = []
    private(set) var languesParLot: [[String]] = []
    private(set) var cleProgression: String?
    private(set) var modes: [String: ReadingModeOrchestrator.ConversationReadingMode] = [:]
    private(set) var modesUserId: String?
    private(set) var medias: [MediaRange] = []
    private(set) var fil: [FeedPost] = []
    private(set) var cleDuFil: String?

    func enregistrerConversations(_ conversations: [MeeshyConversation]) async throws { self.conversations = conversations }
    func enregistrerMessages(_ messages: [APIMessage], langues: [String]) async throws { languesParLot.append(langues) }
    func enregistrerProgression(_ progression: APIEngagementProgress, cle: String) async throws { cleProgression = cle }
    func fixerModeDeLecture(_ mode: ReadingModeOrchestrator.ConversationReadingMode, conversationId: String, userId: String) {
        modes[conversationId] = mode
        modesUserId = userId
    }
    func enregistrerMedia(_ fichier: URL, genre: VitrineFixtures.Media.Genre, cle: String) async { medias.append(MediaRange(cle: cle, genre: genre)) }
    func enregistrerFil(_ posts: [FeedPost], cle: String) async throws {
        fil = posts
        cleDuFil = cle
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
    func enregistrerMedia(_ fichier: URL, genre: VitrineFixtures.Media.Genre, cle: String) async {}
    func enregistrerFil(_ posts: [FeedPost], cle: String) async throws {}
}
