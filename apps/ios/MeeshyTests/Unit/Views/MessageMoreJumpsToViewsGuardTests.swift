import XCTest
@testable import Meeshy

/// Garde de source pour l'ouverture de « Plus… » : la GRILLE COMPLÈTE, sur les
/// DEUX call sites de l'action `.more` (overlay appui-long custom + menu
/// contextuel natif iOS 26). Le saut direct vers « Vues » introduit le
/// 2026-08-11 a été ANNULÉ le 2026-08-19 (décision user) — seuls les accès
/// directs explicites (tap coches ✓✓ `onShowReadStatus`, « info message »
/// `onShowMessageInfo`) conservent leur saut vers `.views`.
///
/// Nom de classe conservé pour l'historique (et la stabilité `-only-testing`).
///
/// Précédents : `CallDetailRoutingTests`, `ConversationMenuSystemDesignGuardTests`
/// — même fichier (`ConversationView.swift`), même pattern d'extraction de
/// closure balancée sur les accolades (PAS de fenêtre de caractères fixe).
///
/// Voir `docs/superpowers/specs/2026-08-19-media-forward-reliability-and-more-menu-design.md`, Volet B.
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

    func test_overlayOnShowMore_opensFullGrid() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        guard let body = closureBody(after: "onShowMore: {", in: view) else {
            XCTFail("ConversationView must define the onShowMore closure passed to MessageOverlayMenu")
            return
        }
        XCTAssertTrue(
            body.contains("moreSheetInitialItem = nil"),
            "onShowMore must open the FULL grid (initialItem = nil) — the 2026-08-11 " +
            "jump-to-Vues was reverted by the 2026-08-19 spec (Volet B)."
        )
        XCTAssertFalse(
            body.contains(".views"),
            "onShowMore must no longer route to .views in any form."
        )
    }

    // MARK: - Site 2 : menu contextuel natif iOS 26 (`case .more:` → Button)

    func test_nativeMoreButton_opensFullGrid() throws {
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
        XCTAssertTrue(
            body.contains("moreSheetInitialItem = nil"),
            "The native .more Button must open the FULL grid (initialItem = nil) — same " +
            "revert as the overlay site, on the iOS 26 native contextMenu path."
        )
        XCTAssertFalse(
            body.contains(".views"),
            "The native .more Button must no longer route to .views."
        )
    }

    // MARK: - Accès directs préservés + ancien ternaire banni

    func test_directAccessesStillJumpToViews_andTernaryIsGone() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        for marker in ["onShowMessageInfo: {", "onShowReadStatus: {"] {
            guard let body = closureBody(after: marker, in: view) else {
                XCTFail("ConversationView must keep the \(marker.dropLast(3)) direct-access closure")
                continue
            }
            XCTAssertTrue(
                body.contains("moreSheetInitialItem = .views"),
                "\(marker) must keep jumping straight to Vues — only the two « Plus… » " +
                "sites revert to the grid (2026-08-19 spec, Volet B)."
            )
        }
        XCTAssertEqual(
            view.components(separatedBy: "showReadReceipts ? .views : nil").count - 1, 0,
            "The 2026-08-11 ternary must be fully removed from ConversationView — " +
            "« Plus… » no longer depends on read receipts."
        )
    }
}
