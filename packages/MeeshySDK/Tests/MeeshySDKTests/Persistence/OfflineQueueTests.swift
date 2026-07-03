import XCTest
import GRDB
import Combine
@testable import MeeshySDK

final class OfflineQueueTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }

    override func setUp() async throws {
        // Wave 1 Task 3.6 — every enqueue path on `OfflineQueue` requires a
        // configured pool. Wiring a fresh in-memory `DatabaseQueue` per test
        // case keeps the legacy tests green while the unified outbox path is
        // exercised. The migrations need to run so the `outbox` table exists.
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await queue.clearAll()
    }

    override func tearDown() async throws {
        await queue.clearAll()
    }

    // MARK: - OfflineQueueItem Model

    func test_item_init_generatesUniqueId() {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "Hello")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "Hello")

        XCTAssertNotEqual(item1.id, item2.id, "Each item should get a unique ID")
    }

    func test_item_init_setsCreatedAtToNow() {
        let before = Date()
        let item = OfflineQueueItem(conversationId: "conv-1", content: "Hello")
        let after = Date()

        XCTAssertGreaterThanOrEqual(item.createdAt, before)
        XCTAssertLessThanOrEqual(item.createdAt, after)
    }

    func test_item_init_storesAllProperties() {
        let item = OfflineQueueItem(
            conversationId: "conv-123",
            content: "Test message",
            replyToId: "msg-456",
            forwardedFromId: "msg-789",
            forwardedFromConversationId: "conv-abc",
            attachmentIds: ["att-1", "att-2"]
        )

        XCTAssertEqual(item.conversationId, "conv-123")
        XCTAssertEqual(item.content, "Test message")
        XCTAssertEqual(item.replyToId, "msg-456")
        XCTAssertEqual(item.forwardedFromId, "msg-789")
        XCTAssertEqual(item.forwardedFromConversationId, "conv-abc")
        XCTAssertEqual(item.attachmentIds, ["att-1", "att-2"])
    }

    func test_item_init_defaultsOptionalFieldsToNil() {
        let item = OfflineQueueItem(conversationId: "conv-1", content: "Hello")

        XCTAssertNil(item.replyToId)
        XCTAssertNil(item.forwardedFromId)
        XCTAssertNil(item.forwardedFromConversationId)
        XCTAssertNil(item.attachmentIds)
    }

    // MARK: - OfflineQueueItem Codable

    func test_item_codableRoundtrip() throws {
        let item = OfflineQueueItem(
            conversationId: "conv-1",
            content: "Hello world",
            replyToId: "reply-1",
            attachmentIds: ["att-1"]
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(item)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(OfflineQueueItem.self, from: data)

        XCTAssertEqual(decoded.id, item.id)
        XCTAssertEqual(decoded.conversationId, item.conversationId)
        XCTAssertEqual(decoded.content, item.content)
        XCTAssertEqual(decoded.replyToId, item.replyToId)
        XCTAssertEqual(decoded.attachmentIds, item.attachmentIds)
    }

    // MARK: - Queue Operations

    func test_enqueue_addsItem() async throws {
        let item = OfflineQueueItem(conversationId: "conv-1", content: "Hello")

        try await queue.enqueue(item)

        let count = await queue.count
        XCTAssertEqual(count, 1)
    }

    func test_enqueue_multipleItems_incrementsCount() async throws {
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "First"))
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "Second"))
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-2", content: "Third"))

        let count = await queue.count
        XCTAssertEqual(count, 3)
    }

    func test_dequeue_removesSpecificItem() async throws {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "First")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "Second")

        try await queue.enqueue(item1)
        try await queue.enqueue(item2)
        await queue.dequeue(item1.id)

        let count = await queue.count
        XCTAssertEqual(count, 1)

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.first?.content, "Second")
    }

    func test_pendingItems_returnsFIFOOrder() async throws {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "First")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "Second")
        let item3 = OfflineQueueItem(conversationId: "conv-1", content: "Third")

        try await queue.enqueue(item1)
        try await queue.enqueue(item2)
        try await queue.enqueue(item3)

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.map(\.content), ["First", "Second", "Third"])
    }

    func test_clearAll_removesAllItems() async throws {
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "A"))
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-2", content: "B"))

        await queue.clearAll()

        let isEmpty = await queue.isEmpty
        XCTAssertTrue(isEmpty)
    }

    func test_isEmpty_trueWhenEmpty() async {
        let isEmpty = await queue.isEmpty
        XCTAssertTrue(isEmpty)
    }

    func test_isEmpty_falseWhenItemsExist() async throws {
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "Hello"))

        let isEmpty = await queue.isEmpty
        XCTAssertFalse(isEmpty)
    }

    func test_dequeue_nonExistentId_doesNothing() async throws {
        let item = OfflineQueueItem(conversationId: "conv-1", content: "Hello")
        try await queue.enqueue(item)

        await queue.dequeue("non-existent-id")

        let count = await queue.count
        XCTAssertEqual(count, 1)
    }

    // MARK: - Advanced queue operations (point 47)

    func test_pendingItems_preservesFIFO_afterDequeue() async throws {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "First")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "Second")
        let item3 = OfflineQueueItem(conversationId: "conv-1", content: "Third")

        try await queue.enqueue(item1)
        try await queue.enqueue(item2)
        try await queue.enqueue(item3)

        // Dequeue middle item
        await queue.dequeue(item2.id)

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 2)
        XCTAssertEqual(pending[0].content, "First")
        XCTAssertEqual(pending[1].content, "Third")
    }

    func test_pendingItems_preservesAllMetadata() async throws {
        let item = OfflineQueueItem(
            conversationId: "conv-123",
            content: "Test with metadata",
            replyToId: "reply-1",
            forwardedFromId: "fwd-1",
            forwardedFromConversationId: "fwd-conv-1",
            attachmentIds: ["att-1", "att-2"]
        )

        try await queue.enqueue(item)

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 1)
        let retrieved = pending[0]
        XCTAssertEqual(retrieved.id, item.id)
        XCTAssertEqual(retrieved.conversationId, "conv-123")
        XCTAssertEqual(retrieved.content, "Test with metadata")
        XCTAssertEqual(retrieved.replyToId, "reply-1")
        XCTAssertEqual(retrieved.forwardedFromId, "fwd-1")
        XCTAssertEqual(retrieved.forwardedFromConversationId, "fwd-conv-1")
        XCTAssertEqual(retrieved.attachmentIds, ["att-1", "att-2"])
    }

    func test_clearAll_thenEnqueue_worksNormally() async throws {
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "Before clear"))
        await queue.clearAll()

        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-2", content: "After clear"))

        let count = await queue.count
        XCTAssertEqual(count, 1)
        let pending = await queue.pendingItems
        XCTAssertEqual(pending.first?.content, "After clear")
    }

    func test_dequeue_allItems_makesQueueEmpty() async throws {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "A")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "B")

        try await queue.enqueue(item1)
        try await queue.enqueue(item2)

        await queue.dequeue(item1.id)
        await queue.dequeue(item2.id)

        let isEmpty = await queue.isEmpty
        XCTAssertTrue(isEmpty)
        let count = await queue.count
        XCTAssertEqual(count, 0)
    }

    func test_enqueue_multipleConversations_preservesOrder() async throws {
        let items = (1...5).map { i in
            OfflineQueueItem(conversationId: "conv-\(i)", content: "Message \(i)")
        }

        for item in items {
            try await queue.enqueue(item)
        }

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 5)
        for (index, item) in pending.enumerated() {
            XCTAssertEqual(item.conversationId, "conv-\(index + 1)")
        }
    }

    // MARK: - Audio enqueue (A3 — multi-track + single wrapper)

    /// Writes a throwaway `.m4a` payload into `tmp/` and returns its URL.
    /// Mirrors the volatile recording path the audio composer hands to the
    /// queue at enqueue time.
    // MARK: - S7b — enqueueMedia durable write-ahead (visual media)

    func test_enqueueMedia_persistsLocalMediaPaths_andRelocatesFiles_preservingExtension() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        let url1 = try makeTempMediaFile(ext: "jpg")
        let url2 = try makeTempMediaFile(ext: "mp4")

        let result = try await queue.enqueueMedia(
            sourceMediaURLs: [url1, url2],
            kinds: [AttachmentKind.image.rawValue, AttachmentKind.video.rawValue],
            conversationId: "conv-1",
            content: nil,
            clientMessageId: cid,
            originalLanguage: "fr"
        )

        XCTAssertEqual(result.localMediaPaths.count, 2)
        XCTAssertTrue(result.localMediaPaths[0].hasSuffix(".jpg"),
            "the source extension must be preserved so the dispatcher can derive the MIME")
        XCTAssertTrue(result.localMediaPaths[1].hasSuffix(".mp4"))
        for path in result.localMediaPaths {
            XCTAssertTrue(path.contains(cid), "stored under the per-message subdir")
            XCTAssertTrue(FileManager.default.fileExists(
                atPath: OfflineQueue.absoluteMediaPath(forStored: path)),
                "each media file must be relocated under Documents/pending-media/")
        }

        let items = try await readBackItems(forClientMessageId: cid)
        XCTAssertEqual(items.count, 1, "media persists as exactly ONE OutboxRecord")
        let item = try XCTUnwrap(items.first)
        XCTAssertEqual(item.localMediaPaths?.count, 2)
        XCTAssertNil(item.localAudioPaths, "media rows must not set the audio field")
        XCTAssertNil(item.attachmentIds)
        XCTAssertEqual(item.attachmentKinds,
            [AttachmentKind.image.rawValue, AttachmentKind.video.rawValue])
    }

    /// A terminated media row must have its relocated `pending-media/` file
    /// swept (no leak), exactly like audio.
    func test_cleanupLocalFiles_sweepsLocalMediaPaths() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        let result = try await queue.enqueueMedia(
            sourceMediaURLs: [try makeTempMediaFile(ext: "jpg")],
            kinds: [AttachmentKind.image.rawValue],
            conversationId: "conv-1", content: nil, clientMessageId: cid
        )
        let abs = OfflineQueue.absoluteMediaPath(forStored: result.localMediaPaths[0])
        XCTAssertTrue(FileManager.default.fileExists(atPath: abs), "precondition: file relocated")

        let maybePool = await queue.outboxPoolForTesting
        let pool = try XCTUnwrap(maybePool)
        let record = try await pool.read { db in
            try OutboxRecord.filter(Column("clientMessageId") == cid).fetchOne(db)
        }
        cleanupLocalFiles(for: try XCTUnwrap(record))

        XCTAssertFalse(FileManager.default.fileExists(atPath: abs),
            "a terminated media row must sweep its pending-media file (no leak)")
    }

    // MARK: - U1b — enqueuePostMedia durable write-ahead (offline media post)

    func test_enqueuePostMedia_persistsCreatePostRow_withLocalMediaPaths_andRelocatesFiles() async throws {
        let cmid = "cmid_\(UUID().uuidString.lowercased())"
        let url1 = try makeTempMediaFile(ext: "jpg")
        let url2 = try makeTempMediaFile(ext: "mp4")

        let result = try await queue.enqueuePostMedia(
            sourceMediaURLs: [url1, url2],
            clientMutationId: cmid,
            content: "Photo post",
            visibility: "PUBLIC",
            originalLanguage: "fr"
        )

        XCTAssertEqual(result.localMediaPaths.count, 2)
        XCTAssertTrue(result.localMediaPaths[0].hasSuffix(".jpg"),
            "the source extension must be preserved so the dispatcher can derive the MIME")
        XCTAssertTrue(result.localMediaPaths[1].hasSuffix(".mp4"))
        for path in result.localMediaPaths {
            XCTAssertTrue(path.contains(cmid), "stored under the per-cmid subdir")
            XCTAssertTrue(FileManager.default.fileExists(
                atPath: OfflineQueue.absoluteMediaPath(forStored: path)),
                "each media file must be relocated under Documents/pending-media/")
        }

        // The persisted row must be a .createPost carrying the localMediaPaths so
        // the dispatcher (ST1) can replay the TUS upload on reconnect.
        let maybePool = await queue.outboxPoolForTesting
        let pool = try XCTUnwrap(maybePool)
        let record = try await pool.read { db in
            try OutboxRecord.filter(Column("id") == "ofqm_\(cmid)").fetchOne(db)
        }
        let row = try XCTUnwrap(record)
        XCTAssertEqual(row.kind, .createPost)
        XCTAssertEqual(row.status, .pending)
        let payload = try JSONDecoder().decode(CreatePostPayload.self, from: row.payload)
        XCTAssertEqual(payload.clientMutationId, cmid)
        XCTAssertEqual(payload.localMediaPaths?.count, 2)
        XCTAssertEqual(payload.content, "Photo post")
        XCTAssertEqual(payload.visibility, "PUBLIC")
        XCTAssertEqual(payload.originalLanguage, "fr")
        XCTAssertTrue(payload.attachmentIds.isEmpty)
        XCTAssertNil(payload.type, "default media post carries no type → gateway POST default")
    }

    func test_enqueuePostMedia_reelType_persistsReelOnCreatePostRow() async throws {
        let cmid = "cmid_\(UUID().uuidString.lowercased())"
        let url = try makeTempMediaFile(ext: "mp4")

        _ = try await queue.enqueuePostMedia(
            sourceMediaURLs: [url],
            clientMutationId: cmid,
            content: "My reel",
            visibility: "PUBLIC",
            originalLanguage: "en",
            type: "REEL"
        )

        // The durable row must carry the REEL type so the dispatcher creates the
        // post on the reels surface on reconnect — the only divergence from a
        // plain offline media post is this server-side type.
        let maybePool = await queue.outboxPoolForTesting
        let pool = try XCTUnwrap(maybePool)
        let record = try await pool.read { db in
            try OutboxRecord.filter(Column("id") == "ofqm_\(cmid)").fetchOne(db)
        }
        let row = try XCTUnwrap(record)
        XCTAssertEqual(row.kind, .createPost)
        let payload = try JSONDecoder().decode(CreatePostPayload.self, from: row.payload)
        XCTAssertEqual(payload.type, "REEL")
        XCTAssertEqual(payload.localMediaPaths?.count, 1)
    }

    // MARK: - Offline draft recovery (recoverLastUnsentPost / cancelCreatePost)

    private func enqueueCreatePost(
        cmid: String,
        content: String,
        type: String,
        moodEmoji: String? = nil
    ) async throws {
        let payload = CreatePostPayload(
            clientMutationId: cmid,
            content: content,
            attachmentIds: [],
            visibility: "PUBLIC",
            type: type,
            moodEmoji: moodEmoji
        )
        try await queue.enqueue(.createPost, payload: payload, conversationId: nil)
    }

    func test_recoverLastUnsentPost_returnsMostRecentMatchingType() async throws {
        try await enqueueCreatePost(cmid: "cmid_post", content: "a post", type: "POST")
        try await enqueueCreatePost(cmid: "cmid_status", content: "a mood", type: "STATUS", moodEmoji: "🎉")

        // A status composer recovers only STATUS rows.
        let status = await queue.recoverLastUnsentPost(matchingTypes: ["STATUS"], olderThan: 0)
        XCTAssertEqual(status?.type, "STATUS")
        XCTAssertEqual(status?.content, "a mood")
        XCTAssertEqual(status?.moodEmoji, "🎉")
        XCTAssertEqual(status?.clientMutationId, "cmid_status")

        // A post composer recovers POST/REEL but never a STATUS row.
        let post = await queue.recoverLastUnsentPost(matchingTypes: ["POST", "REEL"], olderThan: 0)
        XCTAssertEqual(post?.type, "POST")
        XCTAssertEqual(post?.content, "a post")
    }

    func test_recoverLastUnsentPost_skipsRowsYoungerThanThreshold() async throws {
        try await enqueueCreatePost(cmid: "cmid_fresh", content: "just now", type: "POST")
        // A row enqueued "just now" is still actively sending, not yet stuck:
        // with a 1h threshold it must NOT be recovered.
        let recovered = await queue.recoverLastUnsentPost(matchingTypes: ["POST"], olderThan: 3600)
        XCTAssertNil(recovered)
    }

    func test_cancelCreatePost_deletesRow_soRecoveryReturnsNil() async throws {
        // The cancel→recovery contract keys on the outbox row id `ofqm_<cmid>`,
        // which `enqueue` derives from the payload's `clientMutationId` ONLY when
        // that cmid passes `ClientMutationId.isValid` (strict `cmid_<uuid v4>`).
        // A human-readable literal like "cmid_cancel" fails validation, so enqueue
        // mints a fresh cmid for the row id and cancel-by-literal misses the row.
        // All production callers use `ClientMutationId.generate()`, so the test
        // must too — otherwise it exercises a path that cannot occur in prod.
        let cmid = ClientMutationId.generate()
        try await enqueueCreatePost(cmid: cmid, content: "doomed", type: "STATUS")
        await queue.cancelCreatePost(clientMutationId: cmid)
        let recovered = await queue.recoverLastUnsentPost(matchingTypes: ["STATUS"], olderThan: 0)
        XCTAssertNil(recovered, "a superseded row must not be recoverable")
    }

    private func makeTempMediaFile(ext: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("media_\(UUID().uuidString).\(ext)")
        try Data(repeating: 0xCD, count: 16).write(to: url)
        return url
    }

    private func makeTempAudioFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("rec_\(UUID().uuidString).m4a")
        try Data(repeating: 0xAB, count: 16).write(to: url)
        return url
    }

    /// Reads back the single persisted `OfflineQueueItem` for a given
    /// `clientMessageId` by decoding the matching `OutboxRecord` payloads.
    /// T11 edit-into-send merge must PRESERVE the pending visual media
    /// (`localMediaPaths`). Editing the caption of an offline photo/video message
    /// BEFORE it flushes rebuilds the send item — dropping the media there sends
    /// the message with NO images/videos (silent data loss).
    func test_enqueueEdit_mergingIntoPendingSend_preservesLocalMediaPaths() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        let media = ["conv-1/0.jpg", "conv-1/1.mp4"]
        try await queue.enqueue(OfflineQueueItem(
            conversationId: "conv-1",
            content: "original caption",
            clientMessageId: cid,
            attachmentKinds: [AttachmentKind.image.rawValue, AttachmentKind.video.rawValue],
            localMediaPaths: media
        ))

        try await queue.enqueueEdit(OfflineEditPayload(
            messageId: cid, clientMessageId: cid,
            content: "edited caption", conversationId: "conv-1"
        ))

        let items = try await readBackItems(forClientMessageId: cid)
        XCTAssertEqual(items.count, 1, "the edit must coalesce into the pending send (exactly one row)")
        let merged = try XCTUnwrap(items.first)
        XCTAssertEqual(merged.content, "edited caption", "the edit's content must win")
        XCTAssertEqual(merged.localMediaPaths, media,
            "the pending images/videos must survive the caption edit — else they are silently lost on flush")
    }

    private func readBackItems(forClientMessageId cmid: String) async throws -> [OfflineQueueItem] {
        let maybePool = await queue.outboxPoolForTesting
        let pool = try XCTUnwrap(maybePool)
        let records: [OutboxRecord] = try await pool.read { db in
            try OutboxRecord
                .filter(Column("clientMessageId") == cmid)
                .fetchAll(db)
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try records.map { try decoder.decode(OfflineQueueItem.self, from: $0.payload) }
    }

    func test_enqueueAudios_persistsAllPaths_inSingleRecord() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        let url1 = try makeTempAudioFile()
        let url2 = try makeTempAudioFile()

        let result = try await queue.enqueueAudios(
            sourceAudioURLs: [url1, url2],
            conversationId: "conv-1",
            content: nil,
            clientMessageId: cid,
            originalLanguage: "fr"
        )

        XCTAssertEqual(result.localAudioPaths.count, 2)
        for path in result.localAudioPaths {
            XCTAssertTrue(path.contains(cid), "Each stored path must live under the per-message subdir")
            XCTAssertTrue(FileManager.default.fileExists(
                atPath: OfflineQueue.absoluteAudioPath(forStored: path)),
                "Each audio file must have been copied to disk")
        }

        let items = try await readBackItems(forClientMessageId: cid)
        XCTAssertEqual(items.count, 1, "Multi-track audio persists as exactly ONE OutboxRecord")
        let item = try XCTUnwrap(items.first)
        XCTAssertEqual(item.localAudioPaths?.count, 2)
        XCTAssertNil(item.localAudioPath)
        XCTAssertNil(item.attachmentIds)
        XCTAssertEqual(item.attachmentKinds, ["audio", "audio"])
        for path in try XCTUnwrap(item.localAudioPaths) {
            XCTAssertTrue(path.contains(cid))
        }
    }

    // MARK: - S6 — audio-orphan rows must be terminal (.exhausted), not .failed

    /// A crash between the outbox insert and the audio file copy leaves a
    /// sendMessage row whose audio bytes are permanently gone. bootRecovery must
    /// mark it `.exhausted` (terminal + GC-eligible via purgeExhaustedOlderThan),
    /// NOT `.failed` — a `.failed` row is never flushed, never exhausted, never
    /// GC'd, so it leaks in the outbox + SyncPill across every session.
    func test_bootRecovery_audioFileMissing_marksExhaustedNotFailed() async throws {
        let maybePool = await queue.outboxPoolForTesting
        let pool = try XCTUnwrap(maybePool)
        let cid = "cid_boot_\(UUID().uuidString.lowercased())"
        // Enqueue a real audio row (correctly-encoded payload + copied files),
        // then delete the copied files to simulate a crash that lost the bytes.
        let src = try makeTempAudioFile()
        let result = try await queue.enqueueAudios(
            sourceAudioURLs: [src], conversationId: "conv-1",
            content: nil, clientMessageId: cid, originalLanguage: "fr"
        )
        for path in result.localAudioPaths {
            try? FileManager.default.removeItem(
                atPath: OfflineQueue.absoluteAudioPath(forStored: path))
        }

        let report = try await queue.bootRecovery()

        XCTAssertEqual(report.audioOrphanFailed, 1, "the missing-audio row must be swept")
        let status = try await pool.read { db in
            try OutboxRecord.filter(Column("clientMessageId") == cid).fetchOne(db)?.status
        }
        XCTAssertEqual(status, .exhausted,
            "an audio-orphan row must be terminal (.exhausted, GC-eligible), not .failed")
    }

    /// A copy failure in enqueueAudios (source bytes unreadable) is permanent —
    /// the row must end `.exhausted`, not `.failed`.
    func test_enqueueAudios_copyFailure_marksExhaustedNotFailed_andThrows() async throws {
        let maybePool = await queue.outboxPoolForTesting
        let pool = try XCTUnwrap(maybePool)
        let cid = "cid_copyfail_\(UUID().uuidString.lowercased())"
        let badSource = FileManager.default.temporaryDirectory
            .appendingPathComponent("does_not_exist_\(UUID().uuidString).m4a")

        do {
            _ = try await queue.enqueueAudios(
                sourceAudioURLs: [badSource], conversationId: "conv-1",
                content: nil, clientMessageId: cid, originalLanguage: "fr"
            )
            XCTFail("enqueueAudios must throw when the source copy fails")
        } catch {
            // expected EnqueueAudioError.audioCopyFailed
        }

        let status = try await pool.read { db in
            try OutboxRecord.filter(Column("clientMessageId") == cid).fetchOne(db)?.status
        }
        XCTAssertEqual(status, .exhausted,
            "a copy-failure row must be terminal (.exhausted), not .failed")
    }

    func test_enqueueAudio_single_stillWorks_viaWrapper() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        let url = try makeTempAudioFile()

        let result = try await queue.enqueueAudio(
            sourceAudioURL: url,
            conversationId: "conv-1",
            content: nil,
            clientMessageId: cid,
            originalLanguage: "fr"
        )

        XCTAssertFalse(result.localAudioPath.isEmpty)
        XCTAssertTrue(result.localAudioPath.contains(cid))
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: OfflineQueue.absoluteAudioPath(forStored: result.localAudioPath)))

        let items = try await readBackItems(forClientMessageId: cid)
        XCTAssertEqual(items.count, 1)
        let item = try XCTUnwrap(items.first)
        XCTAssertEqual(item.localAudioPaths?.count, 1)
        XCTAssertEqual(item.localAudioPaths?.first, result.localAudioPath)
    }

    func test_item_backwardCompatible_decodesWithoutLocalAudioPaths() throws {
        // Legacy persisted payloads predate `localAudioPaths` — they must still
        // decode (the key is absent) with the new field defaulting to nil.
        let legacyJSON = """
        {"id":"x","clientMessageId":"cid_legacy","conversationId":"c1",
         "content":"hi","createdAt":"2026-05-30T00:00:00Z"}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let item = try decoder.decode(OfflineQueueItem.self, from: Data(legacyJSON.utf8))
        XCTAssertNil(item.localAudioPaths)
        XCTAssertNil(item.localAudioPath)
        XCTAssertEqual(item.content, "hi")
    }

    // MARK: - Near-capacity publisher

    func test_nearCapacityPublisher_notFiredBelowThreshold() async throws {
        // Capacity = 500, threshold = 400. Enqueue 399 items — not near capacity.
        XCTAssertFalse(queue.isNearCapacity)

        for i in 0..<10 {
            let item = OfflineQueueItem(conversationId: "conv-nc", content: "msg-\(i)")
            try await queue.enqueue(item)
        }

        XCTAssertFalse(queue.isNearCapacity,
            "isNearCapacity must remain false well below the 400-item threshold")
    }

    func test_nearCapacityPublisher_firesAtThreshold() async throws {
        // Enqueue exactly 400 items (the threshold = 500 * 4/5) and verify
        // that isNearCapacity becomes true.
        let threshold = 400
        for i in 0..<threshold {
            let item = OfflineQueueItem(conversationId: "conv-nc2", content: "msg-\(i)")
            try await queue.enqueue(item)
        }

        XCTAssertTrue(queue.isNearCapacity,
            "isNearCapacity must be true once \(threshold) items are queued")
    }

    func test_nearCapacityPublisher_emitsValueViaPublisher() async throws {
        var received: [Bool] = []
        var cancellable: AnyCancellable?
        let expectation = XCTestExpectation(description: "near-capacity event")
        expectation.expectedFulfillmentCount = 1

        cancellable = queue.nearCapacityPublisher
            .filter { $0 }
            .sink { value in
                received.append(value)
                expectation.fulfill()
            }

        let threshold = 400
        for i in 0..<threshold {
            let item = OfflineQueueItem(conversationId: "conv-nc3", content: "msg-\(i)")
            try await queue.enqueue(item)
        }

        await fulfillment(of: [expectation], timeout: 5)
        XCTAssertTrue(received.contains(true), "publisher must emit true when threshold is reached")
        cancellable?.cancel()
    }

    func test_isNearCapacity_synchronousReadMatchesPublisher() async throws {
        XCTAssertFalse(queue.isNearCapacity, "initial state must be false")

        let threshold = 400
        for i in 0..<threshold {
            let item = OfflineQueueItem(conversationId: "conv-nc4", content: "msg-\(i)")
            try await queue.enqueue(item)
        }

        let synchronousValue = queue.isNearCapacity
        let publishedValue = await withCheckedContinuation { continuation in
            var c: AnyCancellable?
            c = queue.nearCapacityPublisher
                .first()
                .sink { v in
                    continuation.resume(returning: v)
                    c?.cancel()
                }
        }
        XCTAssertEqual(synchronousValue, publishedValue,
            "synchronous isNearCapacity and publisher's current value must agree")
    }
}
