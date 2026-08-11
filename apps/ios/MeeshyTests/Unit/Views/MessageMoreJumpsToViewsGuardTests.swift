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

    // MARK: - Site 2 : menu contextuel natif iOS 26 (`case .more:` → Button)

    func test_nativeMoreButton_gatesInitialItemOnShowReadReceipts() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        guard let caseRange = view.range(of: "case .more:") else {
            XCTFail("ConversationView's native menu builder must define a `case .more:` branch")
            return
        }
        let afterCase = String(view[caseRange.upperBound...])
        guard let body = closureBody(after: "Button {", in: afterCase) else {
            XCTFail("The .more case must wrap its action in a Button { } closure")
            return
        }
        XCTAssertFalse(
            body.contains("moreSheetInitialItem = nil"),
            "The native .more Button must no longer hard-code moreSheetInitialItem = nil — same " +
            "jump-to-Vues fix as the overlay site, on the iOS 26 native contextMenu path."
        )
        XCTAssertTrue(
            body.contains("UserPreferencesManager.shared.privacy.showReadReceipts ? .views : nil"),
            "The native .more Button must gate moreSheetInitialItem on showReadReceipts directly " +
            "(ctx is built in buildNativeMessageMenu and never passed to nativeMenuButton), falling " +
            "back to nil (full grid) when reciprocity is off."
        )
    }

    // MARK: - Invariant global : aucun 3e chemin, aucune régression du repli

    /// Repli explicite (2026-08-11) : si un futur refactor supprime la branche
    /// `: nil` du ternaire (ex. en codant en dur `.views` sans condition), plus
    /// aucune occurrence de la chaîne littérale ne resterait pour l'attraper —
    /// ce test lit donc les DEUX sites en une passe, indépendamment des deux
    /// tests ciblés ci-dessus.
    func test_noUnconditionalNilFallbackRemainsOnEitherMoreSite() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        let occurrences = view.components(separatedBy: "moreSheetInitialItem = nil").count - 1
        XCTAssertEqual(
            occurrences, 0,
            "ConversationView must not hard-code `moreSheetInitialItem = nil` anywhere — both " +
            "« Plus… » call sites (overlay + native menu) must gate on " +
            "UserPreferencesManager.shared.privacy.showReadReceipts instead."
        )
    }
}
