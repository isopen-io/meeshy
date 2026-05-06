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
}
