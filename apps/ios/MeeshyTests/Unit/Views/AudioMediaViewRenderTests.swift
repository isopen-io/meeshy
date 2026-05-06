import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

@MainActor
final class AudioMediaViewRenderTests: XCTestCase {

    func test_audioMediaView_doesNotObserveThemeManager() {
        let sut = AudioMediaView.makeForTest()
        let mirror = Mirror(reflecting: sut)
        let observedObjects = mirror.children.filter { child in
            String(describing: type(of: child.value)).contains("ObservedObject")
        }
        XCTAssertTrue(
            observedObjects.isEmpty,
            "AudioMediaView should not have @ObservedObject — leaf view rule violation"
        )
    }
}

extension AudioMediaView {
    static func makeForTest() -> AudioMediaView {
        let attachment = MeeshyMessageAttachment(
            id: "att-test-1",
            messageId: "msg-test-1",
            fileName: "test.m4a",
            originalName: "test.m4a",
            mimeType: "audio/m4a",
            fileSize: 1024,
            filePath: "/test/test.m4a",
            fileUrl: "https://example.com/test.m4a",
            uploadedBy: "user-test-1"
        )
        let message = MeeshyMessage(
            id: "msg-test-1",
            conversationId: "conv-test-1",
            senderId: "user-test-1",
            content: ""
        )
        return AudioMediaView(
            attachment: attachment,
            message: message,
            contactColor: "#6366F1",
            visualAttachments: [],
            isDark: false,
            accentColor: "#6366F1"
        )
    }
}
