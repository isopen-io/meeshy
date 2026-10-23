import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// #9881 — les lecteurs de LECTURE lisent le transfert du cache au lieu
/// d'ouvrir leur propre flux à côté de lui.
///
/// - Une story vidéo distante s'attache UNE fois, sur un asset que seul le
///   chargeur du cache ouvre ; une reconfiguration ne remplace jamais l'élément
///   d'un lecteur qui joue (plus de bascule vers le fichier local en pleine
///   lecture).
/// - Une bulle en cours de téléchargement se joue dès la tête, mais seulement
///   quand ce téléchargement (déjà autorisé par la politique réseau) est lisible.
@MainActor
final class ProgressivePlaybackWiringTests: XCTestCase {

    private func makeGeometry() -> CanvasGeometry {
        CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
    }

    private func makeVideo(id: String = "post-\(UUID().uuidString.prefix(8))") -> StoryMediaObject {
        StoryMediaObject(id: "v-\(id)", postMediaId: id, kind: .video, aspectRatio: 1.0)
    }

    private func resolver(_ url: URL) -> @Sendable (String) -> URL? {
        { _ in url }
    }

    private func uncachedRemote() -> URL {
        URL(string: "https://cdn.progressive.meeshy.test/\(UUID().uuidString).mp4")!
    }

    func test_storyForegroundVideo_notOnDisk_readsTheCacheTransfer() {
        let layer = StoryMediaLayer()

        layer.configure(with: makeVideo(), geometry: makeGeometry(), mode: .play, resolver: resolver(uncachedRemote()))

        let asset = layer.avPlayer?.currentItem?.asset
        XCTAssertTrue(asset is ProgressiveURLAsset, "la story lit le fichier que le cache écrit, pas un second flux HTTPS")
    }

    func test_storyForegroundVideo_reconfigured_keepsThePlayingItem() {
        let layer = StoryMediaLayer()
        let media = makeVideo()
        let url = uncachedRemote()
        layer.configure(with: media, geometry: makeGeometry(), mode: .edit, resolver: resolver(url))
        let first = layer.avPlayer?.currentItem

        layer.configure(with: media, geometry: CanvasGeometry(renderSize: CGSize(width: 320, height: 568)), mode: .edit, resolver: resolver(url))

        XCTAssertNotNil(first)
        XCTAssertTrue(layer.avPlayer?.currentItem === first, "aucun replaceCurrentItem sur un lecteur qui lit déjà ce média")
    }

    func test_storyBackgroundVideo_notOnDisk_readsTheCacheTransfer() {
        let layer = StoryBackgroundLayer()
        let url = uncachedRemote()

        layer.attachBackgroundPlayer(url: url, looping: false, mute: true)

        XCTAssertTrue(layer.avPlayer?.currentItem?.asset is ProgressiveURLAsset)
        XCTAssertTrue(layer.attachedVideoAsset is ProgressiveURLAsset, "la taille naturelle se lit sur le MÊME asset, sans troisième accès réseau")
    }

    func test_bubbleDownloading_playsFromTheHead_onlyWhenTheTransferIsReadable() {
        let fileUrl = "https://gate.meeshy.me/api/v1/attachments/file/bubble.mp4"

        XCTAssertTrue(_InlineRenderer.playsWhileDownloading(fileUrl: fileUrl, hasReadableTransfer: { _ in true }))
        XCTAssertFalse(_InlineRenderer.playsWhileDownloading(fileUrl: fileUrl, hasReadableTransfer: { _ in false }))
    }

    func test_bubbleDownloading_asksForTheResolvedCacheKey() {
        var asked: [String] = []

        _ = _InlineRenderer.playsWhileDownloading(fileUrl: "https://gate.meeshy.me/api/v1/attachments/file/key.mp4") {
            asked.append($0)
            return false
        }

        XCTAssertEqual(asked, ["https://gate.meeshy.me/api/v1/attachments/file/key.mp4"])
    }

    /// #12027 — le plein écran passe au lecteur dès que le téléchargement est
    /// lisible, au lieu de garder l'écran d'attente jusqu'à la fin du fichier.
    func test_fullscreen_branchesOnPlaysNow_notOnReady() throws {
        let source = try String(contentsOf: Self.sourceURL("Media/MeeshyVideoPlayer+Renderers.swift"), encoding: .utf8)

        XCTAssertTrue(source.contains("player.availability.playsNow(fileUrl: player.attachment.fileUrl)"))
        XCTAssertFalse(source.contains("case .needsDownload, .downloading:\n                downloadOverlay"),
                       "un téléchargement lisible ne garde plus l'écran d'attente")
    }

    private static func sourceURL(_ relative: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI").appendingPathComponent(relative)
    }

    func test_bubbleWithoutReadableTransfer_leavesNoPlayer() {
        let manager = SharedAVPlayerManager.shared
        manager.stop()

        manager.load(urlString: uncachedRemote().absoluteString)

        XCTAssertNil(manager.player, "sans fichier ni téléchargement autorisé, aucun flux silencieux ne s'ouvre")
        manager.stop()
    }
}
