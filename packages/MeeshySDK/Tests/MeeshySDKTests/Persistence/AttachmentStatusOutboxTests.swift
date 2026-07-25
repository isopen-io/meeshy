import XCTest
import GRDB
@testable import MeeshySDK

/// Point 7 — la consommation d'un média survit à l'absence de réseau.
///
/// Avant, six lecteurs postaient en `try?` inline : une écoute hors-ligne
/// disparaissait sans laisser de trace, et rien ne la rejouait au retour du
/// réseau. Ces tests verrouillent le comportement durable et, surtout, la
/// décision qui distingue ce kind de tous les autres accusés : il ne se
/// coalesce PAS.
final class AttachmentStatusOutboxTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }
    private var pool: DatabaseQueue!

    override func setUp() async throws {
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await queue.clearAll()
    }

    override func tearDown() async throws {
        await queue.clearAll()
        pool = nil
    }

    private func allRows() throws -> [OutboxRecord] {
        try pool.read { db in
            try OutboxRecord
                .filter(Column("kind") == OutboxKind.reportAttachmentStatus.rawValue)
                .order(Column("createdAt"))
                .fetchAll(db)
        }
    }

    private func payload(
        _ attachmentId: String,
        stretches: [PlaybackStretch]? = nil,
        action: String = "listened",
        positionMs: Int = 0
    ) -> ReportAttachmentStatusPayload {
        ReportAttachmentStatusPayload(
            clientMutationId: ClientMutationId.generate(),
            attachmentId: attachmentId,
            action: action,
            playPositionMs: positionMs,
            durationMs: 60_000,
            complete: false,
            stretches: stretches
        )
    }

    // MARK: - Surface du kind

    func test_kind_rawValue_estStable() {
        XCTAssertEqual(OutboxKind.reportAttachmentStatus.rawValue, "reportAttachmentStatus")
    }

    /// Personne n'attend qu'un rapport d'écoute parte pour considérer sa
    /// conversation à jour : le bandeau « Synchronisation… » ne doit pas rester
    /// affiché à cause d'une télémétrie de lecture coincée.
    func test_kind_neCompteFaisPourLIndicateurDeSynchro() {
        XCTAssertFalse(OutboxKind.reportAttachmentStatus.countsTowardSyncIndicator)
    }

    // MARK: - La décision qui compte

    /// Trois écoutes hors-ligne du même audio sont trois passages sur trois
    /// portions distinctes. Les coalescer par attachement — comme le fait
    /// `markStoryViewed` — écraserait les segments précédents et détruirait
    /// exactement ce que la trace motivée existe pour préserver.
    func test_deuxRapportsSurLeMemeMedia_produisentDeuxLignes() async throws {
        let premier = payload("att-1", stretches: [
            PlaybackStretch(startMs: 0, endMs: 4_000, endedBy: .pause)
        ])
        let second = payload("att-1", stretches: [
            PlaybackStretch(startMs: 30_000, endMs: 42_000, endedBy: .completed)
        ], positionMs: 42_000)

        _ = try await queue.enqueue(.reportAttachmentStatus, payload: premier, conversationId: "att-1")
        _ = try await queue.enqueue(.reportAttachmentStatus, payload: second, conversationId: "att-1")

        let rows = try allRows()
        XCTAssertEqual(rows.count, 2, "Les deux passages doivent survivre, pas se remplacer")

        let decoded = try rows.map {
            try JSONDecoder().decode(ReportAttachmentStatusPayload.self, from: $0.payload)
        }
        let tousLesSegments = decoded.compactMap(\.stretches).flatMap { $0 }
        XCTAssertEqual(tousLesSegments.count, 2)
        XCTAssertTrue(tousLesSegments.contains(PlaybackStretch(startMs: 0, endMs: 4_000, endedBy: .pause)),
                      "Le premier passage a disparu — le coalescing a été activé par erreur")
        XCTAssertTrue(tousLesSegments.contains(PlaybackStretch(startMs: 30_000, endMs: 42_000, endedBy: .completed)))
    }

    /// L'ordre est porteur de sens : la position finale est celle du DERNIER
    /// rapport. Un rejeu dans le désordre déclarerait l'auditeur revenu en
    /// arrière alors qu'il a terminé le média.
    func test_lesLignesSontRejouablesDansLOrdreDeProduction() async throws {
        for position in [1_000, 20_000, 55_000] {
            _ = try await queue.enqueue(
                .reportAttachmentStatus,
                payload: payload("att-ordre", positionMs: position),
                conversationId: "att-ordre"
            )
        }

        let positions = try allRows().map {
            try JSONDecoder().decode(ReportAttachmentStatusPayload.self, from: $0.payload).playPositionMs
        }
        XCTAssertEqual(positions, [1_000, 20_000, 55_000])
    }

    func test_mediasDifferents_reçoiventDesLignesDistinctes() async throws {
        _ = try await queue.enqueue(.reportAttachmentStatus, payload: payload("att-a"), conversationId: "att-a")
        _ = try await queue.enqueue(.reportAttachmentStatus, payload: payload("att-b"), conversationId: "att-b")

        let ancres = Set(try allRows().map(\.conversationId))
        XCTAssertEqual(ancres, ["att-a", "att-b"])
    }

    // MARK: - Sérialisation

    func test_payload_faitLAllerRetourSansPerte() throws {
        let original = ReportAttachmentStatusPayload(
            clientMutationId: "cmid_att",
            attachmentId: "att-9",
            action: "watched",
            playPositionMs: 12_345,
            durationMs: 60_000,
            complete: true,
            wasZoomed: true,
            stretches: [
                PlaybackStretch(startMs: 0, endMs: 500, endedBy: .seek),
                PlaybackStretch(startMs: 9_000, endMs: 12_345, endedBy: .completed)
            ],
            language: "pt-BR"
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ReportAttachmentStatusPayload.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    /// Un média d'une seconde écouté 500 ms produit un segment et rien d'autre.
    /// Une liste vide, elle, ne doit pas faire voyager une clé pour rien.
    func test_segmentsVides_sontOmisPlutotQueTransmisVides() throws {
        let vide = ReportAttachmentStatusPayload(
            clientMutationId: "cmid_v", attachmentId: "a", action: "listened",
            playPositionMs: 0, durationMs: 1_000, complete: true, stretches: []
        )
        XCTAssertNil(vide.stretches)

        let json = try XCTUnwrap(String(data: try JSONEncoder().encode(vide), encoding: .utf8))
        XCTAssertFalse(json.contains("stretches"))
    }
}
