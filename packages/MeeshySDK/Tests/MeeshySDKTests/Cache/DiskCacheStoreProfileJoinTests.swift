import XCTest
@testable import MeeshySDK

/// Le réseau de ces témoins : une FILE de réponses par URL, servie dans
/// l'ordre et comptée. La première réponse est retenue (`delay`) pour qu'un
/// second appelant ait le temps de rejoindre le transfert en vol ; `failure`
/// simule le refus d'une session interdite de réseau facturé (URLError).
private final class SequencedStubURLProtocol: URLProtocol {
    struct Reply {
        var status: Int
        var body: Data
        var delay: TimeInterval = 0
        var failure: URLError.Code?
    }

    nonisolated(unsafe) private static let lock = NSLock()
    nonisolated(unsafe) private static var queues: [String: [Reply]] = [:]
    nonisolated(unsafe) private static var hitCounts: [String: Int] = [:]

    static func reset() {
        lock.withLock {
            queues = [:]
            hitCounts = [:]
        }
    }

    static func enqueue(_ replies: [Reply], for url: String) {
        lock.withLock { queues[url] = replies }
    }

    static func hits(_ url: String) -> Int {
        lock.withLock { hitCounts[url, default: 0] }
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        let url = request.url?.absoluteString ?? ""
        let reply = Self.lock.withLock { () -> Reply in
            Self.hitCounts[url, default: 0] += 1
            guard var queue = Self.queues[url], !queue.isEmpty else { return Reply(status: 500, body: Data()) }
            let next = queue.removeFirst()
            Self.queues[url] = queue
            return next
        }
        if reply.delay > 0 { Thread.sleep(forTimeInterval: reply.delay) }
        if let failure = reply.failure {
            client?.urlProtocol(self, didFailWithError: URLError(failure))
            return
        }
        let headers = ["Content-Length": "\(reply.body.count)"]
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil, headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: reply.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

/// IL5 (#11283) — le dédoublonnage par clé ne doit pas faire hériter une
/// lecture des restrictions d'un préchargement. Un préchargement différé,
/// interdit de réseau facturé, échoue sur cellulaire ; la lecture premier plan
/// qui l'avait rejoint échouait avec lui. Elle reprend désormais le
/// téléchargement avec SON profil — et seulement quand le transfert rejoint
/// était plus restreint qu'elle : à profil égal ou plus large, un seul
/// téléchargement reste la règle.
final class DiskCacheStoreProfileJoinTests: XCTestCase {

    private let base = "https://media.profile-join.meeshy.test/api/v1/attachments/file/"
    private let restricted = MediaTransferProfile(priority: .deferrable, allowsExpensiveNetworkAccess: false)

    override func setUp() {
        super.setUp()
        SequencedStubURLProtocol.reset()
    }

    override func tearDown() {
        SequencedStubURLProtocol.reset()
        super.tearDown()
    }

    private func makeStore() -> DiskCacheStore {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("DiskCacheStoreProfileJoinTests-\(UUID().uuidString)", isDirectory: true)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SequencedStubURLProtocol.self]
        configuration.urlCache = nil
        return DiskCacheStore(
            policy: .mediaVideo,
            baseDirectory: root.appendingPathComponent("store", isDirectory: true),
            urlSession: URLSession(configuration: configuration),
            networkTransfer: .streamedToFile,
            fileDownloader: MediaFileDownloader(
                configuration: configuration,
                stagingDirectory: root.appendingPathComponent("staging", isDirectory: true),
                cadenceInterval: 0
            )
        )
    }

    private func body() -> Data {
        Data((0..<32 * 1024).map { UInt8(truncatingIfNeeded: $0) })
    }

    private func failingThenServed(_ url: String) {
        SequencedStubURLProtocol.enqueue([
            .init(status: 0, body: Data(), delay: 0.4, failure: .notConnectedToInternet),
            .init(status: 200, body: body()),
        ], for: url)
    }

    private func startInFlight(_ store: DiskCacheStore, url: String, profile: MediaTransferProfile) async -> Task<Data, Error> {
        let task = Task { try await store.data(for: url, profile: profile, progress: { _, _ in }) }
        for _ in 0..<200 {
            if await store.hasInFlightDownload(forURL: url) { break }
            await Task.yield()
        }
        return task
    }

    func test_dataFor_playbackJoiningARestrictedPrefetchThatFails_resumesWithItsOwnProfile() async throws {
        let url = base + "lecture-rejoint-prechargement.mp4"
        failingThenServed(url)
        let store = makeStore()

        let prefetch = await startInFlight(store, url: url, profile: restricted)
        let played = try await store.data(for: url, profile: .standard, progress: { _, _ in })
        _ = await prefetch.result

        XCTAssertEqual(played, body())
        XCTAssertEqual(SequencedStubURLProtocol.hits(url), 2)
    }

    func test_dataFor_sameProfileJoiningAFailingTransfer_sharesItsFailure_oneDownload() async throws {
        let url = base + "meme-profil.mp4"
        failingThenServed(url)
        let store = makeStore()

        let first = await startInFlight(store, url: url, profile: restricted)
        let second = await outcome { try await store.data(for: url, profile: self.restricted, progress: { _, _ in }) }
        _ = await first.result

        XCTAssertThrowsError(try second.get())
        XCTAssertEqual(SequencedStubURLProtocol.hits(url), 1)
    }

    func test_dataFor_restrictedPrefetchJoiningAStandardTransfer_sharesIt_oneDownload() async throws {
        let url = base + "prechargement-rejoint-lecture.mp4"
        SequencedStubURLProtocol.enqueue([.init(status: 200, body: body(), delay: 0.4)], for: url)
        let store = makeStore()

        let playback = await startInFlight(store, url: url, profile: .standard)
        let prefetched = try await store.data(for: url, profile: restricted, progress: { _, _ in })
        _ = await playback.result

        XCTAssertEqual(prefetched, body())
        XCTAssertEqual(SequencedStubURLProtocol.hits(url), 1)
    }

    func test_covers_aTransferServesOnlyCallersItIsAtLeastAsPermissiveFor() {
        let restrictedImmediate = MediaTransferProfile(priority: .immediate, allowsExpensiveNetworkAccess: false)
        let openDeferred = MediaTransferProfile(priority: .deferrable, allowsExpensiveNetworkAccess: true)

        XCTAssertTrue(MediaTransferProfile.standard.covers(restricted))
        XCTAssertTrue(restricted.covers(restricted))
        XCTAssertFalse(restricted.covers(.standard))
        XCTAssertFalse(restrictedImmediate.covers(.standard))
        XCTAssertFalse(openDeferred.covers(.standard))
        XCTAssertTrue(openDeferred.covers(restricted))
    }

    func test_merged_isTheSmallestProfileCoveringBoth() {
        let restrictedImmediate = MediaTransferProfile(priority: .immediate, allowsExpensiveNetworkAccess: false)
        let openDeferred = MediaTransferProfile(priority: .deferrable, allowsExpensiveNetworkAccess: true)

        XCTAssertEqual(restrictedImmediate.merged(with: openDeferred), .standard)
        XCTAssertEqual(restricted.merged(with: restricted), restricted)
        XCTAssertEqual(restricted.merged(with: openDeferred), openDeferred)
    }
}

private func outcome<T>(of body: () async throws -> T) async -> Result<T, Error> {
    do { return .success(try await body()) } catch { return .failure(error) }
}
