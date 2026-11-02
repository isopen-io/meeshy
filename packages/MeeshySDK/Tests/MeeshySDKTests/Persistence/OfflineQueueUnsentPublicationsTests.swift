import XCTest
import GRDB
@testable import MeeshySDK

/// #13415 — la liste « Publications non envoyées » lit TOUTES les lignes
/// `.createPost` encore sur l'appareil, quel que soit leur âge ou leur état.
final class OfflineQueueUnsentPublicationsTests: XCTestCase {

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

    func test_listsEveryUnsentPublication_newestFirst_withItsState() async throws {
        let old = Date().addingTimeInterval(-30 * 86_400)
        try await insert(cmid: "cmid_old", type: "REEL", status: .exhausted, createdAt: old, lastError: "415")
        try await insert(cmid: "cmid_new", type: "POST", status: .pending, createdAt: Date(), lastError: nil)

        let unsent = await queue.unsentPublications()

        XCTAssertEqual(unsent.map(\.id), ["cmid_new", "cmid_old"])
        XCTAssertEqual(unsent.map(\.state), [.waiting, .failed])
        XCTAssertEqual(unsent.last?.lastError, "415")
        XCTAssertEqual(unsent.last?.draft.type, "REEL")
    }

    func test_aPublicationTheAuthorWithdrew_isNotListed() async throws {
        try await insert(cmid: "cmid_gone", type: "POST", status: .inflight, createdAt: Date(), lastError: nil,
                         cancelRequestedAt: Date())

        let unsent = await queue.unsentPublications()

        XCTAssertTrue(unsent.isEmpty)
    }

    /// #13824 — une ligne restée `.inflight` sans envoi vivant dans ce
    /// processus (écriture d'issue refusée par la base suspendue, application
    /// tuée) n'est PAS en cours : elle se dit en échec, avec « Réessayer ».
    func test_unsentPublications_inflightRowWithoutLiveDispatch_isFailed() async throws {
        try await insert(cmid: "cmid_orphan", type: "POST", status: .inflight, createdAt: Date(), lastError: nil)

        let unsent = await queue.unsentPublications()

        XCTAssertEqual(unsent.map(\.state), [.failed])
    }

    func test_unsentPublications_inflightRowWithLiveDispatch_isSending() async throws {
        try await insert(cmid: "cmid_live", type: "POST", status: .inflight, createdAt: Date(), lastError: nil)
        let dispatch = Task<Void, Error> { try await Task.sleep(for: .seconds(30)) }
        OutboxInflightDispatches.shared.register(dispatch, for: "ofqm_cmid_live")
        defer {
            OutboxInflightDispatches.shared.unregister(dispatch, for: "ofqm_cmid_live")
            dispatch.cancel()
        }

        let unsent = await queue.unsentPublications()

        XCTAssertEqual(unsent.map(\.state), [.sending])
    }

    func test_otherKindsAreNotPublications() async throws {
        let now = Date()
        try await pool.write { db in
            try OutboxRecord(id: "ofq_msg", kind: .sendMessage, conversationId: "c", clientMessageId: "cid_msg",
                             payload: Data(), status: .exhausted, attempts: 5, lastError: nil,
                             createdAt: now, updatedAt: now, nextAttemptAt: now).insert(db)
        }

        let unsent = await queue.unsentPublications()

        XCTAssertTrue(unsent.isEmpty)
    }

    private func insert(cmid: String, type: String, status: OutboxStatus, createdAt: Date,
                        lastError: String?, cancelRequestedAt: Date? = nil) async throws {
        let payload = try JSONEncoder().encode(CreatePostPayload(
            clientMutationId: cmid, content: "texte \(cmid)", attachmentIds: [], visibility: "PUBLIC",
            localMediaPaths: ["pending-media/\(cmid)/0.jpeg"], type: type
        ))
        try await pool.write { db in
            try OutboxRecord(id: "ofqm_\(cmid)", kind: .createPost, conversationId: "", clientMessageId: cmid,
                             payload: payload, status: status, attempts: 5, lastError: lastError,
                             createdAt: createdAt, updatedAt: createdAt, nextAttemptAt: createdAt,
                             cancelRequestedAt: cancelRequestedAt).insert(db)
        }
    }
}

/// #13415 — le balayage ne retire QUE des dossiers vides : un fichier en
/// attente n'est jamais effacé hors succès ou geste de l'auteur.
final class PendingMediaEmptyDirectorySweepTests: XCTestCase {

    func test_sweep_removesEmptyFolders_andKeepsEveryFile() throws {
        let root = URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(forStored: OfflineQueue.pendingMediaDirectoryName))
        let empty = root.appendingPathComponent("cmid_empty_\(UUID().uuidString)", isDirectory: true)
        let full = root.appendingPathComponent("cmid_full_\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: empty, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: full, withIntermediateDirectories: true)
        let file = full.appendingPathComponent("0.jpeg")
        try Data([1]).write(to: file)
        defer { try? FileManager.default.removeItem(at: full) }

        PendingMediaDirectories.sweepEmptyDirectories(now: Date().addingTimeInterval(7200))

        XCTAssertFalse(FileManager.default.fileExists(atPath: empty.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))
    }

    func test_sweep_leavesAFolderAnEnqueueJustCreated() throws {
        let root = URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(forStored: OfflineQueue.pendingMediaDirectoryName))
        let fresh = root.appendingPathComponent("cmid_fresh_\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: fresh, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: fresh) }

        PendingMediaDirectories.sweepEmptyDirectories()

        XCTAssertTrue(FileManager.default.fileExists(atPath: fresh.path))
    }
}
