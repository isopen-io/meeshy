import XCTest
import UIKit
import AVFoundation
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// RC4.1 — `StoryMediaLayer` must resolve a foreground media URL through the
/// reader's `postMediaURLResolver` (published story / composer preview) and
/// fall back to `media.mediaURL` (fixtures / composer edition).
///
/// Before the fix the layer read `media.mediaURL` directly — but a published
/// foreground `StoryMediaObject` never carries `mediaURL` (the URL lives on
/// `StoryItem.media`, reachable only via the resolver), so foreground media
/// stayed invisible while only the full-screen background rendered.
@MainActor
final class StoryMediaLayer_ForegroundResolverTests: XCTestCase {

    private func makeGeometry() -> CanvasGeometry {
        CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
    }

    /// Writes a 4×4 PNG to a temp `file://` URL so the synchronous decode
    /// path in `configureImage` has real bytes to stamp into `contents`.
    private func writeTempPNG(_ color: UIColor) throws -> URL {
        let size = CGSize(width: 4, height: 4)
        let image = UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
        let data = try XCTUnwrap(image.pngData())
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("fg-resolver-\(UUID().uuidString).png")
        try data.write(to: url, options: .atomic)
        return url
    }

    /// Writes a placeholder `file://` video. `AVPlayer.rate` reflects the
    /// requested rate for a local URL regardless of decodability, so this is
    /// enough to assert the play/pause gate deterministically — same approach
    /// as `StoryBackgroundLayerVideoTests`.
    private func writeTempVideo() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("fg-video-\(UUID().uuidString).mp4")
        try Data([0x00, 0x00, 0x00, 0x18]).write(to: url)
        return url
    }

    func test_configure_foregroundImageWithResolver_setsContents() throws {
        let fileURL = try writeTempPNG(.red)
        let media = StoryMediaObject(id: "m1", postMediaId: "post-1",
                                     kind: .image, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        let resolver: @Sendable (String) -> URL? = { id in
            id == "post-1" ? fileURL : nil
        }
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .play, resolver: resolver)
        XCTAssertNotNil(layer.contents,
                        "A resolver-provided file URL must populate layer contents")
    }

    func test_configure_noResolver_fallsBackToMediaURL() throws {
        let fileURL = try writeTempPNG(.green)
        let media = StoryMediaObject(id: "m2", postMediaId: "",
                                     mediaURL: fileURL.absoluteString,
                                     kind: .image, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        layer.configure(with: media, geometry: makeGeometry(), mode: .play)
        XCTAssertNotNil(layer.contents,
                        "With no resolver the layer must fall back to media.mediaURL")
    }

    func test_configure_resolverWins_overMediaURL() throws {
        let resolverURL = try writeTempPNG(.blue)
        // `mediaURL` points nowhere usable; the resolver provides the real file.
        let media = StoryMediaObject(id: "m3", postMediaId: "post-3",
                                     mediaURL: "https://cdn.invalid.test/missing.jpg",
                                     kind: .image, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        let resolver: @Sendable (String) -> URL? = { id in
            id == "post-3" ? resolverURL : nil
        }
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .play, resolver: resolver)
        XCTAssertNotNil(layer.contents,
                        "The resolver must take priority over media.mediaURL")
    }

    func test_configure_foregroundVideoWithResolver_attachesAVPlayerLayer() {
        let media = StoryMediaObject(id: "v1", postMediaId: "post-vid",
                                     kind: .video, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        let resolver: @Sendable (String) -> URL? = { id in
            id == "post-vid" ? URL(string: "https://cdn.example.test/clip.mp4") : nil
        }
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .play, resolver: resolver)
        XCTAssertNotNil(layer.avPlayer,
                        "A resolved video URL must build an AVPlayer")
        XCTAssertNotNil(layer.avPlayerLayer,
                        "A resolved video URL must attach an AVPlayerLayer")
    }

    func test_configure_videoUnresolved_buildsNoPlayer() {
        let media = StoryMediaObject(id: "v2", postMediaId: "missing",
                                     kind: .video, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .play, resolver: { _ in nil })
        XCTAssertNil(layer.avPlayer,
                     "An unresolvable video URL must not build a player")
    }

    /// Reader (`.play`) — a foreground video is a timeline component: it plays
    /// exactly ONCE then stops (it must NOT loop like the background video).
    /// `actionAtItemEnd == .pause` is the deterministic marker that the loop
    /// path was not armed; the end-of-item observer then hides the layer.
    func test_configure_foregroundVideoPlayMode_doesNotLoop() {
        let media = StoryMediaObject(id: "v3", postMediaId: "post-vid",
                                     kind: .video, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        let resolver: @Sendable (String) -> URL? = { id in
            id == "post-vid" ? URL(string: "https://cdn.example.test/clip.mp4") : nil
        }
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .play, resolver: resolver)
        XCTAssertEqual(layer.avPlayer?.actionAtItemEnd, .pause,
                       "A foreground video in .play must play once (no loop)")
    }

    /// The edit-mode playback opt-in defaults OFF on a bare layer — only the
    /// composer canvas flips it. Guards against an off-screen prefetcher (also
    /// `.edit`) starting playback.
    func test_playsInEditMode_defaultsFalse() {
        XCTAssertFalse(StoryMediaLayer().playsInEditMode)
    }

    /// The synchronized-start gate defaults OFF — a foreground video must NOT
    /// begin the instant its bytes resolve.
    func test_isPlaybackActive_defaultsFalse() {
        XCTAssertFalse(StoryMediaLayer().isPlaybackActive)
    }

    /// The timeline-alignment playhead defaults to 0 (slide origin).
    func test_slidePlayheadSeconds_defaultsZero() {
        XCTAssertEqual(StoryMediaLayer().slidePlayheadSeconds, 0, accuracy: 0.0001)
    }

    /// Timeline alignment must not break the gated start: a foreground video that
    /// resolves while the playhead is already advanced (late arrival / open at
    /// t>0) still starts (`rate == 1`). The seek itself is best-effort — this
    /// pins that `alignToTimelineThenPlay()` always reaches `play()`.
    func test_alignToTimeline_playsWhenPlaybackActiveWithAdvancedPlayhead() throws {
        let fileURL = try writeTempVideo()
        let media = StoryMediaObject(id: "v8", postMediaId: "post-vid",
                                     kind: .video, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        layer.slidePlayheadSeconds = 3.0   // playhead avancé (arrivée tardive)
        layer.isPlaybackActive = true
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .play, resolver: { _ in fileURL })
        XCTAssertEqual(layer.avPlayer?.rate, 1,
                       "A late-arriving foreground video must still start (timeline-aligned)")
    }

    /// Reader (`.play`) — a foreground video must NOT start at attach. It waits
    /// for the canvas to raise `isPlaybackActive` at the slide « GO »
    /// (content-ready) so it begins in phase with the background video + audio,
    /// instead of running ahead the moment its URL resolves (start desync,
    /// user 2026-06-24). `rate` is the deterministic marker — same approach as
    /// `StoryBackgroundLayerVideoTests`.
    func test_configure_foregroundVideoPlayMode_doesNotStartUntilPlaybackActive() throws {
        let fileURL = try writeTempVideo()
        let media = StoryMediaObject(id: "v5", postMediaId: "post-vid",
                                     kind: .video, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        let resolver: @Sendable (String) -> URL? = { id in
            id == "post-vid" ? fileURL : nil
        }
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .play, resolver: resolver)
        XCTAssertEqual(layer.avPlayer?.rate, 0,
                       "A foreground video must stay paused at attach until the canvas GO (isPlaybackActive)")

        layer.isPlaybackActive = true
        XCTAssertEqual(layer.avPlayer?.rate, 1,
                       "Raising isPlaybackActive must start the foreground video in sync with the background")
    }

    /// A video whose bytes land AFTER the GO already fired — the canvas raises
    /// `isPlaybackActive` on the layer first, then `configure` attaches the
    /// player, which must start immediately (no second GO needed).
    func test_configure_foregroundVideo_playbackActiveBeforeAttach_startsImmediately() throws {
        let fileURL = try writeTempVideo()
        let media = StoryMediaObject(id: "v6", postMediaId: "post-vid",
                                     kind: .video, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        layer.isPlaybackActive = true   // canvas already past content-ready
        let resolver: @Sendable (String) -> URL? = { id in
            id == "post-vid" ? fileURL : nil
        }
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .play, resolver: resolver)
        XCTAssertEqual(layer.avPlayer?.rate, 1,
                       "A foreground video attaching after the GO must start at once")
    }

    /// Pausing the canvas drops `isPlaybackActive` — a playing foreground video
    /// must stop, in phase with the background pause.
    func test_isPlaybackActive_falseAfterActive_pausesForegroundVideo() throws {
        let fileURL = try writeTempVideo()
        let media = StoryMediaObject(id: "v7", postMediaId: "post-vid",
                                     kind: .video, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        layer.isPlaybackActive = true
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .play, resolver: { _ in fileURL })
        XCTAssertEqual(layer.avPlayer?.rate, 1)
        layer.isPlaybackActive = false
        XCTAssertEqual(layer.avPlayer?.rate, 0,
                       "Lowering isPlaybackActive must pause the foreground video")
    }

    /// P2 — another user's story: the resolver misses (payload `media[]` lacks
    /// the referenced `postMediaId`, or a repost / orphan object) and the object
    /// still carries the AUTHOR's local `file://` edition path. That path never
    /// exists on the viewer's device, so the foreground video must build NO
    /// player instead of wiring an AVPlayer to a dead file.
    func test_configure_resolverMisses_deadAuthorFileURL_videoBuildsNoPlayer() {
        let deadAuthorPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("author-sandbox-\(UUID().uuidString)/clip.mp4")
        let media = StoryMediaObject(id: "v-dead", postMediaId: "post-vid",
                                     mediaURL: deadAuthorPath.absoluteString,
                                     kind: .video, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .play, resolver: { _ in nil })
        XCTAssertNil(layer.avPlayer,
                     "A dead author file:// must not build a player when the resolver misses")
    }

    /// P2 (image) — same scenario for a foreground image: the dead author
    /// `file://` must not populate contents (no wasted decode of a missing file).
    func test_configure_resolverMisses_deadAuthorFileURL_imageStaysUnpopulated() {
        let deadAuthorPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("author-sandbox-\(UUID().uuidString)/photo.jpg")
        let media = StoryMediaObject(id: "i-dead", postMediaId: "post-img",
                                     mediaURL: deadAuthorPath.absoluteString,
                                     kind: .image, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .play, resolver: { _ in nil })
        XCTAssertNil(layer.contents,
                     "A dead author file:// must not populate contents when the resolver misses")
    }

    /// Composer (`.edit`) — the foreground video loops for the live preview,
    /// like the background. `actionAtItemEnd == .none` marks the loop path.
    func test_configure_foregroundVideoEditMode_loops() {
        let media = StoryMediaObject(id: "v4", postMediaId: "post-vid",
                                     kind: .video, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        let resolver: @Sendable (String) -> URL? = { id in
            id == "post-vid" ? URL(string: "https://cdn.example.test/clip.mp4") : nil
        }
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .edit, resolver: resolver)
        XCTAssertEqual(layer.avPlayer?.actionAtItemEnd, AVPlayer.ActionAtItemEnd.none,
                       "A foreground video in .edit must loop for live preview")
    }
}
