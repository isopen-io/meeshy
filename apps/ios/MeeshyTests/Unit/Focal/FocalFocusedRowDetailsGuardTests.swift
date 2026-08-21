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
