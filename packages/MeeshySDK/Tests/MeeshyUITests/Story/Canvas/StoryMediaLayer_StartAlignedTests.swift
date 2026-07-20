import XCTest
import UIKit
import AVFoundation
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// WS3.3 — `startAlignedIfActive()` is the thin public seam routing a canvas
/// « GO » through the single drift-aware start path. It must be a NO-OP unless
/// the layer's `isPlaybackActive` gate is raised (slide past content-ready), and
/// it must (re)start an active layer through `alignToTimelineThenPlay()`.
///
/// `AVPlayer.rate` is the deterministic marker for a local `file://` URL (it
/// reflects the requested rate regardless of decodability) — same approach as
/// `StoryMediaLayer_ForegroundResolverTests`.
@MainActor
final class StoryMediaLayer_StartAlignedTests: XCTestCase {

    private func makeGeometry() -> CanvasGeometry {
        CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
    }

    private func writeTempVideo() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("start-aligned-\(UUID().uuidString).mp4")
        try Data([0x00, 0x00, 0x00, 0x18]).write(to: url)
        return url
    }

    private func makeConfiguredVideoLayer(playbackActive: Bool) throws -> StoryMediaLayer {
        let fileURL = try writeTempVideo()
        let media = StoryMediaObject(id: "sa-\(UUID().uuidString)", postMediaId: "post-vid",
                                     kind: .video, aspectRatio: 1.0)
        let layer = StoryMediaLayer()
        layer.isPlaybackActive = playbackActive
        layer.configure(with: media, geometry: makeGeometry(),
                        mode: .play, resolver: { _ in fileURL })
        return layer
    }

    /// Not playback-active: the layer stayed paused at attach (no GO), and
    /// `startAlignedIfActive()` must leave it paused.
    func test_startAlignedIfActive_noOpWhenNotPlaybackActive() throws {
        let layer = try makeConfiguredVideoLayer(playbackActive: false)
        XCTAssertEqual(layer.avPlayer?.rate, 0,
                       "A foreground video must stay paused before the canvas GO")
        layer.startAlignedIfActive()
        XCTAssertEqual(layer.avPlayer?.rate, 0,
                       "startAlignedIfActive must be a no-op when not playback-active")
    }

    /// Playback-active: `configure` already started it via the gated path; pause
    /// to prove `startAlignedIfActive()` re-drives it through the aligned start.
    func test_startAlignedIfActive_startsWhenPlaybackActive() throws {
        let layer = try makeConfiguredVideoLayer(playbackActive: true)
        layer.avPlayer?.pause()
        XCTAssertEqual(layer.avPlayer?.rate, 0)
        layer.startAlignedIfActive()
        XCTAssertEqual(layer.avPlayer?.rate, 1,
                       "startAlignedIfActive must (re)start an active foreground video")
    }

    /// No attached player (URL never resolved) — must not crash and stays a no-op.
    func test_startAlignedIfActive_noPlayer_isSafe() {
        let layer = StoryMediaLayer()
        layer.isPlaybackActive = true
        layer.startAlignedIfActive()
        XCTAssertNil(layer.avPlayer,
                     "startAlignedIfActive on a layer with no player must be a safe no-op")
    }

    // MARK: Drift-seek decision (F4)

    /// A playhead PAST the 0.30s drift threshold must trigger the seek path so a
    /// foreground video that opened at `t>0` is recaled in phase with the slide.
    func test_shouldSeekToAlign_seeksWhenDriftExceedsThreshold() {
        XCTAssertTrue(StoryMediaLayer.shouldSeekToAlign(current: 0, target: 5.0),
                      "A 5s gap is well past the 0.30s drift seuil — the aligned start must seek")
    }

    /// A drift WITHIN the threshold (a resume-in-place / already-aligned start)
    /// must NOT seek, so a long-press resume never jumps.
    func test_shouldSeekToAlign_resumesInPlaceWithinThreshold() {
        XCTAssertFalse(StoryMediaLayer.shouldSeekToAlign(current: 5.0, target: 5.1),
                       "A 0.1s gap is within the 0.30s seuil — resume in place, no seek")
    }

    func test_shouldSeekToAlign_ignoresNonFinite() {
        XCTAssertFalse(StoryMediaLayer.shouldSeekToAlign(current: .nan, target: 5.0))
        XCTAssertFalse(StoryMediaLayer.shouldSeekToAlign(current: 0, target: .infinity))
    }

    /// Behavioral end-to-end: a playback-active layer whose `slidePlayheadSeconds`
    /// is set PAST the drift threshold, then started via the aligned seam, both
    /// (a) plays (rate 1) and (b) the seek TRIGGER fires for that config. Real
    /// `AVPlayer` seek-position movement is not observable on a non-decodable
    /// fixture mp4, so the seek path is asserted via the pure decision the start
    /// uses — the smallest available seam (per F4).
    func test_startAlignedIfActive_pastDriftThreshold_seeksAndPlays() throws {
        let layer = try makeConfiguredVideoLayer(playbackActive: true)
        layer.avPlayer?.pause()
        layer.slidePlayheadSeconds = 5.0   // far past the 0.30s drift threshold
        layer.startAlignedIfActive()
        XCTAssertEqual(layer.avPlayer?.rate, 1,
                       "An aligned start past the drift seuil must (re)start playback")
        // The target the start path computes for this config: max(0, playhead − startTime).
        let target = max(0, layer.slidePlayheadSeconds)
        XCTAssertTrue(StoryMediaLayer.shouldSeekToAlign(current: 0, target: target),
                      "The drift trigger must fire for a playhead 5s past a freshly-loaded (t≈0) player")
    }
}
