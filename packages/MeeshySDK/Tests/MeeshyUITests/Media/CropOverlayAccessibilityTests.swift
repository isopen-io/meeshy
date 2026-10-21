import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI

@MainActor
final class CropOverlayAccessibilityTests: XCTestCase {

    private final class Box: @unchecked Sendable {
        var rect: CGRect
        var interactions = 0
        init(_ rect: CGRect) { self.rect = rect }
    }

    private let image = CGRect(x: 0, y: 0, width: 400, height: 300)

    private func makeView(_ box: Box, ratio: Double? = nil) -> CropOverlayView {
        CropOverlayView(
            cropRect: Binding(get: { box.rect }, set: { box.rect = $0 }),
            imageDisplayRect: image,
            aspectRatio: ratio,
            image: UIImage(),
            onInteraction: { box.interactions += 1 }
        )
    }

    func test_accessibleHandles_freeRatio_nine_lockedRatio_five() {
        XCTAssertEqual(CropOverlayView.accessibleHandles(aspectRatio: nil).count, 9)
        XCTAssertEqual(CropOverlayView.accessibleHandles(aspectRatio: 1.5).count, 5)
        XCTAssertFalse(CropOverlayView.accessibleHandles(aspectRatio: 1.5).contains(.top))
        XCTAssertTrue(CropOverlayView.accessibleHandles(aspectRatio: nil).contains(.center))
    }

    func test_everyHandleLabel_resolvesInBundleModule_andIsNotAFormat() {
        for handle in CropOverlayView.accessibleHandles(aspectRatio: nil) {
            let label = CropOverlayView.handleLabel(handle)
            XCTAssertFalse(label.isEmpty)
            XCTAssertFalse(label.hasPrefix("media.crop.a11y"), "clé non résolue : \(label)")
            XCTAssertFalse(label.contains("%"), "format non résolu : \(label)")
        }
        for move in CropFrameMove.allCases {
            XCTAssertFalse(CropOverlayView.moveLabel(move).hasPrefix("media.crop.a11y"))
        }
    }

    func test_handleLabels_areDistinctPerHandle() {
        let labels = CropOverlayView.accessibleHandles(aspectRatio: nil).map(CropOverlayView.handleLabel)
        XCTAssertEqual(Set(labels).count, labels.count)
    }

    func test_applyStep_increment_onRightEdge_widensByOnePercent_thenStaysInsideImage() {
        let box = Box(CGRect(x: 100, y: 100, width: 200, height: 150))
        let view = makeView(box)
        view.applyAccessibilityStep(.right, .increment)
        XCTAssertEqual(box.rect, CGRect(x: 100, y: 100, width: 204, height: 150))
        box.rect = CGRect(x: 200, y: 100, width: 200, height: 150)
        view.applyAccessibilityStep(.right, .increment)
        XCTAssertEqual(box.rect, CGRect(x: 200, y: 100, width: 200, height: 150))
    }

    func test_applyStep_decrement_onTopLeft_shrinksKeepingOppositeCorner() {
        let box = Box(CGRect(x: 100, y: 100, width: 200, height: 150))
        makeView(box).applyAccessibilityStep(.topLeft, .decrement)
        XCTAssertEqual(box.rect.maxX, 300)
        XCTAssertEqual(box.rect.maxY, 250)
        XCTAssertEqual(box.rect.width, 196)
    }

    func test_applyStep_withLockedRatio_keepsRatio() {
        let box = Box(CGRect(x: 100, y: 100, width: 200, height: 100))
        makeView(box, ratio: 2).applyAccessibilityStep(.bottomRight, .increment)
        XCTAssertEqual(box.rect.width / box.rect.height, 2, accuracy: 0.0001)
        XCTAssertGreaterThan(box.rect.width, 200)
    }

    func test_applyStep_notifiesInteraction_onlyWhenTheFrameMoves() {
        let box = Box(CGRect(x: 200, y: 100, width: 200, height: 150))
        let view = makeView(box)
        view.applyAccessibilityStep(.right, .increment)
        XCTAssertEqual(box.interactions, 0)
        view.applyAccessibilityStep(.right, .decrement)
        XCTAssertEqual(box.interactions, 1)
    }

    func test_moveActions_translateByOnePercent_andClampAtImageEdge() {
        let box = Box(CGRect(x: 100, y: 100, width: 200, height: 150))
        let view = makeView(box)
        view.applyAccessibilityMove(.right)
        XCTAssertEqual(box.rect.origin, CGPoint(x: 104, y: 100))
        view.applyAccessibilityMove(.up)
        XCTAssertEqual(box.rect.origin, CGPoint(x: 104, y: 97))
        box.rect = CGRect(x: 200, y: 100, width: 200, height: 150)
        view.applyAccessibilityMove(.right)
        XCTAssertEqual(box.rect.origin, CGPoint(x: 200, y: 100))
    }

    func test_handleValue_describesSizeAsPercentOfTheImage() {
        let box = Box(CGRect(x: 40, y: 30, width: 200, height: 150))
        let value = makeView(box).handleValue(.right)
        XCTAssertTrue(value.contains("50"), value)
        XCTAssertFalse(value.contains("%1$"))
    }
}
