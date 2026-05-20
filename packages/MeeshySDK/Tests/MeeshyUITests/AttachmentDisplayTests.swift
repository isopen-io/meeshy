import Testing
import MeeshySDK
@testable import MeeshyUI

@Suite("AttachmentDisplay")
struct AttachmentDisplayTests {

    @Test("each AttachmentKind maps to a non-empty icon, hex color, and label")
    func every_kind_has_complete_display() {
        for kind in AttachmentKind.allCases {
            let display = AttachmentDisplay.make(for: kind)
            #expect(!display.icon.isEmpty, "icon for \(kind)")
            #expect(!display.hexTintColor.isEmpty, "hexTintColor for \(kind)")
            #expect(!display.shortLabel.isEmpty, "shortLabel for \(kind)")
        }
    }

    @Test("image kind exposes camera + blue tint")
    func image_display() {
        let d = AttachmentDisplay.make(for: .image)
        #expect(d.icon == "camera.fill")
        #expect(d.hexTintColor == "4ECDC4")
    }

    @Test("video kind exposes video.fill + red hex (FF6B6B)")
    func video_display() {
        let d = AttachmentDisplay.make(for: .video)
        #expect(d.icon == "video.fill")
        // Matches the legacy hex used by PostModels.swift / StoryReaderRepresentable.swift
        #expect(d.hexTintColor == "FF6B6B")
    }

    @Test("audio kind exposes waveform + purple hex (9B59B6)")
    func audio_display() {
        let d = AttachmentDisplay.make(for: .audio)
        #expect(d.icon == "waveform")
        #expect(d.hexTintColor == "9B59B6")
    }

    @Test("pdf kind exposes doc.fill")
    func pdf_display() {
        let d = AttachmentDisplay.make(for: .pdf)
        #expect(d.icon == "doc.fill")
        #expect(d.shortLabel == "PDF")
    }

    @Test("spreadsheet kind exposes tablecells.fill + Excel label")
    func spreadsheet_display() {
        let d = AttachmentDisplay.make(for: .spreadsheet)
        #expect(d.icon == "tablecells.fill")
        #expect(d.shortLabel == "Excel")
    }

    @Test("document kind exposes doc.text.fill + Word label")
    func document_display() {
        let d = AttachmentDisplay.make(for: .document)
        #expect(d.icon == "doc.text.fill")
        #expect(d.shortLabel == "Word")
    }

    @Test("presentation kind exposes chart.bar.doc.horizontal.fill + PowerPoint label")
    func presentation_display() {
        let d = AttachmentDisplay.make(for: .presentation)
        #expect(d.icon == "chart.bar.doc.horizontal.fill")
        #expect(d.shortLabel == "PowerPoint")
    }

    @Test("archive kind exposes doc.zipper")
    func archive_display() {
        let d = AttachmentDisplay.make(for: .archive)
        #expect(d.icon == "doc.zipper")
    }

    @Test("code kind exposes curlybraces")
    func code_display() {
        let d = AttachmentDisplay.make(for: .code)
        #expect(d.icon == "curlybraces")
    }

    @Test("other kind falls back to paperclip")
    func other_display() {
        let d = AttachmentDisplay.make(for: .other)
        #expect(d.icon == "paperclip")
    }

    @Test("convenience .make(for: mimeType) resolves kind then display")
    func mime_shortcut() {
        let imageDisplay = AttachmentDisplay.make(for: "image/png")
        #expect(imageDisplay.icon == "camera.fill")
        let pdfDisplay = AttachmentDisplay.make(for: "application/pdf")
        #expect(pdfDisplay.icon == "doc.fill")
        let unknownDisplay = AttachmentDisplay.make(for: "application/octet-stream")
        #expect(unknownDisplay.icon == "paperclip")
    }
}
