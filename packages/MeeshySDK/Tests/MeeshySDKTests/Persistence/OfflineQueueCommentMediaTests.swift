import XCTest
import GRDB
@testable import MeeshySDK

/// **Un commentaire hors ligne garde ses pièces** (#9743).
///
/// `CreateCommentPayload` n'emportait ni fichier ni identifiant de média : un
/// commentaire avec pièce dont l'envoi échouait rejoignait la file en texte
/// seul. Ces témoins verrouillent la file : les fichiers vont dans un dossier
/// durable, la ligne les référence, les acquis s'y gravent, un échec reste
/// relançable avec ses pièces, et tout se relit après un redémarrage.
final class OfflineQueueCommentMediaTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }
    private var pool: DatabaseQueue!
    private var scratch: URL!

    override func setUp() async throws {
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await queue.clearAll()
        scratch = FileManager.default.temporaryDirectory
            .appendingPathComponent("comment-media-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
    }

    override func tearDown() async throws {
        await queue.clearAll()
        try? FileManager.default.removeItem(at: scratch)
        pool = nil
    }

    private func source(_ name: String, _ contents: String) throws -> URL {
        let url = scratch.appendingPathComponent(name)
        try Data(contents.utf8).write(to: url)
        return url
    }

    private func comment(_ cmid: String, post: String = "post-1", content: String = "regarde") -> CreateCommentPayload {
        CreateCommentPayload(clientMutationId: cmid, postId: post, parentCommentId: nil,
                             content: content, originalLanguage: "fr")
    }

    private func payload(_ outboxId: String) throws -> CreateCommentPayload {
        let record = try pool.read { db in try OutboxRecord.fetchOne(db, key: outboxId) }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(CreateCommentPayload.self, from: XCTUnwrap(record).payload)
    }

    private func enqueueTwoPieces(_ cmid: String,
                                  acquired: [UploadedCommentMedia] = []) async throws -> OfflineQueue.EnqueueMediaResult {
        try await queue.enqueueCommentMedia(
            comment(cmid),
            sourceMediaURLs: [try source("a.jpg", "photo"), try source("b.m4a", "voix")],
            sourceMediaMimeTypes: ["image/jpeg", "audio/mp4"],
            acquired: acquired
        )
    }

    private func cleanup(_ cmid: String) async {
        await queue.cancelCreateComment(clientMutationId: cmid)
    }

    // MARK: - La ligne emporte les deux pièces, dans un dossier durable

    func test_enqueueCommentMedia_copiesBothPiecesOutOfTmp_andTheRowReferencesThem() async throws {
        let cmid = "cmid_comment_media_1"
        let result = try await enqueueTwoPieces(cmid)

        let stored = try payload(result.outboxId)
        XCTAssertEqual(stored.localMediaPaths, ["pending-media/\(cmid)/0.jpg", "pending-media/\(cmid)/1.m4a"])
        XCTAssertEqual(stored.localMediaMimeTypes, ["image/jpeg", "audio/mp4"])
        XCTAssertEqual(stored.content, "regarde")
        for relative in try XCTUnwrap(stored.localMediaPaths) {
            let path = OfflineQueue.absoluteMediaPath(forStored: relative)
            XCTAssertTrue(FileManager.default.fileExists(atPath: path), "\(relative) n'est pas sur le disque")
            XCTAssertFalse(path.hasPrefix(FileManager.default.temporaryDirectory.path),
                           "Une pièce en attente ne vit pas dans tmp, qu'iOS balaie.")
        }
        await cleanup(cmid)
    }

    func test_enqueueCommentMedia_sameClientId_doesNotCreateASecondRow() async throws {
        let cmid = "cmid_comment_media_2"
        let first = try await enqueueTwoPieces(cmid)
        let second = try await enqueueTwoPieces(cmid)
        XCTAssertEqual(second.outboxId, first.outboxId)
        XCTAssertTrue(first.localMediaPaths.allSatisfy {
            FileManager.default.fileExists(atPath: OfflineQueue.absoluteMediaPath(forStored: $0))
        }, "Un second enfilement ne retire pas les pièces du premier.")
        let rows = try await pool.read { db in
            try OutboxRecord.filter(Column("kind") == OutboxKind.createComment.rawValue).fetchCount(db)
        }
        XCTAssertEqual(rows, 1, "Un même identifiant client ne produit qu'un commentaire.")
        await cleanup(cmid)
    }

    func test_enqueueCommentMedia_keepsWhatTheDirectAttemptAlreadyUploaded() async throws {
        let cmid = "cmid_comment_media_3"
        let done = UploadedCommentMedia(sourceIndex: 0, id: "media0", uploadedAt: Date().timeIntervalSince1970)
        let result = try await enqueueTwoPieces(cmid, acquired: [done])
        XCTAssertEqual(try payload(result.outboxId).uploadedMedia, [done])
        await cleanup(cmid)
    }

    // MARK: - Ce qui est monté reste monté

    func test_recordUploadedCommentMedia_accumulates_andIsIdempotentByIndex() async throws {
        let cmid = "cmid_comment_media_4"
        let result = try await enqueueTwoPieces(cmid)
        let now = Date().timeIntervalSince1970

        await queue.recordUploadedCommentMedia(outboxId: result.outboxId,
                                               UploadedCommentMedia(sourceIndex: 1, id: "media1", uploadedAt: now))
        await queue.recordUploadedCommentMedia(outboxId: result.outboxId,
                                               UploadedCommentMedia(sourceIndex: 0, id: "media0", uploadedAt: now))
        await queue.recordUploadedCommentMedia(outboxId: result.outboxId,
                                               UploadedCommentMedia(sourceIndex: 0, id: "media0-bis", uploadedAt: now))

        let stored = try payload(result.outboxId)
        XCTAssertEqual(stored.uploadedMedia?.map(\.sourceIndex), [0, 1])
        XCTAssertEqual(CommentMediaReplay.attachmentIds(stored.uploadedMedia ?? []), ["media0-bis", "media1"])
        XCTAssertEqual(stored.localMediaPaths?.count, 2, "Graver un acquis ne retire aucune pièce de la ligne.")
        await cleanup(cmid)
    }

    // MARK: - Le plan d'un rejeu

    func test_plan_uploadsOnlyWhatIsNotAcquired() {
        let now = Date()
        let done = UploadedCommentMedia(sourceIndex: 0, id: "media0", uploadedAt: now.timeIntervalSince1970 - 60)
        let payload = comment("cmid_plan_1").withMedia(
            localMediaPaths: ["p/0.jpg", "p/1.m4a"], localMediaMimeTypes: nil, uploadedMedia: [done])
        let plan = CommentMediaReplay.plan(for: payload, now: now, fileExists: { _ in true })
        XCTAssertEqual(plan.acquired, [done])
        XCTAssertEqual(plan.toUpload, [1])
        XCTAssertTrue(plan.missing.isEmpty)
    }

    func test_plan_reuploadsAPieceTheServerHasSweptByNow() {
        let now = Date()
        let stale = UploadedCommentMedia(sourceIndex: 0, id: "media0",
                                         uploadedAt: now.timeIntervalSince1970 - 21 * 60 * 60)
        let payload = comment("cmid_plan_2").withMedia(
            localMediaPaths: ["p/0.jpg"], localMediaMimeTypes: nil, uploadedMedia: [stale])
        let plan = CommentMediaReplay.plan(for: payload, now: now, fileExists: { _ in true })
        XCTAssertTrue(plan.acquired.isEmpty, "Un média pré-téléversé non réclamé est balayé à 24 h.")
        XCTAssertEqual(plan.toUpload, [0])
    }

    func test_plan_namesAPieceWhoseFileIsGone() {
        let payload = comment("cmid_plan_3").withMedia(
            localMediaPaths: ["p/0.jpg", "p/1.jpg"], localMediaMimeTypes: nil, uploadedMedia: nil)
        let plan = CommentMediaReplay.plan(for: payload, now: Date(), fileExists: { $0 == 1 })
        XCTAssertEqual(plan.toUpload, [1])
        XCTAssertEqual(plan.missing, [0])
    }

    // MARK: - L'échec reste relançable, avec ses pièces

    func test_anExhaustedComment_isListedAsFailed_keepsItsFiles_andRetryRearmsIt() async throws {
        let cmid = "cmid_comment_media_5"
        let result = try await enqueueTwoPieces(cmid)
        try await pool.write { db in
            try db.execute(sql: "UPDATE outbox SET status = ?, attempts = 5, lastError = ? WHERE id = ?",
                           arguments: [OutboxStatus.exhausted.rawValue, "hors ligne", result.outboxId])
        }

        let failedList = await queue.unsentComments(postId: "post-1")
        let failed = try XCTUnwrap(failedList.first)
        XCTAssertTrue(failed.isFailed)
        XCTAssertEqual(failed.clientMutationId, cmid)
        XCTAssertEqual(failed.localMediaURLs.count, 2)
        XCTAssertTrue(failed.localMediaURLs.allSatisfy { FileManager.default.fileExists(atPath: $0.path) },
                      "Un commentaire abandonné par la file garde ses pièces.")

        try await queue.retryItem(result.outboxId)

        let rearmedList = await queue.unsentComments(postId: "post-1")
        let rearmed = try XCTUnwrap(rearmedList.first)
        XCTAssertFalse(rearmed.isFailed)
        XCTAssertEqual(rearmed.payload.localMediaPaths?.count, 2)
        await cleanup(cmid)
    }

    func test_unsentComments_areScopedToTheirPost() async throws {
        let cmid = "cmid_comment_media_6"
        _ = try await enqueueTwoPieces(cmid)
        let other = await queue.unsentComments(postId: "post-2")
        XCTAssertTrue(other.isEmpty)
        await cleanup(cmid)
    }

    // MARK: - La reprise après un redémarrage

    func test_afterARelaunch_theRowAndItsFilesAreStillThere() async throws {
        let cmid = "cmid_comment_media_7"
        _ = try await enqueueTwoPieces(cmid)

        // Un redémarrage ne garde que la base et le disque : on rebranche la
        // file sur la même base, sans rien lui redonner d'autre.
        await OfflineQueue.shared.configure(pool: pool)

        let survivorList = await queue.unsentComments(postId: "post-1")
        let survivor = try XCTUnwrap(survivorList.first)
        XCTAssertEqual(survivor.payload.content, "regarde")
        XCTAssertEqual(survivor.localMediaURLs.map(\.lastPathComponent), ["0.jpg", "1.m4a"])
        XCTAssertEqual(try String(contentsOf: survivor.localMediaURLs[1], encoding: .utf8), "voix")
        await cleanup(cmid)
    }

    func test_cancelCreateComment_removesTheRowAndItsFiles() async throws {
        let cmid = "cmid_comment_media_8"
        let result = try await enqueueTwoPieces(cmid)
        let paths = try XCTUnwrap(try payload(result.outboxId).localMediaPaths)

        await queue.cancelCreateComment(clientMutationId: cmid)

        let remaining = await queue.unsentComments(postId: "post-1")
        XCTAssertTrue(remaining.isEmpty)
        XCTAssertTrue(paths.allSatisfy { !FileManager.default.fileExists(atPath: OfflineQueue.absoluteMediaPath(forStored: $0)) })
    }

    // MARK: - Une file gravée avant ce lot se relit

    func test_aRowWrittenBeforeTheFields_stillDecodes() throws {
        let legacy = Data(#"{"clientMutationId":"cmid_x","postId":"p","content":"salut"}"#.utf8)
        let decoded = try JSONDecoder().decode(CreateCommentPayload.self, from: legacy)
        XCTAssertNil(decoded.localMediaPaths)
        XCTAssertNil(decoded.uploadedMedia)
    }
}
