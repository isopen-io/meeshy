import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class MeeshyMotionAnimationTests: XCTestCase {

    private struct SampleError: Error {}

    func test_animation_reduceOn_isNil() {
        XCTAssertNil(MeeshyMotion.animation(.easeIn, reduce: true))
    }

    func test_animation_reduceOff_isUnchanged() {
        XCTAssertEqual(MeeshyMotion.animation(.easeIn, reduce: false), .easeIn)
    }

    func test_animation_nilStaysNil() {
        XCTAssertNil(MeeshyMotion.animation(nil, reduce: false))
        XCTAssertNil(MeeshyMotion.animation(nil, reduce: true))
    }

    func test_meeshyWithAnimation_returnsBodyResult_inBothModes() {
        let reduced = meeshyWithAnimation(.easeIn, reduceMotion: true) { 42 }
        let animated = meeshyWithAnimation(.easeIn, reduceMotion: false) { 42 }
        XCTAssertEqual(reduced, 42)
        XCTAssertEqual(animated, 42)
    }

    func test_meeshyWithAnimation_rethrows() {
        XCTAssertThrowsError(try meeshyWithAnimation(.default, reduceMotion: false) { throw SampleError() })
    }
}
