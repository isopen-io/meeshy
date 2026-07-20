import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Covers `StoryCanvasUIView.accessibilityElements` in mode `.play` (the reader)
/// alongside the pre-existing `.edit` behaviour. Before this fix the getter
/// short-circuited with `guard mode == .edit else { return nil }` which made
/// every story slide invisible to VoiceOver users in the reader.
///
/// The Prisme Linguistique contract (`systemLanguage > regionalLanguage >
/// customDestinationLanguage`) is exercised by injecting a mock
/// `StoryReaderContext` with a chosen `preferredLanguages` array and asserting
/// the spoken label matches the resolved translation, never the device locale.
@MainActor
final class StoryCanvasUIView_ReaderAccessibilityTests: XCTestCase {

    // MARK: - Helpers

    private func makeView(slide: StorySlide, mode: RenderMode) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: slide, mode: mode)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        return view
    }

    private func makeSlide(texts: [StoryTextObject] = [],
                           stickers: [StorySticker]? = nil,
                           media: [StoryMediaObject]? = nil) -> StorySlide {
        let effects = StoryEffects(stickerObjects: stickers,
                                   textObjects: texts,
                                   mediaObjects: media)
        return StorySlide(id: "slide", effects: effects, duration: 5)
    }

    private func elements(_ view: StoryCanvasUIView) -> [UIAccessibilityElement] {
        (view.accessibilityElements as? [UIAccessibilityElement]) ?? []
    }

    // MARK: - Regression: edit-mode behaviour preserved

    /// Localized text prefix — resolved through the same catalog key as the
    /// production code (`story.canvas.a11y.textPrefix`) so the assertion
    /// stays correct regardless of the test host's locale, rather than
    /// pinning one hardcoded language's literal.
    private var textPrefix: String {
        String(localized: "story.canvas.a11y.textPrefix", defaultValue: "Texte", bundle: .module)
    }

    private var imageLabel: String {
        String(localized: "story.media.image", defaultValue: "Image", bundle: .module)
    }

    func test_accessibilityElements_inEditMode_returnsExisting() {
        let slide = makeSlide(
            texts: [StoryTextObject(id: "t1", text: "Hello")],
            stickers: [StorySticker(id: "s1", emoji: "🔥")],
            media: [StoryMediaObject(id: "m1", mediaType: "image", aspectRatio: 1.0)]
        )
        let view = makeView(slide: slide, mode: .edit)

        let labels = elements(view).map(\.accessibilityLabel)
        XCTAssertTrue(labels.contains("\(textPrefix) : Hello"),
                      "Edit mode must keep the localized text prefix for the composer.")
        XCTAssertTrue(labels.contains(imageLabel))
        XCTAssertTrue(labels.contains(where: { $0?.hasPrefix("Sticker") == true }))
        XCTAssertEqual(elements(view).count, 3)
    }

    func test_accessibilityElements_inEditMode_exposesCustomActions() {
        let slide = makeSlide(texts: [StoryTextObject(id: "t1", text: "Hello")])
        let view = makeView(slide: slide, mode: .edit)

        let text = elements(view).first(where: { $0.accessibilityLabel == "\(textPrefix) : Hello" })
        XCTAssertNotNil(text?.accessibilityCustomActions)
        XCTAssertEqual(text?.accessibilityCustomActions?.count, 3,
                       "Edit mode must keep delete/duplicate/send-to-back custom actions.")
    }

    // MARK: - Reader mode (P2 bug fix)

    func test_accessibilityElements_inPlayMode_includesAllText() {
        let slide = makeSlide(texts: [
            StoryTextObject(id: "t1", text: "Bonjour"),
            StoryTextObject(id: "t2", text: "Monde"),
        ])
        let view = makeView(slide: slide, mode: .play)

        let labels = elements(view).map(\.accessibilityLabel)
        XCTAssertTrue(labels.contains("Bonjour"),
                      "Reader must expose text content to VoiceOver — was nil before the fix.")
        XCTAssertTrue(labels.contains("Monde"))
        XCTAssertEqual(labels.count, 2)
    }

    func test_accessibilityElements_inPlayMode_includesStickers() {
        let slide = makeSlide(
            texts: [],
            stickers: [
                StorySticker(id: "s1", emoji: "🔥"),
                StorySticker(id: "s2", emoji: "❤️"),
            ]
        )
        let view = makeView(slide: slide, mode: .play)

        let stickers = elements(view).filter { $0.accessibilityTraits.contains(.image) }
        XCTAssertEqual(stickers.count, 2)
        for sticker in stickers {
            XCTAssertTrue(sticker.accessibilityLabel?.hasPrefix("Sticker") == true,
                          "Each sticker must announce itself with a 'Sticker …' label, got \(String(describing: sticker.accessibilityLabel)).")
        }
    }

    func test_accessibilityElements_inPlayMode_announcesBackgroundMedia() {
        let bg = StoryMediaObject(id: "bg",
                                  mediaType: "image",
                                  aspectRatio: 0.5625,
                                  isBackground: true)
        let videoBg = StoryMediaObject(id: "vbg",
                                       mediaType: "video",
                                       aspectRatio: 0.5625,
                                       isBackground: true)
        let imgSlide = makeSlide(media: [bg])
        let vidSlide = makeSlide(media: [videoBg])

        let imgView = makeView(slide: imgSlide, mode: .play)
        let vidView = makeView(slide: vidSlide, mode: .play)

        let expectedPhoto = String(localized: "story.canvas.a11y.backgroundPhoto", defaultValue: "Photo de fond", bundle: .module)
        let expectedVideo = String(localized: "story.canvas.a11y.backgroundVideo", defaultValue: "Vidéo de fond", bundle: .module)
        XCTAssertEqual(elements(imgView).first?.accessibilityLabel, expectedPhoto)
        XCTAssertEqual(elements(vidView).first?.accessibilityLabel, expectedVideo)
    }

    func test_accessibilityElements_textInPreferredLanguage() {
        // User systemLanguage = "es", regionalLanguage = "en".
        // Story text was authored in French, with translations to both.
        let text = StoryTextObject(
            id: "t1",
            text: "Bonjour le monde",
            translations: [
                "en": "Hello world",
                "es": "Hola mundo",
            ],
            sourceLanguage: "fr"
        )
        let slide = makeSlide(texts: [text])
        let view = makeView(slide: slide, mode: .play)
        view.setReaderContext(StoryReaderContext(preferredLanguages: ["es", "en"]))

        let label = elements(view).first?.accessibilityLabel
        XCTAssertEqual(label, "Hola mundo",
                       "Prisme: when systemLanguage=es matches, VoiceOver must speak Spanish — not the original French nor English regional fallback.")
    }

    func test_accessibilityElements_textFallsBackToOriginal_whenNoTranslationMatches() {
        // No matching translation → Prisme rule: return original text, not a
        // first-translation fallback.
        let text = StoryTextObject(
            id: "t1",
            text: "Bonjour",
            translations: ["de": "Hallo"],
            sourceLanguage: "fr"
        )
        let slide = makeSlide(texts: [text])
        let view = makeView(slide: slide, mode: .play)
        view.setReaderContext(StoryReaderContext(preferredLanguages: ["es", "en"]))

        XCTAssertEqual(elements(view).first?.accessibilityLabel, "Bonjour")
    }

    func test_accessibilityElements_emptySlide_returnsEmpty() {
        let slide = makeSlide()  // no text / sticker / media
        let view = makeView(slide: slide, mode: .play)
        XCTAssertTrue(elements(view).isEmpty,
                      "Empty slide must surface no accessibility elements — never nil.")
    }

    func test_accessibilityElements_inPlayMode_doesNotExposeDestructiveCustomActions() {
        let slide = makeSlide(texts: [StoryTextObject(id: "t1", text: "Hello")])
        let view = makeView(slide: slide, mode: .play)

        let text = elements(view).first
        XCTAssertNotNil(text)
        // Reader mode is read-only — custom actions (delete/duplicate/back)
        // only make sense in the composer. Exposing them in the reader would
        // let VoiceOver users destroy stories they don't own.
        XCTAssertTrue((text?.accessibilityCustomActions ?? []).isEmpty,
                      "Reader must not advertise destructive custom actions.")
    }

    func test_view_isNotItselfAnAccessibilityElement() {
        // The view is a container, not a leaf — otherwise VoiceOver would
        // skip every child element.
        let view = makeView(slide: makeSlide(texts: [StoryTextObject(id: "t1", text: "Hi")]), mode: .play)
        XCTAssertFalse(view.isAccessibilityElement)
    }
}
