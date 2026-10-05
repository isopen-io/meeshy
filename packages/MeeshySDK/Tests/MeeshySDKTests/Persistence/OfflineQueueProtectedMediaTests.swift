import XCTest
import GRDB
@testable import MeeshySDK

/// **Un média protégé mis en file hors ligne garde sa protection** (#8350).
///
/// #8303 a fait rejouer la protection d'un envoi REST ; les chemins MÉDIA
/// (`enqueueMedia`, `enqueueAudios`) ne la recevaient même pas : une photo
/// floutée capturée hors ligne entrait en file sans rien qui dise qu'elle
/// était floutée.
final class OfflineQueueProtectedMediaTests: XCTestCase {

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
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("protected_\(UUID().uuidString).\(ext)")
        try Data(repeating: 0xEF, count: 16).write(to: url)
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

    func test_enqueueMedia_blurredPhoto_persistsItsProtection() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        _ = try await queue.enqueueMedia(
            sourceMediaURLs: [try tempFile(ext: "jpg")], kinds: [AttachmentKind.image.rawValue],
            conversationId: "conv-1", content: nil, clientMessageId: cid,
            protection: MessageProtectionIntent(ephemeral: nil, isBlurred: true))

        let replay = try await item(for: cid).replayProtection
        XCTAssertTrue(replay.isBlurred)
        XCTAssertFalse(replay.isViewOnce)
    }

    func test_enqueueMedia_afterReadVideo_persistsTheFlameEyeWithoutDuration() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        _ = try await queue.enqueueMedia(
            sourceMediaURLs: [try tempFile(ext: "mp4")], kinds: [AttachmentKind.video.rawValue],
            conversationId: "conv-1", content: nil, clientMessageId: cid,
            protection: MessageProtectionIntent(ephemeral: .afterRead))

        let replay = try await item(for: cid).replayProtection
        XCTAssertTrue(replay.ephemeralAfterRead)
        XCTAssertNil(replay.ephemeralDurationSeconds)
    }

    func test_enqueueAudios_viewOnceEphemeral_persistsBoth() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        _ = try await queue.enqueueAudios(
            sourceAudioURLs: [try tempFile(ext: "m4a")],
            conversationId: "conv-1", content: nil, clientMessageId: cid,
            protection: MessageProtectionIntent(ephemeral: .duration(.fifteenSeconds), isViewOnce: true))

        let replay = try await item(for: cid).replayProtection
        XCTAssertTrue(replay.isViewOnce)
        XCTAssertEqual(replay.ephemeralDurationSeconds, 15)
    }

    func test_enqueueMedia_withoutProtection_persistsNone() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        _ = try await queue.enqueueMedia(
            sourceMediaURLs: [try tempFile(ext: "jpg")], kinds: [AttachmentKind.image.rawValue],
            conversationId: "conv-1", content: nil, clientMessageId: cid)

        let persisted = try await item(for: cid)
        XCTAssertNil(persisted.protectionFlags)
        XCTAssertTrue(persisted.replayProtection.isEmpty)
    }
}
