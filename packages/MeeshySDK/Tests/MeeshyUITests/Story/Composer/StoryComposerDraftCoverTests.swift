import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

final class StoryComposerDraftCoverTests: XCTestCase {

    private func solidImage(_ color: UIColor, size: CGSize = CGSize(width: 80, height: 80)) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill(); ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    @MainActor
    func test_draftCoverJPEG_textOnColouredBackground_producesNonNilJPEG() throws {
        let slide = StorySlide(effects: StoryEffects(
            background: "1E1B4B",
            textObjects: [StoryTextObject(id: "t1", text: "Bonjour")]))

        let jpeg = StoryComposerView.draftCoverJPEG(
            firstSlide: slide, loadedImages: [:], bgImage: nil, size: CGSize(width: 270, height: 480))

        let data = try XCTUnwrap(jpeg)
        XCTAssertGreaterThan(data.count, 0)
        XCTAssertNotNil(UIImage(data: data), "must decode back to a valid image")
    }
}
