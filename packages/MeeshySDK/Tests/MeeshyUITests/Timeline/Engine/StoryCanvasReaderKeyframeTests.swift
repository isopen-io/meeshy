import XCTest
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

final class StoryCanvasReaderKeyframeTests: XCTestCase {

    func test_resolvedPosition_noKeyframes_returnsNil() {
        let media = StoryMediaObject(
            id: "m1", postMediaId: "pm1",
            mediaType: "image", placement: "media",
            aspectRatio: 1.0,
            x: 0.5, y: 0.5,
            startTime: 0, duration: 5
        )
        let pos = ReaderKeyframeResolver.resolvedPosition(for: media, keyframes: nil, currentTime: 2)
        XCTAssertNil(pos)
    }

    func test_resolvedPosition_oneKeyframe_returnsKeyframeValue() {
        let media = StoryMediaObject(
            id: "m1", postMediaId: "pm1",
            mediaType: "image", placement: "media",
            aspectRatio: 1.0,
            x: 0.5, y: 0.5,
            startTime: 0, duration: 5
        )
        let kf = StoryKeyframe(time: 1, x: 0.2, y: 0.8)
        let pos = ReaderKeyframeResolver.resolvedPosition(for: media, keyframes: [kf], currentTime: 2)
        XCTAssertEqual(pos?.x ?? 0, 0.2, accuracy: 0.001)
        XCTAssertEqual(pos?.y ?? 0, 0.8, accuracy: 0.001)
    }

    func test_resolvedPosition_twoKeyframes_interpolatesLinearlyAtMidpoint() {
        let media = StoryMediaObject(
            id: "m1", postMediaId: "pm1",
            mediaType: "image", placement: "media",
            aspectRatio: 1.0,
            x: 0.5, y: 0.5,
            startTime: 0, duration: 5
        )
        let k0 = StoryKeyframe(time: 0, x: 0.0, y: 0.0)
        let k1 = StoryKeyframe(time: 4, x: 1.0, y: 1.0)
        let pos = ReaderKeyframeResolver.resolvedPosition(for: media, keyframes: [k0, k1], currentTime: 2)
        XCTAssertEqual(pos?.x ?? 0, 0.5, accuracy: 0.001)
        XCTAssertEqual(pos?.y ?? 0, 0.5, accuracy: 0.001)
    }

    func test_resolvedScale_oneKeyframe_returnsKeyframeValue() {
        let kf = StoryKeyframe(time: 1, scale: 1.5)
        let scale = ReaderKeyframeResolver.resolvedScale(keyframes: [kf], currentTime: 2)
        XCTAssertEqual(scale ?? 0, 1.5, accuracy: 0.001)
    }

    func test_resolvedOpacity_twoKeyframes_interpolatesAtMidpoint() {
        let k0 = StoryKeyframe(time: 0, opacity: 0)
        let k1 = StoryKeyframe(time: 2, opacity: 1)
        let opacity = ReaderKeyframeResolver.resolvedOpacity(keyframes: [k0, k1], currentTime: 1)
        XCTAssertEqual(opacity ?? 0, 0.5, accuracy: 0.001)
    }

    func test_resolvedPosition_clampsAfterLastKeyframe() {
        let k0 = StoryKeyframe(time: 0, x: 0, y: 0)
        let k1 = StoryKeyframe(time: 2, x: 1, y: 1)
        let media = StoryMediaObject(
            id: "m", postMediaId: "p", mediaType: "image", placement: "media",
            aspectRatio: 1.0,
            x: 0, y: 0, startTime: 0, duration: 5
        )
        let pos = ReaderKeyframeResolver.resolvedPosition(for: media, keyframes: [k0, k1], currentTime: 4)
        XCTAssertEqual(pos?.x ?? 0, 1.0, accuracy: 0.001)
    }

    func test_keyframeResolverWiring_overridesStaticPosition() {
        let media = StoryMediaObject(
            id: "m", postMediaId: "p", mediaType: "image", placement: "media",
            aspectRatio: 1.0,
            x: 0.1, y: 0.1, startTime: 0, duration: 5
        )
        let kfs: [StoryKeyframe] = [
            StoryKeyframe(time: 0, x: 0.5, y: 0.5),
            StoryKeyframe(time: 4, x: 0.9, y: 0.9)
        ]
        let pos = ReaderKeyframeResolver.resolvedPosition(for: media, keyframes: kfs, currentTime: 2)
        XCTAssertEqual(pos?.x ?? 0, 0.7, accuracy: 0.001)
        XCTAssertEqual(pos?.y ?? 0, 0.7, accuracy: 0.001)
    }
}
