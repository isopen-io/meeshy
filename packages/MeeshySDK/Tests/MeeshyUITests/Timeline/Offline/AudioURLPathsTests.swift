import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// P0 data-loss regression suite (audio URL persistence).
///
/// Before this fix, `TimelineViewModel+OfflinePublish.buildOfflineQueueItem`
/// passed `audioURLPaths: [:]` unconditionally — every audio clip URL in
/// `pendingMediaURLs` was silently dropped. On crash + restart, the queued
/// item could not locate its audio assets and the upload failed.
///
/// These tests pin the contract: audio clip URLs land in `audioURLPaths`,
/// video / image clip URLs land in `mediaURLPaths`, and the two maps stay
/// disjoint regardless of project composition.
@MainActor
final class AudioURLPathsTests: XCTestCase {

    // MARK: - Factories (audio + mixed projects)

    /// Project with exactly one audio clip whose id == `audioId`.
    private func projectWithAudioClip(audioId: String) -> TimelineProject {
        let audio = StoryAudioPlayerObject(id: audioId, postMediaId: audioId)
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [],
            audioPlayerObjects: [audio],
            textObjects: [],
            clipTransitions: []
        )
    }

    /// Project mixing one video (`videoId`) and one audio (`audioId`) clip.
    private func projectWithVideoAndAudio(videoId: String, audioId: String) -> TimelineProject {
        var video = StoryMediaObject(id: videoId, postMediaId: videoId, kind: .video, aspectRatio: 1.0)
        video.startTime = 0
        video.duration = 5
        let audio = StoryAudioPlayerObject(id: audioId, postMediaId: audioId)
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [video],
            audioPlayerObjects: [audio],
            textObjects: [],
            clipTransitions: []
        )
    }

    private func makeViewModel() -> TimelineViewModel {
        TimelineViewModel(
            engine: MockStoryTimelineEngine(),
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.06)
        )
    }

    // MARK: - Tests

    func test_buildOfflineQueueItem_audioClips_appearsInAudioURLPaths() async {
        let audioId = "audio-1"
        let audioURL = URL(fileURLWithPath: "/tmp/voice-note.m4a")
        let project = projectWithAudioClip(audioId: audioId)
        let network = MockNetworkMonitor()
        network.isOnline = false
        let queue = MockOfflineQueue()

        let vm = makeViewModel()
        vm.bootstrap(project: project, mediaURLs: [audioId: audioURL], images: [:])
        await vm.awaitConfigured()

        await vm.handlePublishTap(visibility: .public,
                                  networkMonitor: network,
                                  offlineQueue: queue)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.count, 1, "Offline publish must enqueue exactly one item")
        guard let item = items.first else { return }
        XCTAssertEqual(item.audioURLPaths[audioId], audioURL.path,
                       "Audio clip URL must be persisted in audioURLPaths (data-loss regression)")
        XCTAssertTrue(item.mediaURLPaths.isEmpty,
                      "Audio-only project must produce an empty mediaURLPaths map")
    }

    func test_buildOfflineQueueItem_videoClips_notInAudioPaths() async {
        let videoId = "video-1"
        let videoURL = URL(fileURLWithPath: "/tmp/clip.mp4")
        var video = StoryMediaObject(id: videoId, postMediaId: videoId, kind: .video, aspectRatio: 1.0)
        video.startTime = 0
        video.duration = 5
        let project = TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [video],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
        let network = MockNetworkMonitor()
        network.isOnline = false
        let queue = MockOfflineQueue()

        let vm = makeViewModel()
        vm.bootstrap(project: project, mediaURLs: [videoId: videoURL], images: [:])
        await vm.awaitConfigured()

        await vm.handlePublishTap(visibility: .public,
                                  networkMonitor: network,
                                  offlineQueue: queue)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.count, 1)
        guard let item = items.first else { return }
        XCTAssertEqual(item.mediaURLPaths[videoId], videoURL.path,
                       "Video clip URL must be in mediaURLPaths")
        XCTAssertNil(item.audioURLPaths[videoId],
                     "Video URL must NOT leak into audioURLPaths")
        XCTAssertTrue(item.audioURLPaths.isEmpty,
                      "Video-only project must produce an empty audioURLPaths map")
    }

    func test_buildOfflineQueueItem_mixedProject_separatesCorrectly() async {
        let videoId = "video-1"
        let audioId = "audio-1"
        let videoURL = URL(fileURLWithPath: "/tmp/clip.mp4")
        let audioURL = URL(fileURLWithPath: "/tmp/voice-note.m4a")
        let project = projectWithVideoAndAudio(videoId: videoId, audioId: audioId)
        let network = MockNetworkMonitor()
        network.isOnline = false
        let queue = MockOfflineQueue()

        let vm = makeViewModel()
        vm.bootstrap(project: project,
                     mediaURLs: [videoId: videoURL, audioId: audioURL],
                     images: [:])
        await vm.awaitConfigured()

        await vm.handlePublishTap(visibility: .friends,
                                  networkMonitor: network,
                                  offlineQueue: queue)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.count, 1)
        guard let item = items.first else { return }

        XCTAssertEqual(item.mediaURLPaths, [videoId: videoURL.path],
                       "Mixed project: mediaURLPaths must contain ONLY the video clip")
        XCTAssertEqual(item.audioURLPaths, [audioId: audioURL.path],
                       "Mixed project: audioURLPaths must contain ONLY the audio clip")

        let mediaKeys = Set(item.mediaURLPaths.keys)
        let audioKeys = Set(item.audioURLPaths.keys)
        XCTAssertTrue(mediaKeys.isDisjoint(with: audioKeys),
                      "mediaURLPaths and audioURLPaths must be disjoint by clip id")
    }
}
