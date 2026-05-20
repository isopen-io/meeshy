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

    /// Equatable doit détecter l'apparition d'une replyReference pour invalider
    /// le cache de bulle (UICollectionView) — sinon la citation n'apparaîtra
    /// pas au passage en mode `audioHostsReply`.
    func test_audioMediaView_equatable_detectsReplyMessageIdChange() {
        let baseline = AudioMediaView.makeForTest()
        let withReply = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut")
        )

        XCTAssertFalse(baseline == withReply,
            "AudioMediaView Equatable doit détecter l'apparition d'une replyReference")
    }

    /// Idem pour un changement de previewText (édition de la cible).
    func test_audioMediaView_equatable_detectsReplyPreviewTextChange() {
        let a = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut")
        )
        let b = AudioMediaView.makeForTest(
            replyReference: ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Coucou")
        )

        XCTAssertFalse(a == b,
            "AudioMediaView Equatable doit détecter une édition du previewText de la reply")
    }

    /// Stabilité : deux instances avec exactement la même reply doivent rester égales.
    func test_audioMediaView_equatable_stableWhenReplyUnchanged() {
        let ref = ReplyReference(messageId: "m-quote-1", authorName: "Bob", previewText: "Salut")
        let a = AudioMediaView.makeForTest(replyReference: ref)
        let b = AudioMediaView.makeForTest(replyReference: ref)

        XCTAssertTrue(a == b,
            "AudioMediaView Equatable doit rester égal pour la même reply (zero-rerender)")
    }
}

extension AudioMediaView {
    static func makeForTest(
        replyReference: ReplyReference? = nil,
        replyIsStory: Bool = false
    ) -> AudioMediaView {
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
        // Dates fixées pour que deux appels successifs produisent des
        // MeeshyMessage Equatable-équivalents (updatedAt par défaut = Date()
        // change à chaque appel).
        let message = MeeshyMessage(
            id: "msg-test-1",
            conversationId: "conv-test-1",
            senderId: "user-test-1",
            content: "",
            createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: Date(timeIntervalSince1970: 0)
        )
        return AudioMediaView(
            attachment: attachment,
            message: message,
            contactColor: "#6366F1",
            visualAttachments: [],
            isDark: false,
            accentColor: "#6366F1",
            replyReference: replyReference,
            replyIsStory: replyIsStory
        )
    }
}
