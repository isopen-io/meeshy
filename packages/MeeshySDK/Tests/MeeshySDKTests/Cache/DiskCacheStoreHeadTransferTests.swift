import XCTest
@testable import MeeshySDK

/// Un serveur de fichiers qui honore `Range` (comme la passerelle et Traefik),
/// ou qui l'ignore. Il compte les requêtes, les en-têtes reçus et les octets
/// servis par URL. `gatesContinuation` retient la reprise après son premier
/// paquet jusqu'à `release(_:)`.
private final class RangeStubURLProtocol: URLProtocol {
    struct File {
        var body: Data
        var honorsHeadRange = true
        var honorsContinuation = true
        var gatesContinuation = false
    }

    nonisolated(unsafe) private static let lock = NSLock()
    nonisolated(unsafe) private static var files: [String: File] = [:]
    nonisolated(unsafe) private static var ranges: [String: [String?]] = [:]
    nonisolated(unsafe) private static var served: [String: Int] = [:]
    nonisolated(unsafe) private static var gates: [String: DispatchSemaphore] = [:]

    static func reset() {
        lock.withLock {
            gates.values.forEach { $0.signal() }
            files = [:]
            ranges = [:]
            served = [:]
            gates = [:]
        }
    }

    static func set(_ file: File, for url: String) {
        lock.withLock {
            files[url] = file
            if file.gatesContinuation { gates[url] = DispatchSemaphore(value: 0) }
        }
    }

    static func update(_ url: String, _ change: (inout File) -> Void) {
        lock.withLock {
            guard var file = files[url] else { return }
            change(&file)
            files[url] = file
        }
    }

    static func requestedRanges(_ url: String) -> [String?] { lock.withLock { ranges[url] ?? [] } }
    static func servedBytes(_ url: String) -> Int { lock.withLock { served[url, default: 0] } }
    static func release(_ url: String) { lock.withLock { gates[url] }?.signal() }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        let url = request.url?.absoluteString ?? ""
        let range = request.value(forHTTPHeaderField: "Range")
        let (file, gate) = Self.lock.withLock { () -> (File?, DispatchSemaphore?) in
            Self.ranges[url, default: []].append(range)
            return (Self.files[url], Self.gates[url])
        }
        guard let file else {
            reply(status: 404, headers: [:], body: Data(), gate: nil)
            return
        }
        guard let range, let bounds = Self.bounds(of: range, size: file.body.count) else {
            reply(status: 200, headers: ["Content-Length": "\(file.body.count)"], body: file.body, gate: nil)
            return
        }
        let honors = bounds.lowerBound == 0 ? file.honorsHeadRange : file.honorsContinuation
        guard honors else {
            reply(status: 200, headers: ["Content-Length": "\(file.body.count)"], body: file.body, gate: nil)
            return
        }
        let slice = file.body.subdata(in: bounds)
        let headers = [
            "Content-Length": "\(slice.count)",
            "Content-Range": "bytes \(bounds.lowerBound)-\(bounds.upperBound - 1)/\(file.body.count)",
        ]
        reply(status: 206, headers: headers, body: slice, gate: bounds.lowerBound > 0 ? gate : nil)
    }

    override nonisolated func stopLoading() {}

    private func reply(status: Int, headers: [String: String], body: Data, gate: DispatchSemaphore?) {
        let url = request.url!
        var all = headers
        all["Content-Type"] = "video/mp4"
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: all)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        let chunk = max(1, body.count / 4)
        var offset = 0
        while offset < body.count {
            let end = min(offset + chunk, body.count)
            client?.urlProtocol(self, didLoad: body.subdata(in: offset..<end))
            Self.lock.withLock { Self.served[url.absoluteString, default: 0] += end - offset }
            if offset == 0, let gate { gate.wait() }
            offset = end
        }
        client?.urlProtocolDidFinishLoading(self)
    }

    private static func bounds(of header: String, size: Int) -> Range<Int>? {
        guard header.hasPrefix("bytes=") else { return nil }
        let parts = header.dropFirst("bytes=".count).split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2, let start = Int(parts[0]), start < size else { return nil }
        let end = parts[1].isEmpty ? size - 1 : min(Int(parts[1]) ?? size - 1, size - 1)
        return start..<(end + 1)
    }
}

/// #11288 — la fenêtre lointaine des réels n'amorce que la TÊTE du fichier
/// (`Range: bytes=0-<n>`), gardée à part du cache ; à l'élection, le transfert
/// suivant REPREND cette tête là où elle s'est arrêtée (`Range: bytes=<n>-`)
/// dans le même fichier lisible, puis le cache adopte le fichier entier.
final class DiskCacheStoreHeadTransferTests: XCTestCase {

    private var tempDir: URL!
    private let base = "https://media.head.meeshy.test/api/v1/attachments/file/"
    private let headBytes = 16 * 1024

    override func setUp() {
        super.setUp()
        RangeStubURLProtocol.reset()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("DiskCacheStoreHeadTransferTests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        RangeStubURLProtocol.reset()
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    // MARK: - Fabriques

    private func makeStore() -> DiskCacheStore {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RangeStubURLProtocol.self]
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
            readsWhileDownloading: true
        )
    }

    private func body(_ count: Int = 96 * 1024) -> Data {
        Data((0..<count).map { UInt8(truncatingIfNeeded: $0 &* 13 &+ 5) })
    }

    // MARK: - La tête seule

    func test_prefetchHead_asksOnlyTheHead_andKeepsItOutOfTheCache() async {
        let url = base + "far.mp4"
        RangeStubURLProtocol.set(.init(body: body()), for: url)
        let store = makeStore()

        await store.prefetchHead(of: url, bytes: headBytes)

        XCTAssertEqual(RangeStubURLProtocol.requestedRanges(url), ["bytes=0-\(headBytes - 1)"])
        XCTAssertEqual(RangeStubURLProtocol.servedBytes(url), headBytes, "seule la tête a voyagé")
        XCTAssertNil(store.cachedFileURL(for: url), "une tête n'est jamais servie comme un fichier entier")
        XCTAssertFalse(store.hasReadableTransfer(for: url), "une tête au repos n'est pas un transfert en cours")
    }

    func test_prefetchHead_ofACachedVideo_opensNoRequest() async throws {
        let url = base + "cached.mp4"
        RangeStubURLProtocol.set(.init(body: body()), for: url)
        let store = makeStore()
        _ = try await store.data(for: url)

        await store.prefetchHead(of: url, bytes: headBytes)

        XCTAssertEqual(RangeStubURLProtocol.requestedRanges(url).count, 1)
    }

    func test_prefetchHead_twice_asksTheHeadOnce() async {
        let url = base + "twice.mp4"
        RangeStubURLProtocol.set(.init(body: body()), for: url)
        let store = makeStore()

        await store.prefetchHead(of: url, bytes: headBytes)
        await store.prefetchHead(of: url, bytes: headBytes)

        XCTAssertEqual(RangeStubURLProtocol.requestedRanges(url).count, 1)
    }

    // MARK: - L'élection reprend la tête

    func test_election_resumesTheHead_andTheFileArrivesOnce() async throws {
        let url = base + "elected.mp4"
        let payload = body()
        RangeStubURLProtocol.set(.init(body: payload), for: url)
        let store = makeStore()
        await store.prefetchHead(of: url, bytes: headBytes)

        let data = try await store.data(for: url)

        XCTAssertEqual(data, payload)
        XCTAssertEqual(RangeStubURLProtocol.requestedRanges(url), ["bytes=0-\(headBytes - 1)", "bytes=\(headBytes)-"])
        XCTAssertEqual(RangeStubURLProtocol.servedBytes(url), payload.count, "aucun octet de la tête ne repart")
        let cached = try XCTUnwrap(store.cachedFileURL(for: url))
        XCTAssertEqual(try Data(contentsOf: cached), payload)
    }

    func test_electedPlayer_readsTheHead_beforeTheRestArrives() async throws {
        let url = base + "played.mp4"
        let payload = body()
        RangeStubURLProtocol.set(.init(body: payload, gatesContinuation: true), for: url)
        let store = makeStore()
        await store.prefetchHead(of: url, bytes: headBytes)

        let opened = await store.readableDownload(for: url, startsTransfer: true)
        let readable = try XCTUnwrap(opened)

        XCTAssertGreaterThanOrEqual(readable.snapshot.file.availableBytes, Int64(headBytes), "la tête est lisible dès l'élection")
        XCTAssertEqual(readable.snapshot.file.expectedBytes, Int64(payload.count), "le lecteur connaît la taille du fichier entier")
        XCTAssertEqual(try readable.read(offset: 0, length: headBytes), payload.prefix(headBytes))
        RangeStubURLProtocol.release(url)
        let finished = try await readable.finishedFile()
        XCTAssertEqual(try Data(contentsOf: finished), payload)
        XCTAssertEqual(RangeStubURLProtocol.servedBytes(url), payload.count)
    }

    func test_parkedHead_isNotPlayed_withoutPermissionToTransfer() async {
        let url = base + "bubble.mp4"
        RangeStubURLProtocol.set(.init(body: body()), for: url)
        let store = makeStore()
        await store.prefetchHead(of: url, bytes: headBytes)

        let readable = await store.readableDownload(for: url, startsTransfer: false)

        XCTAssertNil(readable, "une tête au repos se figerait au bout de ses octets : sans élection, rien ne la complète")
        XCTAssertEqual(RangeStubURLProtocol.requestedRanges(url).count, 1)
    }

    // MARK: - Fichiers courts et serveurs sans Range

    func test_videoShorterThanTheHead_isWholeAfterTheHead_andElectionAsksNothingMore() async throws {
        let url = base + "short.mp4"
        let payload = body(4 * 1024)
        RangeStubURLProtocol.set(.init(body: payload), for: url)
        let store = makeStore()
        await store.prefetchHead(of: url, bytes: headBytes)

        let data = try await store.data(for: url)

        XCTAssertEqual(data, payload)
        XCTAssertEqual(RangeStubURLProtocol.requestedRanges(url).count, 1)
        XCTAssertNotNil(store.cachedFileURL(for: url))
    }

    func test_serverIgnoringRange_headStopsAtItsBudget_andElectionStartsOver() async throws {
        let url = base + "no-range.mp4"
        let payload = body(512 * 1024)
        RangeStubURLProtocol.set(.init(body: payload, honorsHeadRange: false), for: url)
        let store = makeStore()

        await store.prefetchHead(of: url, bytes: headBytes)
        let data = try await store.data(for: url)

        XCTAssertEqual(data, payload)
        let ranges = RangeStubURLProtocol.requestedRanges(url)
        XCTAssertEqual(ranges.count, 2)
        XCTAssertNil(ranges.last ?? "absent", "la seconde requête repart du début, sans Range")
        let cached = try XCTUnwrap(store.cachedFileURL(for: url))
        XCTAssertEqual(try Data(contentsOf: cached), payload)
    }

    func test_continuationAnsweredWithTheWholeFile_isNeverAppended() async throws {
        let url = base + "range-lost.mp4"
        RangeStubURLProtocol.set(.init(body: body()), for: url)
        let store = makeStore()
        await store.prefetchHead(of: url, bytes: headBytes)
        RangeStubURLProtocol.update(url) { $0.honorsContinuation = false }

        do {
            _ = try await store.data(for: url)
            XCTFail("un fichier entier ne se colle pas derrière une tête")
        } catch {}

        XCTAssertNil(store.cachedFileURL(for: url), "rien de corrompu n'entre dans le cache")
    }

    // MARK: - Purge

    func test_purge_dropsTheParkedHead() async throws {
        let url = base + "purged.mp4"
        let payload = body()
        RangeStubURLProtocol.set(.init(body: payload), for: url)
        let store = makeStore()
        await store.prefetchHead(of: url, bytes: headBytes)

        await store.purge(urls: [url])
        let data = try await store.data(for: url)

        XCTAssertEqual(data, payload)
        let ranges = RangeStubURLProtocol.requestedRanges(url)
        XCTAssertEqual(ranges.count, 2)
        XCTAssertNil(ranges.last ?? "absent", "après la purge, le fichier repart du début")
    }
}
