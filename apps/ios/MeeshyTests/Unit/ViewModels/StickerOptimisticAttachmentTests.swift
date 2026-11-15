import XCTest
import UIKit
@testable import Meeshy
import MeeshySDK

@MainActor
final class StickerOptimisticAttachmentTests: XCTestCase {

    private let fileURL = URL(fileURLWithPath: "/tmp/sticker-local.png")

    private func makeImage(width: CGFloat, height: CGFloat, scale: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    private func make(image: UIImage? = nil, sticker: MessageSticker?) -> MeeshyMessageAttachment {
        StickerOptimisticAttachment.make(
            image: image ?? makeImage(width: 10, height: 20, scale: 2),
            attachmentId: "att-1", mimeType: StickerSendPipeline.pngMimeType, fileURL: fileURL,
            sticker: sticker, uploadedBy: "user-1", color: "6366F1"
        )
    }

    func test_make_withSticker_altAndCaptionCarryTheStickerText() {
        let sticker = MessageSticker.emoji("🎉")

        let attachment = make(sticker: sticker)

        XCTAssertNotNil(StickerAltText.describe(sticker))
        XCTAssertEqual(attachment.alt, StickerAltText.describe(sticker))
        XCTAssertEqual(attachment.caption, attachment.alt)
    }

    func test_make_withoutSticker_leavesAltAndCaptionNil() {
        let attachment = make(sticker: nil)

        XCTAssertNil(attachment.alt)
        XCTAssertNil(attachment.caption)
    }

    func test_make_fileSizeIsZero_andFileAndThumbnailPointAtTheLocalKey() {
        let attachment = make(sticker: nil)

        XCTAssertEqual(attachment.fileSize, 0)
        XCTAssertEqual(attachment.fileUrl, fileURL.absoluteString)
        XCTAssertEqual(attachment.thumbnailUrl, fileURL.absoluteString)
    }

    func test_make_dimensionsAreSizeTimesScale() {
        let attachment = make(image: makeImage(width: 10, height: 20, scale: 3), sticker: nil)

        XCTAssertEqual(attachment.width, 30)
        XCTAssertEqual(attachment.height, 60)
    }

    func test_make_identityFieldsAreCarried() {
        let attachment = make(sticker: nil)

        XCTAssertEqual(attachment.id, "att-1")
        XCTAssertEqual(attachment.uploadedBy, "user-1")
        XCTAssertEqual(attachment.mimeType, StickerSendPipeline.pngMimeType)
        XCTAssertEqual(attachment.fileName, StickerSendPipeline.fileName(for: "att-1", mimeType: StickerSendPipeline.pngMimeType))
    }
}
