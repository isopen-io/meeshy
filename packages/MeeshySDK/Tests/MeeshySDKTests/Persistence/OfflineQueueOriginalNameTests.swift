import XCTest
import GRDB
@testable import MeeshySDK

/// **Un fichier mis en file garde son nom d'origine** (#11531).
///
/// Le chemin disque reste `pending-media/<cmid>/<index>.<ext>` : le nom choisi
/// par une autre app n'entre jamais dans un chemin. Il voyage à côté, aligné
/// par index sur `localMediaPaths`, jusqu'au `filename` TUS — sans lui, un
/// partage repris par l'app arrivait au serveur nommé `0.jpeg`.
final class OfflineQueueOriginalNameTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }

    override func setUp() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await queue.clearAll()
    }

    override func tearDown() async throws {
        await queue.clearAll()
    }

    private func tempFile(ext: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("named_\(UUID().uuidString).\(ext)")
        try Data(repeating: 0xAB, count: 16).write(to: url)
        return url
    }

    private func item(for cid: String) async throws -> OfflineQueueItem {
        let maybePool = await queue.outboxPoolForTesting
        let pool = try XCTUnwrap(maybePool)
        let record = try await pool.read { db in
            try OutboxRecord.filter(Column("clientMessageId") == cid).fetchOne(db)
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(OfflineQueueItem.self, from: try XCTUnwrap(record).payload)
    }

    private func postPayload(cmid: String) async throws -> CreatePostPayload {
        let maybePool = await queue.outboxPoolForTesting
        let pool = try XCTUnwrap(maybePool)
        let record = try await pool.read { db in
            try OutboxRecord.filter(Column("id") == "ofqm_\(cmid)").fetchOne(db)
        }
        return try JSONDecoder().decode(CreatePostPayload.self, from: try XCTUnwrap(record).payload)
    }

    func test_enqueueMedia_withOriginalNames_persistsThemAlignedWithTheUnchangedPaths() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        let result = try await queue.enqueueMedia(
            sourceMediaURLs: [try tempFile(ext: "jpeg"), try tempFile(ext: "mp4")],
            kinds: [AttachmentKind.image.rawValue, AttachmentKind.video.rawValue],
            conversationId: "conv-1", content: nil, clientMessageId: cid,
            deletesSourceFiles: false,
            originalNames: ["IMG_0111.jpeg", nil])

        XCTAssertEqual(result.localMediaPaths.map { URL(fileURLWithPath: $0).lastPathComponent }, ["0.jpeg", "1.mp4"],
                       "le chemin disque ne change pas")
        let stored = try await item(for: cid)
        XCTAssertEqual(stored.localMediaOriginalNames, ["IMG_0111.jpeg", nil])
    }

    func test_enqueueMedia_withoutOriginalNames_persistsNoNames() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        _ = try await queue.enqueueMedia(
            sourceMediaURLs: [try tempFile(ext: "jpeg")], kinds: [AttachmentKind.image.rawValue],
            conversationId: "conv-1", content: nil, clientMessageId: cid)

        let stored = try await item(for: cid)
        XCTAssertNil(stored.localMediaOriginalNames)
    }

    func test_enqueueAudios_withOriginalNames_persistsThemForTheReplay() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        let result = try await queue.enqueueAudios(
            sourceAudioURLs: [try tempFile(ext: "m4a")], conversationId: "conv-1", content: nil,
            clientMessageId: cid, originalNames: ["On fait comme ça.m4a"])

        let stored = try await item(for: cid)
        XCTAssertEqual(result.localAudioPaths.count, 1)
        XCTAssertEqual(stored.originalMediaName(at: 0), "On fait comme ça.m4a")
    }

    func test_enqueuePostMedia_importedCopy_keepsTheChosenNameBesideItsPendingPath() async throws {
        let copy = FileManager.default.temporaryDirectory
            .appendingPathComponent(ImportedCopyName.copyName(of: "Devis final.pdf", through: .composerDocument))
        try Data(repeating: 0xAB, count: 16).write(to: copy)
        let camera = try tempFile(ext: "mp4")
        let cmid = "cmid_\(UUID().uuidString.lowercased())"

        let result = try await queue.enqueuePostMedia(
            sourceMediaURLs: [copy, camera], sourceMediaMimeTypes: ["application/pdf", "video/mp4"],
            clientMutationId: cmid, content: nil, visibility: "PUBLIC",
            mobileTranscription: nil, storyEffects: nil, mediaCaptions: nil, mediaAlts: nil,
            mediaObjectIds: nil, allowSoundExtraction: nil)

        let payload = try await postPayload(cmid: cmid)
        let sent = result.localMediaPaths.map { URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(forStored: $0)) }
        XCTAssertEqual(payload.originalMediaName(forSentFile: sent[0]), "Devis final.pdf")
        XCTAssertNil(payload.originalMediaName(forSentFile: sent[1]), "un fichier sans nom choisi garde le sien")
    }

    func test_postMediaProgress_keepsTheChosenNames() {
        let payload = CreatePostPayload(
            clientMutationId: "m", content: "", attachmentIds: [], visibility: "PUBLIC",
            localMediaPaths: ["pending-media/m/0.pdf"], localMediaOriginalNames: ["Devis.pdf"])

        let relu = payload.withUploadedMedia([UploadedPostMedia(sourceIndex: 0, id: "id", url: "u")])

        XCTAssertEqual(relu.localMediaOriginalNames, ["Devis.pdf"])
    }

    func test_postPayload_withoutNames_namesNoFile() {
        let payload = CreatePostPayload(
            clientMutationId: "m", content: "", attachmentIds: [], visibility: "PUBLIC",
            localMediaPaths: ["pending-media/m/0.pdf"])

        XCTAssertNil(payload.originalMediaName(forSentFile: URL(fileURLWithPath: "/x/pending-media/m/0.pdf")))
    }

    func test_item_writtenBeforeTheNames_decodesWithoutThem() throws {
        let legacy = Data("""
        {"id":"i","clientMessageId":"cid_x","conversationId":"c","content":"",\
        "localMediaPaths":["pending-media/cid_x/0.jpeg"],"createdAt":"2026-10-01T00:00:00Z"}
        """.utf8)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let item = try decoder.decode(OfflineQueueItem.self, from: legacy)

        XCTAssertNil(item.localMediaOriginalNames)
        XCTAssertEqual(item.localMediaPaths, ["pending-media/cid_x/0.jpeg"])
    }

    func test_originalName_atIndex_isNilOutOfBounds() {
        let item = OfflineQueueItem(
            id: "i", clientMessageId: "cid_x", conversationId: "c", content: "",
            originalLanguage: nil, replyToId: nil, forwardedFromId: nil, forwardedFromConversationId: nil,
            attachmentIds: nil, localAudioPath: nil,
            localMediaPaths: ["a", "b"], localMediaOriginalNames: ["IMG_1.jpeg"], createdAt: Date())

        XCTAssertEqual(item.originalMediaName(at: 0), "IMG_1.jpeg")
        XCTAssertNil(item.originalMediaName(at: 1))
        XCTAssertNil(item.originalMediaName(at: -1))
    }
}
