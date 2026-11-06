import XCTest
import GRDB
@testable import Meeshy
@testable import MeeshySDK
import MeeshyUI

@MainActor
final class PendingBubbleMediaRelocationTests: XCTestCase {

    private static let conversationId = "00000000000000000000c151"

    private final class RelocatorSpy: PendingBubbleMediaRelocating {
        private(set) var calls: [(tempId: String, attachmentIds: [String], storedPaths: [String])] = []

        func relocate(tempId: String, attachments: [MeeshyMessageAttachment], toStoredPaths storedPaths: [String]) async {
            calls.append((tempId, attachments.map(\.id), storedPaths))
        }
    }

    private func makeAttachment(id: String, mimeType: String, source: URL) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            fileName: source.lastPathComponent,
            originalName: source.lastPathComponent,
            mimeType: mimeType,
            fileSize: 42,
            fileUrl: source.absoluteString,
            thumbnailUrl: mimeType.hasPrefix("image/") ? source.absoluteString : nil,
            duration: mimeType.hasPrefix("image/") ? nil : 12_000,
            uploadedBy: "me"
        )
    }

    private func makeVisualGroup(tempId: String, attachments: [MeeshyMessageAttachment]) -> OutgoingMediaGroup {
        OutgoingMediaGroup(
            group: MultiAttachmentSendPlanner.PlannedMessage(kind: .visual, attachments: attachments, text: nil, carriesReply: false),
            tempId: tempId,
            locals: attachments
        )
    }

    // MARK: - L'enfilage hors ligne remet les chemins durables à la bulle

    func test_enqueueOffline_visualGroup_relocatesTheBubbleOntoTheDurableCopies() async {
        let image = makeAttachment(id: "att-img", mimeType: "image/jpeg", source: URL(fileURLWithPath: "/tmp/src/photo.jpg"))
        let video = makeAttachment(id: "att-vid", mimeType: "video/mp4", source: URL(fileURLWithPath: "/tmp/src/clip.mp4"))
        let send = makeVisualGroup(tempId: "cid_offline_visual", attachments: [image, video])
        let queue = FakeOfflineMessageQueue()
        let relocator = RelocatorSpy()
        let sut = AttachmentGroupOutbox(
            conversationId: Self.conversationId, originalLanguage: "fr", replyToId: nil, protection: .none,
            mediaQueue: queue, relocator: relocator
        )

        let queued = await sut.enqueueOffline(send, mediaFiles: [
            "att-img": URL(fileURLWithPath: "/tmp/src/photo.jpg"),
            "att-vid": URL(fileURLWithPath: "/tmp/src/clip.mp4")
        ])

        XCTAssertTrue(queued)
        XCTAssertEqual(relocator.calls.count, 1, "la bulle doit suivre la copie durable, la source est effacée par l'outbox")
        XCTAssertEqual(relocator.calls.first?.tempId, "cid_offline_visual")
        XCTAssertEqual(relocator.calls.first?.attachmentIds, ["att-img", "att-vid"])
        XCTAssertEqual(relocator.calls.first?.storedPaths, [
            "pending-media/cid_offline_visual/0.jpg",
            "pending-media/cid_offline_visual/1.mp4"
        ])
    }

    func test_requeueAfterOnlineFailure_visualGroup_relocatesTheBubbleToo() async {
        let video = makeAttachment(id: "att-vid", mimeType: "video/mp4", source: URL(fileURLWithPath: "/tmp/src/clip.mp4"))
        let send = makeVisualGroup(tempId: "cid_requeued", attachments: [video])
        let relocator = RelocatorSpy()
        let sut = AttachmentGroupOutbox(
            conversationId: Self.conversationId, originalLanguage: "fr", replyToId: nil, protection: .none,
            mediaQueue: FakeOfflineMessageQueue(), relocator: relocator
        )

        let requeued = await sut.requeueAfterOnlineFailure(send, mediaFiles: ["att-vid": URL(fileURLWithPath: "/tmp/src/clip.mp4")])

        XCTAssertTrue(requeued)
        XCTAssertEqual(relocator.calls.map(\.storedPaths), [["pending-media/cid_requeued/0.mp4"]])
    }

    func test_requeueAfterOnlineFailure_importedFile_keepsItsChosenNameForTheReplay() async {
        let copy = URL(fileURLWithPath: "/tmp/file_27E4A5BD-0000-0000-0000-000000000000_Devis.pdf")
        let document = MeeshyMessageAttachment(id: "att-doc", fileName: "Devis.pdf", originalName: "Devis.pdf",
                                               mimeType: "application/pdf", fileSize: 42, fileUrl: copy.absoluteString)
        let queue = FakeOfflineMessageQueue()
        let sut = AttachmentGroupOutbox(
            conversationId: Self.conversationId, originalLanguage: "fr", replyToId: nil, protection: .none,
            mediaQueue: queue, relocator: RelocatorSpy()
        )

        let requeued = await sut.requeueAfterOnlineFailure(
            makeVisualGroup(tempId: "cid_doc", attachments: [document]), mediaFiles: ["att-doc": copy])

        XCTAssertTrue(requeued)
        let names = await queue.enqueuedMediaCalls.map(\.originalNames)
        XCTAssertEqual(names, [["Devis.pdf"]])
    }

    func test_enqueueOffline_importedAudio_keepsItsChosenNameForTheReplay() async throws {
        let saved = await OfflineQueue.shared.outboxPool
        let base = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: base)
        await OfflineQueue.shared.configure(pool: base)
        defer { if let saved { Task { await OfflineQueue.shared.configure(pool: saved) } } }
        let copy = FileManager.default.temporaryDirectory.appendingPathComponent(
            ImportedCopyName.copyName(of: "On fait comme ça.m4a", through: .conversationFile))
        try Data("octets".utf8).write(to: copy)
        let song = MeeshyMessageAttachment(id: "att-son", fileName: "On fait comme ça.m4a",
                                           originalName: "On fait comme ça.m4a", mimeType: "audio/mp4",
                                           fileUrl: copy.absoluteString)
        let cid = "cid_\(UUID().uuidString.lowercased())"
        let send = OutgoingMediaGroup(
            group: MultiAttachmentSendPlanner.PlannedMessage(kind: .audio, attachments: [song], text: nil, carriesReply: false),
            tempId: cid, locals: [song])
        let sut = AttachmentGroupOutbox(conversationId: Self.conversationId, originalLanguage: "fr", replyToId: nil,
                                        protection: .none, relocator: RelocatorSpy())

        let queued = await sut.enqueueOffline(send, mediaFiles: ["att-son": copy])

        XCTAssertTrue(queued)
        let record = try await base.read { db in
            try OutboxRecord.filter(Column("clientMessageId") == cid).fetchOne(db)
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let item = try decoder.decode(OfflineQueueItem.self, from: try XCTUnwrap(record).payload)
        XCTAssertEqual(item.originalMediaName(at: 0), "On fait comme ça.m4a")
    }

    func test_enqueueOffline_queueFails_leavesTheBubbleAlone() async {
        let video = makeAttachment(id: "att-vid", mimeType: "video/mp4", source: URL(fileURLWithPath: "/tmp/src/clip.mp4"))
        let queue = FakeOfflineMessageQueue()
        await queue.failEveryEnqueue()
        let relocator = RelocatorSpy()
        let sut = AttachmentGroupOutbox(
            conversationId: Self.conversationId, originalLanguage: "fr", replyToId: nil, protection: .none,
            mediaQueue: queue, relocator: relocator
        )

        let queued = await sut.enqueueOffline(
            makeVisualGroup(tempId: "cid_failed", attachments: [video]),
            mediaFiles: ["att-vid": URL(fileURLWithPath: "/tmp/src/clip.mp4")]
        )

        XCTAssertFalse(queued)
        XCTAssertTrue(relocator.calls.isEmpty)
    }

    // MARK: - La ligne GRDB pointe la copie durable, qui survit à une relance

    func test_relocate_rewritesThePersistedBubbleOntoTheDurableFiles() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let store = MessagePersistenceActor(dbWriter: pool)
        try await store.insertOptimistic(SendingRowFixture.record(localId: "cid_grdb", conversationId: Self.conversationId, content: ""))
        let image = makeAttachment(id: "att-img", mimeType: "image/jpeg", source: URL(fileURLWithPath: "/tmp/src/photo.jpg"))
        let video = makeAttachment(id: "att-vid", mimeType: "video/mp4", source: URL(fileURLWithPath: "/tmp/src/clip.mp4"))
        try await store.updateAttachmentsJson(localId: "cid_grdb", attachmentsJson: JSONEncoder().encode([image, video]))

        await PendingBubbleMediaRelocator(persistence: store).relocate(
            tempId: "cid_grdb",
            attachments: [image, video],
            toStoredPaths: ["pending-media/cid_grdb/0.jpg", "pending-media/cid_grdb/1.mp4"]
        )

        let record = try await pool.read { db in try MessageRecord.fetchOne(db, key: "cid_grdb") }
        let persisted = try JSONDecoder().decode([MeeshyMessageAttachment].self, from: XCTUnwrap(record?.attachmentsJson))
        let durableImage = URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(forStored: "pending-media/cid_grdb/0.jpg")).absoluteString
        let durableVideo = URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(forStored: "pending-media/cid_grdb/1.mp4")).absoluteString
        XCTAssertEqual(persisted.map(\.fileUrl), [durableImage, durableVideo])
        XCTAssertEqual(persisted.first?.thumbnailUrl, durableImage, "la vignette d'une image optimiste est le fichier lui-même")
        XCTAssertNil(persisted.last?.thumbnailUrl)
        XCTAssertEqual(persisted.last?.duration, 12_000, "la durée de la vidéo reste sur la bulle")
        XCTAssertEqual(persisted.map(\.id), ["att-img", "att-vid"])
    }

    func test_relocated_mismatchedPaths_keepsTheBubbleUntouched() {
        let image = makeAttachment(id: "att-img", mimeType: "image/jpeg", source: URL(fileURLWithPath: "/tmp/src/photo.jpg"))

        XCTAssertNil(PendingBubbleMediaRelocation.relocated([image], toStoredPaths: []))
        XCTAssertNil(PendingBubbleMediaRelocation.relocated([], toStoredPaths: []))
    }

    func test_relocatingLocalFile_keepsADistinctThumbnail() {
        let video = MeeshyMessageAttachment(
            id: "att-vid", mimeType: "video/mp4",
            fileUrl: "file:///tmp/src/clip.mp4", thumbnailUrl: "file:///tmp/src/poster.jpg"
        )

        let relocated = video.relocatingLocalFile(to: URL(fileURLWithPath: "/tmp/durable/0.mp4"))

        XCTAssertEqual(relocated.fileUrl, "file:///tmp/durable/0.mp4")
        XCTAssertEqual(relocated.thumbnailUrl, "file:///tmp/src/poster.jpg")
    }

    // MARK: - La bulle relue suit le conteneur de l'app (#15294)

    /// Le chemin qu'aurait écrit le même appareil avant que le conteneur ne
    /// change (mise à jour, restauration, réinstallation).
    private func underAnotherContainer(_ relative: String) throws -> String {
        let home = NSHomeDirectory()
        let marker = "/Data/Application/"
        guard let range = home.range(of: marker) else { throw XCTSkip("hôte de test hors conteneur d'app") }
        let afterMarker = home[range.upperBound...]
        let containerEnd = afterMarker.firstIndex(of: "/") ?? afterMarker.endIndex
        let staleHome = String(home[..<range.upperBound]) + "00000000-0000-0000-0000-0000000A1D00" + afterMarker[containerEnd...]
        return URL(fileURLWithPath: staleHome + "/Documents/" + relative).absoluteString
    }

    private func currentContainer(_ relative: String) -> String {
        URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(forStored: relative)).absoluteString
    }

    func test_decode_attachmentWrittenUnderAnotherContainer_pointsIntoTheCurrentContainer() throws {
        let stale = try underAnotherContainer("pending-media/cid_moved/0.jpg")
        let written = MeeshyMessageAttachment(id: "att-img", mimeType: "image/jpeg", fileUrl: stale, thumbnailUrl: stale)

        let decoded = try JSONDecoder().decode(MeeshyMessageAttachment.self, from: JSONEncoder().encode(written))

        XCTAssertEqual(decoded.fileUrl, currentContainer("pending-media/cid_moved/0.jpg"))
        XCTAssertEqual(decoded.thumbnailUrl, currentContainer("pending-media/cid_moved/0.jpg"))
    }

    func test_toMessage_rowWrittenUnderAnotherContainer_keepsTheBubblePreview() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let store = MessagePersistenceActor(dbWriter: pool)
        try await store.insertOptimistic(SendingRowFixture.record(localId: "cid_moved", conversationId: Self.conversationId, content: ""))
        let staleAudio = try underAnotherContainer("pending-audio/cid_moved/0.m4a")
        let audio = MeeshyMessageAttachment(id: "att-voc", mimeType: "audio/mp4", fileUrl: staleAudio, duration: 4_000)
        try await store.updateAttachmentsJson(localId: "cid_moved", attachmentsJson: JSONEncoder().encode([audio]))

        let record = try await pool.read { db in try MessageRecord.fetchOne(db, key: "cid_moved") }
        let message = try XCTUnwrap(record).toMessage(currentUserId: "me")

        XCTAssertEqual(message.attachments.map(\.fileUrl), [currentContainer("pending-audio/cid_moved/0.m4a")])
        XCTAssertEqual(message.attachments.first?.duration, 4_000)
    }

    func test_decode_remoteOrForeignURLs_stayUntouched() throws {
        let remote = MeeshyMessageAttachment(id: "a", mimeType: "image/jpeg",
                                             fileUrl: "https://gate.example/u/a.jpg", thumbnailUrl: nil)
        let foreign = MeeshyMessageAttachment(id: "b", mimeType: "image/jpeg", fileUrl: "file:///tmp/src/b.jpg")

        let decoded = try JSONDecoder().decode([MeeshyMessageAttachment].self, from: JSONEncoder().encode([remote, foreign]))

        XCTAssertEqual(decoded.map(\.fileUrl), ["https://gate.example/u/a.jpg", "file:///tmp/src/b.jpg"])
        XCTAssertNil(decoded.first?.thumbnailUrl)
        let json = try XCTUnwrap(String(data: JSONEncoder().encode(remote), encoding: .utf8))
        XCTAssertFalse(json.contains("thumbnailUrl"), "une vignette absente ne s'écrit pas")
    }

    // MARK: - La copie durable survit à l'accusé, jusqu'à la bascule (#15294)

    private struct AcceptingDispatcher: OutboxDispatching {
        func dispatch(_ record: OutboxRecord) async throws {}
    }

    private func enqueueReplayedVisual(cid: String, in pool: DatabaseQueue) async throws -> String {
        let stored = "pending-media/\(cid)/0.jpg"
        let absolute = OfflineQueue.absoluteMediaPath(forStored: stored)
        try FileManager.default.createDirectory(atPath: (absolute as NSString).deletingLastPathComponent,
                                                withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: absolute, contents: Data("jpeg".utf8))
        let item = OfflineQueueItem(
            id: "qid_\(cid)", clientMessageId: cid, conversationId: Self.conversationId, content: "",
            originalLanguage: "fr", replyToId: nil, forwardedFromId: nil, forwardedFromConversationId: nil,
            attachmentIds: nil, localAudioPath: nil, localMediaPaths: [stored], createdAt: Date()
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payload = try encoder.encode(item)
        let conversationId = Self.conversationId
        try await pool.write { db in
            try OutboxRecord(
                id: "ofq_\(cid)", kind: .sendMessage, conversationId: conversationId, clientMessageId: cid,
                payload: payload, status: .pending, attempts: 0, lastError: nil,
                createdAt: Date(), updatedAt: Date(), nextAttemptAt: Date()
            ).insert(db)
        }
        return absolute
    }

    func test_flush_appliedReplay_keepsTheDurableCopyUntilTheEchoCanAdoptIt() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let copy = try await enqueueReplayedVisual(cid: "cid_ack_\(UUID().uuidString.prefix(8))", in: pool)
        defer { try? FileManager.default.removeItem(atPath: copy) }

        await OutboxFlusher(pool: pool, dispatcher: AcceptingDispatcher()).flush()

        XCTAssertTrue(FileManager.default.fileExists(atPath: copy),
                      "l'accusé précède l'écho : effacer la copie maintenant vide la bulle et prive l'écho de l'adoption en cache")
    }

    func test_flush_appliedReplay_sweepsTheCopyOnceTheEchoGraceHasElapsed() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let copy = try await enqueueReplayedVisual(cid: "cid_grace_\(UUID().uuidString.prefix(8))", in: pool)
        defer { try? FileManager.default.removeItem(atPath: copy) }
        let scheduled = ScheduledSweeps()

        await OutboxFlusher(pool: pool, dispatcher: AcceptingDispatcher(),
                            scheduleAppliedFileSweep: { scheduled.append($0) }).flush()

        XCTAssertTrue(FileManager.default.fileExists(atPath: copy))
        XCTAssertEqual(scheduled.count, 1)
        scheduled.runAll()
        XCTAssertFalse(FileManager.default.fileExists(atPath: copy), "ce que l'écho n'a pas adopté ne fuit pas")
    }

    // MARK: - Le vocal en attente se lit depuis sa copie durable (#15294)

    private func writeSilentWave(seconds: Int) throws -> URL {
        let sampleRate = 8_000
        let samples = Data(count: sampleRate * seconds * 2)
        func le32(_ v: Int) -> Data { withUnsafeBytes(of: UInt32(v).littleEndian) { Data($0) } }
        func le16(_ v: Int) -> Data { withUnsafeBytes(of: UInt16(v).littleEndian) { Data($0) } }
        let chunks: [Data] = [
            Data("RIFF".utf8), le32(36 + samples.count), Data("WAVE".utf8),
            Data("fmt ".utf8), le32(16), le16(1), le16(1), le32(sampleRate), le32(sampleRate * 2), le16(2), le16(16),
            Data("data".utf8), le32(samples.count), samples,
        ]
        let wave = chunks.reduce(Data(), +)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("pending-voice-\(UUID().uuidString).wav")
        try wave.write(to: url)
        return url
    }

    func test_playURLString_pendingVoiceFileURL_playsTheLocalCopy() async throws {
        let voice = try writeSilentWave(seconds: 2)
        defer { try? FileManager.default.removeItem(at: voice) }
        let player = AudioPlaybackManager(registerWithCoordinator: false)

        player.play(urlString: voice.absoluteString)
        for _ in 0..<50 where player.duration == 0 {
            try await Task.sleep(for: .milliseconds(100))
        }
        player.stop()

        XCTAssertGreaterThan(player.duration, 1.5,
                             "la file de lecture de la conversation passe l'URL file:// de la bulle en attente : elle doit se lire sur le disque, jamais par le cache réseau")
    }

    func test_appliedFileSweepGrace_leavesTheEchoTimeToArrive() {
        XCTAssertGreaterThanOrEqual(OutboxFlusher.appliedFileSweepGrace, .seconds(60))
    }
}

private final class ScheduledSweeps: @unchecked Sendable {
    private let lock = NSLock()
    private var sweeps: [@Sendable () -> Void] = []

    var count: Int { lock.withLock { sweeps.count } }

    func append(_ sweep: @escaping @Sendable () -> Void) {
        lock.withLock { sweeps.append(sweep) }
    }

    func runAll() {
        lock.withLock { sweeps }.forEach { $0() }
    }
}

private extension FakeOfflineMessageQueue {
    func failEveryEnqueue() { shouldThrow = true }
}
