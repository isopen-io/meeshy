import XCTest
@testable import MeeshySDK

final class StoryModelsExtensionsTests: XCTestCase {
    // MARK: - StoryEasing

    func test_storyEasing_linear_returnsInputUnchanged() {
        XCTAssertEqual(StoryEasing.linear.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(0.25), 0.25, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(0.5), 0.5, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(0.75), 0.75, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_easeIn_isQuadratic() {
        XCTAssertEqual(StoryEasing.easeIn.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeIn.apply(0.5), 0.25, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeIn.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_easeOut_invertsEaseIn() {
        XCTAssertEqual(StoryEasing.easeOut.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeOut.apply(0.5), 0.75, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeOut.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_easeInOut_isSCurve() {
        XCTAssertEqual(StoryEasing.easeInOut.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeInOut.apply(0.5), 0.5, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeInOut.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_allEasings_areMonotonicOnUnitInterval() {
        for easing in [StoryEasing.linear, .easeIn, .easeOut, .easeInOut] {
            var previous: Float = -.infinity
            for step in stride(from: Float(0), through: Float(1), by: 0.05) {
                let current = easing.apply(step)
                XCTAssertGreaterThanOrEqual(current, previous,
                    "\(easing) is not monotonic at t=\(step)")
                previous = current
            }
        }
    }

    func test_storyEasing_codableRoundTrip_allCases() throws {
        for easing in [StoryEasing.linear, .easeIn, .easeOut, .easeInOut] {
            let data = try JSONEncoder().encode(easing)
            let decoded = try JSONDecoder().decode(StoryEasing.self, from: data)
            XCTAssertEqual(decoded, easing)
        }
    }

    // MARK: - StoryTransitionKind

    func test_storyTransitionKind_rawValues_matchSpec() {
        XCTAssertEqual(StoryTransitionKind.crossfade.rawValue, "crossfade")
        XCTAssertEqual(StoryTransitionKind.dissolve.rawValue, "dissolve")
    }

    func test_storyTransitionKind_codableRoundTrip_allCases() throws {
        for kind in StoryTransitionKind.allCases {
            let data = try JSONEncoder().encode(kind)
            let decoded = try JSONDecoder().decode(StoryTransitionKind.self, from: data)
            XCTAssertEqual(decoded, kind)
        }
    }

    // MARK: - StoryClipTransition

    func test_storyClipTransition_init_assignsProperties() {
        let t = StoryClipTransition(
            id: "tr-1",
            fromClipId: "clip-a",
            toClipId: "clip-b",
            kind: .crossfade,
            duration: 0.5,
            easing: .easeInOut
        )
        XCTAssertEqual(t.id, "tr-1")
        XCTAssertEqual(t.fromClipId, "clip-a")
        XCTAssertEqual(t.toClipId, "clip-b")
        XCTAssertEqual(t.kind, .crossfade)
        XCTAssertEqual(t.duration, 0.5)
        XCTAssertEqual(t.easing, .easeInOut)
    }

    func test_storyClipTransition_init_defaultsEasingToNil_andGeneratesUUID() {
        let t = StoryClipTransition(
            fromClipId: "a",
            toClipId: "b",
            kind: .dissolve,
            duration: 1.0
        )
        XCTAssertFalse(t.id.isEmpty)
        XCTAssertNil(t.easing)
    }

    func test_storyClipTransition_codableRoundTrip_full() throws {
        let original = StoryClipTransition(
            id: "tr-42",
            fromClipId: "intro.mp4",
            toClipId: "photo1",
            kind: .dissolve,
            duration: 0.8,
            easing: .easeOut
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryClipTransition.self, from: data)
        XCTAssertEqual(decoded.id, original.id)
        XCTAssertEqual(decoded.fromClipId, original.fromClipId)
        XCTAssertEqual(decoded.toClipId, original.toClipId)
        XCTAssertEqual(decoded.kind, original.kind)
        XCTAssertEqual(decoded.duration, original.duration, accuracy: 0.0001)
        XCTAssertEqual(decoded.easing, original.easing)
    }

    func test_storyClipTransition_codableRoundTrip_omittingEasing() throws {
        let original = StoryClipTransition(
            fromClipId: "a", toClipId: "b",
            kind: .crossfade, duration: 0.4
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryClipTransition.self, from: data)
        XCTAssertNil(decoded.easing)
        XCTAssertEqual(decoded.kind, .crossfade)
    }

    // MARK: - StoryKeyframe

    func test_storyKeyframe_init_assignsAllProperties() {
        let kf = StoryKeyframe(
            id: "kf-1",
            time: 1.5,
            x: 0.3,
            y: 0.7,
            scale: 1.25,
            opacity: 0.9,
            easing: .easeIn
        )
        XCTAssertEqual(kf.id, "kf-1")
        XCTAssertEqual(kf.time, 1.5)
        XCTAssertEqual(kf.x, 0.3)
        XCTAssertEqual(kf.y, 0.7)
        XCTAssertEqual(kf.scale, 1.25)
        XCTAssertEqual(kf.opacity, 0.9)
        XCTAssertEqual(kf.easing, .easeIn)
    }

    func test_storyKeyframe_init_defaultsAllPropertiesToNil() {
        let kf = StoryKeyframe(time: 2.0)
        XCTAssertFalse(kf.id.isEmpty)
        XCTAssertEqual(kf.time, 2.0)
        XCTAssertNil(kf.x)
        XCTAssertNil(kf.y)
        XCTAssertNil(kf.scale)
        XCTAssertNil(kf.opacity)
        XCTAssertNil(kf.easing)
    }

    func test_storyKeyframe_codableRoundTrip_full() throws {
        let original = StoryKeyframe(
            id: "kf-99",
            time: 3.25,
            x: 0.5, y: 0.5,
            scale: 1.0, opacity: 1.0,
            easing: .easeInOut
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: data)
        XCTAssertEqual(decoded.id, original.id)
        XCTAssertEqual(decoded.time, original.time, accuracy: 0.0001)
        XCTAssertEqual(decoded.x, original.x)
        XCTAssertEqual(decoded.y, original.y)
        XCTAssertEqual(decoded.scale, original.scale)
        XCTAssertEqual(decoded.opacity, original.opacity)
        XCTAssertEqual(decoded.easing, original.easing)
    }

    func test_storyKeyframe_codableRoundTrip_partial_onlyTimeAndX() throws {
        let original = StoryKeyframe(time: 0.5, x: 0.42)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: data)
        XCTAssertEqual(decoded.x, 0.42)
        XCTAssertNil(decoded.y)
        XCTAssertNil(decoded.scale)
        XCTAssertNil(decoded.opacity)
        XCTAssertNil(decoded.easing)
    }

    func test_storyKeyframe_decodeJSON_withoutOptionalFields() throws {
        let json = #"{"id":"kf-bare","time":1.0}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: json)
        XCTAssertEqual(decoded.id, "kf-bare")
        XCTAssertEqual(decoded.time, 1.0)
        XCTAssertNil(decoded.x)
        XCTAssertNil(decoded.y)
        XCTAssertNil(decoded.scale)
        XCTAssertNil(decoded.opacity)
        XCTAssertNil(decoded.easing)
    }

    // MARK: - StoryEffects.clipTransitions extension

    func test_storyEffects_clipTransitions_defaultsToNil() {
        let effects = StoryEffects()
        XCTAssertNil(effects.clipTransitions)
    }

    func test_storyEffects_clipTransitions_canBeAssignedAndPersisted() throws {
        var effects = StoryEffects()
        effects.clipTransitions = [
            StoryClipTransition(fromClipId: "a", toClipId: "b",
                                kind: .crossfade, duration: 0.5)
        ]
        let data = try JSONEncoder().encode(effects)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: data)
        XCTAssertEqual(decoded.clipTransitions?.count, 1)
        XCTAssertEqual(decoded.clipTransitions?.first?.kind, .crossfade)
    }

    func test_storyEffects_decodeOldJSON_withoutClipTransitions_succeeds() throws {
        let json = #"{"background":"FFFFFF","mediaObjects":[]}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: json)
        XCTAssertNil(decoded.clipTransitions)
        XCTAssertEqual(decoded.background, "FFFFFF")
    }

    // MARK: - StoryMediaObject.keyframes extension

    func test_storyMediaObject_keyframes_defaultsToNil() {
        let media = StoryMediaObject()
        XCTAssertNil(media.keyframes)
    }

    func test_storyMediaObject_keyframes_canBeAssignedAndPersisted() throws {
        var media = StoryMediaObject(postMediaId: "pm-1", mediaType: "video")
        media.keyframes = [
            StoryKeyframe(time: 0.0, x: 0.0, y: 0.0, scale: 1.0, opacity: 0.0),
            StoryKeyframe(time: 1.0, x: 0.5, y: 0.5, scale: 1.5, opacity: 1.0,
                          easing: .easeOut)
        ]
        let data = try JSONEncoder().encode(media)
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: data)
        XCTAssertEqual(decoded.keyframes?.count, 2)
        XCTAssertEqual(decoded.keyframes?[1].easing, .easeOut)
    }

    func test_storyMediaObject_decodeOldJSON_withoutKeyframes_succeeds() throws {
        let json = #"{"id":"m1","postMediaId":"pm","mediaType":"image","placement":"media","x":0.5,"y":0.5,"scale":1.0,"rotation":0,"volume":1.0}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: json)
        XCTAssertNil(decoded.keyframes)
        XCTAssertEqual(decoded.id, "m1")
    }
}
