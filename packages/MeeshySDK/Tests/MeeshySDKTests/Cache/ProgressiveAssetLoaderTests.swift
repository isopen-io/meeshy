import XCTest
import AVFoundation
@testable import MeeshySDK

/// #9881 — l'asset d'une vidéo distante non téléchargée lit le transfert du
/// cache : son URL n'est ouvrable que par son chargeur, et le type de contenu
/// remis à AVFoundation vient de la réponse, sinon de l'extension.
final class ProgressiveAssetLoaderTests: XCTestCase {

    private let remote = URL(string: "https://gate.meeshy.test/api/v1/attachments/file/clip.mp4?v=2")!

    func test_loaderURL_swapsOnlyTheScheme() {
        let url = ProgressiveURLAsset.loaderURL(for: remote)

        XCTAssertEqual(url.scheme, ProgressiveURLAsset.scheme)
        XCTAssertEqual(url.host, remote.host)
        XCTAssertEqual(url.path, remote.path)
        XCTAssertEqual(url.query, remote.query)
    }

    func test_asset_isOpenedThroughItsLoader_neverOverHTTPS() {
        let asset = ProgressiveURLAsset(remoteURL: remote) { nil }

        XCTAssertEqual(asset.url.scheme, ProgressiveURLAsset.scheme)
        XCTAssertEqual(asset.remoteURL, remote)
        XCTAssertNotNil(asset.resourceLoader.delegate, "le chargeur est posé dès la création de l'asset")
    }

    func test_contentType_followsTheServedMimeType() {
        let type = ProgressiveAssetLoader.contentType(mimeType: "video/quicktime", remoteURL: remote)
        XCTAssertEqual(type, "com.apple.quicktime-movie")
    }

    func test_contentType_withoutMime_fallsBackOnTheExtension_thenOnMPEG4() {
        let mov = URL(string: "https://gate.meeshy.test/f/clip.mov")!
        let bare = URL(string: "https://gate.meeshy.test/f/abcdef")!

        XCTAssertEqual(ProgressiveAssetLoader.contentType(mimeType: nil, remoteURL: mov), "com.apple.quicktime-movie")
        XCTAssertEqual(ProgressiveAssetLoader.contentType(mimeType: "application/octet-stream", remoteURL: bare), "public.mpeg-4")
    }

    func test_cachedOrLocalVideo_isPlayedFromTheFile() throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("local-\(UUID().uuidString).mp4")
        try Data([0, 1, 2]).write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }

        let asset = CacheCoordinator.videoPlaybackAsset(for: file, startsTransfer: false)

        XCTAssertFalse(asset is ProgressiveURLAsset)
        XCTAssertEqual(asset.url, file)
    }
}
