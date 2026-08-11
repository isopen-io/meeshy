import XCTest
@testable import Meeshy

/// Garde de source pour "Plus…" → ouverture directe sur "Vues" (accusés de
/// lecture), sur les DEUX call sites de l'action `.more` (overlay appui-long
/// custom + menu contextuel natif iOS 26). `ctx`/`MessageMenuContext` n'est en
/// portée à aucun des deux sites (vérifié) — la source de vérité lue
/// directement est `UserPreferencesManager.shared.privacy.showReadReceipts`,
/// exactement comme `ConversationView.swift:1847` et `MessageOverlayMenu.swift:163`.
///
/// Précédents : `CallDetailRoutingTests`, `ConversationMenuSystemDesignGuardTests`
/// — même fichier (`ConversationView.swift`), même pattern d'extraction de
/// closure balancée sur les accolades (PAS de fenêtre de caractères fixe).
///
/// Voir `docs/superpowers/specs/2026-08-11-message-more-jumps-to-views-design.md`.
@MainActor
final class MessageMoreJumpsToViewsGuardTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Extrait le corps d'une closure/case en équilibrant ses accolades — PAS
    /// une fenêtre de caractères fixe (leçon repo : ça pourrit dès qu'un
    /// commentaire s'ajoute en tête). `marker` doit se terminer par "{".
    private func closureBody(after marker: String, in source: String) -> String? {
        guard let open = source.range(of: marker) else { return nil }
        var depth = 1
        var index = open.upperBound
        while index < source.endIndex {
            let ch = source[index]
            if ch == "{" { depth += 1 }
            if ch == "}" {
                depth -= 1
                if depth == 0 { return String(source[open.upperBound..<index]) }
            }
            index = source.index(after: index)
        }
        return nil
    }

    // MARK: - Site 1 : overlay appui-long custom (`onShowMore`)

    func test_overlayOnShowMore_gatesInitialItemOnShowReadReceipts() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        guard let body = closureBody(after: "onShowMore: {", in: view) else {
            XCTFail("ConversationView must define the onShowMore closure passed to MessageOverlayMenu")
            return
        }
        XCTAssertFalse(
            body.contains("moreSheetInitialItem = nil"),
            "onShowMore must no longer hard-code moreSheetInitialItem = nil — « Plus… » must " +
            "jump straight to Vues when the user shares read receipts (2026-08-11 spec)."
        )
        XCTAssertTrue(
            body.contains("UserPreferencesManager.shared.privacy.showReadReceipts ? .views : nil"),
            "onShowMore must gate moreSheetInitialItem on showReadReceipts directly (ctx is not " +
            "in scope here), falling back to nil (full grid) when reciprocity is off — never " +
            "pointing initialItem at an item absent from moreSections."
        )
    }
}
