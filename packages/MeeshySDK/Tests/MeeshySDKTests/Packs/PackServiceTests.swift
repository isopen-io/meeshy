import CryptoKit
import XCTest
@testable import MeeshySDK

/// **Un service par domaine, le même code** (#10150) : les cadres de gloire
/// parlent à `/packs/glory-frame`, les stickers à `/sticker-packs` (inchangé).
final class PackServiceTests: XCTestCase {

    private func frames(_ slugs: [String]) -> LossyDecodableArray<FramePack> {
        LossyDecodableArray(elements: slugs.map { FramePack(slug: $0, name: $0) })
    }

    func test_frameCatalogue_readsTheFrameShop() async throws {
        let mock = MockAPIClient()
        mock.stub("/packs/glory-frame", result: APIResponse(success: true, data: frames(["exemple-savane"]), error: nil))
        let service = PackService<FramePack>(domain: .gloryFrame, api: mock)

        let packs = try await service.catalogue()

        XCTAssertEqual(packs.map(\.slug), ["exemple-savane"])
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_frameInstalled_andDetail_useTheirAddresses() async throws {
        let mock = MockAPIClient()
        mock.stub("/packs/glory-frame/installed", result: APIResponse(success: true, data: frames(["a"]), error: nil))
        mock.stub("/packs/glory-frame/a", result: APIResponse(success: true, data: FramePack(slug: "a", name: "A"), error: nil))
        let service = PackService<FramePack>(domain: .gloryFrame, api: mock)

        _ = try await service.installed()
        XCTAssertEqual(mock.lastRequest?.endpoint, "/packs/glory-frame/installed")
        let detail = try await service.detail(slug: "a")
        XCTAssertEqual(detail.name, "A")
        XCTAssertEqual(mock.lastRequest?.endpoint, "/packs/glory-frame/a")
    }

    func test_frameInstall_putsThenRemoveDeletes() async throws {
        let mock = MockAPIClient()
        mock.stub("/packs/glory-frame/a/install",
                  result: APIResponse(success: true, data: FramePack(slug: "a", name: "A", installed: true), error: nil))
        let service = PackService<FramePack>(domain: .gloryFrame, api: mock)

        _ = try await service.setInstalled(true, slug: "a")
        XCTAssertEqual(mock.lastRequest?.method, "PUT")
        _ = try await service.setInstalled(false, slug: "a")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    func test_theStickerProjection_keepsItsDomain() {
        XCTAssertEqual(StickerPackService(api: MockAPIClient()).domain, .sticker)
    }
}

// MARK: - Le magasin adressé par contenu

private final class CountingFetcher: PackAssetFetching, @unchecked Sendable {
    var payload: Data
    private(set) var calls = 0

    init(_ payload: Data) {
        self.payload = payload
    }

    func fetch(file name: String) async throws -> Data {
        calls += 1
        return payload
    }
}

/// **Un fichier de pack se télécharge une fois, se vérifie, se garde** (#10150).
final class ContentAddressedStoreTests: XCTestCase {

    private func temporaryDirectory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("packs-\(UUID().uuidString)")
    }

    private func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    func test_aVerifiedFile_isFetchedOnce_thenReadFromDisk() async throws {
        let bytes = Data("vignette".utf8)
        let sha = digest(bytes)
        let file = try XCTUnwrap(PackAssetFile(name: "\(sha.prefix(16)).webp", sha256: sha))
        let fetcher = CountingFetcher(bytes)
        let store = ContentAddressedStore(directory: temporaryDirectory(), fetcher: fetcher)

        let first = try await store.data(for: file)
        let second = try await store.data(for: file)

        XCTAssertEqual(first, bytes)
        XCTAssertEqual(second, bytes)
        XCTAssertEqual(fetcher.calls, 1)
    }

    func test_bytesThatDoNotMatchTheirName_areRefused_andNotKept() async throws {
        let sha = digest(Data("attendu".utf8))
        let file = try XCTUnwrap(PackAssetFile(name: "\(sha.prefix(16)).webp"))
        let fetcher = CountingFetcher(Data("autre chose".utf8))
        let store = ContentAddressedStore(directory: temporaryDirectory(), fetcher: fetcher)

        do {
            _ = try await store.data(for: file)
            XCTFail("des octets qui ne sont pas ceux du nom ne passent pas")
        } catch {
            XCTAssertEqual(error as? ContentAddressedStoreError, .digestMismatch)
        }
        let kept = await store.contains(file)
        XCTAssertFalse(kept)
    }

    func test_aCoverKnownOnlyByItsName_isCheckedOnItsPrefix() async throws {
        let bytes = Data("couverture".utf8)
        let file = try XCTUnwrap(PackAssetFile(servedPath: "/api/v1/pack-assets/\(digest(bytes).prefix(16)).webp"))
        let store = ContentAddressedStore(directory: temporaryDirectory(), fetcher: CountingFetcher(bytes))

        let data = try await store.data(for: file)

        XCTAssertEqual(data, bytes)
    }
}
