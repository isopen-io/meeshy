import Testing
import Foundation
@testable import MeeshySDK

@Suite("MimeTypeResolver")
struct MimeTypeResolverTests {

    // MARK: - Image extensions

    @Test("image extensions resolve to image/* mime types")
    func image_extensions() {
        #expect(MimeTypeResolver.mimeType(forExtension: "jpg") == "image/jpeg")
        #expect(MimeTypeResolver.mimeType(forExtension: "jpeg") == "image/jpeg")
        #expect(MimeTypeResolver.mimeType(forExtension: "png") == "image/png")
        #expect(MimeTypeResolver.mimeType(forExtension: "gif") == "image/gif")
        #expect(MimeTypeResolver.mimeType(forExtension: "webp") == "image/webp")
        #expect(MimeTypeResolver.mimeType(forExtension: "heic") == "image/heic")
        #expect(MimeTypeResolver.mimeType(forExtension: "heif") == "image/heic")
        #expect(MimeTypeResolver.mimeType(forExtension: "svg") == "image/svg+xml")
        #expect(MimeTypeResolver.mimeType(forExtension: "bmp") == "image/bmp")
        #expect(MimeTypeResolver.mimeType(forExtension: "tiff") == "image/tiff")
        #expect(MimeTypeResolver.mimeType(forExtension: "tif") == "image/tiff")
    }

    // MARK: - Video extensions

    @Test("video extensions resolve to video/* mime types")
    func video_extensions() {
        #expect(MimeTypeResolver.mimeType(forExtension: "mp4") == "video/mp4")
        #expect(MimeTypeResolver.mimeType(forExtension: "m4v") == "video/mp4")
        #expect(MimeTypeResolver.mimeType(forExtension: "mov") == "video/quicktime")
        #expect(MimeTypeResolver.mimeType(forExtension: "avi") == "video/x-msvideo")
        #expect(MimeTypeResolver.mimeType(forExtension: "mkv") == "video/x-matroska")
        #expect(MimeTypeResolver.mimeType(forExtension: "webm") == "video/webm")
    }

    // MARK: - Audio extensions

    @Test("audio extensions resolve to audio/* mime types")
    func audio_extensions() {
        #expect(MimeTypeResolver.mimeType(forExtension: "mp3") == "audio/mpeg")
        #expect(MimeTypeResolver.mimeType(forExtension: "m4a") == "audio/mp4")
        #expect(MimeTypeResolver.mimeType(forExtension: "aac") == "audio/mp4")
        #expect(MimeTypeResolver.mimeType(forExtension: "wav") == "audio/wav")
        #expect(MimeTypeResolver.mimeType(forExtension: "ogg") == "audio/ogg")
        #expect(MimeTypeResolver.mimeType(forExtension: "oga") == "audio/ogg")
        #expect(MimeTypeResolver.mimeType(forExtension: "flac") == "audio/flac")
        #expect(MimeTypeResolver.mimeType(forExtension: "wma") == "audio/x-ms-wma")
    }

    // MARK: - Document extensions

    @Test("Office documents resolve to their canonical mime types")
    func office_extensions() {
        #expect(MimeTypeResolver.mimeType(forExtension: "pdf") == "application/pdf")
        #expect(MimeTypeResolver.mimeType(forExtension: "doc") == "application/msword")
        // The .docx fix : previously FeedView mapped to msword which made
        // Excel/Word indistinguishable in AttachmentKind.
        #expect(MimeTypeResolver.mimeType(forExtension: "docx") == "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        #expect(MimeTypeResolver.mimeType(forExtension: "xls") == "application/vnd.ms-excel")
        #expect(MimeTypeResolver.mimeType(forExtension: "xlsx") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        #expect(MimeTypeResolver.mimeType(forExtension: "ppt") == "application/vnd.ms-powerpoint")
        #expect(MimeTypeResolver.mimeType(forExtension: "pptx") == "application/vnd.openxmlformats-officedocument.presentationml.presentation")
    }

    @Test("iWork extensions resolve correctly")
    func iwork_extensions() {
        #expect(MimeTypeResolver.mimeType(forExtension: "pages") == "application/x-iwork-pages-sffpages")
        #expect(MimeTypeResolver.mimeType(forExtension: "numbers") == "application/x-iwork-numbers-sffnumbers")
        #expect(MimeTypeResolver.mimeType(forExtension: "keynote") == "application/x-iwork-keynote-sffkey")
    }

    // MARK: - Text & Code

    @Test("text and code extensions resolve correctly")
    func text_code_extensions() {
        #expect(MimeTypeResolver.mimeType(forExtension: "txt") == "text/plain")
        #expect(MimeTypeResolver.mimeType(forExtension: "csv") == "text/csv")
        #expect(MimeTypeResolver.mimeType(forExtension: "json") == "application/json")
        #expect(MimeTypeResolver.mimeType(forExtension: "xml") == "application/xml")
        #expect(MimeTypeResolver.mimeType(forExtension: "html") == "text/html")
        #expect(MimeTypeResolver.mimeType(forExtension: "htm") == "text/html")
        #expect(MimeTypeResolver.mimeType(forExtension: "css") == "text/css")
        #expect(MimeTypeResolver.mimeType(forExtension: "js") == "application/javascript")
        #expect(MimeTypeResolver.mimeType(forExtension: "ts") == "application/typescript")
        #expect(MimeTypeResolver.mimeType(forExtension: "py") == "text/x-python")
        #expect(MimeTypeResolver.mimeType(forExtension: "swift") == "text/x-swift")
        #expect(MimeTypeResolver.mimeType(forExtension: "md") == "text/markdown")
        #expect(MimeTypeResolver.mimeType(forExtension: "markdown") == "text/markdown")
        #expect(MimeTypeResolver.mimeType(forExtension: "rtf") == "application/rtf")
        #expect(MimeTypeResolver.mimeType(forExtension: "log") == "text/plain")
    }

    // MARK: - Archives

    @Test("archive extensions resolve correctly")
    func archive_extensions() {
        #expect(MimeTypeResolver.mimeType(forExtension: "zip") == "application/zip")
        #expect(MimeTypeResolver.mimeType(forExtension: "rar") == "application/x-rar-compressed")
        #expect(MimeTypeResolver.mimeType(forExtension: "7z") == "application/x-7z-compressed")
        #expect(MimeTypeResolver.mimeType(forExtension: "tar") == "application/x-tar")
        #expect(MimeTypeResolver.mimeType(forExtension: "gz") == "application/gzip")
        #expect(MimeTypeResolver.mimeType(forExtension: "gzip") == "application/gzip")
    }

    // MARK: - Case-insensitivity & normalization

    @Test("extensions are case-insensitive")
    func case_insensitive() {
        #expect(MimeTypeResolver.mimeType(forExtension: "JPG") == "image/jpeg")
        #expect(MimeTypeResolver.mimeType(forExtension: "PDF") == "application/pdf")
        #expect(MimeTypeResolver.mimeType(forExtension: "Xlsx") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    }

    @Test("leading dot is stripped")
    func leading_dot() {
        #expect(MimeTypeResolver.mimeType(forExtension: ".pdf") == "application/pdf")
        #expect(MimeTypeResolver.mimeType(forExtension: ".PNG") == "image/png")
        #expect(MimeTypeResolver.mimeType(forExtension: ".xlsx") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    }

    // MARK: - Fallback

    @Test("unknown extensions fall back to application/octet-stream")
    func unknown_extension() {
        #expect(MimeTypeResolver.mimeType(forExtension: "unknownext") == "application/octet-stream")
        #expect(MimeTypeResolver.mimeType(forExtension: "") == "application/octet-stream")
        #expect(MimeTypeResolver.mimeType(forExtension: "xyz123") == "application/octet-stream")
    }

    // MARK: - URL / filename helpers

    @Test("mimeType(forURL:) extracts extension from the URL")
    func from_URL() {
        let url1 = URL(fileURLWithPath: "/tmp/foo.pdf")
        #expect(MimeTypeResolver.mimeType(forURL: url1) == "application/pdf")
        let url2 = URL(string: "https://example.com/photo.JPG")!
        #expect(MimeTypeResolver.mimeType(forURL: url2) == "image/jpeg")
        let url3 = URL(string: "https://example.com/file")!
        #expect(MimeTypeResolver.mimeType(forURL: url3) == "application/octet-stream")
    }

    @Test("mimeType(forFilename:) extracts extension from the filename")
    func from_filename() {
        #expect(MimeTypeResolver.mimeType(forFilename: "report.xlsx") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        #expect(MimeTypeResolver.mimeType(forFilename: "ARCHIVE.ZIP") == "application/zip")
        #expect(MimeTypeResolver.mimeType(forFilename: "file.tar.gz") == "application/gzip")
        #expect(MimeTypeResolver.mimeType(forFilename: "noext") == "application/octet-stream")
        #expect(MimeTypeResolver.mimeType(forFilename: "") == "application/octet-stream")
    }

    // MARK: - Reverse direction (preferredExtension)

    @Test("preferredExtension(for mimeType:) returns a sensible extension")
    func preferred_extension() {
        #expect(MimeTypeResolver.preferredExtension(for: "image/jpeg") == "jpg")
        #expect(MimeTypeResolver.preferredExtension(for: "image/png") == "png")
        #expect(MimeTypeResolver.preferredExtension(for: "image/gif") == "gif")
        #expect(MimeTypeResolver.preferredExtension(for: "audio/mpeg") == "mp3")
        #expect(MimeTypeResolver.preferredExtension(for: "audio/mp4") == "m4a")
        #expect(MimeTypeResolver.preferredExtension(for: "audio/wav") == "wav")
        #expect(MimeTypeResolver.preferredExtension(for: "video/mp4") == "mp4")
        #expect(MimeTypeResolver.preferredExtension(for: "video/quicktime") == "mov")
        #expect(MimeTypeResolver.preferredExtension(for: "application/pdf") == "pdf")
        #expect(MimeTypeResolver.preferredExtension(for: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") == "xlsx")
    }

    @Test("preferredExtension is case-insensitive on the input mime type")
    func preferred_extension_case_insensitive() {
        #expect(MimeTypeResolver.preferredExtension(for: "Image/JPEG") == "jpg")
        #expect(MimeTypeResolver.preferredExtension(for: "APPLICATION/PDF") == "pdf")
    }

    @Test("preferredExtension returns nil for unknown mime types")
    func preferred_extension_unknown() {
        #expect(MimeTypeResolver.preferredExtension(for: "application/octet-stream") == nil)
        #expect(MimeTypeResolver.preferredExtension(for: "foo/bar") == nil)
        #expect(MimeTypeResolver.preferredExtension(for: "") == nil)
    }

    // MARK: - Integration with AttachmentKind

    @Test("mime types resolved by resolver align with AttachmentKind families")
    func aligns_with_attachment_kind() {
        // Every well-known extension should produce a mime that AttachmentKind
        // recognises (i.e. NOT .other).
        let mappings: [(String, AttachmentKind)] = [
            ("jpg", .image), ("png", .image), ("gif", .image), ("webp", .image), ("heic", .image),
            ("mp4", .video), ("mov", .video), ("webm", .video),
            ("mp3", .audio), ("m4a", .audio), ("wav", .audio),
            ("pdf", .pdf),
            ("xls", .spreadsheet), ("xlsx", .spreadsheet), ("csv", .spreadsheet),
            ("doc", .document), ("docx", .document), ("rtf", .document),
            ("ppt", .presentation), ("pptx", .presentation),
            ("zip", .archive), ("rar", .archive), ("tar", .archive), ("7z", .archive), ("gz", .archive),
            ("json", .code), ("xml", .code),
            ("txt", .text), ("md", .text), ("html", .text)
        ]
        for (ext, expectedKind) in mappings {
            let mime = MimeTypeResolver.mimeType(forExtension: ext)
            let kind = AttachmentKind(mimeType: mime)
            #expect(kind == expectedKind, "ext=\(ext) mime=\(mime) → expected \(expectedKind), got \(kind)")
        }
    }
}
