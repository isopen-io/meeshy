import XCTest
import GRDB
@testable import MeeshySDK

/// Task 3 (2026-08-20-televersement-rejouer-apres-refus) — the server no
/// longer catches an expired JWT with the session-token fallback ("une forme
/// de connexion à la fois"), so a stale bearer token mid-PATCH now surfaces
/// as a flat 401 instead of being silently recovered. `TusUploadManager`
/// used to treat any unlisted status (401 included) as a hard failure via
/// its `default:` branch — these tests pin the fix: refresh EXACTLY once
/// through the SAME mechanism `APIClient` uses, then resume from whatever
/// offset the SERVER reports (never a local counter, never a brand-new
/// session).
///
/// Drives `performTusUpload` directly (relaxed to `internal` for this
/// purpose) against a stubbed `URLSession` + an in-memory
/// `TusUploadCheckpointStore`, bypassing `uploadFile`'s queue/background-task
/// ceremony — no real network, no shared on-disk database touched.
private final class TusAuthRetryStubURLProtocol: URLProtocol {
    struct Exchange {
        let status: Int
        let headers: [String: String]
        let body: Data
    }

    nonisolated(unsafe) static var exchanges: [Exchange] = []
    nonisolated(unsafe) static var methods: [String] = []
    nonisolated(unsafe) static var headers: [[String: String]] = []
    nonisolated(unsafe) static var bodies: [Data] = []

    static func reset() {
        exchanges = []; methods = []; headers = []; bodies = []
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }

    /// `URLProtocol` empties `httpBody` in favor of `httpBodyStream`; without
    /// re-materializing it here, the captured chunk bodies would all read
    /// empty and the byte-range assertions would pass on nothing.
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest {
        var canonical = request
        if canonical.httpBody == nil, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var data = Data()
            let size = 65536
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: size)
            defer { buffer.deallocate() }
            while stream.hasBytesAvailable {
                let read = stream.read(buffer, maxLength: size)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            canonical.httpBody = data
        }
        return canonical
    }

    override nonisolated func startLoading() {
        Self.methods.append(request.httpMethod ?? "")
        Self.headers.append(request.allHTTPHeaderFields ?? [:])
        Self.bodies.append(request.httpBody ?? Data())

        let next = Self.exchanges.isEmpty
            ? Exchange(status: 500, headers: [:], body: Data())
            : Self.exchanges.removeFirst()
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.meeshy.test")!,
            statusCode: next.status, httpVersion: nil, headerFields: next.headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: next.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

/// Thread-safe spy standing in for `AuthManager.refreshSession(force:)`.
/// `TusUploadManager` calls the injected closure from its own actor
/// isolation, so the spy must be safe to call across that boundary.
private final class RefreshSpy: @unchecked Sendable {
    private let lock = NSLock()
    private var _callCount = 0
    private var _forceParams: [Bool] = []
    var result: Result<String, Error> = .success("fresh-token")

    var callCount: Int { withLock { _callCount } }
    var forceParams: [Bool] { withLock { _forceParams } }

    /// `NSLock.lock()`/`.unlock()` are `@_unavailableFromAsync` — calling them
    /// directly inside an `async` closure body doesn't compile. Routing
    /// through this synchronous helper sidesteps that diagnostic.
    private func withLock<T>(_ body: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body()
    }

    func closure() -> @Sendable (Bool) async throws -> String {
        { [self] force in
            let outcome: Result<String, Error> = withLock {
                _callCount += 1
                _forceParams.append(force)
                return result
            }
            switch outcome {
            case .success(let token): return token
            case .failure(let error): throw error
            }
        }
    }
}

final class TusUploadManager_AuthRetryTests: XCTestCase {

    private var createdFiles: [URL] = []

    override func setUp() {
        super.setUp()
        TusAuthRetryStubURLProtocol.reset()
    }

    override func tearDown() {
        TusAuthRetryStubURLProtocol.reset()
        for url in createdFiles { try? FileManager.default.removeItem(at: url) }
        createdFiles.removeAll()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeStubbedSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [TusAuthRetryStubURLProtocol.self]
        return URLSession(configuration: config)
    }

    /// Fresh in-memory checkpoint store per test — never touches the real
    /// on-disk `AppDatabase.shared`, so no state leaks across tests.
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

    private func makeManager(refresh: RefreshSpy) throws -> TusUploadManager {
        TusUploadManager(
            baseURL: URL(string: "https://stub.meeshy.test")!,
            urlSession: makeStubbedSession(),
            checkpointStore: try makeCheckpointStore(),
            refreshAuthSession: refresh.closure()
        )
    }

    /// Writes a deterministic, non-uniform file by repeating a 64 KiB
    /// pattern — fast even at 10+ MB (no per-byte `Data.append`), and the
    /// pattern only needs to be non-uniform enough that a byte-range
    /// assertion (`suffix(_:)`) would fail on a wrong offset.
    private func writeFile(bytes: Int) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tus-auth-retry-\(UUID().uuidString).bin")
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

    // MARK: - Single-chunk: refresh once, retry succeeds

    func test_patch401_refreshesSessionOnce_thenRetries_succeedsWithFreshToken() async throws {
        let file = try writeFile(bytes: 128)
        let refresh = RefreshSpy()
        refresh.result = .success("fresh-token-A")
        let manager = try makeManager(refresh: refresh)

        TusAuthRetryStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/a"], body: Data()),
            .init(status: 401, headers: [:], body: Data()),
            .init(status: 200, headers: ["Upload-Offset": "0"], body: Data()),
            .init(status: 200, headers: [:], body: finishBody(id: "att-A"))
        ]

        let result = try await manager.performTusUpload(
            fileURL: file, mimeType: "application/octet-stream",
            credential: .bearer("stale-token")
        )

        XCTAssertEqual(result.id, "att-A")
        XCTAssertEqual(TusAuthRetryStubURLProtocol.methods, ["POST", "PATCH", "HEAD", "PATCH"])
        XCTAssertEqual(TusAuthRetryStubURLProtocol.headers[3]["Authorization"], "Bearer fresh-token-A",
            "the retried PATCH must carry the REFRESHED token, not the one that got refused")
        XCTAssertEqual(refresh.callCount, 1)
        XCTAssertEqual(refresh.forceParams, [true])
    }

    // MARK: - En-têtes d'identification client

    /// Le téléversement TUS ne posait QUE l'identité (`credential.header`) et
    /// les en-têtes du protocole : version, appareil et locale n'y entraient
    /// pas, alors que toute requête `APIClient` les porte
    /// (`APIClient.swift:603` et `:915`).
    ///
    /// `X-Device-Locale` n'est pas décoratif — c'est le signal du Prisme
    /// Linguistique en 4e priorité, que le middleware gateway lit pour
    /// persister `User.deviceLocale` (`ClientInfoProvider.swift:30-36`).
    ///
    /// Le test porte sur les TROIS verbes : un manque sur le seul POST
    /// passerait inaperçu si PATCH et HEAD étaient servis.
    func test_everyTusRequest_carriesTheClientIdentificationHeaders() async throws {
        let file = try writeFile(bytes: 128)
        let manager = try makeManager(refresh: RefreshSpy())

        TusAuthRetryStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/h"], body: Data()),
            .init(status: 409, headers: [:], body: Data()),
            .init(status: 200, headers: ["Upload-Offset": "0"], body: Data()),
            .init(status: 200, headers: [:], body: finishBody(id: "att-H"))
        ]

        _ = try? await manager.performTusUpload(
            fileURL: file, mimeType: "application/octet-stream",
            credential: .bearer("token")
        )

        let vus = TusAuthRetryStubURLProtocol.methods
        XCTAssertTrue(vus.contains("POST") && vus.contains("PATCH") && vus.contains("HEAD"),
                      "le scénario doit exercer les trois verbes, sinon le test ne prouve rien — vus : \(vus)")

        for (index, method) in vus.enumerated() {
            let entetes = TusAuthRetryStubURLProtocol.headers[index]
            XCTAssertNotNil(entetes["X-Device-Locale"],
                            "\(method) part sans X-Device-Locale : le Prisme perd sa 4e priorité")
            XCTAssertNotNil(entetes["X-Meeshy-Platform"],
                            "\(method) part sans les en-têtes statiques du client")
            XCTAssertEqual(entetes["Tus-Resumable"], "1.0.0",
                           "\(method) : les en-têtes client ne doivent RIEN écraser du protocole")
        }
    }

    // MARK: - A second 401 is definitive

    func test_patch401_afterOneRetryFailsAgain_isDefinitive_noSecondRefresh() async throws {
        let file = try writeFile(bytes: 128)
        let refresh = RefreshSpy()
        refresh.result = .success("fresh-token-B")
        let manager = try makeManager(refresh: refresh)

        TusAuthRetryStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/b"], body: Data()),
            .init(status: 401, headers: [:], body: Data()),
            .init(status: 200, headers: ["Upload-Offset": "0"], body: Data()),
            .init(status: 401, headers: [:], body: Data())
        ]

        do {
            _ = try await manager.performTusUpload(
                fileURL: file, mimeType: "application/octet-stream",
                credential: .bearer("stale-token")
            )
            XCTFail("a second 401 after the retry must be a definitive failure")
        } catch {
            guard let meeshyError = error as? MeeshyError, case .auth(.sessionExpired) = meeshyError else {
                XCTFail("expected MeeshyError.auth(.sessionExpired), got \(error)")
                return
            }
        }

        XCTAssertEqual(TusAuthRetryStubURLProtocol.methods, ["POST", "PATCH", "HEAD", "PATCH"],
            "no third PATCH, no second HEAD — the retry budget is exactly one")
        XCTAssertEqual(refresh.callCount, 1, "a second 401 must NOT trigger a second refresh attempt")
    }

    // MARK: - Anonymous session credential: no refresh mechanism exists

    func test_patch401_withAnonymousSessionCredential_failsWithoutAttemptingRefresh() async throws {
        let file = try writeFile(bytes: 128)
        let refresh = RefreshSpy()
        let manager = try makeManager(refresh: refresh)

        TusAuthRetryStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/c"], body: Data()),
            .init(status: 401, headers: [:], body: Data())
        ]

        do {
            _ = try await manager.performTusUpload(
                fileURL: file, mimeType: "application/octet-stream",
                credential: .anonymousSession("sess_abc")
            )
            XCTFail("a guest X-Session-Token has no refresh mechanism — 401 must fail directly")
        } catch {
            guard let meeshyError = error as? MeeshyError, case .auth(.sessionExpired) = meeshyError else {
                XCTFail("expected MeeshyError.auth(.sessionExpired), got \(error)")
                return
            }
        }

        XCTAssertEqual(TusAuthRetryStubURLProtocol.methods, ["POST", "PATCH"],
            "no HEAD, no retry — AuthManager.refreshSession refreshes a DIFFERENT identity")
        XCTAssertEqual(refresh.callCount, 0,
            "AuthManager.refreshSession must never be invoked for a non-account credential")
    }

    // MARK: - Resume from the SERVER's offset, never a local counter or a fresh session

    /// A 10.3 MB file forces two real PATCH chunks (chunkSize is a fixed
    /// 10 MB). Chunk 1 succeeds; chunk 2 is refused with 401. The HEAD
    /// recovery reports an offset that is NEITHER the local pre-401 offset
    /// NOR the file's end — the only way the retried PATCH can carry that
    /// exact number is if it actually asked the server, instead of trusting
    /// its own counter or restarting the whole upload session.
    func test_patch401_resumesFromServerReportedOffset_notLocalCounter_sameUploadSession() async throws {
        let fileSize = 10_785_760
        let file = try writeFile(bytes: fileSize)
        let refresh = RefreshSpy()
        refresh.result = .success("fresh-token-D")
        let manager = try makeManager(refresh: refresh)

        let chunk1Len = 10_485_760 // == TusUploadManager.chunkSize
        let localOffsetAtFailure = chunk1Len
        let serverOffset = chunk1Len + 150_000 // deliberately NOT the local offset
        let finalLen = fileSize - serverOffset

        TusAuthRetryStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/d"], body: Data()),
            .init(status: 200, headers: [:], body: Data()),                                  // chunk 1 OK
            .init(status: 401, headers: [:], body: Data()),                                  // chunk 2 attempt refused
            .init(status: 200, headers: ["Upload-Offset": "\(serverOffset)"], body: Data()),  // HEAD reveals real progress
            .init(status: 200, headers: [:], body: finishBody(id: "att-D"))                   // resumed final chunk
        ]

        let result = try await manager.performTusUpload(
            fileURL: file, mimeType: "application/octet-stream",
            credential: .bearer("stale-token")
        )

        XCTAssertEqual(result.id, "att-D")
        XCTAssertEqual(TusAuthRetryStubURLProtocol.methods, ["POST", "PATCH", "PATCH", "HEAD", "PATCH"],
            "exactly ONE POST — a 401 must never restart the upload session from scratch")
        XCTAssertEqual(TusAuthRetryStubURLProtocol.headers[2]["Upload-Offset"], "\(localOffsetAtFailure)",
            "sanity check: the refused attempt used the local counter, as expected")
        XCTAssertEqual(TusAuthRetryStubURLProtocol.headers[4]["Upload-Offset"], "\(serverOffset)",
            "the retried PATCH must resume from the SERVER-reported offset, not the local counter")
        XCTAssertEqual(TusAuthRetryStubURLProtocol.bodies[4].count, finalLen)

        let sourceBytes = try Data(contentsOf: file)
        XCTAssertEqual(TusAuthRetryStubURLProtocol.bodies[4], sourceBytes.suffix(finalLen),
            "the resumed chunk must carry exactly the bytes from the server's offset onward — " +
            "a wrong offset here would either re-send already-uploaded bytes or skip real ones")
        XCTAssertEqual(refresh.callCount, 1)
    }

    // MARK: - The refresh call itself fails: definitive, no retry

    /// `refreshAuthSession` throwing (e.g. the refresh network call itself
    /// fails) is a DIFFERENT branch from "refresh succeeded but the retried
    /// PATCH got a second 401" (covered above). Nothing else in this file
    /// configures the refresh spy to fail — the only other failing case is
    /// the spy's own `Result<String, Error>` plumbing, never exercised.
    func test_patch401_refreshItselfFails_convertsToSessionExpired_noRetry() async throws {
        struct RefreshTransportError: Error {}
        let file = try writeFile(bytes: 128)
        let refresh = RefreshSpy()
        refresh.result = .failure(RefreshTransportError())
        let manager = try makeManager(refresh: refresh)

        TusAuthRetryStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/f"], body: Data()),
            .init(status: 401, headers: [:], body: Data())
        ]

        do {
            _ = try await manager.performTusUpload(
                fileURL: file, mimeType: "application/octet-stream",
                credential: .bearer("stale-token")
            )
            XCTFail("a refresh call that itself fails must surface as a definitive session-expired error")
        } catch {
            guard let meeshyError = error as? MeeshyError, case .auth(.sessionExpired) = meeshyError else {
                XCTFail("expected MeeshyError.auth(.sessionExpired), got \(error)")
                return
            }
        }

        XCTAssertEqual(TusAuthRetryStubURLProtocol.methods, ["POST", "PATCH"],
            "no HEAD, no second PATCH — a failed refresh must not attempt to recover an offset that was never granted")
        XCTAssertEqual(refresh.callCount, 1,
            "the refresh must be attempted exactly once — its own failure must never trigger a second attempt")
    }

    // MARK: - Retry budget is per-UPLOAD, not per-CHUNK

    /// `hasRetriedAfterAuthRefusal` is declared once, before the chunk loop
    /// (`TusUploadManager.swift`, just above `while offset < fileSize`) — so
    /// the one-retry budget is shared by every chunk of a single upload, not
    /// reset per chunk. A 10.3 MB file only ever produces ONE retryable 401
    /// (all prior tests here), which can't distinguish "budget resets per
    /// chunk" from "budget is per upload". A file spanning three real 10 MB
    /// chunks can: consume the retry on chunk 2, then refuse chunk 3 — if
    /// the budget were (wrongly) per-chunk, chunk 3 would get its own
    /// refresh; since it's per-upload, chunk 3 must fail net with NO second
    /// refresh.
    func test_patch401_onThirdChunk_afterRetryAlreadyConsumedOnSecondChunk_isDefinitive_noSecondRefresh() async throws {
        let chunkSize = 10_485_760 // == TusUploadManager.chunkSize
        let fileSize = 2 * chunkSize + 500_000 // forces 3 real PATCH chunks
        let file = try writeFile(bytes: fileSize)
        let refresh = RefreshSpy()
        refresh.result = .success("fresh-token-G")
        let manager = try makeManager(refresh: refresh)

        TusAuthRetryStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/g"], body: Data()),
            .init(status: 200, headers: [:], body: Data()),                                       // chunk 1 OK
            .init(status: 401, headers: [:], body: Data()),                                        // chunk 2 refused — consumes the retry
            .init(status: 200, headers: ["Upload-Offset": "\(chunkSize)"], body: Data()),           // HEAD recovery
            .init(status: 200, headers: [:], body: Data()),                                        // chunk 2 retried OK
            .init(status: 401, headers: [:], body: Data())                                          // chunk 3 refused — budget already spent
        ]

        do {
            _ = try await manager.performTusUpload(
                fileURL: file, mimeType: "application/octet-stream",
                credential: .bearer("stale-token")
            )
            XCTFail("a 401 on the THIRD chunk, after the single retry was already spent on the second, must be definitive")
        } catch {
            guard let meeshyError = error as? MeeshyError, case .auth(.sessionExpired) = meeshyError else {
                XCTFail("expected MeeshyError.auth(.sessionExpired), got \(error)")
                return
            }
        }

        XCTAssertEqual(TusAuthRetryStubURLProtocol.methods, ["POST", "PATCH", "PATCH", "HEAD", "PATCH", "PATCH"],
            "no second HEAD, no fourth PATCH — the retry budget spent on chunk 2 does not replenish for chunk 3")
        XCTAssertEqual(refresh.callCount, 1,
            "chunk 3's 401 must NOT trigger a second refresh — the one-retry budget is per UPLOAD, not per CHUNK")
    }

    // MARK: - Regression: other explicitly-handled codes are untouched

    func test_patch404_stillThrowsRetriableError_unaffectedByAuthHandling() async throws {
        let file = try writeFile(bytes: 128)
        let refresh = RefreshSpy()
        let manager = try makeManager(refresh: refresh)

        TusAuthRetryStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "https://stub.meeshy.test/api/v1/uploads/e"], body: Data()),
            .init(status: 404, headers: [:], body: Data())
        ]

        do {
            _ = try await manager.performTusUpload(
                fileURL: file, mimeType: "application/octet-stream",
                credential: .bearer("token")
            )
            XCTFail("a GC'd session (404) must still surface as TusResumeRetriableError")
        } catch {
            XCTAssertTrue(error is TusResumeRetriableError)
        }
        XCTAssertEqual(refresh.callCount, 0, "404 must never touch the auth-refresh path")
    }
}
