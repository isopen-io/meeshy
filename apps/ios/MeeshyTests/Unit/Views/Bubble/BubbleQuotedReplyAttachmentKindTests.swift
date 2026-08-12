import XCTest
@testable import Meeshy
import MeeshySDK

/// Pins the contract of `BubbleQuotedReply.resolveAttachmentKind`, the
/// helper that decodes `ReplyReference.attachmentType` (a free-form
/// String coming from the SDK) into the canonical `AttachmentKind`.
///
/// Two paths must work:
///   1. Short kind rawValue (`"image"`, `"video"`, ...) — emitted by the
///      post-fix SDK that runs `AttachmentKind(mimeType:).rawValue`.
///   2. Raw MIME (`"image/jpeg"`, `"video/mp4"`, ...) — emitted by older
///      cached payloads still in GRDB before the migration finishes.
///
/// Without this two-step lookup the bubble would show `"paperclip"` + the
/// generic "Media" fallback every time a stale cached payload renders.
@MainActor
final class BubbleQuotedReplyAttachmentKindTests: XCTestCase {

    // MARK: - nil / empty input

    func test_resolve_nilInput_returnsNil() {
        XCTAssertNil(BubbleQuotedReply.resolveAttachmentKind(nil))
    }

    func test_resolve_emptyInput_returnsNil() {
        XCTAssertNil(BubbleQuotedReply.resolveAttachmentKind(""))
    }

    // MARK: - Short kind rawValue (new SDK payloads)

    func test_resolve_imageRawValue_returnsImageKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("image")
        XCTAssertEqual(kind, .image)
        XCTAssertEqual(kind?.sfSymbolName, "camera.fill")
    }

    func test_resolve_videoRawValue_returnsVideoKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("video")
        XCTAssertEqual(kind, .video)
        XCTAssertEqual(kind?.sfSymbolName, "video.fill")
    }

    func test_resolve_audioRawValue_returnsAudioKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("audio")
        XCTAssertEqual(kind, .audio)
    }

    func test_resolve_pdfRawValue_returnsPDFKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("pdf")
        XCTAssertEqual(kind, .pdf)
        XCTAssertEqual(kind?.sfSymbolName, "doc.fill")
    }

    // MARK: - Raw MIME (legacy cached payloads)

    func test_resolve_imageMIME_returnsImageKind() {
        // The pre-fix SDK stored `firstAtt.mimeType` directly. Cached
        // ReplyReferences in GRDB still carry that — the resolver MUST
        // recognise them so the icon doesn't fall back to paperclip.
        let kind = BubbleQuotedReply.resolveAttachmentKind("image/jpeg")
        XCTAssertEqual(kind, .image)
    }

    func test_resolve_videoMIME_returnsVideoKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("video/mp4")
        XCTAssertEqual(kind, .video)
    }

    func test_resolve_audioMIME_returnsAudioKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("audio/mpeg")
        XCTAssertEqual(kind, .audio)
    }

    func test_resolve_pdfMIME_returnsPDFKind() {
        let kind = BubbleQuotedReply.resolveAttachmentKind("application/pdf")
        XCTAssertEqual(kind, .pdf)
    }

    func test_resolve_pdfMIME_returnsLocalizedShortLabel() {
        // Pinning the fallback that replaces the hardcoded "Media" string
        // in the bubble. For PDF, `shortLabel` returns "PDF" (not
        // localized because the brand uses the format name verbatim).
        let kind = BubbleQuotedReply.resolveAttachmentKind("application/pdf")
        XCTAssertEqual(kind?.shortLabel, "PDF")
    }

    // MARK: - Unknown input

    func test_resolve_unknownMIME_returnsOther() {
        // Single-source-of-truth contract: unknown MIME never returns nil
        // — it folds to `.other` so the UI always has a glyph + label
        // ready (paperclip + "Fichier"). Better than showing a hard-coded
        // "Media" label and an opaque paperclip with no semantic.
        let kind = BubbleQuotedReply.resolveAttachmentKind("application/x-some-binary-format")
        XCTAssertEqual(kind, .other)
        XCTAssertEqual(kind?.sfSymbolName, "paperclip")
    }
}
