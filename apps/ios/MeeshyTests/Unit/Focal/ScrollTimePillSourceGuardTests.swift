import XCTest
@testable import Meeshy

/// F-081 (WS-2) — gardes de source sur `Focal/Chrome/*.swift` (contrat
/// §WS-2) :
/// - `ScrollTimePillOverlay.swift` ne référence NI `UIScrollView` NI
///   `Timer` — le pilotage vient de l'hôte (WS-6/F-085), la vue est PURE ;
/// - garde R15 : aucun des littéraux de loi interdits (`900`, `520`, `380`,
///   `0.45`, `0.82`, `25`, `24`) n'apparaît en dur dans les fichiers de
///   peau de ce dossier — la constante `900` vient de
///   `ScrollTimePillLaw.lingerMs` (`Focal/Core/`, gelé), jamais recopiée.
final class ScrollTimePillSourceGuardTests: XCTestCase {

    private func source(_ fileName: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Chrome/\(fileName)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_scrollTimePillOverlay_doesNotReferenceUIScrollView() throws {
        let stripped = AppSourceGuard.stripComments(try source("ScrollTimePillOverlay.swift"))
        XCTAssertFalse(
            stripped.contains("UIScrollView"),
            "ScrollTimePillOverlay doit rester une vue PURE — le pilotage du défilement vient de l'hôte (WS-6/F-085)."
        )
    }

    func test_scrollTimePillOverlay_doesNotReferenceTimer() throws {
        let stripped = AppSourceGuard.stripComments(try source("ScrollTimePillOverlay.swift"))
        XCTAssertFalse(
            stripped.contains("Timer"),
            "ScrollTimePillOverlay ne doit posséder aucune horloge propre — `.tick` vient de l'hôte."
        )
    }

    // MARK: - Garde R15 : aucun littéral de loi hors `packages/shared`/son miroir

    private static let forbiddenLawLiterals = ["900", "520", "380", "0.45", "0.82", "25", "24"]

    /// Recherche le littéral comme JETON NUMÉRIQUE isolé (`\b…\b`), pas comme
    /// sous-chaîne — `MeeshyColors.indigo900` contient la sous-chaîne "900"
    /// sans être le littéral de loi `900` : aucune frontière de mot entre
    /// "o" et "9" dans "indigo900", donc `\b900\b` ne le confond pas.
    private func containsStandaloneNumericLiteral(_ literal: String, in text: String) -> Bool {
        let escaped = NSRegularExpression.escapedPattern(for: literal)
        let pattern = "\\b\(escaped)\\b"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return false }
        let range = NSRange(text.startIndex..., in: text)
        return regex.firstMatch(in: text, range: range) != nil
    }

    func test_focalChromeFiles_neverHardcodeLawLiterals() throws {
        for fileName in ["ScrollTimePillState.swift", "ScrollTimePillOverlay.swift"] {
            let stripped = AppSourceGuard.stripComments(try source(fileName))
            for literal in Self.forbiddenLawLiterals {
                XCTAssertFalse(
                    containsStandaloneNumericLiteral(literal, in: stripped),
                    "\(fileName) contient le littéral de loi interdit « \(literal) » (garde R15) — " +
                    "il doit venir de ScrollTimePillLaw, jamais être recopié dans un fichier de peau."
                )
            }
        }
    }

    /// `ScrollTimePillState.swift` doit lire la constante de fenêtre depuis
    /// la loi gelée, jamais la recalculer.
    func test_scrollTimePillState_readsLingerMsFromTheLaw() throws {
        let stripped = AppSourceGuard.stripComments(try source("ScrollTimePillState.swift"))
        XCTAssertTrue(stripped.contains("ScrollTimePillLaw.isVisible"))
    }
}
