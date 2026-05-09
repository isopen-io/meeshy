import Foundation
@testable import MeeshySDK

enum TimelineProjectFactory {

    static func emptyProject(slideId: String = "slide-1", duration: Float = 10) -> TimelineProject {
        TimelineProject(
            slideId: slideId,
            slideDuration: duration,
            mediaObjects: [],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }

    static func projectWithVideoClip(
        clipId: String = "clip-1",
        startTime: Float = 0,
        duration: Float = 5
    ) -> TimelineProject {
        var media = StoryMediaObject(id: clipId, postMediaId: clipId, kind: .video, aspectRatio: 1.0)
        media.startTime = Double(startTime)
        media.duration = Double(duration)
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [media],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }

    static func projectWithTwoContiguousClips() -> TimelineProject {
        var a = StoryMediaObject(id: "clip-a", postMediaId: "clip-a", kind: .video, aspectRatio: 1.0)
        a.startTime = 0
        a.duration = 4
        var b = StoryMediaObject(id: "clip-b", postMediaId: "clip-b", kind: .video, aspectRatio: 1.0)
        b.startTime = 4
        b.duration = 4
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 10,
            mediaObjects: [a, b],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }
}
