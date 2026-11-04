import XCTest
import GRDB
@testable import MeeshySDK

/// **Hors ligne, « Enregistrer » part en file et ne se défait pas** (#15997).
///
/// Le like et le repartage avaient leur ligne durable ; le favori non : hors
/// ligne il échouait, défaisait la bascule et affichait une erreur. La ligne
/// `.toggleBookmarkPost` porte l'état VOULU (`bookmarked`), jamais une bascule :
/// rejouée, elle ne peut que poser cet état, et seule la dernière intention
/// d'une même carte compte.
final class OfflineQueueBookmarkTests: XCTestCase {

    private var pool: DatabaseQueue!

    override func setUp() async throws {
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await OfflineQueue.shared.clearAll()
    }

    override func tearDown() async throws {
        await OfflineQueue.shared.clearAll()
        pool = nil
    }

    private func enfiler(bookmarked: Bool, postId: String, cmid: String = ClientMutationId.generate()) async throws {
        try await OfflineQueue.shared.enqueue(
            .toggleBookmarkPost,
            payload: ToggleBookmarkPostPayload(clientMutationId: cmid, postId: postId, bookmarked: bookmarked),
            conversationId: postId
        )
    }

    private func lignes() throws -> [OutboxRecord] {
        try pool.read { db in
            try OutboxRecord.filter(Column("kind") == OutboxKind.toggleBookmarkPost.rawValue).fetchAll(db)
        }
    }

    private static func record(_ payload: ToggleBookmarkPostPayload, status: OutboxStatus = .pending) throws -> OutboxRecord {
        OutboxRecord(kind: .toggleBookmarkPost, conversationId: payload.postId, clientMessageId: payload.clientMutationId,
                     payload: try JSONEncoder().encode(payload), status: status, createdAt: Date(timeIntervalSince1970: 1_760_000_000))
    }

    // MARK: - Le genre de ligne

    func test_leGenre_garderSonNomPersiste_etCompterPourLaSynchro() {
        XCTAssertEqual(OutboxKind.toggleBookmarkPost.rawValue, "toggleBookmarkPost",
                       "le nom est la colonne `kind` des lignes déjà gravées : le changer les perdrait")
        XCTAssertTrue(OutboxKind.toggleBookmarkPost.countsTowardSyncIndicator)
        XCTAssertTrue(OutboxKind.toggleBookmarkPost.isDiscardableWhenTerminal,
                      "un favori refusé ne porte rien que l'utilisateur ait écrit : la ligne épuisée se jette, comme un like")
    }

    func test_laCharge_faitLAllerRetourSansRienPerdre() throws {
        let payload = ToggleBookmarkPostPayload(clientMutationId: "cmid_1", postId: "p1", bookmarked: false)

        let relu = try JSONDecoder().decode(ToggleBookmarkPostPayload.self, from: JSONEncoder().encode(payload))

        XCTAssertEqual(relu, payload)
    }

    // MARK: - La dernière intention gagne

    func test_deuxIntentionsSurLaMemeCarte_neLaissentQueLaDerniere() async throws {
        try await enfiler(bookmarked: true, postId: "p1")
        try await enfiler(bookmarked: false, postId: "p1", cmid: "cmid_dernier")

        let restantes = try lignes()

        XCTAssertEqual(restantes.count, 1, "enregistrer puis retirer hors ligne ne doit rejouer qu'un seul état")
        let payload = try JSONDecoder().decode(ToggleBookmarkPostPayload.self, from: XCTUnwrap(restantes.first).payload)
        XCTAssertEqual(payload.clientMutationId, "cmid_dernier")
        XCTAssertFalse(payload.bookmarked)
    }

    func test_deuxCartesDifferentes_gardentChacuneLeurLigne() async throws {
        try await enfiler(bookmarked: true, postId: "p1")
        try await enfiler(bookmarked: true, postId: "p2")

        XCTAssertEqual(Set(try lignes().map(\.conversationId)), ["p1", "p2"],
                       "l'ancre est la carte : un favori n'efface pas celui d'une autre")
    }

    // MARK: - Ce que la ligne dit ailleurs

    func test_laPastille_nommeLeFavori_etMeneALaCarte() throws {
        let item = OutboxUIItem.from(record: try Self.record(ToggleBookmarkPostPayload(clientMutationId: "m", postId: "p9", bookmarked: true)))

        XCTAssertEqual(item.kind, .other("toggleBookmarkPost"))
        XCTAssertEqual(item.source, .post(id: "p9"))
    }

    func test_unFavoriLivre_estUnSave_etUnRetraitLivre_unUnsave() throws {
        let pose = SocialInteractionEvents.event(forDelivered: try Self.record(ToggleBookmarkPostPayload(clientMutationId: "m-1", postId: "p1", bookmarked: true)))
        let retire = SocialInteractionEvents.event(forDelivered: try Self.record(ToggleBookmarkPostPayload(clientMutationId: "m-2", postId: "p1", bookmarked: false)))

        XCTAssertEqual(pose?.action, "save")
        XCTAssertEqual(pose?.target, SocialTarget(kind: .post, id: "p1"))
        XCTAssertEqual(retire?.action, "unsave")
    }

    // MARK: - Ce qui reste visible par-dessus un fil relu

    /// Un fil relu pendant qu'un favori attend son envoi recevrait l'état
    /// d'AVANT le geste : la file dit ce qui est encore en route, pour que le
    /// fil le repose par-dessus. Une ligne en vol l'est aussi — le serveur peut
    /// avoir répondu au fil avant de recevoir le favori.
    func test_lesFavorisEncoreEnRoute_sontServisAuFil_horsLignesEpuisees() async throws {
        let rows = [
            try Self.record(ToggleBookmarkPostPayload(clientMutationId: "m1", postId: "attente", bookmarked: true)),
            try Self.record(ToggleBookmarkPostPayload(clientMutationId: "m2", postId: "envol", bookmarked: false), status: .inflight),
            try Self.record(ToggleBookmarkPostPayload(clientMutationId: "m3", postId: "echec", bookmarked: true), status: .failed),
            try Self.record(ToggleBookmarkPostPayload(clientMutationId: "m4", postId: "refuse", bookmarked: true), status: .exhausted),
        ]
        try await pool.write { db in try rows.forEach { try $0.insert(db) } }

        let flags = await FeedPersistenceActor(dbWriter: pool).pendingBookmarkFlags()

        XCTAssertEqual(flags, ["attente": true, "envol": false, "echec": true],
                       "un favori refusé pour de bon ne se repose pas : son retour arrière a déjà eu lieu")
    }
}
