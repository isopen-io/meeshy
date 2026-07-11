import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Lot E — les keyframes ajoutés (ClipInspector → « Ajouter un keyframe »)
/// étaient invisibles et non re-sélectionnables. Le résolveur les projette en
/// temps ABSOLU (début de clip + temps relatif) pour l'affichage sur lane.
@MainActor
final class KeyframeMarkerResolverTests: XCTestCase {

    func test_resolve_mediaKeyframes_projectToAbsoluteTime() {
        var media = StoryMediaObject(id: "m1", postMediaId: "m1", kind: .video, aspectRatio: 1)
        media.startTime = 2
        media.duration = 5
        media.keyframes = [
            StoryKeyframe(time: 0.5, x: 0.3, y: 0.3, scale: nil, opacity: nil, easing: .linear),
            StoryKeyframe(time: 2.0, x: 0.7, y: 0.7, scale: nil, opacity: nil, easing: .linear)
        ]
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [media], audioPlayerObjects: [],
                                      textObjects: [], clipTransitions: [])

        let markers = KeyframeMarkerResolver.resolve(project: project)

        XCTAssertEqual(markers.count, 2)
        XCTAssertEqual(markers[0].absoluteTime, 2.5, accuracy: 0.001)
        XCTAssertEqual(markers[1].absoluteTime, 4.0, accuracy: 0.001)
        XCTAssertTrue(markers.allSatisfy { $0.clipId == "m1" })
    }

    func test_resolve_textKeyframes_included() {
        var text = StoryTextObject(id: "t1", text: "Salut")
        text.startTime = 1
        text.keyframes = [StoryKeyframe(time: 1.0, x: nil, y: nil, scale: 1.4, opacity: nil, easing: .easeInOut)]
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [], audioPlayerObjects: [],
                                      textObjects: [text], clipTransitions: [])

        let markers = KeyframeMarkerResolver.resolve(project: project)

        XCTAssertEqual(markers.count, 1)
        XCTAssertEqual(markers[0].absoluteTime, 2.0, accuracy: 0.001)
    }

    func test_markersForLane_filtersByClip() {
        var a = StoryMediaObject(id: "a", postMediaId: "a", kind: .video, aspectRatio: 1)
        a.keyframes = [StoryKeyframe(time: 1, x: nil, y: nil, scale: nil, opacity: 0.5, easing: .linear)]
        var b = StoryTextObject(id: "b", text: "x")
        b.keyframes = [StoryKeyframe(time: 2, x: nil, y: nil, scale: nil, opacity: 0.5, easing: .linear)]
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [a], audioPlayerObjects: [],
                                      textObjects: [b], clipTransitions: [])
        let all = KeyframeMarkerResolver.resolve(project: project)

        XCTAssertEqual(KeyframeMarkerResolver.markers(for: ["b"], in: all).map(\.clipId), ["b"])
    }
}
