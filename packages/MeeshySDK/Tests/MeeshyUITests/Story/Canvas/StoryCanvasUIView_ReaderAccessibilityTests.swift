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
        // **La fixture CÂBLE l'éditeur (#4046)**, comme l'atelier de production
        // (`StoryComposerView+Canvas.swift:1131`). Sans lui, « Modifier » n'a
        // personne derrière elle et la règle la retire — à juste titre : ces
        // témoins vérifient que VoiceOver annonce l'action, pas qu'elle est
        // annoncée dans le vide.
        view.onItemDoubleTapped = { _, _ in }
        return view
    }

    private func makeSlide(texts: [StoryTextObject] = [],
                           stickers: [StorySticker]? = nil,
                           media: [StoryMediaObject]? = nil,
                           locations: [StoryLocationObject] = []) -> StorySlide {
        let effects = StoryEffects(stickerObjects: stickers,
                                   textObjects: texts,
                                   locationObjects: locations,
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

    private var locationWord: String {
        String(localized: "story.canvas.a11y.location", defaultValue: "Lieu", bundle: .module)
    }

    private var modifierActionName: String {
        String(localized: "story.composer.editSlide", defaultValue: "Modifier", bundle: .module)
    }

    private func compositionCountLabel(_ count: Int) -> String {
        count == 1
            ? String(localized: "story.composer.a11y.compositionCount.one", defaultValue: "1 objet", bundle: .module)
            : String(localized: "story.composer.a11y.compositionCount.many", defaultValue: "\(count) objets", bundle: .module)
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
        // A summary element is prepended ahead of the 3 per-object elements —
        // the first VoiceOver stop on a non-empty slide is now an overview,
        // not an arbitrary object.
        XCTAssertEqual(elements(view).count, 4)
        let summary = labels.first ?? nil
        XCTAssertTrue(summary?.contains("Story") == true)
        XCTAssertTrue(summary?.contains(compositionCountLabel(3)) == true)
    }

    func test_accessibilityElements_inEditMode_exposesCustomActions() {
        let slide = makeSlide(texts: [StoryTextObject(id: "t1", text: "Hello")])
        let view = makeView(slide: slide, mode: .edit)

        let text = elements(view).first(where: { $0.accessibilityLabel == "\(textPrefix) : Hello" })
        XCTAssertNotNil(text?.accessibilityCustomActions)
        XCTAssertEqual(text?.accessibilityCustomActions?.count, 4,
                       "Edit mode must keep delete/duplicate/send-to-back custom actions, plus Modifier.")
    }

    func test_accessibilityElements_inEditMode_locationObjects_areExposed() {
        let location = StoryLocationObject(id: "loc1", place: SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Paris"))
        let slide = makeSlide(locations: [location])
        let view = makeView(slide: slide, mode: .edit)

        let loc = elements(view).first(where: { $0.accessibilityLabel == "\(locationWord) : Paris" })
        XCTAssertNotNil(loc, "A location pin must be exposed to VoiceOver with 'Lieu : {name}'.")
        XCTAssertTrue(loc?.accessibilityTraits.contains(.staticText) == true)
    }

    func test_accessibilityElements_inEditMode_locationObjects_haveDeleteDuplicateSendToBack_butNotModifier() {
        let location = StoryLocationObject(id: "loc1", place: SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Paris"))
        let slide = makeSlide(locations: [location])
        let view = makeView(slide: slide, mode: .edit)

        let loc = elements(view).first(where: { $0.accessibilityLabel == "\(locationWord) : Paris" })
        // Delete / Duplicate / Send-to-back — never "Modifier": there is no
        // editor to open for a location pin (D4 — no VoiceOver dead end).
        XCTAssertEqual(loc?.accessibilityCustomActions?.count, 3)
        XCTAssertFalse(loc?.accessibilityCustomActions?.contains(where: { $0.name == modifierActionName }) ?? true)
    }

    func test_accessibilityElements_inEditMode_stickerLabel_resolvesEmojiName() {
        let slide = makeSlide(stickers: [StorySticker(id: "s1", emoji: "🔥")])
        let view = makeView(slide: slide, mode: .edit)

        let labels = elements(view).map(\.accessibilityLabel)
        // Must resolve through the same Unicode-name helper as `.play` mode
        // ("Sticker Fire"), not a raw concatenation of the emoji glyph.
        XCTAssertTrue(labels.contains(where: { $0?.contains("Fire") == true }),
                      "Sticker label must resolve the emoji's Unicode name, got: \(labels)")
    }

    func test_accessibilityElements_inEditMode_emptySlide_returnsEmpty_noSummary() {
        let slide = makeSlide()
        let view = makeView(slide: slide, mode: .edit)

        XCTAssertTrue(elements(view).isEmpty,
                      "An empty slide must never synthesize a phantom summary element.")
    }

    func test_accessibilityElements_inEditMode_summaryElement_hasNoCustomActions() {
        let slide = makeSlide(texts: [StoryTextObject(id: "t1", text: "Hello")])
        let view = makeView(slide: slide, mode: .edit)

        let summary = elements(view).first
        XCTAssertTrue(summary?.accessibilityCustomActions?.isEmpty ?? true,
                      "The composition summary is read-only — it must not carry destructive actions.")
    }

    func test_accessibilityElements_inEditMode_textAndMedia_haveModifierAsFirstAction() {
        let slide = makeSlide(
            texts: [StoryTextObject(id: "t1", text: "Hello")],
            media: [StoryMediaObject(id: "m1", mediaType: "image", aspectRatio: 1.0)]
        )
        let view = makeView(slide: slide, mode: .edit)

        let text = elements(view).first(where: { $0.accessibilityLabel == "\(textPrefix) : Hello" })
        let media = elements(view).first(where: { $0.accessibilityLabel == imageLabel })
        XCTAssertEqual(text?.accessibilityCustomActions?.first?.name, modifierActionName)
        XCTAssertEqual(media?.accessibilityCustomActions?.first?.name, modifierActionName)
    }

    func test_accessibilityElements_inEditMode_modifierAction_invokesOnItemDoubleTapped() {
        let slide = makeSlide(texts: [StoryTextObject(id: "t1", text: "Hello")])
        let view = makeView(slide: slide, mode: .edit)

        var invokedId: String?
        var invokedKind: StoryCanvasUIView.CanvasItemKind?
        view.onItemDoubleTapped = { id, kind in
            invokedId = id
            invokedKind = kind
        }

        let text = elements(view).first(where: { $0.accessibilityLabel == "\(textPrefix) : Hello" })
        let modifier = text?.accessibilityCustomActions?.first(where: { $0.name == modifierActionName })
        XCTAssertNotNil(modifier)
        _ = modifier?.actionHandler?(modifier!)

        XCTAssertEqual(invokedId, "t1")
        XCTAssertEqual(invokedKind, .text)
    }

    func test_accessibilityElements_inEditMode_stickerAndLocation_haveNoModifierAction() {
        let location = StoryLocationObject(id: "loc1", place: SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Paris"))
        let slide = makeSlide(stickers: [StorySticker(id: "s1", emoji: "🔥")], locations: [location])
        let view = makeView(slide: slide, mode: .edit)

        let sticker = elements(view).first(where: { $0.accessibilityLabel?.hasPrefix("Sticker") == true })
        XCTAssertEqual(sticker?.accessibilityCustomActions?.count, 3)
        XCTAssertNotEqual(sticker?.accessibilityCustomActions?.first?.name, modifierActionName)
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
