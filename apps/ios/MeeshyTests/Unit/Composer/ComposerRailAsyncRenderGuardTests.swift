import XCTest
@testable import Meeshy

/// #9135 — le composer trappait (`_dispatch_assert_queue_fail`) quand le clavier
/// montait ou descendait : `ViewThatFits` mesurait l'autre candidat du rail sur
/// `com.apple.SwiftUI.AsyncRenderer`, et la fermeture du `ForEach`, isolée au
/// main actor par l'isolation par défaut de la cible, trappait à son entrée
/// (`closure #1 in ComposerLeadingRail.doorEntries(_:)`, `.ips` du 2026-10-05).
///
/// Le rendu asynchrone ne se provoque pas dans un test : seule la FORME se
/// garde, plus la seule chose que ce rendu appelle désormais — relue hors du
/// fil principal.
final class ComposerRailAsyncRenderGuardTests: XCTestCase {

    private func composerSource(_ name: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Composer
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/" + name)
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(source.isEmpty, "\(name) est vide — la garde ne mesurerait rien")
        return AppSourceGuard.stripComments(source)
    }

    private func occurrences(of needle: String, in code: String) -> Int {
        code.components(separatedBy: needle).count - 1
    }

    func test_leContenuDUneEntreeSeRelitHorsDuFilPrincipal() {
        let relu = expectation(description: "entrée relue sur une file de fond")
        DispatchQueue.global(qos: .userInteractive).async {
            let rangee = ComposerRailRow(id: "media", content: 42)
            XCTAssertFalse(Thread.isMainThread)
            XCTAssertEqual(composerRailRowContent(rangee), 42)
            relu.fulfill()
        }
        wait(for: [relu], timeout: 2.0)
    }

    func test_lesRailsNePassentAucuneFermetureAuForEach() throws {
        for name in ["ComposerLeadingRail.swift", "ComposerTrailingRail.swift"] {
            let unit = try composerSource(name)
            let forEach = occurrences(of: "ForEach(", in: unit)
            XCTAssertGreaterThan(forEach, 0, "\(name) : aucun ForEach — la garde ne mesurerait rien")
            XCTAssertEqual(occurrences(of: "content: composerRailRowContent)", in: unit), forEach,
                           "\(name) : chaque ForEach reçoit composerRailRowContent, jamais une fermeture "
                           + "— le rendu asynchrone d'iOS 26 l'appellerait hors du fil principal")
        }
    }

    func test_laRelectureNEstIsoleeAAucunActeur() throws {
        let unit = try composerSource("ComposerRailRows.swift")
        XCTAssertTrue(unit.contains("nonisolated struct ComposerRailRow<"))
        XCTAssertTrue(unit.contains("nonisolated func composerRailRowContent<"),
                      "sans `nonisolated`, l'isolation par défaut de la cible remettrait le contrôle d'exécuteur")
    }
}
