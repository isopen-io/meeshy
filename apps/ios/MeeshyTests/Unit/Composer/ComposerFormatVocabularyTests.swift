import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le compositeur unifié nomme le format en cours** (#13913) : la table des
/// variantes (`ComposerFormatVariant`) sert chaque libellé qui nomme le format,
/// et aucun ne dit « story » quand on compose un post ou un réel, ni l'inverse.
@MainActor
final class ComposerFormatVocabularyTests: XCTestCase {

    private static let locales = ["fr", "en", "es", "pt-BR", "de", "it", "ar"]
    private static let storyWords = ["story", "stories", "historia", "história", "storia", "قصة", "قصت"]
    private static let otherWords = ["post", "réel", "reel", "منشور", "ريل"]

    private static let keysByFormat: [ComposerFormat: [String]] = [
        .story: ["composer.limit.duration", "composer.paste.documentRefused.story", "story.published",
                 "story.publishError"],
        .post: ["composer.limit.duration.post", "composer.paste.documentRefused.post", "feed.post.toast.published",
                "feed.post.toast.publishError"],
        .reel: ["composer.limit.duration.reel", "composer.paste.documentRefused.reel", "reel.published",
                "reel.publishError"]
    ]

    private final class Haut: ComposerLimitSpeaking {
        var dits: [String] = []
        func say(_ message: String) { dits.append(message) }
    }

    private static var repo: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func values(for key: String) throws -> [String: String] {
        let data = try Data(contentsOf: repo.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        let entry = try XCTUnwrap(strings[key] as? [String: Any], "clé absente : \(key)")
        let localizations = try XCTUnwrap(entry["localizations"] as? [String: [String: Any]])
        return localizations.compactMapValues { ($0["stringUnit"] as? [String: Any])?["value"] as? String }
    }

    private static func says(_ words: [String], in text: String) -> Bool {
        words.contains { text.lowercased().contains($0) }
    }

    private static func source(_ name: String) throws -> String {
        let url = repo.appendingPathComponent("Meeshy/Features/Composer/\(name)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private static func labels(_ format: ComposerFormat) -> [String] {
        let variant = ComposerFormatVariant.of(format)
        return [variant.durationLimitMessage(hours: 2),
                variant.documentRefusal(names: "contrat.pdf"),
                StoryPublishCopy.published(format.postType),
                StoryPublishCopy.publishFailed(format.postType)]
    }

    func test_variant_servesTheSDKWordingOfItsFormat() {
        for format in [ComposerFormat.story, .post, .reel, .status] {
            XCTAssertEqual(ComposerFormatVariant.of(format).wording, ComposerFormatWording(format.postType))
        }
    }

    func test_postAndReel_noLabelSaysStory() {
        for format in [ComposerFormat.post, .reel] {
            for label in Self.labels(format) {
                XCTAssertFalse(Self.says(Self.storyWords, in: label), "\(format) dit « story » : \(label)")
            }
        }
    }

    func test_story_noLabelSaysPostOrReel() {
        for label in Self.labels(.story) {
            XCTAssertFalse(Self.says(Self.otherWords, in: label), "la story dit un autre format : \(label)")
        }
    }

    func test_catalog_everyFormatKey_inSevenLanguages_withoutTheOtherFormat() throws {
        for (format, keys) in Self.keysByFormat {
            let forbidden = format == .story ? Self.otherWords : Self.storyWords
            for key in keys {
                let values = try Self.values(for: key)
                for locale in Self.locales {
                    let value = try XCTUnwrap(values[locale], "\(key) sans \(locale)")
                    XCTAssertFalse(value.trimmingCharacters(in: .whitespaces).isEmpty, "\(key) vide en \(locale)")
                    XCTAssertFalse(Self.says(forbidden, in: value), "\(key) nomme un autre format en \(locale) : \(value)")
                }
            }
        }
    }

    func test_durationLimit_namesTheBound_andFollowsTheFormat() {
        XCTAssertEqual(ComposerLimitFeedback.message(for: .duration),
                       ComposerFormatVariant.of(.story).durationLimitMessage(hours: StoryComposerLimit.duration.value))
        XCTAssertEqual(ComposerLimitFeedback.message(for: .duration, format: .post),
                       ComposerFormatVariant.of(.post).durationLimitMessage(hours: StoryComposerLimit.duration.value))
        XCTAssertTrue(ComposerLimitFeedback.message(for: .duration, format: .reel)
            .contains("\(StoryComposerLimit.duration.value)"))
    }

    func test_board_speaksTheDurationOfTheArmedFormat() {
        let haut = Haut()
        let board = ComposerLimitNoticeBoard(speaker: haut, clock: { Date(timeIntervalSince1970: 0) })
        board.format = .post
        board.report(.duration)
        XCTAssertEqual(haut.dits, [ComposerLimitFeedback.message(for: .duration, format: .post)])
    }

    func test_documentRefusal_namesTheFile() {
        for format in [ComposerFormat.story, .post, .reel] {
            XCTAssertTrue(ComposerFormatVariant.of(format).documentRefusal(names: "contrat.pdf").contains("contrat.pdf"))
        }
    }

    func test_portals_injectTheFormatWording_atBothPresenters() throws {
        let portals = try Self.source("MeeshyComposerHost+Portals.swift")
        let anchored = try Self.source("MeeshyComposerHost+AnchoredSheet.swift")
        XCTAssertTrue(portals.contains(".composerPortalProviders(format: selectedFormat)"))
        XCTAssertTrue(anchored.contains(".composerPortalProviders(format: selectedFormat)"))
        XCTAssertFalse(portals.contains(".composerPortalProviders()"))
        XCTAssertFalse(anchored.contains(".composerPortalProviders()"))
        XCTAssertTrue(portals.contains("composerFormatWording, ComposerFormatVariant.of(format).wording"))
        let paste = try Self.source("PasteIntoComposer.swift")
        XCTAssertTrue(paste.contains("let format = ComposerFormat(noun: wording.noun)"),
                      "le refus d'un document collé lit le format posé par l'hôte")
    }

    func test_formatOfANoun_isTheFormatThatNamesIt() {
        for format in [ComposerFormat.story, .post, .reel] {
            XCTAssertEqual(ComposerFormat(noun: ComposerFormatVariant.of(format).wording.noun), format)
        }
    }
}
