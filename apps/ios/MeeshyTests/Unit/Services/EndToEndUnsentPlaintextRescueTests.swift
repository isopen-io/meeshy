import XCTest
import GRDB
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **Une bulle jamais partie d'une conversation chiffrée, écrite en clair par
/// une version antérieure, rend son clair au coffre** (#13067, rétrocompatibilité
/// #9223, modèle : appareil volé).
///
/// Avant #13067, la réponse depuis une notification et le refus d'appel par
/// message laissaient une ligne `isEncrypted: false` portant le clair. Chaque
/// témoin pose une telle ligne dans une VRAIE base sur disque, lance le
/// rattrapage, et lit les octets des fichiers.
@MainActor
final class EndToEndUnsentPlaintextRescueTests: XCTestCase {

    private let sealed = "00000000000000000000e2e1"
    private let readable = "00000000000000000000c1e2"
    private let notified = "00000000000000000000bb01"
    private let me = "00000000000000000000ee01"
    private let secret = "Le code du coffre est 4512"

    private struct Fixture {
        let directory: URL
        let pool: DatabasePool
        let persistence: MessagePersistenceActor
        let vault: MockEndToEndMessaging
        let rescue: EndToEndUnsentPlaintextRescue

        func holds(_ text: String) throws -> Bool {
            let needle = Data(text.utf8)
            let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            return try files.contains { try Data(contentsOf: $0).range(of: needle) != nil }
        }

        func row(_ localId: String) async throws -> MessageRecord? {
            try await pool.read { try MessageRecord.fetchOne($0, key: localId) }
        }
    }

    private func makeFixture() throws -> Fixture {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("e2ee-unsent-rescue-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let pool = try DatabasePool(path: directory.appendingPathComponent("meeshy.sqlite").path)
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool, currentUserId: me)
        let vault = MockEndToEndMessaging()
        let sealedId = sealed
        let rescue = EndToEndUnsentPlaintextRescue(
            endToEnd: vault, persistence: { persistence }, seals: { $0 == sealedId }
        )
        return Fixture(directory: directory, pool: pool, persistence: persistence, vault: vault, rescue: rescue)
    }

    /// La ligne qu'une version antérieure posait : le clair, sans chiffrement, en échec.
    private func legacyReply(_ text: String, localId: String, in conversationId: String, from senderId: String? = nil) -> MessageRecord {
        let item = OfflineQueueItem(conversationId: conversationId, content: text, originalLanguage: "fr", replyToId: notified)
        var record = MessageRecord.optimisticText(item: item, senderId: senderId ?? me, replyToId: notified)
        record.localId = localId
        record.state = .failed
        record.lastError = EndToEndSendRefusal.sealedOnlyInConversation.userMessage
        return record
    }

    private func insert(_ records: [MessageRecord], into fixture: Fixture) async throws {
        try await fixture.pool.write { db in try records.forEach { try $0.insert(db) } }
    }

    func test_run_aLegacyClearReply_inAnEndToEndConversation_leavesTheDisk_forTheVault() async throws {
        let fixture = try makeFixture()
        try await insert([legacyReply(secret, localId: "cid_legacy", in: sealed)], into: fixture)
        XCTAssertTrue(try fixture.holds(secret), "le détecteur voit le clair hérité")

        await fixture.rescue.run(for: me)

        XCTAssertFalse(try fixture.holds(secret), "aucun octet du clair dans meeshy.sqlite, son WAL ni sa mémoire partagée")
        let legacy = try await fixture.row("cid_legacy")
        let row = try XCTUnwrap(legacy)
        XCTAssertEqual(row.content, E2EEWire.contentPlaceholder)
        XCTAssertTrue(row.isEncrypted)
        XCTAssertEqual(row.encryptionMode, E2EEWire.mode)
        XCTAssertEqual(row.state, .failed)
        XCTAssertEqual(row.lastError, EndToEndSendRefusal.sealedOnlyInConversation.userMessage)

        let bubble = row.toMessage(currentUserId: me)
        let entry = try XCTUnwrap(EndToEndThreadPlaintexts.entry(for: bubble, in: fixture.vault.remembered))
        XCTAssertEqual(EndToEndThreadPlaintexts.adoption(of: entry, by: bubble, conversationId: sealed)?.content, secret,
                       "le fil adopte le clair à SA place : la bulle se renvoie scellée")
    }

    func test_run_aClearReply_inAReadableConversation_staysAsItIs() async throws {
        let fixture = try makeFixture()
        try await insert([legacyReply("lisible", localId: "cid_open", in: readable)], into: fixture)

        await fixture.rescue.run(for: me)

        let open = try await fixture.row("cid_open")
        XCTAssertEqual(open?.content, "lisible")
        XCTAssertTrue(fixture.vault.storedIds.isEmpty)
    }

    /// Le coffre ne le prend pas : effacer perdrait le seul exemplaire du texte,
    /// la ligne attend la session suivante.
    func test_run_whenTheVaultRefuses_leavesTheRowForTheNextSession() async throws {
        let fixture = try makeFixture()
        fixture.vault.rememberAccepted = false
        try await insert([legacyReply(secret, localId: "cid_legacy", in: sealed)], into: fixture)

        await fixture.rescue.run(for: me)

        let kept = try await fixture.row("cid_legacy")
        XCTAssertEqual(kept?.content, secret)
    }

    /// Seuls MES envois jamais acquittés sont concernés : un message reçu ou
    /// acquitté a sa propre loi (#12999).
    func test_run_touchesNeitherAPeersRow_norAnAcknowledgedOne() async throws {
        let fixture = try makeFixture()
        var acknowledged = legacyReply("acquitté", localId: "cid_ack", in: sealed)
        acknowledged.serverId = "00000000000000000000ac01"
        try await insert([
            legacyReply("du pair", localId: "cid_peer", in: sealed, from: "00000000000000000000fe01"),
            acknowledged,
        ], into: fixture)

        await fixture.rescue.run(for: me)

        let peer = try await fixture.row("cid_peer")
        let ack = try await fixture.row("cid_ack")
        XCTAssertEqual(peer?.content, "du pair")
        XCTAssertEqual(ack?.content, "acquitté")
        XCTAssertTrue(fixture.vault.storedIds.isEmpty)
    }
}
