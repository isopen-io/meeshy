import XCTest
import GRDB
@testable import MeeshySDK

/// #9875 — un téléversement long survit au passage en arrière-plan.
///
/// `beginBackgroundTask(withName:)` était appelé SANS gestionnaire
/// d'expiration : si le temps accordé s'épuisait avant `endBackgroundTask`, le
/// système tuait l'application. Ces témoins passent par `uploadFile` (file,
/// tâche d'arrière-plan, reprise) avec un fournisseur de tâches factice qui
/// déclenche l'expiration pendant qu'un PATCH est en vol.
private final class TusExpirationStubURLProtocol: URLProtocol {
    enum Reply {
        case respond(status: Int, headers: [String: String], body: Data)
        case hang
    }

    nonisolated(unsafe) static var replies: [Reply] = []
    nonisolated(unsafe) static var methods: [String] = []
    nonisolated(unsafe) static var onHang: (@Sendable () -> Void)?

    static func reset() {
        replies = []; methods = []; onHang = nil
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        Self.methods.append(request.httpMethod ?? "")
        let next = Self.replies.isEmpty
            ? Reply.respond(status: 500, headers: [:], body: Data())
            : Self.replies.removeFirst()
        switch next {
        case .hang:
            Self.onHang?()
        case let .respond(status, headers, body):
            let response = HTTPURLResponse(
                url: request.url ?? URL(string: "https://stub.meeshy.test")!,
                statusCode: status, httpVersion: nil, headerFields: headers)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: body)
            client?.urlProtocolDidFinishLoading(self)
        }
    }

    override nonisolated func stopLoading() {}
}

/// Fournisseur factice : jetons distincts, fins comptées, expiration à la main.
@MainActor
private final class FakeBackgroundTasks: BackgroundTaskProviding {
    private var nextRawValue = 1
    private(set) var begunNames: [String] = []
    private(set) var endedTokens: [BackgroundTaskToken] = []
    private var expirationHandlers: [(@MainActor @Sendable () -> Void)] = []

    func beginBackgroundTask(
        withName name: String,
        expirationHandler: @escaping @MainActor @Sendable () -> Void
    ) -> BackgroundTaskToken {
        begunNames.append(name)
        expirationHandlers.append(expirationHandler)
        defer { nextRawValue += 1 }
        return BackgroundTaskToken(rawValue: nextRawValue)
    }

    func endBackgroundTask(_ token: BackgroundTaskToken) {
        endedTokens.append(token)
    }

    func expireAll() {
        expirationHandlers.forEach { $0() }
    }
}

@MainActor
final class TusUploadManager_BackgroundExpirationTests: XCTestCase {

    private var createdFiles: [URL] = []
    private let chunkSize = 10 * 1024 * 1024
    private let location = "https://stub.meeshy.test/api/v1/uploads/expiring"

    override func setUp() async throws {
        try await super.setUp()
        TusExpirationStubURLProtocol.reset()
    }

    override func tearDown() async throws {
        TusExpirationStubURLProtocol.reset()
        for url in createdFiles { try? FileManager.default.removeItem(at: url) }
        createdFiles.removeAll()
        try await super.tearDown()
    }

    // MARK: - Helpers

    private func makeStubbedSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [TusExpirationStubURLProtocol.self]
        return URLSession(configuration: config)
    }

    private func makeCheckpointStore() throws -> TusUploadCheckpointStore {
        let queue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        migrator.registerMigration("v6_tus_upload_checkpoint") { db in
            try db.create(table: "tus_upload_checkpoint") { t in
                t.column("checkpointKey", .text).primaryKey()
                t.column("uploadURL", .text).notNull()
                t.column("byteOffset", .integer).notNull()
                t.column("fileSize", .integer).notNull()
                t.column("fileName", .text).notNull()
                t.column("mimeType", .text).notNull()
                t.column("uploadContext", .text)
                t.column("thumbHash", .text)
                t.column("createdAt", .datetime).notNull()
                t.column("updatedAt", .datetime).notNull()
            }
        }
        try migrator.migrate(queue)
        return TusUploadCheckpointStore(pool: queue)
    }

    private func makeManager(
        store: TusUploadCheckpointStore,
        backgroundTasks: FakeBackgroundTasks,
        digestMemo: FileDigestMemo = FileDigestMemo(capacity: 8)
    ) -> TusUploadManager {
        TusUploadManager(
            baseURL: URL(string: "https://stub.meeshy.test")!,
            urlSession: makeStubbedSession(),
            checkpointStore: store,
            refreshAuthSession: { _ in "unused" },
            backgroundTasks: backgroundTasks,
            digestMemo: digestMemo
        )
    }

    private func writeFile(bytes: Int) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tus-expiration-\(UUID().uuidString).bin")
        FileManager.default.createFile(atPath: url.path, contents: nil)
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        let unit = Data((0..<65536).map { UInt8($0 % 251) })
        var written = 0
        while written < bytes {
            let take = min(unit.count, bytes - written)
            try handle.write(contentsOf: unit.prefix(take))
            written += take
        }
        createdFiles.append(url)
        return url
    }

    private func finishBody(id: String) -> Data {
        Data("""
        {"success":true,"data":{"attachment":{"id":"\(id)","fileName":"a.bin",\
        "mimeType":"application/octet-stream","fileSize":4,\
        "fileUrl":"https://cdn.meeshy.test/a.bin"}}}
        """.utf8)
    }

    // MARK: - (a) L'expiration enregistre la reprise et termine la tâche

    func test_uploadFile_backgroundTimeExpiresMidPatch_keepsResumePointAndEndsTaskOnce() async throws {
        let file = try writeFile(bytes: chunkSize + 128)
        let store = try makeCheckpointStore()
        let backgroundTasks = FakeBackgroundTasks()
        let manager = makeManager(store: store, backgroundTasks: backgroundTasks)

        let secondPatchInFlight = expectation(description: "le second PATCH est en vol")
        TusExpirationStubURLProtocol.onHang = { secondPatchInFlight.fulfill() }
        TusExpirationStubURLProtocol.replies = [
            .respond(status: 201, headers: ["Location": location], body: Data()),
            .respond(status: 204, headers: ["Upload-Offset": "\(chunkSize)"], body: Data()),
            .hang
        ]

        let upload = Task {
            try await manager.uploadFile(
                fileURL: file, mimeType: "application/octet-stream", credential: .bearer("token")
            )
        }
        await fulfillment(of: [secondPatchInFlight], timeout: 10)

        backgroundTasks.expireAll()

        do {
            _ = try await upload.value
            XCTFail("Un téléversement dont le temps d'arrière-plan expire ne peut pas réussir")
        } catch is TusUploadSuspendedError {
        } catch {
            XCTFail("L'expiration doit remonter en TusUploadSuspendedError (reprise possible), reçu : \(error)")
        }

        XCTAssertEqual(backgroundTasks.begunNames.count, 1)
        XCTAssertEqual(
            backgroundTasks.endedTokens, [BackgroundTaskToken(rawValue: 1)],
            "La tâche d'arrière-plan doit être terminée exactement une fois, par le gestionnaire d'expiration"
        )

        let checkpoints = await store.allCheckpoints()
        XCTAssertEqual(checkpoints.count, 1, "Le point de reprise doit survivre à l'expiration")
        XCTAssertEqual(checkpoints.first?.uploadURL, location)
        XCTAssertEqual(
            checkpoints.first?.byteOffset, Int64(chunkSize),
            "La reprise repart du dernier offset ACCEPTÉ par le serveur, jamais de zéro"
        )
        XCTAssertEqual(TusExpirationStubURLProtocol.methods, ["POST", "PATCH", "PATCH"])
    }

    func test_uploadFile_afterSuspension_resumesFromSavedOffsetWithoutNewSession() async throws {
        let file = try writeFile(bytes: chunkSize + 128)
        let store = try makeCheckpointStore()
        let backgroundTasks = FakeBackgroundTasks()
        let manager = makeManager(store: store, backgroundTasks: backgroundTasks)

        let secondPatchInFlight = expectation(description: "le second PATCH est en vol")
        TusExpirationStubURLProtocol.onHang = { secondPatchInFlight.fulfill() }
        TusExpirationStubURLProtocol.replies = [
            .respond(status: 201, headers: ["Location": location], body: Data()),
            .respond(status: 204, headers: ["Upload-Offset": "\(chunkSize)"], body: Data()),
            .hang
        ]
        let suspended = Task {
            try await manager.uploadFile(
                fileURL: file, mimeType: "application/octet-stream", credential: .bearer("token")
            )
        }
        await fulfillment(of: [secondPatchInFlight], timeout: 10)
        backgroundTasks.expireAll()
        _ = try? await suspended.value

        TusExpirationStubURLProtocol.methods = []
        TusExpirationStubURLProtocol.replies = [
            .respond(status: 200, headers: [:], body: finishBody(id: "att-resumed"))
        ]
        let result = try await manager.uploadFile(
            fileURL: file, mimeType: "application/octet-stream", credential: .bearer("token")
        )

        XCTAssertEqual(result.id, "att-resumed")
        XCTAssertEqual(
            TusExpirationStubURLProtocol.methods, ["PATCH"],
            "Au retour, la reprise rejoue le seul tronçon restant, sans recréer de session"
        )
        XCTAssertEqual(backgroundTasks.endedTokens.count, 2)
    }

    // MARK: - Aucune double fin, sur chaque chemin

    func test_uploadFile_success_endsBackgroundTaskOnce_andLateExpirationIsNoOp() async throws {
        let file = try writeFile(bytes: 128)
        let backgroundTasks = FakeBackgroundTasks()
        let manager = makeManager(store: try makeCheckpointStore(), backgroundTasks: backgroundTasks)
        TusExpirationStubURLProtocol.replies = [
            .respond(status: 201, headers: ["Location": location], body: Data()),
            .respond(status: 200, headers: [:], body: finishBody(id: "att-ok"))
        ]

        let result = try await manager.uploadFile(
            fileURL: file, mimeType: "application/octet-stream", credential: .bearer("token")
        )
        backgroundTasks.expireAll()

        XCTAssertEqual(result.id, "att-ok")
        XCTAssertEqual(backgroundTasks.endedTokens, [BackgroundTaskToken(rawValue: 1)])
    }

    func test_uploadFile_serverFailure_endsBackgroundTaskOnce_andKeepsTheOriginalError() async throws {
        let file = try writeFile(bytes: 128)
        let backgroundTasks = FakeBackgroundTasks()
        let manager = makeManager(store: try makeCheckpointStore(), backgroundTasks: backgroundTasks)
        TusExpirationStubURLProtocol.replies = [
            .respond(status: 503, headers: [:], body: Data())
        ]

        do {
            _ = try await manager.uploadFile(
                fileURL: file, mimeType: "application/octet-stream", credential: .bearer("token")
            )
            XCTFail("Un refus serveur doit remonter")
        } catch is TusUploadSuspendedError {
            XCTFail("Un échec sans expiration n'est pas une suspension")
        } catch {
        }

        XCTAssertEqual(backgroundTasks.endedTokens, [BackgroundTaskToken(rawValue: 1)])
    }

    // MARK: - (b) Le hachage d'un fichier inchangé n'est calculé qu'une fois

    func test_uploadFile_retriedOnTheSameFile_goesThroughTheDigestMemo() async throws {
        let file = try writeFile(bytes: 128)
        let memo = FileDigestMemo(capacity: 8)
        let manager = makeManager(
            store: try makeCheckpointStore(), backgroundTasks: FakeBackgroundTasks(), digestMemo: memo
        )
        TusExpirationStubURLProtocol.replies = [
            .respond(status: 503, headers: [:], body: Data()),
            .respond(status: 503, headers: [:], body: Data())
        ]

        for _ in 0..<2 {
            _ = try? await manager.uploadFile(
                fileURL: file, mimeType: "application/octet-stream", credential: .bearer("token")
            )
        }

        XCTAssertEqual(memo.count, 1)
        let memoised = try memo.digest(of: file) { _ in
            XCTFail("Le fichier inchangé ne doit pas être rehaché")
            return ""
        }
        XCTAssertEqual(memoised, try TusUploadManager.sha256Hex(of: file))
    }

    // MARK: - La clé d'ensemencement est la clé de rendu (#9839)

    func test_renderCacheKey_ofAStorageKey_isTheResolvedAddressTheReaderLooksUp() {
        let storageKey = "2026/10/68c07400/video.mp4"

        let key = TusUploadManager.renderCacheKey(forFileUrl: storageKey)

        XCTAssertEqual(key, MeeshyConfig.resolveMediaURL(storageKey)?.absoluteString)
        XCTAssertTrue(key.hasPrefix("http"), "La bulle cherche l'adresse résolue, jamais la clé de stockage brute")
    }
}
