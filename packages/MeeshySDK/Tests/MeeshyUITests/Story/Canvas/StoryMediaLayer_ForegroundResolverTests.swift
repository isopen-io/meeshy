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
        XCTAssertEqual(layer.avPlayer?.actionAtItemEnd, .none,
                       "A foreground video in .edit must loop for live preview")
    }
}
