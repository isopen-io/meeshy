import Testing
@testable import MeeshySDK

@Suite("AttachmentKind")
struct AttachmentKindTests {

    // MARK: - Prefix-based families (image / video / audio)

    @Test("image/* mime types resolve to .image")
    func image_prefix() {
        #expect(AttachmentKind(mimeType: "image/jpeg") == .image)
        #expect(AttachmentKind(mimeType: "image/png") == .image)
        #expect(AttachmentKind(mimeType: "image/webp") == .image)
        #expect(AttachmentKind(mimeType: "image/heic") == .image)
        #expect(AttachmentKind(mimeType: "image/gif") == .image)
    }

    @Test("video/* mime types resolve to .video")
    func video_prefix() {
        #expect(AttachmentKind(mimeType: "video/mp4") == .video)
        #expect(AttachmentKind(mimeType: "video/quicktime") == .video)
        #expect(AttachmentKind(mimeType: "video/webm") == .video)
    }

    @Test("audio/* mime types resolve to .audio")
    func audio_prefix() {
        #expect(AttachmentKind(mimeType: "audio/mp4") == .audio)
        #expect(AttachmentKind(mimeType: "audio/mpeg") == .audio)
        #expect(AttachmentKind(mimeType: "audio/wav") == .audio)
        #expect(AttachmentKind(mimeType: "audio/aac") == .audio)
    }

    // MARK: - Exact document mime types

    @Test("application/pdf resolves to .pdf")
    func pdf() {
        #expect(AttachmentKind(mimeType: "application/pdf") == .pdf)
    }

    @Test("Excel / CSV resolve to .spreadsheet")
    func spreadsheet() {
        #expect(AttachmentKind(mimeType: "application/vnd.ms-excel") == .spreadsheet)
        #expect(AttachmentKind(mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") == .spreadsheet)
        #expect(AttachmentKind(mimeType: "text/csv") == .spreadsheet)
    }

    @Test("Word / RTF resolve to .document")
    func document() {
        #expect(AttachmentKind(mimeType: "application/msword") == .document)
        #expect(AttachmentKind(mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document") == .document)
        #expect(AttachmentKind(mimeType: "application/rtf") == .document)
    }

    @Test("PowerPoint mime types resolve to .presentation")
    func presentation() {
        #expect(AttachmentKind(mimeType: "application/vnd.ms-powerpoint") == .presentation)
        #expect(AttachmentKind(mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation") == .presentation)
    }

    @Test("Archives resolve to .archive")
    func archive() {
        #expect(AttachmentKind(mimeType: "application/zip") == .archive)
        #expect(AttachmentKind(mimeType: "application/x-zip-compressed") == .archive)
        #expect(AttachmentKind(mimeType: "application/x-tar") == .archive)
        #expect(AttachmentKind(mimeType: "application/x-7z-compressed") == .archive)
        #expect(AttachmentKind(mimeType: "application/gzip") == .archive)
        #expect(AttachmentKind(mimeType: "application/x-rar-compressed") == .archive)
    }

    @Test("JSON / XML resolve to .code")
    func code() {
        #expect(AttachmentKind(mimeType: "application/json") == .code)
        #expect(AttachmentKind(mimeType: "application/xml") == .code)
        #expect(AttachmentKind(mimeType: "text/xml") == .code)
    }

    @Test("text/* (other than xml/csv) resolves to .text")
    func text() {
        #expect(AttachmentKind(mimeType: "text/plain") == .text)
        #expect(AttachmentKind(mimeType: "text/markdown") == .text)
        #expect(AttachmentKind(mimeType: "text/html") == .text)
    }

    // MARK: - Fallback

    @Test("unknown mime types fall back to .other")
    func other_fallback() {
        #expect(AttachmentKind(mimeType: "application/octet-stream") == .other)
        #expect(AttachmentKind(mimeType: "") == .other)
        #expect(AttachmentKind(mimeType: "foo/bar") == .other)
    }

    // MARK: - Case-insensitive normalisation (RFC 2045 §5.1)

    @Test("uppercase / mixed-case mime types resolve to the same kind")
    func case_insensitive() {
        #expect(AttachmentKind(mimeType: "Image/JPEG") == .image)
        #expect(AttachmentKind(mimeType: "IMAGE/PNG") == .image)
        #expect(AttachmentKind(mimeType: "Video/MP4") == .video)
        #expect(AttachmentKind(mimeType: "AUDIO/MPEG") == .audio)
        #expect(AttachmentKind(mimeType: "Application/PDF") == .pdf)
        #expect(AttachmentKind(mimeType: "Text/CSV") == .spreadsheet)
        #expect(AttachmentKind(mimeType: "APPLICATION/JSON") == .code)
    }

    // MARK: - Precedence rules

    @Test("text/csv is .spreadsheet, not .text (exact match wins over text/* prefix)")
    func csv_precedence() {
        #expect(AttachmentKind(mimeType: "text/csv") == .spreadsheet)
    }

    @Test("text/xml is .code, not .text (exact match wins over text/* prefix)")
    func xml_precedence() {
        #expect(AttachmentKind(mimeType: "text/xml") == .code)
    }

    // MARK: - Helpers

    @Test("isMedia is true for image, video, audio")
    func isMedia() {
        #expect(AttachmentKind.image.isMedia)
        #expect(AttachmentKind.video.isMedia)
        #expect(AttachmentKind.audio.isMedia)
        #expect(!AttachmentKind.pdf.isMedia)
        #expect(!AttachmentKind.spreadsheet.isMedia)
        #expect(!AttachmentKind.document.isMedia)
        #expect(!AttachmentKind.presentation.isMedia)
        #expect(!AttachmentKind.archive.isMedia)
        #expect(!AttachmentKind.code.isMedia)
        #expect(!AttachmentKind.text.isMedia)
        #expect(!AttachmentKind.other.isMedia)
    }

    @Test("hasTimebasedTrack is true for audio and video only")
    func hasTimebasedTrack() {
        #expect(AttachmentKind.audio.hasTimebasedTrack)
        #expect(AttachmentKind.video.hasTimebasedTrack)
        #expect(!AttachmentKind.image.hasTimebasedTrack)
        #expect(!AttachmentKind.pdf.hasTimebasedTrack)
        #expect(!AttachmentKind.other.hasTimebasedTrack)
    }
}
