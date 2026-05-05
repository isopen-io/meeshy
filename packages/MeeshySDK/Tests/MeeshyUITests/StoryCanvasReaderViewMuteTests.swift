import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Tests for `StoryCanvasReaderView`'s `mute` parameter.
///
/// `ReaderState` is `@StateObject private` inside `StoryCanvasReaderView`, so we cannot
/// inspect `AVQueuePlayer.isMuted` directly. Instead we observe the **side effect** of
/// `startBackgroundAudio` via `StoryMediaCoordinator.shared.backgroundAudioSourceId`,
/// which is set by `ReaderState.startBackgroundAudio` when audio activation actually
/// proceeds (and skipped when `mute=true`).
@MainActor
final class StoryCanvasReaderViewMuteTests: XCTestCase {

    override func setUp() async throws {
        try await super.setUp()
        // Reset coordinator state between tests.
        StoryMediaCoordinator.shared.backgroundAudioSourceId = nil
    }

    override func tearDown() async throws {
        StoryMediaCoordinator.shared.backgroundAudioSourceId = nil
        try await super.tearDown()
    }

    func test_mute_true_skipsBackgroundAudioActivation() async {
        let story = Self.makeStoryWithBackgroundAudio()

        let view = StoryCanvasReaderView(story: story, mute: true)
        let host = UIHostingController(rootView: view)
        host.view.frame = CGRect(x: 0, y: 0, width: 360, height: 640)
        host.view.layoutIfNeeded()
        // Let SwiftUI's `.onAppear` propagate.
        await Task.yield()
        await Task.yield()

        XCTAssertNil(StoryMediaCoordinator.shared.backgroundAudioSourceId,
                     "mute=true must NOT activate background audio")
    }

    func test_mute_false_activatesBackgroundAudio() async {
        let story = Self.makeStoryWithBackgroundAudio()

        let view = StoryCanvasReaderView(story: story, mute: false)
        let host = UIHostingController(rootView: view)
        host.view.frame = CGRect(x: 0, y: 0, width: 360, height: 640)
        host.view.layoutIfNeeded()
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(StoryMediaCoordinator.shared.backgroundAudioSourceId,
                       "media-bg-1",
                       "mute=false must activate background audio for the resolved media id")
    }

    // MARK: - Fixtures

    /// Builds a `StoryItem` whose `storyEffects.audioPlayerObjects` contains a single
    /// background audio entry that resolves to a real-looking URL via `story.media`.
    /// `MeeshyConfig.resolveMediaURL` only requires a non-empty string to return a URL,
    /// so we use an `https://` scheme to keep the test hermetic.
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
