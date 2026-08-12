import XCTest
@testable import Meeshy
import MeeshySDK

/// Regression coverage for the on-demand "Traduire" routing bug on existing
/// audio messages: tapping "Traduire" next to a language must resolve the
/// audio attachment from the message itself, not only from a `transcription`
/// cache that may still be nil (never hydrated, or hydration lagging the
/// conversation open). Before the fix, a nil cache silently fell through to
/// the text-translation branch, which no-ops on empty `content` — no spinner,
/// no error, no network call.
@MainActor
final class MessageLanguageDetailViewAudioRoutingTests: XCTestCase {

    private func makeAttachment(mimeType: String, id: String = "att_1") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, mimeType: mimeType, fileUrl: "https://x/file", uploadedBy: "u1")
    }

    func test_resolveAudioAttachmentId_noCachedTranscription_findsAudioAttachmentOnMessage() {
        let attachments = [makeAttachment(mimeType: "audio/m4a", id: "att_audio")]

        let resolved = MessageLanguageDetailView.resolveAudioAttachmentId(
            cachedTranscriptionAttachmentId: nil,
            attachments: attachments
        )

        XCTAssertEqual(resolved, "att_audio")
    }

    func test_resolveAudioAttachmentId_noCachedTranscription_findsVideoAttachmentOnMessage() {
        let attachments = [makeAttachment(mimeType: "video/mp4", id: "att_video")]

        let resolved = MessageLanguageDetailView.resolveAudioAttachmentId(
            cachedTranscriptionAttachmentId: nil,
            attachments: attachments
        )

        XCTAssertEqual(resolved, "att_video")
    }

    func test_resolveAudioAttachmentId_prefersCachedTranscriptionOverAttachmentScan() {
        let attachments = [makeAttachment(mimeType: "audio/m4a", id: "att_from_message")]

        let resolved = MessageLanguageDetailView.resolveAudioAttachmentId(
            cachedTranscriptionAttachmentId: "att_from_cache",
            attachments: attachments
        )

        XCTAssertEqual(resolved, "att_from_cache")
    }

    func test_resolveAudioAttachmentId_noAudioOrVideoAttachment_returnsNil() {
        let attachments = [makeAttachment(mimeType: "image/jpeg", id: "att_image")]

        let resolved = MessageLanguageDetailView.resolveAudioAttachmentId(
            cachedTranscriptionAttachmentId: nil,
            attachments: attachments
        )

        XCTAssertNil(resolved)
    }

    func test_resolveAudioAttachmentId_noAttachmentsNoCache_returnsNil() {
        let resolved = MessageLanguageDetailView.resolveAudioAttachmentId(
            cachedTranscriptionAttachmentId: nil,
            attachments: []
        )

        XCTAssertNil(resolved)
    }
}
