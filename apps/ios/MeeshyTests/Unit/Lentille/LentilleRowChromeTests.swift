import XCTest
@testable import Meeshy

/// Chrome de la rangée Lentille — directive produit du 2026-08-22 (soir) :
/// « dans les rangées normales, pas de contour sur le dernier message, juste
/// "auteur : message", puis en dessous, sur une nouvelle ligne à droite, la
/// date (qui garde cette place en magnificence) ; la pile de non-lus toujours
/// sur fond rouge, magnificence comprise ; la pile d'effectif en bas à droite
/// SUR la bordure, jamais dans le contenu, repos compris ».
///
/// Gardes de FORME (lecture du source, comme `LentilleFocusCardTests`) +
/// règles pures. Repos = `LentilleConversationRow` (Row/), magnificence =
/// `LentilleFocusCard` (Mode/) : deux vues, une même grammaire.
final class LentilleRowChromeTests: XCTestCase {

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ relative: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relative), encoding: .utf8)
    }

    private func rowSource() throws -> String { try source("Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift") }
    private func skeletonSource() throws -> String { try source("Meeshy/Features/Main/Lentille/Row/LentilleSkeletonRow.swift") }
    private func cardSource() throws -> String { try source("Meeshy/Features/Main/Lentille/Mode/LentilleFocusCard.swift") }

    /// Le corps d'une déclaration, de son en-tête à la prochaine déclaration
    /// de même niveau. Une garde de forme doit viser le BLOC, jamais le
    /// FICHIER : la rangée contient légitimement un `strokeBorder` (l'anneau
    /// d'avatar) et une `Capsule` (le bouton « Rejoindre » d'un appel en
    /// cours) — les interdire globalement condamnait deux innocents.
    private func block(_ header: String, in code: String) throws -> Substring {
        let start = try XCTUnwrap(code.range(of: header), "\(header) introuvable")
        let rest = code[start.upperBound...]
        let end = rest.range(of: "\n    private var ")?.lowerBound
            ?? rest.range(of: "\n    private func ")?.lowerBound
            ?? rest.range(of: "\n    nonisolated static func ")?.lowerBound
            ?? rest.endIndex
        return code[start.lowerBound..<end]
    }

    private func viewBlock(_ name: String, in code: String) throws -> Substring {
        try block("private var \(name): some View {", in: code)
    }

    // MARK: - « auteur : message » (repos ET magnificence)

    func test_authorPrefix_isNameColonSpace_orNothing() {
        XCTAssertEqual(LentilleConversationRow.authorPrefix(name: "Andre Tabeth"), "Andre Tabeth : ")
        XCTAssertNil(LentilleConversationRow.authorPrefix(name: ""))
        XCTAssertNil(LentilleConversationRow.authorPrefix(name: "   "))
        XCTAssertNil(LentilleConversationRow.authorPrefix(name: nil))
    }

    func test_flatRow_textPreview_isOneText_authorColonMessage_noOutline() throws {
        let code = try rowSource()
        XCTAssertTrue(code.contains("(senderPrefix + Text(resolvedPreviewText)"), "« Auteur : texte » en UN seul texte, comme la carte")
        XCTAssertTrue(code.contains("LentilleConversationRow.authorPrefix(name:") || code.contains("Self.authorPrefix(name:"), "le préfixe vient de la règle pure")
        let preview = try block("private func standardPreview(showEphemeralIcon: Bool) -> some View {", in: code)
        for outline in ["strokeBorder", ".border(", "RoundedRectangle", "background("] {
            XCTAssertFalse(preview.contains(outline), "aucun contour ni fond sur le dernier message au repos (« \(outline) »)")
        }
    }

    func test_focusCard_previewUsesTheSameAuthorPrefixRule() throws {
        let code = try cardSource()
        XCTAssertTrue(code.contains("LentilleConversationRow.authorPrefix(name:"), "une seule règle « auteur : » pour les deux vues")
    }

    // MARK: - La date : seule, en dessous, à droite — repos ET magnificence

    func test_flatRow_dateLeavesTheHeaderLine_andSitsAloneTrailingBelow() throws {
        let code = try rowSource()
        let header = try viewBlock("headerLine", in: code)
        XCTAssertFalse(header.contains("LentilleRowTimestamp("), "plus d'heure sur la ligne du nom")
        XCTAssertFalse(header.contains("Text(\"·\")"), "plus de séparateur « · » sur la ligne du nom")
        let date = try viewBlock("dateLine", in: code)
        let spacer = try XCTUnwrap(date.range(of: "Spacer(minLength: 0)"))
        let stamp = try XCTUnwrap(date.range(of: "LentilleRowTimestamp("))
        XCTAssertLessThan(spacer.lowerBound, stamp.lowerBound, "la date est poussée à DROITE de sa ligne")
        XCTAssertTrue(code.contains("headerLine\n                line2\n                dateLine"), "ordre : nom, message, date")
    }

    func test_focusCard_dateLeavesTheHeaderLine_andSitsTrailingUnderThePreview() throws {
        let code = try cardSource()
        let header = try viewBlock("headerLine", in: code)
        XCTAssertFalse(header.contains("fullTimestamp("), "plus de date sur la ligne du nom")
        XCTAssertFalse(header.contains("Text(\"·\")"))
        let date = try viewBlock("dateLine", in: code)
        let spacer = try XCTUnwrap(date.range(of: "Spacer(minLength: 0)"))
        let stamp = try XCTUnwrap(date.range(of: "Text(Self.fullTimestamp("))
        XCTAssertLessThan(spacer.lowerBound, stamp.lowerBound, "la date complète garde sa place : à droite, sous l'aperçu")
        XCTAssertTrue(code.contains("headerLine\n                line2\n                dateLine"), "ordre : nom, message, date")
    }

    func test_skeleton_mirrorsTheDateLine() throws {
        let code = try skeletonSource()
        XCTAssertTrue(code.contains("LentilleMetrics.Time.font"), "le squelette réserve la ligne de date")
        XCTAssertTrue(code.contains("Spacer(minLength: 0)"), "… à droite, comme la rangée réelle")
    }

    func test_rowHeight_fitsThreeLines() {
        // nom (corps) + message (sous-titre) + date (12) + rembourrage : 64 ne
        // logeait que deux lignes.
        XCTAssertGreaterThanOrEqual(LentilleMetrics.Row.height, 72)
        XCTAssertGreaterThan(LentilleMetrics.FocusCard.height, LentilleMetrics.Row.height)
    }

    // MARK: - Non-lus : rouge, toujours

    func test_focusCard_unreadBadge_isAlwaysRed_neverAccent() throws {
        let code = try cardSource()
        let badge = try viewBlock("unreadBadge", in: code)
        XCTAssertTrue(badge.contains("MeeshyColors.unreadBadgeBackground(isDark: isDark)"), "fond ROUGE sémantique, magnificence comprise")
        XCTAssertFalse(badge.contains("fill(accent)"), "jamais l'accent de la conversation")
    }

    // MARK: - Effectif : sur la bordure, jamais dans le contenu — repos compris

    func test_flatRow_memberCount_isAnchoredOnTheBottomTrailingEdge_neverInTheContent() throws {
        let code = try rowSource()
        XCTAssertTrue(code.contains(".overlay(alignment: .bottomTrailing) {"), "ancré au bord bas droit de la rangée")
        XCTAssertTrue(code.contains("LentilleMetrics.Row.edgeBadgeOverhang"), "le débord sur la trace de la bordure est un jeton, pas un littéral")
        let content = try XCTUnwrap(code.range(of: "VStack(alignment: .leading, spacing: 2) {"))
        let contentEnd = try XCTUnwrap(code.range(of: ".frame(maxWidth: .infinity, alignment: .leading)", range: content.upperBound..<code.endIndex))
        XCTAssertFalse(code[content.lowerBound..<contentEnd.lowerBound].contains("memberCount"), "jamais dans le contenu")
        let badge = try viewBlock("memberCountBadge", in: code)
        for card in ["Capsule(", "RoundedRectangle", "background(", "strokeBorder"] {
            XCTAssertFalse(badge.contains(card), "une information NUE, pas une carte (« \(card) ») — aucune carte dans Lentille/Row/")
        }
    }

    func test_focusCard_memberCount_staysOnTheBorder_neverInTheContent() throws {
        let code = try cardSource()
        let anchor = try XCTUnwrap(code.range(of: ".overlay(alignment: .bottomLeading) {"))
        let tail = code[anchor.upperBound...]
        XCTAssertTrue(tail.prefix(700).contains("typeBadge"), "l'effectif vit dans l'ancrage de bord bas")
        XCTAssertTrue(tail.prefix(900).contains(".offset(y: -LentilleMetrics.ModeNotch.top)"), "… à cheval sur la bordure")
        let content = try viewBlock("magnifiedContent", in: code)
        XCTAssertFalse(content.contains("typeBadge"), "jamais dans le contenu")
    }

    func test_edgeBadgeOverhang_isHalfALabel_notALawLiteral() {
        XCTAssertGreaterThan(LentilleMetrics.Row.edgeBadgeOverhang, 0)
        XCTAssertLessThan(LentilleMetrics.Row.edgeBadgeOverhang, LentilleMetrics.Row.paddingVertical, "il mord la marge, jamais la rangée suivante")
    }
}
