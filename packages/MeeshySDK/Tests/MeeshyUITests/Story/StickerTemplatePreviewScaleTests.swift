import XCTest
import UIKit
@testable import MeeshyUI

@MainActor
final class StickerTemplatePreviewScaleTests: XCTestCase {

    private let templateID = StickerTemplateCatalog.ID.textBadge

    func test_render_drawsAtTheEnvironmentScale() {
        for scale in [CGFloat(2), 3] {
            let image = StickerTemplatePreview.render(
                templateID: templateID, slots: [:], side: 80, dieCut: false, scale: scale)
            XCTAssertEqual(image?.scale, scale)
        }
    }

    func test_render_drawsTheDieCutAtTheEnvironmentScale() {
        for scale in [CGFloat(2), 3] {
            let image = StickerTemplatePreview.render(
                templateID: templateID, slots: [:], side: 80, dieCut: true, scale: scale)
            XCTAssertEqual(image?.scale, scale)
        }
    }

    func test_taskKey_changesWithScaleOnly() {
        let at2 = StickerTemplatePreview.taskKey(contentKey: "t|a=b", dieCut: false, scale: 2)
        let at3 = StickerTemplatePreview.taskKey(contentKey: "t|a=b", dieCut: false, scale: 3)
        XCTAssertNotEqual(at2, at3)
        XCTAssertEqual(at2, StickerTemplatePreview.taskKey(contentKey: "t|a=b", dieCut: false, scale: 2))
    }
}
