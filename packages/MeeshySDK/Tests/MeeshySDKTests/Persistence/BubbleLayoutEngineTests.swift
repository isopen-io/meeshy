import XCTest
@testable import MeeshySDK

final class BubbleLayoutEngineTests: XCTestCase {

    private let maxWidth: CGFloat = 393

    func test_textMessage_shortContent_fitsReasonableSize() {
        let result = BubbleLayoutEngine.computeLayout(
            content: "Hello", contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        XCTAssertGreaterThan(result.size.width, 0)
        XCTAssertLessThan(result.size.width, maxWidth * 0.5)
        XCTAssertGreaterThan(result.size.height, 20)
        XCTAssertEqual(result.lineCount, 1)
    }

    func test_textMessage_longContent_multipleLines() {
        let longText = String(repeating: "word ", count: 100)
        let result = BubbleLayoutEngine.computeLayout(
            content: longText, contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        XCTAssertGreaterThan(result.lineCount, 5)
        XCTAssertGreaterThan(result.size.height, 100)
    }

    func test_textMessage_shortText_timestampInline() {
        let result = BubbleLayoutEngine.computeLayout(
            content: "Hi", contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        XCTAssertTrue(result.timestampInline)
    }

    func test_textMessage_fullWidthLastLine_timestampNotInline() {
        let text = String(repeating: "A", count: 200)
        let result = BubbleLayoutEngine.computeLayout(
            content: text, contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        XCTAssertFalse(result.timestampInline)
    }

    func test_imageMessage_respectsAspectRatio() {
        let result = BubbleLayoutEngine.computeLayout(
            content: nil, contentType: "image",
            attachmentDimensions: CGSize(width: 1920, height: 1080),
            replyPreview: false, reactionCount: 0, maxWidth: maxWidth
        )
        let mediaHeight = result.size.height - 18 // minus timestamp
        let ratio = result.size.width / mediaHeight
        XCTAssertEqual(ratio, 1920.0 / 1080.0, accuracy: 0.2)
    }

    func test_imageMessage_nilDimensions_fallback() {
        let result = BubbleLayoutEngine.computeLayout(
            content: nil, contentType: "image",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        XCTAssertEqual(result.size.width, 200, accuracy: 1)
    }

    func test_reactionBar_addsHeight() {
        let without = BubbleLayoutEngine.computeLayout(
            content: "Test", contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        let with = BubbleLayoutEngine.computeLayout(
            content: "Test", contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 3, maxWidth: maxWidth
        )
        XCTAssertGreaterThan(with.size.height, without.size.height)
    }

    func test_replyPreview_addsHeight() {
        let without = BubbleLayoutEngine.computeLayout(
            content: "Test", contentType: "text",
            attachmentDimensions: nil, replyPreview: false,
            reactionCount: 0, maxWidth: maxWidth
        )
        let with = BubbleLayoutEngine.computeLayout(
            content: "Test", contentType: "text",
            attachmentDimensions: nil, replyPreview: true,
            reactionCount: 0, maxWidth: maxWidth
        )
        XCTAssertGreaterThan(with.size.height, without.size.height)
    }
}
