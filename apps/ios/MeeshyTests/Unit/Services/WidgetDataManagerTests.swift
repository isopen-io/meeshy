import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class WidgetDataManagerTests: XCTestCase {

    // MARK: - appgroup-01 — wipeAll (wipe de logout)

    private func makeWipeSUT() throws -> (WidgetDataManager, UserDefaults, [URL]) {
        let suite = "group.test.meeshy.widgetwipe.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let fm = FileManager.default
        let dirs = try (0..<3).map { i -> URL in
            let dir = fm.temporaryDirectory.appendingPathComponent("wipe-staging-\(i)-\(UUID().uuidString)", isDirectory: true)
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
            try Data("{}".utf8).write(to: dir.appendingPathComponent("blob.json"))
            return dir
        }
        let sut = WidgetDataManager(suiteName: suite, stagingDirectories: dirs)
        return (sut, defaults, dirs)
    }

    func test_wipeAll_removesWidgetKeysAndStagingDirs() throws {
        let (sut, defaults, dirs) = try makeWipeSUT()
        let keys = [
            "recent_conversations", "conversation_snapshots", "favorite_contacts",
            "widget_last_updated", "unread_count", "pending_mark_read",
        ]
        for key in keys { defaults.set(Data("seed".utf8), forKey: key) }
        // Clés d'ENVIRONNEMENT — le wipe ne doit PAS les toucher.
        defaults.set("http://localhost:3000", forKey: "meeshy_api_base_url")

        sut.wipeAll()

        for key in keys {
            XCTAssertNil(defaults.object(forKey: key), "\(key) must be removed by the logout wipe")
        }
        XCTAssertEqual(
            defaults.string(forKey: "meeshy_api_base_url"), "http://localhost:3000",
            "environment keys are NOT account data — the wipe must leave them alone"
        )
        for dir in dirs {
            XCTAssertFalse(
                FileManager.default.fileExists(atPath: dir.path),
                "staging dir \(dir.lastPathComponent) must be removed — its blobs would replay under the next account"
            )
        }
    }

    // MARK: - WidgetConversation Data Model

    func test_widgetConversation_encodesAndDecodes() throws {
        let conversation = WidgetConversation(
            id: "conv123",
            contactName: "Alice",
            contactAvatar: "person.circle.fill",
            lastMessage: "Hey there!",
            timestamp: Date(timeIntervalSince1970: 1700000000),
            isUnread: true,
            isPinned: false,
            accentColor: "6366F1"
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(conversation)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(WidgetConversation.self, from: data)

        XCTAssertEqual(decoded.id, "conv123")
        XCTAssertEqual(decoded.contactName, "Alice")
        XCTAssertEqual(decoded.contactAvatar, "person.circle.fill")
        XCTAssertEqual(decoded.lastMessage, "Hey there!")
        XCTAssertTrue(decoded.isUnread)
        XCTAssertFalse(decoded.isPinned)
        XCTAssertEqual(decoded.accentColor, "6366F1")
    }

    func test_widgetConversation_identifiableById() {
        let conversation = WidgetConversation(
            id: "unique-id",
            contactName: "Bob",
            contactAvatar: "person.fill",
            lastMessage: "",
            timestamp: Date(),
            isUnread: false,
            isPinned: true,
            accentColor: "4ECDC4"
        )

        XCTAssertEqual(conversation.id, "unique-id")
    }

    // MARK: - WidgetFavoriteContact Data Model

    func test_widgetFavoriteContact_encodesAndDecodes() throws {
        let contact = WidgetFavoriteContact(
            id: "fav1",
            name: "Charlie",
            avatar: "person.crop.circle.fill",
            status: "Online",
            accentColor: "34D399"
        )

        let data = try JSONEncoder().encode(contact)
        let decoded = try JSONDecoder().decode(WidgetFavoriteContact.self, from: data)

        XCTAssertEqual(decoded.id, "fav1")
        XCTAssertEqual(decoded.name, "Charlie")
        XCTAssertEqual(decoded.avatar, "person.crop.circle.fill")
        XCTAssertEqual(decoded.status, "Online")
        XCTAssertEqual(decoded.accentColor, "34D399")
    }

    func test_widgetFavoriteContact_identifiableById() {
        let contact = WidgetFavoriteContact(
            id: "contact-id",
            name: "Dana",
            avatar: "person.fill",
            status: "Offline",
            accentColor: "6366F1"
        )

        XCTAssertEqual(contact.id, "contact-id")
    }

    // MARK: - Multiple Conversations Serialization

    func test_multipleWidgetConversations_encodeAsArray() throws {
        let conversations = [
            WidgetConversation(id: "1", contactName: "A", contactAvatar: "", lastMessage: "a", timestamp: Date(), isUnread: false, isPinned: false, accentColor: "6366F1"),
            WidgetConversation(id: "2", contactName: "B", contactAvatar: "", lastMessage: "b", timestamp: Date(), isUnread: true, isPinned: true, accentColor: "4ECDC4")
        ]

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(conversations)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode([WidgetConversation].self, from: data)

        XCTAssertEqual(decoded.count, 2)
        XCTAssertEqual(decoded[0].contactName, "A")
        XCTAssertEqual(decoded[1].contactName, "B")
        XCTAssertEqual(decoded[0].accentColor, "6366F1")
    }

    // MARK: - publishFavoriteContacts (SSOT des raccourcis Siri)

    /// `favorite_contacts` est LA clé que `MeeshyAppIntents.ContactQuery` lit
    /// pour ré-hydrater les raccourcis enregistrés. Ces tests épinglent la clé
    /// et le contenu — une dérive rendrait tout raccourci silencieusement
    /// orphelin (le défaut historique de la clé `contacts`, jamais écrite).

    private func makeFavoritesSUT() throws -> (WidgetDataManager, UserDefaults) {
        let suite = "group.test.meeshy.favorites.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        return (WidgetDataManager(suiteName: suite, stagingDirectories: []), defaults)
    }

    private func makeDirectConversation(
        id: String, title: String, isPinned: Bool = true, type: ConversationType = .direct
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: id,
            identifier: "ident-\(id)",
            type: type,
            title: title,
            isPinned: isPinned
        )
    }

    func test_publishFavoriteContacts_writesInCorrectKey() throws {
        let (sut, defaults) = try makeFavoritesSUT()

        sut.publishFavoriteContacts([makeDirectConversation(id: "conv-1", title: "Alice")])

        let data = try XCTUnwrap(
            defaults.data(forKey: "favorite_contacts"),
            "favorite_contacts key should be written"
        )
        let decoded = try JSONDecoder().decode([WidgetFavoriteContact].self, from: data)
        XCTAssertEqual(decoded.count, 1)
        XCTAssertEqual(decoded[0].id, "conv-1")
        XCTAssertEqual(decoded[0].name, "Alice")
    }

    func test_publishFavoriteContacts_limitsToEightAndDirectPinnedOnly() throws {
        let (sut, defaults) = try makeFavoritesSUT()
        let pinnedDirect = (0..<10).map {
            makeDirectConversation(id: "direct-\($0)", title: "Contact \($0)")
        }
        let noise = [
            makeDirectConversation(id: "group-1", title: "Groupe", type: .group),
            makeDirectConversation(id: "unpinned-1", title: "Pas épinglée", isPinned: false),
        ]

        sut.publishFavoriteContacts(noise + pinnedDirect)

        let data = try XCTUnwrap(defaults.data(forKey: "favorite_contacts"))
        let decoded = try JSONDecoder().decode([WidgetFavoriteContact].self, from: data)
        XCTAssertEqual(decoded.count, 8, "cap à 8 contacts")
        XCTAssertTrue(
            decoded.allSatisfy { $0.id.hasPrefix("direct-") },
            "seules les conversations directes épinglées sont publiées, got \(decoded.map(\.id))"
        )
    }
}


/// P2 (revue local-first 2026-08-01, fiche appgroup-05, appariée au wipe P0
/// appgroup-01) — les providers des widgets retournaient des jeux de données
/// fabriqués (« John Doe », « Jane Smith ») sur clé App Group absente OU sur
/// échec de décodage : toute lecture morte devenait indétectable (le pattern
/// exact qui a masqué la panne de la share extension), et le wipe de logout
/// aurait rempli l'écran d'accueil de conversations fictives crédibles.
///
/// Motifs cherchés APRÈS retrait des commentaires (piège connu du dépôt).
final class MeeshyWidgetsSourceGuardTests: XCTestCase {

    private var widgetsSourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Services
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("MeeshyWidgets/MeeshyWidgets.swift")
    }

    private func strippedSource() throws -> String {
        strippingComments(try String(contentsOf: widgetsSourceURL, encoding: .utf8))
    }

    /// Corps d'une fonction : de son en-tête jusqu'à l'ancre structurelle
    /// suivante (pas de fenêtre de découpe fixe — elles pourrissent).
    private func body(of header: String, until nextAnchor: String, in source: String) -> String? {
        guard let start = source.range(of: header) else { return nil }
        guard let end = source.range(of: nextAnchor, range: start.upperBound..<source.endIndex) else { return nil }
        return String(source[start.upperBound..<end.lowerBound])
    }

    func test_loadConversations_hasNoFabricatedFallback() throws {
        let source = try strippedSource()
        guard let body = body(
            of: "private func loadConversations()",
            until: "private func",
            in: source
        ) else {
            XCTFail("Could not locate loadConversations body in MeeshyWidgets.swift")
            return
        }
        XCTAssertFalse(
            body.contains("sampleConversations"),
            "loadConversations must return [] on missing key or decode failure — a fabricated " +
            "fallback hides every dead read and fills the home screen after the logout wipe."
        )
    }

    func test_loadFavorites_hasNoFabricatedFallback() throws {
        let source = try strippedSource()
        guard let body = body(
            of: "private func loadFavorites()",
            until: "\nstruct ",
            in: source
        ) else {
            XCTFail("Could not locate loadFavorites body in MeeshyWidgets.swift")
            return
        }
        XCTAssertFalse(
            body.contains("sampleContacts"),
            "loadFavorites must return [] on missing key or decode failure — same fabricated-fallback " +
            "trap as the share extension outage."
        )
    }

    func test_getSnapshot_reservesSamplesToPreviewContext() throws {
        let source = try strippedSource()
        for (header, anchor) in [
            ("func getSnapshot(in context: Context, completion: @escaping (ConversationEntry) -> ())", "func getTimeline"),
            ("func getSnapshot(in context: Context, completion: @escaping (FavoriteContactsEntry) -> ())", "func getTimeline"),
        ] {
            guard let body = body(of: header, until: anchor, in: source) else {
                XCTFail("Could not locate getSnapshot body for \(header)")
                continue
            }
            XCTAssertTrue(
                body.contains("context.isPreview"),
                "getSnapshot must serve samples ONLY in the widget-gallery preview (context.isPreview) " +
                "and real (possibly empty) data everywhere else."
            )
        }
    }

    // MARK: - Comment stripping (miroir de ShareExtensionSourceGuardTests)

    private func strippingComments(_ source: String) -> String {
        var output = ""
        var iterator = source.startIndex
        var inLineComment = false
        var inBlockComment = false

        while iterator < source.endIndex {
            let remaining = source[iterator...]
            if inLineComment {
                if source[iterator] == "\n" { inLineComment = false; output.append("\n") }
                iterator = source.index(after: iterator)
                continue
            }
            if inBlockComment {
                if remaining.hasPrefix("*/") {
                    inBlockComment = false
                    iterator = source.index(iterator, offsetBy: 2)
                    continue
                }
                iterator = source.index(after: iterator)
                continue
            }
            if remaining.hasPrefix("//") {
                inLineComment = true
                iterator = source.index(iterator, offsetBy: 2)
                continue
            }
            if remaining.hasPrefix("/*") {
                inBlockComment = true
                iterator = source.index(iterator, offsetBy: 2)
                continue
            }
            output.append(source[iterator])
            iterator = source.index(after: iterator)
        }
        return output
    }
}


/// Fiche appgroup-05 — test de contrat app↔widget : `WidgetConversation`
/// (côté app, encodé par `WidgetDataManager`) et `Conversation` (miroir
/// dupliqué dans MeeshyWidgets.swift, non compilable dans ce bundle) doivent
/// rester décodables l'un depuis l'autre. Le miroir STRICT local reproduit le
/// struct widget champ à champ ; toute dérive du contrat JSON casse ce test
/// au lieu de rendre le widget silencieusement vide (pattern
/// `SharePendingSendContractTests`).
final class WidgetConversationContractTests: XCTestCase {

    /// Miroir exact du struct `Conversation` de MeeshyWidgets.swift.
    private struct WidgetMirrorConversation: Decodable {
        let id: String
        let contactName: String
        let contactAvatar: String
        let lastMessage: String
        let timestamp: Date
        let isUnread: Bool
        let isPinned: Bool
        let accentColor: String
    }

    func test_appEncodedConversations_decodeWithWidgetMirror() throws {
        let reference = Date(timeIntervalSince1970: 1_754_000_000)
        let appSide = WidgetConversation(
            id: "conv-42",
            contactName: "Alice",
            contactAvatar: "person.circle.fill",
            lastMessage: "Bonjour !",
            timestamp: reference,
            isUnread: true,
            isPinned: true,
            accentColor: "6366F1"
        )

        // Même configuration d'encodeur que WidgetDataManager (ISO 8601).
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payload = try encoder.encode([appSide])

        // Même configuration de décodeur que les providers du widget.
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode([WidgetMirrorConversation].self, from: payload)

        let mirror = try XCTUnwrap(decoded.first)
        XCTAssertEqual(mirror.id, "conv-42")
        XCTAssertEqual(mirror.contactName, "Alice")
        XCTAssertEqual(mirror.contactAvatar, "person.circle.fill")
        XCTAssertEqual(mirror.lastMessage, "Bonjour !")
        XCTAssertEqual(mirror.timestamp.timeIntervalSince1970, reference.timeIntervalSince1970, accuracy: 1)
        XCTAssertTrue(mirror.isUnread)
        XCTAssertTrue(mirror.isPinned)
        XCTAssertEqual(mirror.accentColor, "6366F1")
    }
}
