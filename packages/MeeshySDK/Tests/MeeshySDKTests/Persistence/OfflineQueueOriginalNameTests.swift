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
