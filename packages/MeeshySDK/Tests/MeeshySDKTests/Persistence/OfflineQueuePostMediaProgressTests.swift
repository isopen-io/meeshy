import XCTest
import GRDB
@testable import MeeshySDK

/// **Un média monté RESTE monté** (#5830).
///
/// Le réel bloqué sur l'appareil du porteur le 2026-09-08 n'a pas échoué faute
/// d'octets : les trois fichiers étaient encore sur le disque et la passerelle
/// les acceptait. Il a échoué faute de MÉMOIRE — le dispatcher reparcourait
/// `localMediaPaths` depuis l'index 0 à chaque rejeu et jetait tout ce que la
/// tentative précédente avait obtenu. Cinq tentatives ne valaient pas mieux
/// qu'une seule.
///
/// Ce que ces témoins verrouillent : la carte des acquis vit sur la LIGNE, elle
/// est une FONCTION de l'index d'origine, et elle survit à l'écriture suivante.
final class OfflineQueuePostMediaProgressTests: XCTestCase {

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

    private func enfilerReel(cmid: String) async throws -> String {
        try await queue.enqueue(
            .createPost,
            payload: CreatePostPayload(
                clientMutationId: cmid,
                content: "",
                attachmentIds: [],
                visibility: "PUBLIC",
                localMediaPaths: ["pending-media/\(cmid)/0.mov",
                                  "pending-media/\(cmid)/1.jpeg",
                                  "pending-media/\(cmid)/2.mov"],
                type: "REEL"
            ),
            conversationId: nil
        )
    }

    private func acquis(_ outboxId: String) throws -> [UploadedPostMedia] {
        let record = try pool.read { db in try OutboxRecord.fetchOne(db, key: outboxId) }
        let decodeur = JSONDecoder()
        decodeur.dateDecodingStrategy = .iso8601
        let payload = try decodeur.decode(CreatePostPayload.self, from: XCTUnwrap(record).payload)
        return payload.uploadedMedia ?? []
    }

    // MARK: - Ce qui est monté est GRAVÉ

    func test_recordUploadedPostMedia_graveLAcquisSurLaLigne() async throws {
        let cmid = "cmid_progression_1"
        let id = try await enfilerReel(cmid: cmid)

        await queue.recordUploadedPostMedia(outboxId: id, UploadedPostMedia(sourceIndex: 0, id: "media0", url: "2026/09/u/0.mov"))

        let carte = try acquis(id)
        XCTAssertEqual(carte.count, 1)
        XCTAssertEqual(carte.first?.sourceIndex, 0)
        XCTAssertEqual(carte.first?.id, "media0")
        XCTAssertEqual(carte.first?.url, "2026/09/u/0.mov",
                       "L'URL SERVIE voyage avec l'id : adopter l'id sans l'URL laisse le canvas devant un file:// annulé (#5280).")
    }

    /// C'est LE témoin du défaut : deux écritures successives, et la première
    /// doit survivre à la seconde. Une carte remplacée à chaque fois ramènerait
    /// exactement la boucle qu'on vient de fermer.
    func test_recordUploadedPostMedia_deuxMediasSaccumulent() async throws {
        let cmid = "cmid_progression_2"
        let id = try await enfilerReel(cmid: cmid)

        await queue.recordUploadedPostMedia(outboxId: id, UploadedPostMedia(sourceIndex: 0, id: "media0", url: "u0"))
        await queue.recordUploadedPostMedia(outboxId: id, UploadedPostMedia(sourceIndex: 2, id: "media2", url: "u2"))

        XCTAssertEqual(try acquis(id).map(\.sourceIndex), [0, 2],
                       "Les deux acquis doivent coexister, rangés par index d'origine.")
    }

    func test_recordUploadedPostMedia_estIdempotentParIndex() async throws {
        let cmid = "cmid_progression_3"
        let id = try await enfilerReel(cmid: cmid)

        await queue.recordUploadedPostMedia(outboxId: id, UploadedPostMedia(sourceIndex: 1, id: "ancien", url: "ancienne"))
        await queue.recordUploadedPostMedia(outboxId: id, UploadedPostMedia(sourceIndex: 1, id: "neuf", url: "neuve"))

        let carte = try acquis(id)
        XCTAssertEqual(carte.count, 1, "Un même index ne doit jamais produire deux entrées — la carte est une FONCTION de l'index.")
        XCTAssertEqual(carte.first?.id, "neuf")
    }

    // MARK: - Ce que l'écriture ne doit RIEN faire perdre

    func test_recordUploadedPostMedia_preserveLeResteDeLaCharge() async throws {
        let cmid = "cmid_progression_4"
        let id = try await queue.enqueue(
            .createPost,
            payload: CreatePostPayload(
                clientMutationId: cmid,
                content: "Les jeux en série",
                attachmentIds: ["déjà-en-ligne"],
                visibility: "PUBLIC",
                originalLanguage: "fr",
                localMediaPaths: ["pending-media/\(cmid)/0.mov"],
                type: "REEL",
                mediaCaptions: ["une légende"],
                mediaObjectIds: ["objet-de-scène"],
                allowSoundExtraction: true
            ),
            conversationId: nil
        )

        await queue.recordUploadedPostMedia(outboxId: id, UploadedPostMedia(sourceIndex: 0, id: "m0", url: "u0"))

        let record = try await pool.read { db in try OutboxRecord.fetchOne(db, key: id) }
        let decodeur = JSONDecoder()
        decodeur.dateDecodingStrategy = .iso8601
        let relu = try decodeur.decode(CreatePostPayload.self, from: XCTUnwrap(record).payload)
        XCTAssertEqual(relu.content, "Les jeux en série")
        XCTAssertEqual(relu.type, "REEL")
        XCTAssertEqual(relu.originalLanguage, "fr")
        XCTAssertEqual(relu.attachmentIds, ["déjà-en-ligne"])
        XCTAssertEqual(relu.mediaCaptions?.compactMap { $0 }, ["une légende"])
        XCTAssertEqual(relu.mediaObjectIds?.compactMap { $0 }, ["objet-de-scène"])
        XCTAssertEqual(relu.allowSoundExtraction, true)
        XCTAssertEqual(relu.localMediaPaths?.count, 1)
    }

    // MARK: - Une ligne inconnue ne fait rien exploser

    func test_recordUploadedPostMedia_surUneLigneInconnueEstUnNoOp() async throws {
        await queue.recordUploadedPostMedia(outboxId: "ofqm_inexistante",
                                            UploadedPostMedia(sourceIndex: 0, id: "m", url: "u"))
        let compte = try await pool.read { db in try OutboxRecord.fetchCount(db) }
        XCTAssertEqual(compte, 0)
    }

    // MARK: - La relance ré-arme la ligne SANS effacer les acquis

    /// Sans cela, toucher « Réel non publié » repartirait de zéro : le doigt
    /// qui veut relancer détruirait le travail déjà fait, et la relance serait
    /// pire que l'attente.
    func test_retryItem_conserveLesMediasDejaMontes() async throws {
        let cmid = "cmid_progression_5"
        let id = try await enfilerReel(cmid: cmid)
        await queue.recordUploadedPostMedia(outboxId: id, UploadedPostMedia(sourceIndex: 0, id: "media0", url: "u0"))

        try await pool.write { db in
            try db.execute(sql: "UPDATE outbox SET status = ?, attempts = 5 WHERE id = ?",
                           arguments: [OutboxStatus.exhausted.rawValue, id])
        }
        try await queue.retryItem(id)

        let record = try await pool.read { db in try OutboxRecord.fetchOne(db, key: id) }
        XCTAssertEqual(try XCTUnwrap(record).status, .pending)
        XCTAssertEqual(try XCTUnwrap(record).attempts, 0)
        XCTAssertEqual(try acquis(id).map(\.id), ["media0"])
    }
}
