import XCTest
@testable import MeeshySDK

/// Le réseau de ces témoins : une réponse par URL, comptée. `hangs` envoie
/// l'en-tête et un premier paquet puis ne termine jamais (annulation) ;
/// `delay` retient la réponse (coalescence de deux appelants).
private final class StreamedStubURLProtocol: URLProtocol {
    struct Reply {
        var status: Int = 200
        var cacheControl: String?
        var body: Data
        var chunks: Int = 4
        var hangs: Bool = false
        var delay: TimeInterval = 0
    }

    nonisolated(unsafe) private static let lock = NSLock()
    nonisolated(unsafe) private static var replies: [String: Reply] = [:]
    nonisolated(unsafe) private static var hitCounts: [String: Int] = [:]
    nonisolated(unsafe) private static var stopped: [String: Int] = [:]

    static func reset() {
        lock.withLock {
            replies = [:]
            hitCounts = [:]
            stopped = [:]
        }
    }

    static func set(_ reply: Reply, for url: String) {
        lock.withLock { replies[url] = reply }
    }

    static func hits(_ url: String) -> Int {
        lock.withLock { hitCounts[url, default: 0] }
    }

    static func stops(_ url: String) -> Int {
        lock.withLock { stopped[url, default: 0] }
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        let url = request.url?.absoluteString ?? ""
        let reply = Self.lock.withLock { () -> Reply in
            Self.hitCounts[url, default: 0] += 1
            return Self.replies[url] ?? Reply(status: 500, body: Data())
        }
        if reply.delay > 0 { Thread.sleep(forTimeInterval: reply.delay) }
        var headers = ["Content-Length": "\(reply.body.count)"]
        if let cacheControl = reply.cacheControl { headers["Cache-Control"] = cacheControl }
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil, headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        let chunkSize = max(1, reply.body.count / max(1, reply.chunks))
        var offset = 0
        while offset < reply.body.count {
            let end = min(offset + chunkSize, reply.body.count)
            client?.urlProtocol(self, didLoad: reply.body.subdata(in: offset..<end))
            offset = end
            if reply.hangs { return }
        }
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {
        let url = request.url?.absoluteString ?? ""
        Self.lock.withLock { Self.stopped[url, default: 0] += 1 }
    }
}

private final class ProgressRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var reports: [(written: Int64, expected: Int64)] = []

    func record(_ written: Int64, _ expected: Int64) {
        lock.withLock { reports.append((written, expected)) }
    }

    var all: [(written: Int64, expected: Int64)] {
        lock.withLock { reports }
    }
}

/// #9863 — un média lourd se télécharge EN FLUX vers un fichier que le store
/// déplace sous sa clé : ni boucle octet par octet, ni fichier entier dans un
/// `Data`. La progression, l'annulation, le dédoublonnage et les directives de
/// fraîcheur #9478 (`no-store`, `no-cache`, 404 « disparu ») sont conservés,
/// et le fichier de transit ne survit à aucun chemin.
final class DiskCacheStoreStreamedTransferTests: XCTestCase {

    private var tempDir: URL!
    private var stagingDir: URL!
    private let base = "https://media.streamed.meeshy.test/api/v1/attachments/file/"

    override func setUp() {
        super.setUp()
        StreamedStubURLProtocol.reset()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("DiskCacheStoreStreamedTransferTests-\(UUID().uuidString)", isDirectory: true)
        stagingDir = tempDir.appendingPathComponent("staging", isDirectory: true)
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        StreamedStubURLProtocol.reset()
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    // MARK: - Factories

    private func configuration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StreamedStubURLProtocol.self]
        configuration.urlCache = nil
        return configuration
    }

    private func makeStore(
        transfer: DiskCacheStore.NetworkTransfer = .streamedToFile,
        policy: CachePolicy = .mediaVideo,
        subdir: String = "store"
    ) -> DiskCacheStore {
        let configuration = configuration()
        return DiskCacheStore(
            policy: policy,
            baseDirectory: tempDir.appendingPathComponent(subdir, isDirectory: true),
            urlSession: URLSession(configuration: configuration),
            networkTransfer: transfer,
            fileDownloader: MediaFileDownloader(configuration: configuration, stagingDirectory: stagingDir, cadenceInterval: 0)
        )
    }

    private func body(_ count: Int = 64 * 1024) -> Data {
        Data((0..<count).map { UInt8(truncatingIfNeeded: $0) })
    }

    private func reply(_ url: String, _ reply: StreamedStubURLProtocol.Reply) {
        StreamedStubURLProtocol.set(reply, for: url)
    }

    private func stagedFiles() -> [String] {
        (try? FileManager.default.contentsOfDirectory(atPath: stagingDir.path)) ?? []
    }

    private func ageBeyondTTL(_ url: String, in store: DiskCacheStore) async throws {
        let local = await store.localFileURL(for: url)
        let fileURL = try XCTUnwrap(local)
        try FileManager.default.setAttributes(
            [.modificationDate: Date(timeIntervalSinceNow: -2 * 366 * 24 * 3600)],
            ofItemAtPath: fileURL.path
        )
    }

    private func waitUntil(timeout: TimeInterval = 3, _ condition: () async -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    // MARK: - Média ordinaire : fichier déplacé, jamais résident

    func test_dataFor_streamedStore_ordinaryVideo_isCachedAsAFile_andNeverHeldInMemory() async throws {
        let url = base + "reel.mp4"
        let payload = body()
        reply(url, .init(cacheControl: "private, max-age=31536000", body: payload))
        let store = makeStore()

        let served = try await store.data(for: url)

        XCTAssertEqual(served, payload)
        XCTAssertNil(store.cachedData(for: url), "un média en flux ne passe pas par le L1 mémoire")
        let fileURL = try XCTUnwrap(store.cachedFileURL(for: url))
        let size = try XCTUnwrap(try FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as? Int)
        XCTAssertEqual(size, payload.count)
        XCTAssertEqual(stagedFiles(), [], "le fichier de transit est déplacé, pas copié")
    }

    /// La couture : le même téléchargement par le funnel `inMemory` dépose les
    /// octets dans le L1 — c'est le `Data` du fichier entier que le flux évite.
    func test_dataFor_inMemoryStore_keepsTheBytesInTheL1_contrastWitness() async throws {
        let url = base + "photo.jpg"
        reply(url, .init(cacheControl: nil, body: body(1024)))
        let store = makeStore(transfer: .inMemory, policy: .mediaImages)

        _ = try await store.data(for: url)

        XCTAssertNotNil(store.cachedData(for: url))
    }

    func test_dataFor_streamedStore_secondUse_isServedWithoutNetwork() async throws {
        let url = base + "rejoue.mp4"
        reply(url, .init(cacheControl: nil, body: body()))
        let store = makeStore()

        _ = try await store.data(for: url)
        let second = try await store.data(for: url)

        XCTAssertEqual(second.count, body().count)
        XCTAssertEqual(StreamedStubURLProtocol.hits(url), 1)
    }

    func test_dataFor_streamedStore_concurrentCallers_shareOneTransfer() async throws {
        let url = base + "partage.mp4"
        reply(url, .init(cacheControl: nil, body: body(), delay: 0.3))
        let store = makeStore()

        async let first = store.data(for: url)
        async let second = store.data(for: url)
        let (a, b) = try await (first, second)

        XCTAssertEqual(a, b)
        XCTAssertEqual(StreamedStubURLProtocol.hits(url), 1, "un même média demandé deux fois ⇒ un seul téléchargement")
    }

    func test_adoptedFile_countsInTheDiskBudget() async throws {
        let url = base + "budget.mp4"
        let payload = body(10_000)
        reply(url, .init(cacheControl: nil, body: payload))
        let store = makeStore()

        _ = try await store.data(for: url)

        let total = await store.estimatedDiskBytes()
        XCTAssertEqual(total, payload.count)
    }

    // MARK: - #9478 : vue unique, éphémère, disparu

    func test_dataFor_streamedStore_noStore_isServed_butNeverWritten_andNothingStaged() async throws {
        let url = base + "vue-unique.mp4"
        let payload = body(4096)
        reply(url, .init(cacheControl: "private, no-store", body: payload))
        let store = makeStore()

        let served = try await store.data(for: url)

        XCTAssertEqual(served, payload)
        let cached = await store.isCached(url)
        XCTAssertFalse(cached)
        XCTAssertNil(store.cachedFileURL(for: url))
        XCTAssertEqual(stagedFiles(), [], "le fichier de transit d'une vue unique ne survit pas au service")
    }

    func test_dataFor_streamedStore_noStore_evictsACopyWrittenBeforeTheMediaWasProtected() async throws {
        let url = base + "deja-en-cache.mp4"
        let writer = makeStore()
        await writer.save(Data("vieux".utf8), for: url)
        try await ageBeyondTTL(url, in: writer)
        reply(url, .init(cacheControl: "private, no-store", body: body(512)))
        let store = makeStore()

        _ = try await store.data(for: url)

        XCTAssertNil(store.cachedFileURL(for: url))
    }

    func test_dataFor_streamedStore_noCache_goesToNetworkAtEachUse() async throws {
        let url = base + "ephemere.mp4"
        reply(url, .init(cacheControl: "private, no-cache", body: body(512)))
        let store = makeStore()

        _ = try await store.data(for: url)
        _ = try await store.data(for: url)

        XCTAssertEqual(StreamedStubURLProtocol.hits(url), 2)
        let cached = await store.isCached(url)
        XCTAssertFalse(cached)
    }

    func test_dataFor_streamedStore_404_evictsTheCachedCopy_andThrows() async throws {
        let url = base + "rappele.mp4"
        let writer = makeStore()
        await writer.save(Data("video".utf8), for: url)
        try await ageBeyondTTL(url, in: writer)
        reply(url, .init(status: 404, body: Data("absent".utf8)))
        let store = makeStore()

        do {
            _ = try await store.data(for: url)
            XCTFail("un média disparu ne doit pas être servi")
        } catch {}

        XCTAssertNil(store.cachedFileURL(for: url))
        XCTAssertEqual(stagedFiles(), [])
    }

    func test_dataFor_streamedStore_serverError_keepsTheCachedCopy() async throws {
        let url = base + "panne.mp4"
        let writer = makeStore()
        await writer.save(Data("video".utf8), for: url)
        try await ageBeyondTTL(url, in: writer)
        reply(url, .init(status: 503, body: Data("panne".utf8)))
        let store = makeStore()

        _ = try? await store.data(for: url)

        XCTAssertNotNil(store.cachedFileURL(for: url))
        XCTAssertEqual(stagedFiles(), [])
    }

    // MARK: - Progression

    func test_dataForProgress_reportsProgress_upToTheFullSize() async throws {
        let url = base + "progression.mp4"
        let payload = body(256 * 1024)
        reply(url, .init(cacheControl: nil, body: payload, chunks: 8))
        let store = makeStore()
        let recorder = ProgressRecorder()

        _ = try await store.data(for: url, progress: { written, expected in recorder.record(written, expected) })

        let reports = recorder.all
        XCTAssertFalse(reports.isEmpty, "le délégué didWriteData rapporte la progression")
        XCTAssertEqual(reports.last?.written, Int64(payload.count))
        XCTAssertEqual(reports.last?.expected, Int64(payload.count))
        XCTAssertEqual(reports.map { $0.written }, reports.map { $0.written }.sorted(), "la progression ne recule jamais")
    }

    /// Le centre de téléchargement de l'app demande aussi des IMAGES avec
    /// progression : la variante `progress:` passe en flux quel que soit le
    /// mode du store.
    func test_dataForProgress_onAnInMemoryStore_stillStreamsToAFile() async throws {
        let url = base + "grande-photo.jpg"
        let payload = body(128 * 1024)
        reply(url, .init(cacheControl: nil, body: payload))
        let store = makeStore(transfer: .inMemory, policy: .mediaImages)
        let recorder = ProgressRecorder()

        let served = try await store.data(for: url, progress: { written, expected in recorder.record(written, expected) })

        XCTAssertEqual(served, payload)
        XCTAssertFalse(recorder.all.isEmpty)
        XCTAssertNotNil(store.cachedFileURL(for: url))
        XCTAssertNil(store.cachedData(for: url))
    }

    // MARK: - Annulation

    func test_dataForProgress_cancellingTheCaller_cancelsTheTransfer_andLeavesNothing() async throws {
        let url = base + "annule.mp4"
        reply(url, .init(cacheControl: nil, body: body(256 * 1024), chunks: 16, hangs: true))
        let store = makeStore()

        let download = Task { try await store.data(for: url, progress: { _, _ in }) }
        try await waitUntil { StreamedStubURLProtocol.hits(url) == 1 }
        download.cancel()
        let result = await download.result

        switch result {
        case .success: XCTFail("un transfert annulé ne rend pas de média")
        case .failure(let error): XCTAssertTrue(error is CancellationError, "annulation coopérative : \(error)")
        }
        try await waitUntil { StreamedStubURLProtocol.stops(url) == 1 }
        XCTAssertEqual(StreamedStubURLProtocol.stops(url), 1, "la requête réseau elle-même est arrêtée")
        let cached = await store.isCached(url)
        XCTAssertFalse(cached)
        let inFlight = await store.hasInFlightDownload(forURL: url)
        XCTAssertFalse(inFlight)
        XCTAssertEqual(stagedFiles(), [])
    }

    func test_purge_cancelsAStreamedTransfer_soItCannotRewriteTheFile() async throws {
        let url = base + "purge.mp4"
        reply(url, .init(cacheControl: nil, body: body(256 * 1024), chunks: 16, hangs: true))
        let store = makeStore()

        let download = Task { try await store.data(for: url) }
        try await waitUntil { StreamedStubURLProtocol.hits(url) == 1 }
        _ = await store.purge(urls: [url])
        _ = await download.result

        let cached = await store.isCached(url)
        XCTAssertFalse(cached)
        try await waitUntil { StreamedStubURLProtocol.stops(url) == 1 }
        XCTAssertEqual(StreamedStubURLProtocol.stops(url), 1)
    }

    /// Arrêter puis relancer aussitôt le même média : le second appel ne
    /// rejoint pas le transfert condamné (il ne rendrait qu'une annulation),
    /// il en ouvre un neuf.
    func test_restartingRightAfterACancel_opensAFreshTransfer() async throws {
        let url = base + "relance.mp4"
        reply(url, .init(cacheControl: nil, body: body(256 * 1024), chunks: 16, hangs: true))
        let store = makeStore()
        let first = Task { try await store.data(for: url, progress: { _, _ in }) }
        try await waitUntil { StreamedStubURLProtocol.hits(url) == 1 }

        first.cancel()
        let payload = body(2048)
        reply(url, .init(cacheControl: nil, body: payload))
        let served = try await store.data(for: url, progress: { _, _ in })

        XCTAssertEqual(served, payload)
        XCTAssertEqual(StreamedStubURLProtocol.hits(url), 2)
        _ = await first.result
    }

    /// Rejoindre un transfert n'en fait pas son propriétaire : l'appelant qui
    /// a seulement REJOINT et s'annule ne coupe pas le préchargement d'autrui.
    func test_cancellingAJoiningCaller_doesNotCancelTheTransferItJoined() async throws {
        let url = base + "rejoint.mp4"
        let payload = body()
        reply(url, .init(cacheControl: nil, body: payload, delay: 0.4))
        let store = makeStore()

        let owner = Task { try await store.data(for: url) }
        try await waitUntil { StreamedStubURLProtocol.hits(url) == 1 }
        let joiner = Task { try await store.data(for: url, progress: { _, _ in }) }
        try await Task.sleep(nanoseconds: 50_000_000)
        joiner.cancel()

        let served = try await owner.value
        XCTAssertEqual(served, payload)
        XCTAssertNotNil(store.cachedFileURL(for: url))
    }

    // MARK: - Adoption d'un fichier téléchargé

    func test_adoptDownloadedFile_movesTheFile_insteadOfReadingIt() async throws {
        let url = base + "adopte.mp4"
        let source = tempDir.appendingPathComponent("transit.mp4")
        try body(2048).write(to: source)
        let store = makeStore()
        let response = HTTPURLResponse(url: URL(string: url)!, statusCode: 200, httpVersion: nil, headerFields: nil)

        let adopted = await store.adopt(downloadedFile: source, for: url, honoring: response)

        XCTAssertNotNil(adopted)
        XCTAssertFalse(FileManager.default.fileExists(atPath: source.path), "déplacé, pas copié")
        XCTAssertEqual(store.cachedFileURL(for: url), adopted)
        XCTAssertNil(store.cachedData(for: url))
    }

    func test_adoptDownloadedFile_replacesAnExpiredCopy() async throws {
        let url = base + "remplace.mp4"
        let store = makeStore()
        await store.save(Data("ancien".utf8), for: url)
        let source = tempDir.appendingPathComponent("nouveau.mp4")
        let fresh = body(1024)
        try fresh.write(to: source)
        let response = HTTPURLResponse(url: URL(string: url)!, statusCode: 200, httpVersion: nil, headerFields: nil)

        _ = await store.adopt(downloadedFile: source, for: url, honoring: response)

        let fileURL = try XCTUnwrap(store.cachedFileURL(for: url))
        XCTAssertEqual(try Data(contentsOf: fileURL), fresh)
        XCTAssertNil(store.cachedData(for: url), "l'ancienne copie du L1 ne doit plus être servie")
    }

    func test_adoptDownloadedFile_noStore_leavesTheFileToTheCaller() async throws {
        let url = base + "adopte-vue-unique.mp4"
        let source = tempDir.appendingPathComponent("transit-vue-unique.mp4")
        try body(2048).write(to: source)
        let store = makeStore()
        let response = HTTPURLResponse(url: URL(string: url)!, statusCode: 200, httpVersion: nil, headerFields: ["Cache-Control": "private, no-store"])

        let adopted = await store.adopt(downloadedFile: source, for: url, honoring: response)

        XCTAssertNil(adopted)
        XCTAssertTrue(FileManager.default.fileExists(atPath: source.path))
        let cached = await store.isCached(url)
        XCTAssertFalse(cached)
    }

    func test_adoptDownloadedFile_triggersTheBudgetEviction() async throws {
        let policy = CachePolicy(ttl: 3600 * 24 * 365, staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Budget", maxBytes: 1000))
        let store = makeStore(policy: policy)
        let oldURL = base + "ancien.mp4"
        await store.save(Data(repeating: 1, count: 600), for: oldURL)
        let oldFile = try XCTUnwrap(store.cachedFileURL(for: oldURL))
        try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -3600)], ofItemAtPath: oldFile.path)
        let source = tempDir.appendingPathComponent("gros.mp4")
        try Data(repeating: 2, count: 600).write(to: source)
        let newURL = base + "nouveau.mp4"
        let response = HTTPURLResponse(url: URL(string: newURL)!, statusCode: 200, httpVersion: nil, headerFields: nil)

        _ = await store.adopt(downloadedFile: source, for: newURL, honoring: response)

        let total = await store.estimatedDiskBytes()
        XCTAssertLessThanOrEqual(total, 1000)
        XCTAssertNil(store.cachedFileURL(for: oldURL), "le plus ancien part le premier")
        XCTAssertNotNil(store.cachedFileURL(for: newURL))
    }
}
