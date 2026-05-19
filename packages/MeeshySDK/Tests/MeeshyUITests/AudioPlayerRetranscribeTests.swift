import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("AudioPlayerView re-transcribe wiring")
struct AudioPlayerRetranscribeTests {

    @Test("onRetranscribe callback is stored when provided")
    @MainActor
    func test_init_withOnRetranscribe_storesCallback() {
        let attachment = MeeshyMessageAttachment(
            id: "att_1",
            fileName: "a.m4a",
            mimeType: "audio/m4a",
            fileUrl: "https://x/a.m4a",
            duration: 1600
        )
        var called = false
        let view = AudioPlayerView(
            attachment: attachment,
            context: .messageBubble,
            onRetranscribe: { called = true }
        )
        view.onRetranscribe?()
        #expect(called)
        #expect(view.onRetranscribe != nil)
    }

    @Test("onRetranscribe is nil by default")
    @MainActor
    func test_init_withoutOnRetranscribe_isNil() {
        let attachment = MeeshyMessageAttachment(
            id: "att_1",
            fileName: "a.m4a",
            mimeType: "audio/m4a",
            fileUrl: "https://x/a.m4a",
            duration: 1600
        )
        let view = AudioPlayerView(attachment: attachment, context: .messageBubble)
        #expect(view.onRetranscribe == nil)
    }
}
