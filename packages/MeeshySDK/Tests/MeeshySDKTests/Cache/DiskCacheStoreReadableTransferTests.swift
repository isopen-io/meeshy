import XCTest
@testable import MeeshySDK

/// Le réseau de ces témoins : une réponse par URL, comptée. `gated` envoie
/// l'en-tête et le premier paquet, puis attend `release(_:)` pour le reste.
private final class ReadableStubURLProtocol: URLProtocol {
    struct Reply {
        var status: Int = 200
        var cacheControl: String?
        var contentType: String = "video/mp4"
        var body: Data
        var chunks: Int = 4
        var gated: Bool = false
        var hangs: Bool = false
    }

    nonisolated(unsafe) private static let lock = NSLock()
    nonisolated(unsafe) private static var replies: [String: Reply] = [:]
    nonisolated(unsafe) private static var hitCounts: [String: Int] = [:]
    nonisolated(unsafe) private static var gates: [String: DispatchSemaphore] = [:]

    static func reset() {
        lock.withLock {
            gates.values.forEach { $0.signal() }
            replies = [:]
            hitCounts = [:]
            gates = [:]
        }
    }

    static func set(_ reply: Reply, for url: String) {
        lock.withLock {
            replies[url] = reply
            if reply.gated { gates[url] = DispatchSemaphore(value: 0) }
        }
    }

    static func hits(_ url: String) -> Int {
        lock.withLock { hitCounts[url, default: 0] }
    }

    static func release(_ url: String) {
        lock.withLock { gates[url] }?.signal()
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        let url = request.url?.absoluteString ?? ""
        let (reply, gate) = Self.lock.withLock { () -> (Reply, DispatchSemaphore?) in
            Self.hitCounts[url, default: 0] += 1
            return (Self.replies[url] ?? Reply(status: 500, body: Data()), Self.gates[url])
        }
        var headers = ["Content-Length": "\(reply.body.count)", "Content-Type": reply.contentType]
        if let cacheControl = reply.cacheControl { headers["Cache-Control"] = cacheControl }
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil, headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        let chunkSize = max(1, reply.body.count / max(1, reply.chunks))
        var offset = 0
        while offset < reply.body.count {
            let end = min(offset + chunkSize, reply.body.count)
            client?.urlProtocol(self, didLoad: reply.body.subdata(in: offset..<end))
            if reply.hangs { return }
            if offset == 0, let gate { gate.wait() }
            offset = end
        }
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

/// #9881 — une vidéo se lit PENDANT qu'elle se télécharge, depuis le seul
/// transfert qui remplit le cache : le lecteur, le préchargeur et le centre de
/// téléchargement partagent une requête par URL ; la tête du fichier est
/// lisible avant la fin ; les directives #9478 décident de ce qui reste.
final class DiskCacheStoreReadableTransferTests: XCTestCase {

    private var tempDir: URL!
    private let base = "https://media.readable.meeshy.test/api/v1/attachments/file/"

    override func setUp() {
        super.setUp()
        ReadableStubURLProtocol.reset()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("DiskCacheStoreReadableTransferTests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        ReadableStubURLProtocol.reset()
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    // MARK: - Factories

    private func makeStore(readsWhileDownloading: Bool = true) -> DiskCacheStore {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ReadableStubURLProtocol.self]
        configuration.urlCache = nil
        return DiskCacheStore(
            policy: .mediaVideo,
            baseDirectory: tempDir.appendingPathComponent("store", isDirectory: true),
            urlSession: URLSession(configuration: configuration),
            networkTransfer: .streamedToFile,
            fileDownloader: MediaFileDownloader(
                configuration: configuration,
                stagingDirectory: tempDir.appendingPathComponent("staging", isDirectory: true),
                cadenceInterval: 0
            ),
            readsWhileDownloading: readsWhileDownloading
        )
    }

    private func body(_ count: Int = 64 * 1024) -> Data {
        Data((0..<count).map { UInt8(truncatingIfNeeded: $0 &* 7) })
    }

    private func waitUntil(timeout: TimeInterval = 3, _ condition: () async -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return }
            try await Task.sleep(for: .milliseconds(20))
        }
    }

    // MARK: - Une URL, une requête

    func test_readableDownload_thenPrefetchOfTheSameURL_makeOneRequest() async throws {
        let url = base + "story.mp4"
        let payload = body()
        ReadableStubURLProtocol.set(.init(body: payload), for: url)
        let store = makeStore()

        let readable = await store.readableDownload(for: url, startsTransfer: true)
        let prefetched = try await store.data(for: url)

        XCTAssertNotNil(readable)
        XCTAssertEqual(prefetched, payload)
        XCTAssertEqual(ReadableStubURLProtocol.hits(url), 1, "le lecteur et le préchargeur partagent un seul transfert")
    }

    func test_prefetchInFlight_thenReadableDownload_joinsIt() async throws {
        let url = base + "prefetch-first.mp4"
        let payload = body()
        ReadableStubURLProtocol.set(.init(body: payload, gated: true), for: url)
        let store = makeStore()

        let prefetch = Task { try await store.data(for: url) }
        try await waitUntil { store.hasReadableTransfer(for: url) }
        let opened = await store.readableDownload(for: url, startsTransfer: true)
        let readable = try XCTUnwrap(opened)
        ReadableStubURLProtocol.release(url)
        _ = try await prefetch.value
        _ = try await readable.finishedFile()

        XCTAssertEqual(ReadableStubURLProtocol.hits(url), 1)
    }

    // MARK: - La tête se lit avant la fin

    func test_readableDownload_headIsReadable_beforeTheTransferEnds() async throws {
        let url = base + "head.mp4"
        let payload = body()
        ReadableStubURLProtocol.set(.init(body: payload, chunks: 4, gated: true), for: url)
        let store = makeStore()

        let opened = await store.readableDownload(for: url, startsTransfer: true)
        let readable = try XCTUnwrap(opened)
        try await waitUntil { readable.snapshot.file.availableBytes > 0 }

        let snapshot = readable.snapshot
        XCTAssertFalse(snapshot.file.isComplete, "le transfert attend encore son reste")
        XCTAssertEqual(snapshot.file.expectedBytes, Int64(payload.count))
        XCTAssertEqual(snapshot.mimeType, "video/mp4")
        let head = try readable.read(offset: 0, length: 1024)
        XCTAssertEqual(head, payload.prefix(1024))

        ReadableStubURLProtocol.release(url)
        let finished = try await readable.finishedFile()
        XCTAssertEqual(try Data(contentsOf: finished), payload)
        XCTAssertEqual(store.cachedFileURL(for: url)?.standardizedFileURL.path, finished.standardizedFileURL.path, "le fichier fini est adopté sous sa clé")
        XCTAssertEqual(try readable.read(offset: Int64(payload.count - 16), length: 16), payload.suffix(16),
                       "la lecture survit au déplacement du fichier dans le cache")
    }

    func test_readableTransfer_isVisibleSynchronously_whileItRuns() async throws {
        let url = base + "visible.mp4"
        ReadableStubURLProtocol.set(.init(body: body(), gated: true), for: url)
        let store = makeStore()

        let opened = await store.readableDownload(for: url, startsTransfer: true)
        let readable = try XCTUnwrap(opened)
        XCTAssertTrue(store.hasReadableTransfer(for: url))

        ReadableStubURLProtocol.release(url)
        _ = try await readable.finishedFile()
        try await waitUntil { !store.hasReadableTransfer(for: url) }
        XCTAssertFalse(store.hasReadableTransfer(for: url))
    }

    // MARK: - La politique réseau reste à l'appelant

    func test_readableDownload_withoutPermission_opensNoTransfer() async {
        let url = base + "not-allowed.mp4"
        ReadableStubURLProtocol.set(.init(body: body()), for: url)
        let store = makeStore()

        let readable = await store.readableDownload(for: url, startsTransfer: false)

        XCTAssertNil(readable)
        XCTAssertEqual(ReadableStubURLProtocol.hits(url), 0)
    }

    func test_cachedVideo_isServedFromTheFile_withoutNetwork() async throws {
        let url = base + "cached.mp4"
        let payload = body()
        ReadableStubURLProtocol.set(.init(body: payload), for: url)
        let store = makeStore()
        _ = try await store.data(for: url)

        let opened = await store.readableDownload(for: url, startsTransfer: false)
        let readable = try XCTUnwrap(opened)

        XCTAssertTrue(readable.snapshot.file.isComplete)
        XCTAssertEqual(try readable.read(offset: 0, length: 64), payload.prefix(64))
        XCTAssertEqual(ReadableStubURLProtocol.hits(url), 1)
    }

    // MARK: - Fraîcheur #9478

    func test_noStoreVideo_playsButIsNotKept() async throws {
        let url = base + "view-once.mp4"
        let payload = body()
        ReadableStubURLProtocol.set(.init(cacheControl: "no-store", body: payload), for: url)
        let store = makeStore()

        let opened = await store.readableDownload(for: url, startsTransfer: true)
        let readable = try XCTUnwrap(opened)
        _ = try await readable.finishedFile()

        XCTAssertNil(store.cachedFileURL(for: url), "un média no-store n'est pas gardé")
        XCTAssertEqual(try readable.read(offset: 0, length: payload.count), payload)
    }

    func test_goneVideo_failsTheReaders_andWritesNoMediaBytes() async throws {
        let url = base + "gone.mp4"
        ReadableStubURLProtocol.set(.init(status: 404, contentType: "application/json", body: Data(#"{"success":false}"#.utf8)), for: url)
        let store = makeStore()

        let opened = await store.readableDownload(for: url, startsTransfer: true)
        let readable = try XCTUnwrap(opened)
        do {
            _ = try await readable.finishedFile()
            XCTFail("un 404 ne se lit pas comme une vidéo")
        } catch {}

        XCTAssertTrue(readable.snapshot.hasFailed)
        XCTAssertEqual(readable.snapshot.file.availableBytes, 0)
        XCTAssertNil(store.cachedFileURL(for: url))
    }

    // MARK: - Progression et annulation du funnel

    func test_progressiveFunnel_reportsProgress_upToTheLastByte() async throws {
        let url = base + "progress.mp4"
        let payload = body()
        ReadableStubURLProtocol.set(.init(body: payload, chunks: 8), for: url)
        let store = makeStore()
        let reports = ReadableProgressRecorder()

        _ = try await store.data(for: url, progress: { written, expected in reports.record(written, expected) })

        XCTAssertEqual(reports.last?.written, Int64(payload.count))
    }

    func test_cancelledCaller_cancelsTheTransfer_andKeepsNothing() async throws {
        let url = base + "cancel.mp4"
        ReadableStubURLProtocol.set(.init(body: body(), hangs: true), for: url)
        let store = makeStore()

        let task = Task { try await store.data(for: url, progress: { _, _ in }) }
        try await waitUntil { store.hasReadableTransfer(for: url) }
        task.cancel()

        do {
            _ = try await task.value
            XCTFail("l'annulation doit lever")
        } catch {
            XCTAssertTrue(error is CancellationError)
        }
        XCTAssertNil(store.cachedFileURL(for: url))
    }

    func test_storeWithoutReadableTransfers_keepsThePlainFileTransfer() async throws {
        let url = base + "plain.mp4"
        ReadableStubURLProtocol.set(.init(body: body()), for: url)
        let store = makeStore(readsWhileDownloading: false)

        let readable = await store.readableDownload(for: url, startsTransfer: true)
        _ = try await store.data(for: url)

        XCTAssertNil(readable, "un store sans lecture en flux n'ouvre pas de transfert lisible")
        XCTAssertFalse(store.hasReadableTransfer(for: url))
    }
}

private final class ReadableProgressRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var reports: [(written: Int64, expected: Int64)] = []

    func record(_ written: Int64, _ expected: Int64) {
        lock.withLock { reports.append((written, expected)) }
    }

    var last: (written: Int64, expected: Int64)? {
        lock.withLock { reports.last }
    }
}
