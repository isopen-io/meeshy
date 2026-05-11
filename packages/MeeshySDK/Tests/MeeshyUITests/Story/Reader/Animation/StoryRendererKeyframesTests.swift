// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/StoryRendererKeyframesTests.swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

final class StoryRendererKeyframesTests: XCTestCase {
    func test_applyKeyframes_position_interpolatedAtMidpoint() {
        let kfs: [StoryKeyframe] = [
            StoryKeyframe(time: 0, x: 0.0, y: 0.0),
            StoryKeyframe(time: 1.0, x: 1.0, y: 1.0),
        ]
        let result = StoryRenderer.applyKeyframes(keyframes: kfs, at: 0.5, startTime: 0)
        XCTAssertEqual(result.position?.x ?? 0, 0.5, accuracy: 1e-4)
        XCTAssertEqual(result.position?.y ?? 0, 0.5, accuracy: 1e-4)
    }

    func test_applyKeyframes_opacity_interpolatedAtMidpoint() {
        let kfs: [StoryKeyframe] = [
            StoryKeyframe(time: 0, opacity: 0),
            StoryKeyframe(time: 1.0, opacity: 1),
        ]
        let result = StoryRenderer.applyKeyframes(keyframes: kfs, at: 0.5, startTime: 0)
        XCTAssertEqual(result.opacity ?? 0, 0.5, accuracy: 1e-4)
    }

    func test_applyKeyframes_emptyFrames_returnsNilOverrides() {
        let result = StoryRenderer.applyKeyframes(keyframes: [], at: 0.5, startTime: 0)
        XCTAssertNil(result.position)
        XCTAssertNil(result.scale)
        XCTAssertNil(result.opacity)
    }

    func test_applyKeyframes_respectsStartTimeOffset() {
        let kfs: [StoryKeyframe] = [
            StoryKeyframe(time: 0, x: 0.0, y: 0.0),
            StoryKeyframe(time: 1.0, x: 1.0, y: 1.0),
        ]
        // global time 5.5, startTime 5 → local 0.5
        let result = StoryRenderer.applyKeyframes(keyframes: kfs, at: 5.5, startTime: 5.0)
        XCTAssertEqual(result.position?.x ?? 0, 0.5, accuracy: 1e-4)
    }
}
