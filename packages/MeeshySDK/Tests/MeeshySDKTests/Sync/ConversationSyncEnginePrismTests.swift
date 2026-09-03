import XCTest
import GRDB
@testable import MeeshySDK

/// Le message CITÉ descend le Prisme du lecteur sur les chemins que le moteur
/// de synchronisation grave lui-même (#4945, seconde moitié).
///
/// `APIMessage.toMessage(preferredLanguages:)` et `upsertFromAPIMessages
/// (_:preferredLanguages:)` savent descendre le Prisme depuis la première
/// moitié du lot — mais avec un défaut `[]`, qui sert l'ORIGINAL. Un
/// résolveur que personne n'alimente n'a corrigé personne : la question n'est
/// pas seulement « élit-il le bon rang ? » mais « qui lui REMET le prisme ? ».
/// Deux témoins de comportement (chargement forcé, pagination arrière) et une
/// garde de source pour les deux sites que les mocks n'atteignent pas sans
/// rejouer un socket (`handleNewMessage`, `handleEditedMessage`) et pour le
/// puits d'ingestion bufferisée de `MessagePersistenceActor`.
///
/// Le témoin de rang s'écrit sur un rang AUTRE que le premier (leçon 261) :
/// au rang 1, le court-circuit interdit et la règle juste rendent le même
/// verdict.
///
/// XCTest et non Swift Testing, comme ses voisines de `Sync/` : la suite
/// mute `AuthManager.shared.currentUser`, un singleton de processus, et doit
/// s'exécuter en série avec restauration au `tearDown`.
final class ConversationSyncEnginePrismTests: XCTestCase {

    private var originalUser: MeeshyUser?

    override func setUp() async throws {
        try await super.setUp()
        originalUser = await MainActor.run { AuthManager.shared.currentUser }
        await MainActor.run {
            AuthManager.shared.currentUser = MeeshyUser(
                id: "u-me", username: "me", systemLanguage: "de", regionalLanguage: "fr"
            )
        }
    }

    override func tearDown() async throws {
        let restored = originalUser
        await MainActor.run { AuthManager.shared.currentUser = restored }
        try await super.tearDown()
    }

    // MARK: - Fabriques

    private func makeEngine(messageService: MockMessageService) throws -> (ConversationSyncEngine, CacheCoordinator) {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let cache = CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
        let engine = ConversationSyncEngine(
            cache: cache,
            conversationService: MockConversationService(),
            messageService: messageService,
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            api: MockAPIClient()
        )
        return (engine, cache)
    }

    private func translation(_ language: String, _ text: String) -> String {
        """
        {"id":"q1-\(language)","messageId":"q1","targetLanguage":"\(language)","translatedContent":"\(text)","translationModel":"nllb"}
        """
    }

    /// `GET /messages` tel que la passerelle le sert : le message `m1` cite
    /// `q1`, écrit en anglais, avec les traductions demandées.
    private func makeResponse(quotedTranslations: [String]) throws -> MessagesAPIResponse {
        let json = """
        {"success":true,"data":[{
          "id":"m1","conversationId":"conv1","senderId":"u2","content":"Reply","createdAt":"2026-09-03T10:00:00Z",
          "replyToId":"q1",
          "replyTo":{"id":"q1","content":"Hello","originalLanguage":"en","senderId":"p-bob",
                     "sender":{"id":"p-bob","displayName":"Bob","userId":"u-bob"},
                     "translations":[\(quotedTranslations.joined(separator: ","))],"attachments":[]}
        }],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(MessagesAPIResponse.self, from: Data(json.utf8))
    }

    private func cachedQuote(in cache: CacheCoordinator) async -> ReplyReference? {
        await cache.messages.load(for: "conv1").snapshot()?.first(where: { $0.id == "m1" })?.replyTo
    }

    // MARK: - ensureMessages

    func test_ensureMessages_servesTheRankTwoTranslationOfTheQuote() async throws {
        let service = MockMessageService()
        service.listResult = .success(try makeResponse(quotedTranslations: [
            translation("es", "Hola"), translation("fr", "Bonjour")
        ]))
        let (engine, cache) = try makeEngine(messageService: service)

        await engine.ensureMessages(for: "conv1", force: true)

        let quote = await cachedQuote(in: cache)
        XCTAssertEqual(quote?.previewText, "Bonjour",
                       "le lecteur [de, fr] lit la citation au rang 2 ; « Hola » (translations.first) serait pire que l'original")
    }

    func test_ensureMessages_withoutTranslationInThePrism_servesTheOriginal() async throws {
        let service = MockMessageService()
        service.listResult = .success(try makeResponse(quotedTranslations: [translation("es", "Hola")]))
        let (engine, cache) = try makeEngine(messageService: service)

        await engine.ensureMessages(for: "conv1", force: true)

        let quote = await cachedQuote(in: cache)
        XCTAssertEqual(quote?.previewText, "Hello", "nil ⇒ l'original, jamais `translations.first`")
    }

    // MARK: - fetchOlderMessages

    func test_fetchOlderMessages_servesTheQuoteInTheReaderLanguage() async throws {
        let service = MockMessageService()
        service.listBeforeResult = .success(try makeResponse(quotedTranslations: [
            translation("es", "Hola"), translation("fr", "Bonjour")
        ]))
        let (engine, cache) = try makeEngine(messageService: service)

        await engine.fetchOlderMessages(for: "conv1", before: "m-newer")

        let quote = await cachedQuote(in: cache)
        XCTAssertEqual(quote?.previewText, "Bonjour",
                       "la pagination arrière grave la même citation que le chargement initial")
    }

    // MARK: - Garde de source : chaque site remet le prisme

    /// Les deux sites SOCKET du moteur (`handleNewMessage`, `handleEditedMessage`)
    /// ne s'atteignent pas sans rejouer un fil ; le puits bufferisé de
    /// `MessagePersistenceActor` non plus. La garde lit les fichiers réels,
    /// commentaires retirés, et exige que CHAQUE appel à `toMessage(` du
    /// moteur et l'appel à `upsertFromAPIMessages(` du puits portent
    /// `preferredLanguages:` — un site qui retombe sur le défaut `[]` a l'air
    /// correct et sert l'original.
    func test_everyConversionSite_passesTheReaderPrism() throws {
        let engine = try Self.source("Sync/ConversationSyncEngine.swift")
        let calls = Self.callSites(of: ".toMessage(", in: engine)
        XCTAssertEqual(calls.count, 4, "ancrage : quatre conversions vivent dans le moteur (chargement, pagination, message:new, message:edited)")
        for call in calls {
            XCTAssertTrue(call.contains("preferredLanguages:"), "un `toMessage(` sans prisme sert l'original : \(call)")
        }

        let persistence = try Self.source("Persistence/MessagePersistenceActor.swift")
        let sinks = Self.callSites(of: "self.upsertFromAPIMessages(", in: persistence)
        XCTAssertEqual(sinks.count, 1, "ancrage : le puits d'ingestion bufferisée est unique")
        XCTAssertTrue(sinks.allSatisfy { $0.contains("preferredLanguages: Self.readerPrism()") },
                      "le puits `.upsertAPIMessages` doit remettre `Self.readerPrism()` — c'est là que convergent le relais global et le socket de la conversation")
    }

    // MARK: - Lecture de source

    private static func source(_ relativePath: String) throws -> String {
        // Quatre remontées, comme `CallEmitSourceGuardTests` et
        // `SocketLifecycleBindingGuardTests` depuis la même profondeur : la
        // première quitte le FICHIER, les trois suivantes les trois dossiers.
        // Trois seulement laissaient l'URL sur `Tests/` et la lecture échouait
        // — une garde qui ne lit rien ne garde rien.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // .../Tests/MeeshySDKTests/Sync
            .deletingLastPathComponent() // .../Tests/MeeshySDKTests
            .deletingLastPathComponent() // .../Tests
            .deletingLastPathComponent() // .../packages/MeeshySDK
            .appendingPathComponent("Sources/MeeshySDK/\(relativePath)")
        return stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Chaque appel `needle(...)`, parenthèses équilibrées, pour qu'un appel
    /// écrit sur deux lignes soit lu en entier.
    private static func callSites(of needle: String, in source: String) -> [String] {
        var sites: [String] = []
        var searchRange = source.startIndex..<source.endIndex
        while let found = source.range(of: needle, range: searchRange) {
            var depth = 0
            var cursor = found.upperBound
            var end = found.upperBound
            scan: while cursor < source.endIndex {
                switch source[cursor] {
                case "(": depth += 1
                case ")":
                    if depth == 0 { end = cursor; break scan }
                    depth -= 1
                default: break
                }
                cursor = source.index(after: cursor)
            }
            sites.append(String(source[found.lowerBound...end]))
            searchRange = source.index(after: end)..<source.endIndex
        }
        return sites
    }

    /// Même forme que `TusUploadManagerSourceGuardTests.stripComments` — dupliquée
    /// plutôt qu'importée, ce helper y étant privé.
    private static func stripComments(_ source: String) -> String {
        enum Mode { case code, string, lineComment, blockComment }
        var mode: Mode = .code
        var result = ""
        var escaped = false
        var pending: Character?

        for character in source {
            switch mode {
            case .code:
                if let slash = pending {
                    pending = nil
                    if character == "/" { mode = .lineComment; continue }
                    if character == "*" { mode = .blockComment; continue }
                    result.append(slash)
                }
                if character == "/" { pending = "/"; continue }
                if character == "\"" { mode = .string }
                result.append(character)
            case .string:
                result.append(character)
                if escaped { escaped = false; continue }
                if character == "\\" { escaped = true; continue }
                if character == "\"" { mode = .code }
            case .lineComment:
                if character == "\n" { mode = .code; result.append(character) }
            case .blockComment:
                if character == "/" && pending == "*" { pending = nil; mode = .code; continue }
                pending = character == "*" ? "*" : nil
            }
        }
        return result
    }
}
