import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI

@MainActor
final class MeeshyTapTargetGeometryTests: XCTestCase {

    func test_inset_forVisualSide_returnsHalfTheMissingSide() {
        XCTAssertEqual(MeeshyTapTarget.inset(forVisualSide: 36), 4)
        XCTAssertEqual(MeeshyTapTarget.inset(forVisualSide: 28), 8)
        XCTAssertEqual(MeeshyTapTarget.inset(forVisualSide: 40), 2)
        XCTAssertEqual(MeeshyTapTarget.inset(forVisualSide: 44), 0)
        XCTAssertEqual(MeeshyTapTarget.inset(forVisualSide: 52), 0)
    }

    func test_overlaps_whenGapSmallerThanBothInsets_isTrue() {
        XCTAssertTrue(MeeshyTapTarget.overlaps(visualA: 28, visualB: 28, gap: 6))
        XCTAssertFalse(MeeshyTapTarget.overlaps(visualA: 36, visualB: 54, gap: 24))
        XCTAssertFalse(MeeshyTapTarget.overlaps(visualA: 34, visualB: 34, gap: 10))
    }

    func test_tapTarget_growsSmallControlLayoutBoxTo44() {
        let small = UIHostingController(rootView: Color.clear.frame(width: 28, height: 28).meeshyTapTarget())
        let large = UIHostingController(rootView: Color.clear.frame(width: 52, height: 52).meeshyTapTarget())
        let bounds = CGSize(width: 1000, height: 1000)
        XCTAssertEqual(small.sizeThatFits(in: bounds), CGSize(width: 44, height: 44))
        XCTAssertEqual(large.sizeThatFits(in: bounds), CGSize(width: 52, height: 52))
    }

    func test_compensatedPadding_keepsTheOriginalLayoutBox() {
        let bounds = CGSize(width: 1000, height: 1000)
        let inset = MeeshyTapTarget.inset(forVisualSide: MeeshyControlSize.regular)
        let before = UIHostingController(rootView: Color.clear
            .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.smPlus))
        let after = UIHostingController(rootView: Color.clear
            .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
            .meeshyTapTarget()
            .padding(.horizontal, MeeshySpacing.lg - inset)
            .padding(.vertical, MeeshySpacing.smPlus - inset))
        XCTAssertEqual(before.sizeThatFits(in: bounds), CGSize(width: 68, height: 56))
        XCTAssertEqual(after.sizeThatFits(in: bounds), before.sizeThatFits(in: bounds))
    }
}
