import XCTest
import SwiftUI
@testable import MeeshyUI

final class AnimatedLogoViewMotionTests: XCTestCase {

    func test_breathes_continuousAndNoReduce_isTrue() {
        XCTAssertTrue(AnimatedLogoView.breathes(continuous: true, reduceMotion: false))
    }

    func test_breathes_reduceMotion_isFalse() {
        XCTAssertFalse(AnimatedLogoView.breathes(continuous: true, reduceMotion: true))
    }

    func test_breathes_notContinuous_isFalse() {
        XCTAssertFalse(AnimatedLogoView.breathes(continuous: false, reduceMotion: false))
    }

    func test_dashAnimation_reduceMotion_isNil() {
        XCTAssertNil(AnimatedLogoView.dashAnimation(delay: 0.1, reduceMotion: true))
    }

    func test_dashAnimation_noReduce_isAnimated() {
        XCTAssertNotNil(AnimatedLogoView.dashAnimation(delay: 0.1, reduceMotion: false))
        XCTAssertNotNil(AnimatedLogoView.dashAnimation(delay: 0, reduceMotion: false))
    }

    func test_source_readsBothReduceMotionHalves() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let code = try String(
            contentsOf: root.appendingPathComponent("Sources/MeeshyUI/Primitives/AnimatedLogoView.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(code.contains("accessibilityReduceMotion"))
        XCTAssertTrue(code.contains("meeshyForceReduceMotion"))
        XCTAssertTrue(code.contains("MeeshyMotion.shouldReduce"))
    }
}
