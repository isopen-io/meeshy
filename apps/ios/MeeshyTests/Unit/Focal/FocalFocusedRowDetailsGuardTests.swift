import XCTest
@testable import Meeshy

/// Focal (2026-08-21) — le message EN FOCUS porte ses détails en PERMANENCE :
/// identité même en continuation, jour + heure, texte plafonné. Ces témoins
/// de structure (source lue à l'exécution) verrouillent le point que la
/// capture d'ouverture du 2026-08-21 a révélé : l'heure de la rangée en focus
/// passait par le révélé de défilement (`FocalRevealedTime`) et restait donc
/// INVISIBLE au repos — la règle était écrite, pas câblée.
final class FocalFocusedRowDetailsGuardTests: XCTestCase {

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func normalized(_ relativePath: String) throws -> String {
        let raw = try String(
            contentsOf: Self.iosRoot.appendingPathComponent(relativePath),
            encoding: .utf8
        )
        return AppSourceGuard.stripComments(raw)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    func test_focalRow_handsTheFocusSignal_toTheIdentityHeaderTime() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(
            row.contains("revealsTimeAlways: input.isFocused"),
            "La rangée en focus doit demander à son en-tête d'identité une heure PERMANENTE " +
            "(`revealsTimeAlways: input.isFocused`) — sinon l'heure suit le révélé et disparaît au repos."
        )
        XCTAssertTrue(
            row.contains("if input.isFirstInGroup || input.isFocused {"),
            "Le message en focus porte son en-tête d'identité même en continuation de groupe."
        )
    }

    /// 2026-08-21 : le message en focus porte sur sa bordure basse les
    /// drapeaux disponibles, l'icône de traduction, le (+) emoji et ses
    /// réactions ; ses coches (haut-droite) ouvrent les détails de lecture.
    func test_focusedRow_hasTheBottomStrip_andTappableChecks() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(row.contains("if input.isFocused { focusStrip }"), "la bordure basse remplace la ligne drapeau+réactions en focus")
        XCTAssertTrue(row.contains("actions.onSetActiveDisplayLanguage?(content.messageId, code)"), "un drapeau = afficher cette langue")
        XCTAssertTrue(row.contains("actions.onShowTranslationDetail?(content.messageId)"), "l'icône de traduction du mode bulle")
        XCTAssertTrue(row.contains("actions.onOpenReactPicker?(content.messageId)"), "le (+) emoji, même sur mes messages")
        XCTAssertTrue(row.contains("isLastReceivedMessage: true,"), "les réactions + (+) du message reçu, dernier ou pas")
        XCTAssertTrue(row.contains("onShowReadStatus: actions.onShowReadStatus.map"), "les coches ouvrent les détails de lecture")
        let header = try normalized("Meeshy/Features/Main/Focal/Row/FocalIdentityHeader.swift")
        XCTAssertTrue(header.contains("Button(action: onShowReadStatus)"), "les coches sont un bouton quand la rangée sait ouvrir les détails")
    }

    func test_focusFlagCodes_putTheOriginalFirst_thenAvailable_thenTheDisplayedOne_neverRepeated() {
        XCTAssertEqual(
            FocalRow.focusFlagCodes(originalLangCode: "en", availableFlags: ["fr", "EN", "es"], activeLangCode: "fr"),
            ["en", "fr", "es"]
        )
        XCTAssertEqual(FocalRow.focusFlagCodes(originalLangCode: "fr", availableFlags: [], activeLangCode: "en"), ["fr", "en"])
    }

    func test_identityHeader_rendersAPermanentTime_whenAskedTo_andTheRevealedOneOtherwise() throws {
        let header = try normalized("Meeshy/Features/Main/Focal/Row/FocalIdentityHeader.swift")
        XCTAssertTrue(
            header.contains("if revealsTimeAlways { Text(timeString)"),
            "Heure permanente : un `Text` nu, hors de toute observation du révélé."
        )
        XCTAssertTrue(
            header.contains("} else { FocalRevealedTime(timeString: timeString, tint: metaTint) }"),
            "Hors focus, la règle commune des têtes de groupe reste le révélé de défilement."
        )
    }
}
