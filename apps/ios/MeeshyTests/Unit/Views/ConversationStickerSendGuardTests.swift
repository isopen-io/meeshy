import XCTest
@testable import Meeshy

/// **Une porte qui existe a un effet** (loi 4) — la tuile « Sticker » du
/// composer de conversation (#4823).
///
/// La tuile n'apparaît que si l'hôte câble `onRequestStickerPicker` ; l'hôte
/// n'a d'effet que s'il présente `StickerPickerView` avec ses injecteurs ; et
/// le PNG hors-ligne n'a de sens que si le dispatcher rejoue le sticker avec
/// lui. Trois absences que SwiftUI ne signale jamais — d'où une lecture de la
/// source, sur le patron de `ComposerIngestWiringParityTests`.
final class ConversationStickerSendGuardTests: XCTestCase {

    private func appSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    // MARK: - La tuile

    func test_composerBar_declaresStickerCallback_andGatesTheTileOnIt() throws {
        let bar = try appSource("Meeshy/Features/Main/Components/UniversalComposerBar.swift")
        XCTAssertTrue(bar.contains("var onRequestStickerPicker: (() -> Void)? = nil"),
                      "la barre déclare la porte, avec `nil` pour défaut : un hôte qui ne la câble pas n'a pas de tuile")

        let tiles = try appSource("Meeshy/Features/Main/Components/UniversalComposerBar+Attachments.swift")
        XCTAssertTrue(tiles.contains("if onRequestStickerPicker != nil {"),
                      "la tuile est GATÉE sur le rappel — loi 4, une porte sans effet n'est pas rendue")
        XCTAssertTrue(tiles.contains("id: \"sticker\""))
        XCTAssertTrue(tiles.contains("icon: \"rectangle.portrait.on.rectangle.portrait.angled\""),
                      "même glyphe que `ComposerRailDoor.sticker` et que l'en-tête de la palette — pas un smiley")
        XCTAssertTrue(tiles.contains("\"composer.attach.sticker\""))
    }

    // MARK: - L'hôte

    func test_conversationComposer_wiresTheDoor_andPresentsThePalette() throws {
        let composer = try appSource("Meeshy/Features/Main/Views/ConversationView+Composer.swift")

        let range = try XCTUnwrap(composer.range(of: "onRequestStickerPicker:"),
                                  "la conversation doit câbler `onRequestStickerPicker` sur son UniversalComposerBar")
        let tail = composer[range.upperBound...].prefix(60).trimmingCharacters(in: .whitespacesAndNewlines)
        XCTAssertFalse(tail.hasPrefix("nil"), "câblé à `nil`, la tuile serait absente")
        XCTAssertTrue(tail.hasPrefix("{"), "la porte doit ouvrir quelque chose : une fermeture, pas une valeur")

        XCTAssertTrue(composer.contains("StickerPickerView("),
                      "la porte n'a d'effet que si la palette est PRÉSENTÉE")
        for injecteur in [".storyPasteProvided()", ".storyStickerLibraryProvided()", ".stickerNearbyPlacesProvided()"] {
            XCTAssertTrue(composer.contains(injecteur),
                          "sans `\(injecteur)`, un onglet de la palette n'est pas rendu (loi 4)")
        }
    }

    func test_stickerSendPath_staysWithinItsBudget() throws {
        let sticker = try appSource("Meeshy/Features/Main/Views/ConversationView+Sticker.swift")
        XCTAssertLessThanOrEqual(sticker.components(separatedBy: .newlines).count, 300,
                                 "le chemin d'envoi d'un sticker tient en ≤ 300 lignes — au-delà, on extrait")
        for callback in ["func sendEmojiSticker(", "func sendTemplateSticker(",
                         "func sendLocationTemplateSticker(", "func sendLibrarySticker("] {
            XCTAssertTrue(sticker.contains(callback), "les quatre rappels de la palette ont chacun leur chemin")
        }
    }

    // MARK: - Le rejeu hors-ligne

    func test_outboxDispatcher_replaysStickerOnEveryMessagePath() throws {
        let dispatcher = try appSource("Meeshy/Features/Main/Services/OutboxDispatcher+Messages.swift")
        XCTAssertEqual(occurrences(of: "sticker: item.sticker", in: dispatcher), 3,
                       "audio socket, média socket et REST : les trois rejeux portent `item.sticker`")
    }
}
