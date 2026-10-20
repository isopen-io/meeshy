import SwiftUI
import XCTest
@testable import MeeshyUI

final class MeeshyPointerShapeTests: XCTestCase {
    private let rect = CGRect(x: 0, y: 0, width: 100, height: 40)

    func test_roundedRect_zeroRadius_containsTheCorner() {
        let path = MeeshyPointerShape.roundedRect(cornerRadius: 0).path(in: rect)
        XCTAssertTrue(path.contains(CGPoint(x: 0.5, y: 0.5)))
    }

    func test_roundedRect_negativeRadius_behavesLikeZero() {
        let path = MeeshyPointerShape.roundedRect(cornerRadius: -8).path(in: rect)
        XCTAssertTrue(path.contains(CGPoint(x: 0.5, y: 0.5)))
    }

    func test_roundedRect_positiveRadius_excludesTheCorner() {
        let path = MeeshyPointerShape.roundedRect(cornerRadius: 16).path(in: rect)
        XCTAssertFalse(path.contains(CGPoint(x: 0.5, y: 0.5)))
        XCTAssertTrue(path.contains(CGPoint(x: 50, y: 20)))
    }

    func test_capsule_excludesTheCornerAndContainsTheCentre() {
        let path = MeeshyPointerShape.capsule.path(in: rect)
        XCTAssertFalse(path.contains(CGPoint(x: 0.5, y: 0.5)))
        XCTAssertTrue(path.contains(CGPoint(x: 50, y: 20)))
    }

    func test_circle_excludesTheCornerOfItsSquare() {
        let path = MeeshyPointerShape.circle.path(in: CGRect(x: 0, y: 0, width: 40, height: 40))
        XCTAssertFalse(path.contains(CGPoint(x: 1, y: 1)))
        XCTAssertTrue(path.contains(CGPoint(x: 20, y: 20)))
    }
}
