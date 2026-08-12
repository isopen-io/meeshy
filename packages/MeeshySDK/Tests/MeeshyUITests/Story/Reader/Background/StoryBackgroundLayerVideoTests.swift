// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerVideoTests.swift
import XCTest
import AVFoundation
@testable import MeeshyUI

@MainActor
final class StoryBackgroundLayerVideoTests: XCTestCase {
    func test_configure_video_attachesAVPlayerLayer() throws {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let testURL = Bundle(for: type(of: self)).url(forResource: "test-1s", withExtension: "mp4")
        guard let url = testURL else {
            throw XCTSkip("test-1s.mp4 fixture not bundled — add later")
        }
        let resolver: (String) -> URL? = { _ in url }
        layer.configure(kind: .video(postMediaId: "vid-1", looping: true, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geom,
                        resolver: resolver, imageCache: nil)
        let avLayer = layer.sublayers?.first { $0 is AVPlayerLayer } as? AVPlayerLayer
        XCTAssertNotNil(avLayer)
        XCTAssertEqual(avLayer?.player?.isMuted, true)
    }

    /// Régression 2026-05-20 (`f917d30b94`) corrigée 2026-06-20 : sur cache-miss,
    /// le fond vidéo distant DOIT être streamé immédiatement — `AVPlayer` attaché
    /// SYNCHRONEMENT à l'URL distante (progressive/range loading, 1ère frame en
    /// ~centaines de ms) — et NON bloqué sur un download intégral avant attache.
    /// Le download bloquant rendait les grosses stories injouables sur réseau
    /// device : la slide s'auto-avançait (failsafe 2s) avant la fin du download,
    /// la vidéo n'apparaissait jamais (« marche en simulateur, pas sur device »).
    /// Avant le fix, `avPlayer` était nil juste après `configure` (attache
    /// différée dans un `Task { await download }`) → ce test échouait.
    func test_configure_video_cacheMiss_streamsRemoteURLSynchronously() {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        // `.invalid` TLD : ne résout jamais → le cache-populate détaché échoue
        // instantanément sans trafic réseau réel ; l'attache du player est
        // synchrone et n'a pas besoin que l'URL soit jouable.
        let remote = URL(string: "https://media.example.invalid/api/v1/attachments/file/clip-\(UUID().uuidString).mov")!
        let resolver: (String) -> URL? = { _ in remote }
        layer.configure(kind: .video(postMediaId: "vid-remote", looping: false, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geom,
                        resolver: resolver, imageCache: nil)
        XCTAssertNotNil(layer.avPlayer,
                        "cache-miss : le player doit être attaché IMMÉDIATEMENT (streaming), pas après un download")
        let assetURL = (layer.avPlayer?.currentItem?.asset as? AVURLAsset)?.url
        XCTAssertEqual(assetURL, remote,
                       "le player doit streamer l'URL DISTANTE, pas attendre un fichier local pré-téléchargé")
    }

    func test_handleAppLifecycle_pausesAndResumes() throws {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let testURL = Bundle(for: type(of: self)).url(forResource: "test-1s", withExtension: "mp4")
        guard let url = testURL else {
            throw XCTSkip("test-1s.mp4 fixture not bundled — add later")
        }
        let resolver: (String) -> URL? = { _ in url }
        layer.configure(kind: .video(postMediaId: "vid-1", looping: true, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geom,
                        resolver: resolver, imageCache: nil)
        layer.handleAppLifecycle(active: false)
        // Player rate should be 0 after deactivation
        let avLayer = layer.sublayers?.first { $0 is AVPlayerLayer } as? AVPlayerLayer
        XCTAssertEqual(avLayer?.player?.rate, 0)
    }

    /// With no explicit override the background fills the canvas regardless of
    /// the video's orientation. The orientation-based auto-pick was removed on
    /// 2026-05-29 (user feedback): a landscape background flipped to letterbox
    /// once its bitmap loaded async, hiding the background behind its own bars.
    /// Fit/fill is now driven exclusively by the double-tap override.
    func test_resolveVideoGravity_landscapeVideo_noOverride_returnsResizeAspectFill() {
        let canvas = CGSize(width: 1080, height: 1920)
        let landscape = CGSize(width: 1920, height: 1080)
        let gravity = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: landscape, canvasSize: canvas, override: nil)
        XCTAssertEqual(gravity, .resizeAspectFill)
    }

    func test_resolveVideoGravity_portraitVideo_returnsResizeAspectFill() {
        let canvas = CGSize(width: 1080, height: 1920)
        let portrait = CGSize(width: 1080, height: 1920)
        let gravity = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: portrait, canvasSize: canvas, override: nil)
        XCTAssertEqual(gravity, .resizeAspectFill)
    }

    func test_resolveVideoGravity_overrideFit_returnsResizeAspect() {
        let canvas = CGSize(width: 1080, height: 1920)
        let portrait = CGSize(width: 1080, height: 1920)
        let gravity = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: portrait, canvasSize: canvas, override: "fit")
        XCTAssertEqual(gravity, .resizeAspect)
    }

    func test_resolveVideoGravity_overrideFill_returnsResizeAspectFill() {
        let canvas = CGSize(width: 1080, height: 1920)
        let landscape = CGSize(width: 1920, height: 1080)
        let gravity = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: landscape, canvasSize: canvas, override: "fill")
        XCTAssertEqual(gravity, .resizeAspectFill)
    }

    /// Un attach de player (chaud comme tardif après download) DOIT notifier
    /// `onPlayerAttached` : c'est le signal qui permet au canvas de ré-armer
    /// l'observation de readiness quand le fichier vidéo arrive APRÈS
    /// l'évaluation initiale (bug 2026-06-11 : thumbnail figé, progression
    /// sans frames ni audio). L'attach est synchrone et ne dépend pas de la
    /// validité du contenu — un fichier temporaire suffit.
    func test_attachBackgroundPlayer_firesOnPlayerAttached() throws {
        let layer = StoryBackgroundLayer()
        let url = try makeTemporaryFileURL()
        var attachedCount = 0
        layer.onPlayerAttached = { attachedCount += 1 }
        layer.attachBackgroundPlayer(url: url, looping: true, mute: true)
        XCTAssertEqual(attachedCount, 1)
        XCTAssertNotNil(layer.avPlayer)
    }

    func test_attachBackgroundPlayer_nonLooping_firesOnPlayerAttached() throws {
        let layer = StoryBackgroundLayer()
        let url = try makeTemporaryFileURL()
        var attachedCount = 0
        layer.onPlayerAttached = { attachedCount += 1 }
        layer.attachBackgroundPlayer(url: url, looping: false, mute: false)
        XCTAssertEqual(attachedCount, 1)
    }

    /// Invariant « stop à la sortie » : un retour foreground ne doit JAMAIS
    /// relancer un player dont la lecture n'est pas autorisée
    /// (`isPlaybackActive == false` — canvas détaché, prefetcher, viewer
    /// fermé). Bug user 2026-06-11 : « quand j'ouvre l'application, la story
    /// qui jouait en dernier continue à jouer ».
    func test_handleAppLifecycle_active_doesNotPlayWhenPlaybackInactive() throws {
        let layer = StoryBackgroundLayer()
        let url = try makeTemporaryFileURL()
        layer.attachBackgroundPlayer(url: url, looping: false, mute: true)
        XCTAssertEqual(layer.isPlaybackActive, false)
        layer.handleAppLifecycle(active: true)
        XCTAssertEqual(layer.avPlayer?.rate, 0,
                       "foreground ne doit pas relancer un player non autorisé")
    }

    func test_handleAppLifecycle_active_resumesWhenPlaybackActive() throws {
        let layer = StoryBackgroundLayer()
        let url = try makeTemporaryFileURL()
        layer.attachBackgroundPlayer(url: url, looping: false, mute: true)
        layer.isPlaybackActive = true
        layer.avPlayer?.pause()
        layer.handleAppLifecycle(active: true)
        XCTAssertEqual(layer.avPlayer?.rate, 1,
                       "foreground doit reprendre un player explicitement autorisé")
    }

    private func makeTemporaryFileURL() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("bg-attach-\(UUID().uuidString).mp4")
        try Data([0x00, 0x00, 0x00, 0x18]).write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }
}
