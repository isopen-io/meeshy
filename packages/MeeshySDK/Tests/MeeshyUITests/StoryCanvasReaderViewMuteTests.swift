import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Tests for `StoryReaderRepresentable`'s `mute` parameter.
///
/// Migrated from the legacy `StoryCanvasReaderView`-based test during Phase A4
/// reader migration. The new canvas passes mute through `StoryReaderContext` into
/// `StoryCanvasUIView.isAudioMuted`; we verify the struct captures the param
/// correctly and that the underlying `StoryCanvasUIView` reflects it after layout.
@MainActor
final class StoryCanvasReaderViewMuteTests: XCTestCase {

    func test_mute_true_storedOnRepresentable() {
        let story = Self.makeStoryWithBackgroundAudio()
        let rep = StoryReaderRepresentable(story: story, mute: true)
        XCTAssertTrue(rep.mute, "mute=true must be preserved on the representable")
    }

    func test_mute_false_storedOnRepresentable() {
        let story = Self.makeStoryWithBackgroundAudio()
        let rep = StoryReaderRepresentable(story: story, mute: false)
        XCTAssertFalse(rep.mute, "mute=false must be preserved on the representable")
    }

    func test_mute_true_propagatesToCanvasUIView() {
        let story = Self.makeStoryWithBackgroundAudio()
        let rep = StoryReaderRepresentable(story: story, mute: true)
        let host = UIHostingController(rootView: rep.frame(width: 360, height: 640))
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 360, height: 640))
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        host.view.layoutIfNeeded()

        let canvas = firstCanvasView(in: host.view)
        XCTAssertNotNil(canvas, "StoryCanvasUIView must be present after layout")
        XCTAssertTrue(canvas?.isAudioMuted ?? false,
                      "isAudioMuted must be true when mute=true is passed to StoryReaderRepresentable")
    }

    func test_mute_false_leavesCanvasUnmuted() {
        let story = Self.makeStoryWithBackgroundAudio()
        let rep = StoryReaderRepresentable(story: story, mute: false)
        let host = UIHostingController(rootView: rep.frame(width: 360, height: 640))
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 360, height: 640))
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        host.view.layoutIfNeeded()

        let canvas = firstCanvasView(in: host.view)
        XCTAssertNotNil(canvas, "StoryCanvasUIView must be present after layout")
        XCTAssertFalse(canvas?.isAudioMuted ?? true,
                       "isAudioMuted must be false when mute=false is passed to StoryReaderRepresentable")
    }

    // MARK: - Helpers

    private func firstCanvasView(in view: UIView) -> StoryCanvasUIView? {
        if let canvas = view as? StoryCanvasUIView { return canvas }
        for sub in view.subviews {
            if let found = firstCanvasView(in: sub) { return found }
        }
        return nil
    }

    private static func makeStoryWithBackgroundAudio() -> StoryItem {
        let mediaId = "media-bg-1"
        let bgAudio = StoryAudioPlayerObject(
            id: "audio-1",
            postMediaId: mediaId,
            placement: "background",
            x: 0.5, y: 0.5,
            volume: 0.5,
            waveformSamples: [],
            isBackground: true,
            startTime: Float(0),
            duration: Float(5),
            loop: true
        )
        let effects = StoryEffects(audioPlayerObjects: [bgAudio])
        let media = FeedMedia(
            id: mediaId,
            type: .audio,
            url: "https://cdn.example.test/audio.mp3",
            thumbnailColor: "4ECDC4",
            width: nil, height: nil, duration: 5
        )
        return StoryItem(
            id: "story-1",
            content: nil,
            media: [media],
            storyEffects: effects,
            createdAt: Date(),
            expiresAt: Date().addingTimeInterval(3600),
            repostOfId: nil,
            repostAuthorName: nil,
            isViewed: false,
            translations: nil,
            backgroundAudio: nil,
            reactionCount: 0,
            commentCount: 0
        )
    }
}
