import SwiftUI
import XCTest
@testable import MeeshyUI

final class AnchoredPickerPresentationTests: XCTestCase {

    func test_resolve_choosesAPopoverOnlyInRegularWidth() {
        XCTAssertEqual(AnchoredPickerPresentation.resolve(horizontalSizeClass: .regular), .popover)
        XCTAssertEqual(AnchoredPickerPresentation.resolve(horizontalSizeClass: .compact), .sheet)
        XCTAssertEqual(AnchoredPickerPresentation.resolve(horizontalSizeClass: nil), .sheet)
    }

    func test_isPresented_projectsTheSourceOntoTheResolvedPresentationOnly() {
        XCTAssertFalse(AnchoredPickerPresentation.isPresented(true, as: .popover, resolved: .sheet))
        XCTAssertTrue(AnchoredPickerPresentation.isPresented(true, as: .sheet, resolved: .sheet))
        XCTAssertTrue(AnchoredPickerPresentation.isPresented(true, as: .popover, resolved: .popover))
        XCTAssertFalse(AnchoredPickerPresentation.isPresented(false, as: .popover, resolved: .popover))
        XCTAssertFalse(AnchoredPickerPresentation.isPresented(false, as: .sheet, resolved: .sheet))
    }
}
