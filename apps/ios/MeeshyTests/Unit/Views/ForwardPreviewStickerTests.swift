import XCTest
import MeeshySDK
@testable import Meeshy

final class ForwardPreviewStickerTests: XCTestCase {
    private func attachment() -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: "a1", originalName: "s.png", mimeType: "image/png", fileSize: 7168, width: 512, height: 512)
    }

    func test_previewText_stickerWithOnlyItsLibraryId_saysStickerNotPhoto() {
        let message = Message(id: "m1", conversationId: "c1", senderId: "u1", content: "",
                              attachments: [attachment()], sticker: MessageSticker(stickerId: "6ad11ed4cfca42ca9678fdc2"))

        XCTAssertEqual(ForwardPickerSheet.previewText(for: message), ForwardPickerSheet.stickerPreviewLabel)
        XCTAssertNotEqual(ForwardPickerSheet.previewText(for: message), "Photo")
    }

    func test_previewText_plainImage_stillSaysPhoto() {
        let message = Message(id: "m1", conversationId: "c1", senderId: "u1", content: "", attachments: [attachment()])

        XCTAssertNotEqual(ForwardPickerSheet.previewText(for: message), ForwardPickerSheet.stickerPreviewLabel)
    }
}
