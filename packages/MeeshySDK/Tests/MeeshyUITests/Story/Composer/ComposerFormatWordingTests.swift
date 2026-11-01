import XCTest
import UIKit
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le compositeur nomme le format qu'il compose** (#13913) : la story, le post
/// et le réel montent la même scène, et aucune brique de l'atelier ne dit
/// « story » quand on compose un post ou un réel, ni l'inverse.
@MainActor
final class ComposerFormatWordingTests: XCTestCase {

    private static let locales = ["fr", "en", "es", "pt-BR", "de", "it", "ar"]

    private static let storyKeys = [
        "story.composer.a11y.composition",
        "story.location.add.a11y",
        "story.mention.add.a11y",
        "story.draft.resume.title",
        "story.draft.resume.a11y",
        "story.sound.library.emptyMine",
        "story.composer.a11y.publishStarted"
    ]

    private static let storyWords = ["story", "stories", "historia", "história", "storia", "قصة", "قصت"]
    private static let otherWords = ["post", "réel", "reel", "منشور", "ريل"]

    private static var catalogURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("Sources/MeeshyUI/Resources/Localizable.xcstrings")
    }

    private static func values(for key: String) throws -> [String: String] {
        let data = try Data(contentsOf: catalogURL)
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        let entry = try XCTUnwrap(strings[key] as? [String: Any], "clé absente : \(key)")
        let localizations = try XCTUnwrap(entry["localizations"] as? [String: [String: Any]])
        return localizations.compactMapValues { ($0["stringUnit"] as? [String: Any])?["value"] as? String }
    }

    private static func says(_ words: [String], in text: String) -> Bool {
        words.contains { text.lowercased().contains($0) }
    }

    private static func everyLabel(_ wording: ComposerFormatWording) -> [String] {
        [wording.compositionSummary(count: "2", objects: "Texte"),
         wording.addPlace,
         wording.mention,
         wording.draftResumeTitle,
         wording.draftResumeAccessibility(slideCount: 2),
         wording.soundLibraryEmptyMine,
         wording.publishStarted]
    }

    private func canvas(_ wording: ComposerFormatWording?) -> StoryCanvasUIView {
        var effets = StoryEffects()
        effets.textObjects = [StoryTextObject(id: "t1", text: "Bonjour")]
        var slide = StorySlide(id: "s1")
        slide.effects = effets
        let vue = StoryCanvasUIView(slide: slide, mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 270, height: 480)
        if let wording { vue.formatWording = wording }
        return vue
    }

    private func summary(_ vue: StoryCanvasUIView) -> String? {
        (vue.accessibilityElements as? [UIAccessibilityElement])?.first?.accessibilityLabel
    }

    func test_catalog_postAndReelKeys_neverSayStory_inSevenLanguages() throws {
        for suffix in [".post", ".reel"] {
            for key in Self.storyKeys.map({ $0 + suffix }) {
                let values = try Self.values(for: key)
                for locale in Self.locales {
                    let value = try XCTUnwrap(values[locale], "\(key) sans \(locale)")
                    XCTAssertFalse(value.trimmingCharacters(in: .whitespaces).isEmpty, "\(key) vide en \(locale)")
                    XCTAssertFalse(Self.says(Self.storyWords, in: value), "\(key) dit « story » en \(locale) : \(value)")
                }
                XCTAssertNotEqual(values["en"], values["fr"], "\(key) : l'anglais recopie le français")
            }
        }
    }

    func test_catalog_storyKeys_neverSayPostOrReel_inSevenLanguages() throws {
        for key in Self.storyKeys {
            let values = try Self.values(for: key)
            for locale in Self.locales {
                let value = try XCTUnwrap(values[locale], "\(key) sans \(locale)")
                XCTAssertFalse(Self.says(Self.otherWords, in: value), "\(key) dit un autre format en \(locale) : \(value)")
            }
        }
    }

    func test_wording_postAndReel_noLabelSaysStory() {
        for type in [PostType.post, .reel, .status] {
            for label in Self.everyLabel(ComposerFormatWording(type)) {
                XCTAssertFalse(Self.says(Self.storyWords, in: label), "\(type) dit « story » : \(label)")
            }
        }
    }

    func test_wording_story_noLabelSaysPostOrReel() {
        for label in Self.everyLabel(.story) {
            XCTAssertFalse(Self.says(Self.otherWords, in: label), "la story dit un autre format : \(label)")
        }
    }

    func test_wording_eachFormatHasItsOwnLabels() {
        let story = Self.everyLabel(.story)
        let post = Self.everyLabel(ComposerFormatWording(.post))
        let reel = Self.everyLabel(ComposerFormatWording(.reel))
        for index in story.indices {
            XCTAssertNotEqual(story[index], post[index])
            XCTAssertNotEqual(story[index], reel[index])
            XCTAssertNotEqual(post[index], reel[index])
        }
    }

    func test_canvasSummary_onAPost_announcesThePost() throws {
        let post = try XCTUnwrap(summary(canvas(ComposerFormatWording(.post))))
        let story = try XCTUnwrap(summary(canvas(nil)))
        XCTAssertFalse(Self.says(Self.storyWords, in: post), "la scène d'un post s'annonce « \(post) »")
        XCTAssertNotEqual(post, story)
        XCTAssertTrue(post.hasPrefix(ComposerFormatWording(.post).compositionSummary(count: "", objects: "")
            .components(separatedBy: ",").first ?? ""), "le résumé ne vient pas de la table : \(post)")
    }

    func test_canvasSummary_withoutHost_staysTheStory() throws {
        let story = try XCTUnwrap(summary(canvas(nil)))
        XCTAssertTrue(story.hasPrefix(ComposerFormatWording.story.compositionSummary(count: "", objects: "")
            .components(separatedBy: ",").first ?? "∅"), "« \(story) »")
    }

    func test_soundLibraryEmptyMine_followsTheFormat() {
        let model = SoundLibraryPickerModel(service: FakeSoundLibraryService())
        XCTAssertEqual(model.emptyMessage(for: ComposerFormatWording(.post)),
                       ComposerFormatWording(.post).soundLibraryEmptyMine)
        XCTAssertEqual(model.emptyMessage(for: ComposerFormatWording(.reel)),
                       ComposerFormatWording(.reel).soundLibraryEmptyMine)
        XCTAssertEqual(model.emptyMessage, ComposerFormatWording.story.soundLibraryEmptyMine)
    }

    func test_publishStartedAnnouncement_isTheTableOfTheFormat() {
        for type in PostType.allCases {
            XCTAssertEqual(StoryComposerView.publishStartedAnnouncement(for: type),
                           ComposerFormatWording(type).publishStarted)
        }
    }

    func test_environment_defaultsToTheStory() {
        XCTAssertEqual(EnvironmentValues().composerFormatWording, .story)
    }
}
