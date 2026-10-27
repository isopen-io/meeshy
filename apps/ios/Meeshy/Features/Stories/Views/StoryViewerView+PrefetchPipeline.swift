import SwiftUI
import MeeshySDK
import MeeshyUI

/// What the reader hands its playback pipeline (`StoryPlaybackPipeline`, #13135).
extension StoryViewerView {

    var slideTimer: StoryReaderTimerController { playback.timer }

    /// Slide duration used to arm the gated timer (6 s when not computed yet).
    var currentSlideDuration: TimeInterval {
        computedStoryDuration > 0 ? computedStoryDuration : StorySlideDuration.fallback
    }

    /// `pipeline` lets the integration tests drive a dedicated pipeline: a
    /// `View` outside the SwiftUI graph does not retain its `@State`.
    func installPrefetchPipelineIfNeeded(_ pipeline: StoryPlaybackPipeline? = nil) {
        (pipeline ?? playback).install(
            onProgress: { [self] in progressClock.publish($0) },
            onFirstTick: { [self] in prepareNeighborWindow(pipeline) },
            onCompletion: { [self] in storyDidReachItsEnd() }
        )
    }

    /// Re-arms the prefetch window and the gated clock on the visible slide.
    /// The Prism chain is `ReaderPrism.resolve(for:)` (#11832); the warm items
    /// are the slides an author swipe lands on (#10348).
    /// - Parameters: `paused` / `currentIndex` override `shouldPauseTimer` /
    ///   `currentStoryIndex` for the same test reason as `pipeline`.
    func refreshPrefetchWindowAndTimer(_ pipeline: StoryPlaybackPipeline? = nil,
                                       paused: Bool? = nil, currentIndex: Int? = nil) {
        let window = StoryPlaybackWindow(
            stories: currentGroup?.stories ?? [],
            index: currentIndex ?? currentStoryIndex,
            languages: ReaderPrism.resolve(for: AuthManager.shared.currentUser),
            mute: isGlobalMuted,
            duration: currentSlideDuration,
            warmItems: StoryNeighborWindow.authorSwipeLandings(from: currentGroupIndex, groups: storyGroupShapes)
                .map { story(at: $0) }
        )
        (pipeline ?? playback).refresh(window, paused: paused ?? shouldPauseTimer)
    }

    /// Prefetches every medium of `story`, then probes its foreground videos'
    /// audio tracks so the sound button is settled before the slide shows.
    @discardableResult
    func prefetchAllMedia(for story: StoryItem) -> Task<Void, Never> {
        playback.prefetch(story) { [self] in await probeVideoAudio(for: story) }
    }

    /// The visible slide first; its neighbours follow its first image.
    func prefetchCurrentGroup() {
        playback.interruptNeighbors()
        guard let story = currentStory else { return }
        prefetchAllMedia(for: story)
    }

    func prepareNeighborWindow(_ pipeline: StoryPlaybackPipeline? = nil) {
        guard groups.indices.contains(currentGroupIndex),
              groups[currentGroupIndex].stories.indices.contains(currentStoryIndex) else { return }
        (pipeline ?? playback).prepareNeighbors(
            at: StorySlidePosition(group: currentGroupIndex, slide: currentStoryIndex),
            groups: storyGroupShapes,
            story: { story(at: $0) }
        )
    }

    private var storyGroupShapes: [StoryGroupShape] {
        groups.map { StoryGroupShape(slideCount: $0.stories.count, entryIndex: entryIndex(of: $0)) }
    }

    private func story(at position: StorySlidePosition) -> StoryItem {
        groups[position.group].stories[position.slide]
    }
}
