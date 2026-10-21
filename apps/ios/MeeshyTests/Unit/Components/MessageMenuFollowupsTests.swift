import XCTest
import MeeshySDK
@testable import Meeshy

/// Les suites de l'audit des appuis longs (2026-10-20) côté iOS :
/// « Copier » copie le texte AFFICHÉ (#11233), une action se nomme d'UNE table
/// (#11234), et la Rivière ouvre le menu unifié (#11224). « Supprimer pour
/// moi » partout (#11221) est tenu par `ConversationCommandHandlerTests`.
@MainActor
final class MessageMenuFollowupsTests: XCTestCase {

    // MARK: - Fabriques

    private func message(_ content: String = "Bonjour", originalLanguage: String = "fr") -> Message {
        Message(id: "m1", conversationId: "c1", senderId: "u2", content: content, originalLanguage: originalLanguage)
    }

    private func translation(_ language: String, _ text: String) -> MessageTranslation {
        MessageTranslation(
            id: "t-\(language)", messageId: "m1", sourceLanguage: "fr", targetLanguage: language,
            translatedContent: text, translationModel: "nllb", confidenceScore: nil
        )
    }

    private var translations: [MessageTranslation] {
        [translation("en", "Hello"), translation("es", "Hola")]
    }

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    // MARK: - #11233 — « Copier » copie ce que la bulle AFFICHE

    func test_displayedText_withoutFlag_isThePreferredTranslation() {
        let text = BubbleContent.displayedText(
            of: message(), translations: translations,
            preferredTranslation: translation("en", "Hello"), activeDisplayLangCode: nil
        )
        XCTAssertEqual(text, "Hello")
    }

    func test_displayedText_flagSwitchedToAnotherLanguage_isThatTranslation() {
        let text = BubbleContent.displayedText(
            of: message(), translations: translations,
            preferredTranslation: translation("en", "Hello"), activeDisplayLangCode: "es"
        )
        XCTAssertEqual(text, "Hola", "le drapeau a basculé en espagnol : la bulle lit « Hola », Copier aussi")
    }

    func test_displayedText_flagSwitchedBackToTheOriginal_isTheOriginal() {
        let text = BubbleContent.displayedText(
            of: message(), translations: translations,
            preferredTranslation: translation("en", "Hello"), activeDisplayLangCode: "fr"
        )
        XCTAssertEqual(text, "Bonjour", "la bulle montre l'original : jamais la traduction préférée")
    }

    func test_displayedText_withoutAnyTranslation_isTheOriginal() {
        let text = BubbleContent.displayedText(
            of: message(), translations: [], preferredTranslation: nil, activeDisplayLangCode: nil
        )
        XCTAssertEqual(text, "Bonjour")
    }

    func test_copySites_readTheDisplayedText_neverThePreferredTranslationAlone() throws {
        let sites = [
            "Features/Main/Views/ConversationView+OverlayMenu.swift",
            "Features/Main/Views/ConversationView+MessageSheets.swift",
            "Features/Main/Views/ConversationView+MessageRow.swift",
        ]
        for path in sites {
            let code = try source(path)
            XCTAssertFalse(
                code.contains("?.translatedContent ?? msg.content, of: msg"),
                "`\(path)` copie la traduction préférée, pas le texte affiché (#11233)"
            )
            XCTAssertTrue(code.contains("MessageExitTransport.copyDisplayed("), "`\(path)` doit copier par le site unique")
        }
    }

    // MARK: - #11234 — une action, UN libellé, UN symbole

    private func doubleTap(peutEditer: Bool = true) -> [MessageEditMenuAction] {
        MessageEditMenuAction.primaires(
            messageId: "m1", peutEditer: peutEditer, editer: { _ in }, selectionner: { _ in },
            composer: { _ in }, imager: nil, repondre: { _ in }, transferer: { _ in }, plus: { _ in }
        )
    }

    func test_edit_isNamedAlikeInTheThreeMenus() {
        let edit = doubleTap().first { $0.id == "edit" }
        XCTAssertEqual(PrimaryAction.edit.verb, .edit)
        XCTAssertEqual(MoreItem.edit.verb, .edit)
        XCTAssertEqual(edit?.title, MessageActionVerb.edit.label, "« Éditer » au double toucher, « Modifier » ailleurs : un acte, un mot")
        XCTAssertEqual(edit?.systemImage, MessageActionVerb.edit.symbol)
    }

    func test_doubleTap_everyEntryReadsTheTable() {
        let expected: [String: MessageActionVerb] = [
            "edit": .edit, "select": .select, "compose": .compose,
            "reply": .reply, "forward": .forward, "more": .more,
        ]
        for action in doubleTap() {
            guard let verb = expected[action.id] else { continue }
            XCTAssertEqual(action.title, verb.label, "« \(action.id) » ne lit pas la table")
            XCTAssertEqual(action.systemImage, verb.symbol, "« \(action.id) » ne lit pas la table")
        }
    }

    func test_theSameActOnTwoTargets_isOneVerb() {
        XCTAssertEqual(PrimaryAction.replyToPiece.verb, PrimaryAction.reply.verb)
        XCTAssertEqual(MoreItem.reply.verb, PrimaryAction.reply.verb)
        XCTAssertEqual(PrimaryAction.forwardPiece.verb, MoreItem.forward.verb)
        XCTAssertEqual(MoreItem.language.verb, PrimaryAction.translate.verb)
        XCTAssertEqual(MoreItem.imager.verb, PrimaryAction.exportImage.verb)
        XCTAssertEqual(MoreItem.copy.verb, PrimaryAction.copy.verb)
    }

    func test_everyVerb_hasALabelAndASymbol() {
        for verb in MessageActionVerb.allCases {
            XCTAssertFalse(verb.label.isEmpty, "\(verb) sans libellé")
            XCTAssertFalse(verb.symbol.isEmpty, "\(verb) sans symbole")
        }
    }

    func test_menus_neverSpellAnActionThemselves() throws {
        let menus = [
            "Features/Main/Components/MessageActionsMenu.swift",
            "Features/Main/Views/NativeMessageEditMenu.swift",
        ]
        for path in menus {
            XCTAssertFalse(try source(path).contains("String(localized:"), "`\(path)` nomme une action hors de la table (#11234)")
        }
        let sheet = try source("Features/Main/Components/MessageMoreSheet.swift")
        XCTAssertFalse(sheet.contains("func labelText(_ item: MoreItem)"), "« Plus… » garde sa propre table de libellés")
        XCTAssertFalse(sheet.contains("func symbol(_ item: MoreItem)"), "« Plus… » garde sa propre table de symboles")
    }

    // MARK: - #11224 — la Rivière ouvre le menu unifié

    func test_river_hasNoMenuOfItsOwn() throws {
        let bubble = try source("Features/Main/Riviere/View/RiverBubbleView.swift")
        XCTAssertFalse(bubble.contains(".contextMenu"), "la Rivière ne compose plus son propre menu à trois actions")
        XCTAssertTrue(bubble.contains("MessagePressClaim.rowMinimumDuration"), "l'appui long d'une bulle dure ce que dure celui d'une rangée")
        XCTAssertTrue(bubble.contains("onLongPress(content.bubble.messageId)"), "l'appui long rend la main à l'hôte")
    }

    func test_river_longPressReachesTheSinglePresentation() throws {
        let layer = try source("Features/Main/Views/ConversationView+ReaderLayers.swift")
        XCTAssertTrue(layer.contains("onLongPress:"), "la couche Rivière branche l'appui long")
        XCTAssertTrue(layer.contains("presentMenu(msg)"), "la couche Rivière présente le menu par l'hôte")
        XCTAssertTrue(layer.contains("overlayState.longPressEnabled"), "mêmes gardes que la liste")
        let host = try source("Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(host.contains("presentMenu: { presentLongPressMenu(for: $0, cellFrame: nil) }"),
                      "la Rivière ouvre le menu par `presentLongPressMenu`, le point d'entrée unique")
    }
}
