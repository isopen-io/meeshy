import XCTest
import UIKit
@testable import MeeshySDK

/// Le réseau de ces témoins : une réponse par URL, comptée.
private final class FreshnessStubURLProtocol: URLProtocol {
    struct Reply {
        let status: Int
        let cacheControl: String?
        let body: Data
    }

    nonisolated(unsafe) static var replies: [String: Reply] = [:]
    nonisolated(unsafe) static var hits: [String: Int] = [:]

    static func reset() {
        replies = [:]
        hits = [:]
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        let url = request.url?.absoluteString ?? ""
        Self.hits[url, default: 0] += 1
        let reply = Self.replies[url] ?? Reply(status: 500, cacheControl: nil, body: Data())
        let headers = reply.cacheControl.map { ["Cache-Control": $0] } ?? [:]
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil, headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: reply.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

/// #9478 — le cache disque respecte la fraîcheur que la passerelle déclare.
///
/// La route par chemin sert une vue unique en `private, no-store`, un éphémère
/// vivant en `private, no-cache`, et rend 404 pour un fichier rappelé, expiré
/// ou consommé (#9315). Le funnel réseau écrivait TOUT 2xx sur le disque et le
/// resservait ensuite sans réseau : une vue unique se relisait depuis
/// `Application Support` longtemps après sa fin de vie. Un média ORDINAIRE,
/// lui, reste servi depuis le disque, instantanément.
final class DiskCacheStoreFreshnessTests: XCTestCase {

    private var tempDir: URL!
    private let base = "https://media.freshness.meeshy.test/api/v1/attachments/file/"

    override func setUp() {
        super.setUp()
        FreshnessStubURLProtocol.reset()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("DiskCacheStoreFreshnessTests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        FreshnessStubURLProtocol.reset()
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    private func makeStore() -> DiskCacheStore {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FreshnessStubURLProtocol.self]
        configuration.urlCache = nil
        return DiskCacheStore(policy: .mediaImages, baseDirectory: tempDir, urlSession: URLSession(configuration: configuration))
    }

    private func reply(_ url: String, status: Int = 200, cacheControl: String?, body: Data = Data("octets".utf8)) {
        FreshnessStubURLProtocol.replies[url] = .init(status: status, cacheControl: cacheControl, body: body)
    }

    private func pngData() -> Data {
        UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).pngData { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
    }

    // MARK: - Média ordinaire : le Cache-First nominal ne change pas

    func test_dataFor_ordinaryMedia_isPersisted_andServedWithoutNetworkNextTime() async throws {
        let url = base + "ordinaire.jpg"
        reply(url, cacheControl: "private, max-age=31536000")
        let store = makeStore()

        _ = try await store.data(for: url)
        let second = try await store.data(for: url)

        XCTAssertEqual(second, Data("octets".utf8))
        XCTAssertEqual(FreshnessStubURLProtocol.hits[url], 1)
        let cached = await store.isCached(url)
        XCTAssertTrue(cached)
    }

    // MARK: - Vue unique : jamais écrite

    func test_dataFor_noStoreMedia_isServed_butNeverWrittenToDisk() async throws {
        let url = base + "vue-unique.jpg"
        reply(url, cacheControl: "private, no-store")
        let store = makeStore()

        let data = try await store.data(for: url)

        XCTAssertEqual(data, Data("octets".utf8))
        let cached = await store.isCached(url)
        XCTAssertFalse(cached)
        XCTAssertNil(store.cachedData(for: url))
    }

    func test_dataFor_noStoreMedia_goesToNetworkAtEachUse() async throws {
        let url = base + "vue-unique-2.jpg"
        reply(url, cacheControl: "private, no-store")
        let store = makeStore()

        _ = try await store.data(for: url)
        _ = try await store.data(for: url)

        XCTAssertEqual(FreshnessStubURLProtocol.hits[url], 2)
    }

    func test_imageFor_noStoreMedia_keepsNoDecodedCopy() async throws {
        let url = base + "vue-unique-image.png"
        reply(url, cacheControl: "private, no-store", body: pngData())
        let store = makeStore()

        let image = await store.image(for: url, maxPixelSize: 256)

        XCTAssertNotNil(image)
        XCTAssertNil(DiskCacheStore.cachedImage(for: url, maxPixelSize: 256))
        XCTAssertFalse(DiskCacheStore.hasAnyCachedImageVariant(for: url))
    }

    func test_dataFor_noStoreAnswer_evictsACopyWrittenBeforeTheMediaWasProtected() async throws {
        let url = base + "deja-en-cache.jpg"
        let writer = makeStore()
        await writer.save(Data("vieux".utf8), for: url)
        try await ageBeyondTTL(url, in: writer)
        reply(url, cacheControl: "private, no-store")
        let store = makeStore()

        _ = try await store.data(for: url)

        let cached = await store.isCached(url)
        XCTAssertFalse(cached)
        XCTAssertNil(store.cachedFileURL(for: url))
    }

    // MARK: - Éphémère : jamais resservi sans revalidation

    func test_dataFor_noCacheMedia_isNotServedFromDiskWithoutRevalidation() async throws {
        let url = base + "ephemere.jpg"
        reply(url, cacheControl: "private, no-cache")
        let store = makeStore()

        _ = try await store.data(for: url)
        _ = try await store.data(for: url)

        XCTAssertEqual(FreshnessStubURLProtocol.hits[url], 2)
        let cached = await store.isCached(url)
        XCTAssertFalse(cached)
    }

    func test_dataFor_noCacheMediaThatExpired_answers404_andIsNotServed() async throws {
        let url = base + "ephemere-expire.jpg"
        reply(url, cacheControl: "private, no-cache")
        let store = makeStore()
        _ = try await store.data(for: url)

        reply(url, status: 404, cacheControl: nil)

        do {
            _ = try await store.data(for: url)
            XCTFail("un éphémère expiré ne doit plus être servi")
        } catch {}
    }

    // MARK: - 404 / 410 à la revalidation : la copie locale est évincée

    /// Une entrée échue repart au réseau (TTL). Si la passerelle répond que le
    /// fichier n'existe plus, la copie restait sur le disque, et
    /// `cachedFileURL(for:)` — le chemin des lecteurs audio et vidéo — la
    /// resservait sans regarder sa fraîcheur.
    func test_revalidation_404_evictsTheCachedCopy() async throws {
        let url = base + "rappele.jpg"
        let writer = makeStore()
        await writer.save(Data("photo".utf8), for: url)
        try await ageBeyondTTL(url, in: writer)
        reply(url, status: 404, cacheControl: nil)
        let store = makeStore()

        _ = try? await store.data(for: url)

        let cached = await store.isCached(url)
        XCTAssertFalse(cached)
        XCTAssertNil(store.cachedFileURL(for: url))
    }

    func test_revalidation_410_evictsTheCachedCopy() async throws {
        let url = base + "brule.jpg"
        let writer = makeStore()
        await writer.save(Data("photo".utf8), for: url)
        try await ageBeyondTTL(url, in: writer)
        reply(url, status: 410, cacheControl: nil)
        let store = makeStore()

        _ = try? await store.data(for: url)

        XCTAssertNil(store.cachedFileURL(for: url))
    }

    func test_revalidation_serverError_keepsTheCachedCopy() async throws {
        let url = base + "panne.jpg"
        let writer = makeStore()
        await writer.save(Data("photo".utf8), for: url)
        try await ageBeyondTTL(url, in: writer)
        reply(url, status: 503, cacheControl: nil)
        let store = makeStore()

        _ = try? await store.data(for: url)

        XCTAssertNotNil(store.cachedFileURL(for: url))
    }

    private func ageBeyondTTL(_ url: String, in store: DiskCacheStore) async throws {
        let local = await store.localFileURL(for: url)
        let fileURL = try XCTUnwrap(local)
        try FileManager.default.setAttributes(
            [.modificationDate: Date(timeIntervalSinceNow: -2 * 366 * 24 * 3600)],
            ofItemAtPath: fileURL.path
        )
    }

    // MARK: - Écriture par un téléchargeur externe (progression)

    func test_storeHonoringResponse_ordinary_persists() async throws {
        let url = base + "externe-ordinaire.jpg"
        let store = makeStore()
        let response = HTTPURLResponse(url: URL(string: url)!, statusCode: 200, httpVersion: nil, headerFields: ["Cache-Control": "private, max-age=31536000"])

        let persisted = await store.store(Data("octets".utf8), for: url, honoring: response)

        XCTAssertTrue(persisted)
        let cached = await store.isCached(url)
        XCTAssertTrue(cached)
    }

    func test_storeHonoringResponse_noStore_doesNotPersist() async throws {
        let url = base + "externe-vue-unique.jpg"
        let store = makeStore()
        let response = HTTPURLResponse(url: URL(string: url)!, statusCode: 200, httpVersion: nil, headerFields: ["Cache-Control": "private, no-store"])

        let persisted = await store.store(Data("octets".utf8), for: url, honoring: response)

        XCTAssertFalse(persisted)
        let cached = await store.isCached(url)
        XCTAssertFalse(cached)
    }
}
