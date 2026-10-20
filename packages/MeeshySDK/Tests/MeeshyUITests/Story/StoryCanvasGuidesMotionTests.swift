import XCTest
import SwiftUI
@testable import MeeshyUI

final class StoryCanvasGuidesMotionTests: XCTestCase {

    func test_pulseAnimation_reduceMotion_isNil() {
        XCTAssertNil(StoryOutOfBoundsPulse.animation(reduceMotion: true))
    }

    func test_pulseAnimation_noReduce_repeats() {
        XCTAssertNotNil(StoryOutOfBoundsPulse.animation(reduceMotion: false))
    }

    func test_stroke_reduceMotion_restsOnTheProminentValue() {
        XCTAssertEqual(
            StoryOutOfBoundsPulse.stroke(pulse: false, reduceMotion: true),
            StoryOutOfBoundsStroke(opacity: 0.9, lineWidth: 2.5)
        )
    }

    func test_stroke_noReduce_followsPulse() {
        XCTAssertEqual(
            StoryOutOfBoundsPulse.stroke(pulse: false, reduceMotion: false),
            StoryOutOfBoundsStroke(opacity: 0.5, lineWidth: 1.5)
        )
        XCTAssertEqual(
            StoryOutOfBoundsPulse.stroke(pulse: true, reduceMotion: false),
            StoryOutOfBoundsStroke(opacity: 0.9, lineWidth: 2.5)
        )
    }

    func test_source_noRawAnimationModifier() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let code = try String(
            contentsOf: root.appendingPathComponent("Sources/MeeshyUI/Story/StoryCanvasGuides.swift"),
            encoding: .utf8
        )
        XCTAssertNil(code.range(of: #"(?<![A-Za-z])\.animation\("#, options: .regularExpression))
        XCTAssertTrue(code.contains("meeshyAnimation"))
    }
}
