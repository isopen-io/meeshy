import XCTest
@testable import Meeshy

/// **#3905 (exigence 2) — `NearbyDiscoverabilityControl` se replie par défaut.**
///
/// Avant ce correctif, `header` (le `Toggle` + titre + sous-titre) était
/// TOUJOURS peint — le contrôle occupait en permanence une bande large de
/// l'écran de publication pour un réglage secondaire. La garde prouve, par
/// la SOURCE (suite tournée sans UIKit réel, R5/R15, même patron que
/// `ComposerToolRowLeadingAccessoryGuardTests`) : un résumé compact toujours
/// visible, et le détail complet (`header`/`tierPicker`/`notices`) gaté sur
/// un état de repli, REPLIÉ par défaut.
final class NearbyDiscoverabilityControlFoldGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Components/NearbyDiscoverabilityControl.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func body(of anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var result = ""
        for character in code[start.lowerBound...] {
            result.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return result }
            }
        }
        return nil
    }

    func test_isExpanded_declaredAsAStateProperty_collapsedByDefault() throws {
        let code = try source()
        XCTAssertTrue(
            code.contains("@State private var isExpanded = false"),
            "`isExpanded` doit être un `@State` REPLIÉ par défaut (`false`) — la spec exige un résumé "
                + "compact par défaut, jamais le détail complet à l'ouverture."
        )
    }

    func test_body_alwaysRendersASummary_regardlessOfExpansion() throws {
        let code = try source()
        guard let bodyBlock = body(of: "var body: some View {", in: code) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            bodyBlock.contains("summary"),
            "`body` doit toujours peindre `summary` — sans résumé compact, replié n'affiche RIEN, ce qui "
                + "masquerait le contrôle plutôt que de le réduire."
        )
        // Extrait le bloc `if isExpanded { … }` et assertit dessus plutôt que
        // sur un littéral indenté (revue Opus 2026-08-27) : un `XCTAssertFalse`
        // sur une chaîne à indentation FIXE ne rougit plus si `summary` migre
        // dans le bloc à une profondeur différente — la garde passait au vert
        // sans plus rien protéger (fiche « gardes négatives meurent en
        // silence »).
        guard let detail = body(of: "if isExpanded {", in: bodyBlock) else {
            return XCTFail("Aucun bloc `if isExpanded {` dans `body` — le détail complet n'est plus gaté.")
        }
        XCTAssertFalse(
            detail.contains("summary"),
            "`summary` ne doit PAS être gaté par `isExpanded` — c'est le résumé qui reste visible replié."
        )
    }

    func test_body_gatesTheFullDetailBehindIsExpanded() throws {
        let code = try source()
        guard let bodyBlock = body(of: "var body: some View {", in: code) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        guard let detail = body(of: "if isExpanded {", in: bodyBlock) else {
            return XCTFail("Aucun bloc `if isExpanded {` dans `body` — le détail complet n'est plus gaté.")
        }
        XCTAssertTrue(
            detail.contains("header"),
            "Le `Toggle` (titre + sous-titre) doit rester dans le bloc `isExpanded` — c'est lui que la spec "
                + "veut voir disparaître à l'état replié."
        )
    }
}
