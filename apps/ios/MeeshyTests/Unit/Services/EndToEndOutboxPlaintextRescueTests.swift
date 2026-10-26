import XCTest
import GRDB
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **Les lignes d'outbox en clair héritées d'une conversation chiffrée
/// quittent le disque** (#13167, rétrocompatibilité #9223, modèle : appareil
/// volé).
///
/// Mesuré : la rétention terminale (`purgeDiscardableTerminalRows`) ne jette ni
/// `sendMessage` ni `editMessage` (`isDiscardableWhenTerminal`), et n'efface
/// pas sous `secure_delete`. Avant #12641, la réponse depuis une notification
/// et le refus d'appel enfilaient une telle ligne même vers une conversation
/// chiffrée ; `EndToEndOutboxGate` en refuse le rejeu, la charge restait.
/// Chaque témoin pose ces lignes dans une VRAIE base sur disque, lance le
/// rattrapage de l'ouverture de session, et lit les octets des fichiers.
@MainActor
final class EndToEndOutboxPlaintextRescueTests: XCTestCase {

    private let sealed = "00000000000000000000e3e1"
    private let readable = "00000000000000000000c3e2"
    private let me = "00000000000000000000ee03"
    private let secret = "Le code de la porte est 7781"

    private struct Fixture {
        let directory: URL
        let pool: DatabasePool
        let vault: MockEndToEndMessaging
        let rescue: EndToEndUnsentPlaintextRescue

        func holds(_ text: String) throws -> Bool {
            let needle = Data(text.utf8)
            let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            return try files.contains { try Data(contentsOf: $0).range(of: needle) != nil }
        }

        func outboxIds() async throws -> [String] {
            try await pool.read { try String.fetchAll($0, sql: "SELECT id FROM outbox ORDER BY id") }
        }

        func row(_ localId: String) async throws -> MessageRecord? {
            try await pool.read { try MessageRecord.fetchOne($0, key: localId) }
        }
    }

    private func makeFixture() throws -> Fixture {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("e2ee-outbox-rescue-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let pool = try DatabasePool(path: directory.appendingPathComponent("meeshy.sqlite").path)
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool, currentUserId: me)
        let vault = MockEndToEndMessaging()
        let sealedId = sealed
        let rescue = EndToEndUnsentPlaintextRescue(endToEnd: vault, persistence: { persistence }, seals: { $0 == sealedId })
        return Fixture(directory: directory, pool: pool, vault: vault, rescue: rescue)
    }

    /// Une réponse rapide héritée : sa bulle en clair, en file, et sa ligne d'outbox.
    private func legacyQueuedReply(_ text: String, in conversationId: String, bubble: Bool = true, state: MessageState = .queued) -> (OutboxRecord, MessageRecord?) {
        let item = OfflineQueueItem(conversationId: conversationId, content: text, originalLanguage: "fr", replyToId: nil)
        var record = MessageRecord.optimisticText(item: item, senderId: me, replyToId: nil)
        record.state = state
        let outbox = OutboxRecord(
            id: "ofq_\(item.id)", kind: .sendMessage, conversationId: conversationId,
            messageLocalId: item.clientMessageId, clientMessageId: item.clientMessageId,
            payload: try! JSONEncoder().encode(item), status: .exhausted
        )
        return (outbox, bubble ? record : nil)
    }

    private func legacyEdit(_ text: String, in conversationId: String) -> OutboxRecord {
        let payload = OfflineEditPayload(messageId: "00000000000000000000ab99", clientMessageId: "cid_edit", content: text, conversationId: conversationId)
        return OutboxRecord(
            id: "ofq_edit_\(conversationId)", kind: .editMessage, conversationId: conversationId,
            clientMessageId: "cid_edit", payload: try! JSONEncoder().encode(payload), status: .failed
        )
    }

    private func insert(outbox: [OutboxRecord], messages: [MessageRecord], into fixture: Fixture) async throws {
        try await fixture.pool.write { db in
            try messages.forEach { try $0.insert(db) }
            try outbox.forEach { try $0.insert(db) }
        }
    }

    func test_run_uneReponseEnFileVersUneConversationChiffree_quitteLeDisque_etSonClairVaAuCoffre() async throws {
        let fixture = try makeFixture()
        let (outbox, bubble) = legacyQueuedReply(secret, in: sealed)
        try await insert(outbox: [outbox], messages: [bubble!], into: fixture)
        XCTAssertTrue(try fixture.holds(secret), "le détecteur voit la charge héritée")

        await fixture.rescue.run(for: me)

        XCTAssertFalse(try fixture.holds(secret), "aucun octet du clair dans meeshy.sqlite, son WAL ni sa mémoire partagée")
        let remaining = try await fixture.outboxIds()
        XCTAssertTrue(remaining.isEmpty, "la ligne d'outbox est retirée")
        let row = try await fixture.row(bubble!.localId)
        XCTAssertEqual(row?.content, E2EEWire.contentPlaceholder, "la bulle est rescellée")
        XCTAssertEqual(row?.state, .failed, "et passe en échec, renvoyable scellée")
        let bubbleMessage = try XCTUnwrap(row).toMessage(currentUserId: me)
        let entry = try XCTUnwrap(EndToEndThreadPlaintexts.entry(for: bubbleMessage, in: fixture.vault.remembered))
        XCTAssertEqual(EndToEndThreadPlaintexts.adoption(of: entry, by: bubbleMessage, conversationId: sealed)?.content, secret)
    }

    func test_run_uneLigneSansBulle_etUneModification_quittentLeDisque() async throws {
        let fixture = try makeFixture()
        let (orphan, _) = legacyQueuedReply(secret, in: sealed, bubble: false)
        let edit = legacyEdit("\(secret) (modifié)", in: sealed)
        try await insert(outbox: [orphan, edit], messages: [], into: fixture)

        await fixture.rescue.run(for: me)

        XCTAssertFalse(try fixture.holds(secret))
        let remaining = try await fixture.outboxIds()
        XCTAssertTrue(remaining.isEmpty)
        XCTAssertTrue(fixture.vault.storedIds.isEmpty, "aucune bulle n'attend ce clair : il ne va pas au coffre")
    }

    func test_run_leCoffreRefuse_laLigneDUneBulleQuiLAttendReste() async throws {
        let fixture = try makeFixture()
        fixture.vault.rememberAccepted = false
        let (outbox, bubble) = legacyQueuedReply(secret, in: sealed)
        try await insert(outbox: [outbox], messages: [bubble!], into: fixture)

        await fixture.rescue.run(for: me)

        let remaining = try await fixture.outboxIds()
        XCTAssertEqual(remaining, [outbox.id], "seul exemplaire du texte d'une bulle affichée : il attend la session suivante")
    }

    func test_run_uneConversationLisible_garderSesLignes() async throws {
        let fixture = try makeFixture()
        let (outbox, bubble) = legacyQueuedReply("lisible", in: readable)
        try await insert(outbox: [outbox, legacyEdit("modif lisible", in: readable)], messages: [bubble!], into: fixture)

        await fixture.rescue.run(for: me)

        let remaining = try await fixture.outboxIds()
        XCTAssertEqual(remaining.count, 2)
        XCTAssertTrue(fixture.vault.storedIds.isEmpty)
    }
}
