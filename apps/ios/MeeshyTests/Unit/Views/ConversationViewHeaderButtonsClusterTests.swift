import XCTest
@testable import Meeshy

/// Regression guard for the header's call+search button spacing (user-requested
/// 2026-07-11: "les boutons n'ont pas besoin d'être si loin l'un de l'autre").
/// Each button already carries ~8pt of invisible padding via `.meeshyTapTarget()`'s
/// 44×44 HIG minimum around a visually 28×28 glass circle — an HStack with its own
/// non-zero spacing stacks additional space ON TOP of that built-in padding.
@MainActor
final class ConversationViewHeaderButtonsClusterTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// **L'UNITÉ du header** : `ConversationView.swift` PLUS le fichier où vit
    /// le type nominal qui assemble la grappe.
    ///
    /// Depuis le 2026-09-13, `headerButtonsCluster` ne construit plus le
    /// `HStack` lui-même : il remet trois fentes à
    /// `ConversationHeaderActionsCluster`, extrait dans
    /// `ConversationExpandedHeaderBand.swift` pour que la grappe cesse de
    /// peser sur la LARGEUR de la valeur `ConversationView` (le débordement de
    /// pile à l'ouverture d'une conversation, #6213 bis). L'invariant de
    /// spacing n'a pas disparu — il a DÉMÉNAGÉ.
    ///
    /// > Une garde qui lit un seul fichier mesure un DÉCOUPAGE, pas une règle.
    /// > Quand le code part chez un type extrait, elle ne devient pas muette :
    /// > elle affirme le contraire de la vérité.
    ///
    /// Ne PAS étendre `source()` lui-même : sa sœur
    /// `test_collapsedHeaderState_usesHeaderButtonsCluster_notInlineDuplication`
    /// COMPTE les occurrences dans le seul fichier hôte, et un compte élargi ne
    /// voudrait plus rien dire.
    private func headerUnitSource() throws -> String {
        let band = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationExpandedHeaderBand.swift")
        return try source() + "\n" + String(contentsOf: band, encoding: .utf8)
    }

    func test_headerButtonsCluster_usesZeroSpacing() throws {
        let unit = AppSourceGuard.stripComments(try headerUnitSource())

        // 1) L'HÔTE remet bien les fentes au type nominal.
        //    `AnyView` (not `some View`) since 2026-08-17 — erasing at the
        //    DECLARATION (not just call sites) was required to stop a Swift
        //    metadata-decoder stack overflow at first render (see
        //    ConversationFirstRenderWarmup.swift doc comment).
        guard let range = unit.range(of: "private var headerButtonsCluster: AnyView {") else {
            XCTFail("ConversationView must define headerButtonsCluster")
            return
        }
        let end = unit.index(range.lowerBound, offsetBy: 300, limitedBy: unit.endIndex) ?? unit.endIndex
        let host = String(unit[range.lowerBound ..< end])
        XCTAssertTrue(
            host.contains("ConversationHeaderActionsCluster"),
            "headerButtonsCluster doit remettre ses fentes au type nominal " +
            "ConversationHeaderActionsCluster (l'assemblage a quitté l'hôte le 2026-09-13)."
        )
        XCTAssertTrue(
            host.contains("headerCallButtons") && host.contains("expandedHeaderSearchButton"),
            "headerButtonsCluster must pass both the call button and the search button."
        )

        // 2) Le TYPE NOMINAL porte l'invariant de spacing — la règle que ce
        //    témoin existe pour tenir (« les boutons n'ont pas besoin d'être si
        //    loin l'un de l'autre », porteur 2026-07-11).
        guard let clusterRange = unit.range(of: "struct ConversationHeaderActionsCluster: View {") else {
            XCTFail("ConversationHeaderActionsCluster doit exister — l'unité ne le voit pas.")
            return
        }
        let clusterEnd = unit.index(clusterRange.lowerBound, offsetBy: 500, limitedBy: unit.endIndex) ?? unit.endIndex
        let cluster = String(unit[clusterRange.lowerBound ..< clusterEnd])
        XCTAssertTrue(
            cluster.contains("HStack(spacing: 0)"),
            "La grappe must use zero extra spacing — each button already " +
            "carries its own built-in padding via meeshyTapTarget's 44×44 minimum."
        )
        XCTAssertTrue(
            cluster.contains("callButtons().layoutPriority(1)"),
            "L'appel garde sa layoutPriority(1) : c'est elle qui l'empêche d'être " +
            "comprimé par la recherche et le mode (contrat du header)."
        )
    }

    /// Arbitrage user 2026-08-18 : la bande DÉPLIÉE ne porte plus la grappe
    /// (ni mode, ni recherche, ni appel — titre + tags seulement). L'unique
    /// site d'appel restant est l'état PLIÉ ; l'invariant anti-duplication
    /// demeure : toute évolution de spacing ne doit exiger qu'une édition.
    func test_collapsedHeaderState_usesHeaderButtonsCluster_notInlineDuplication() throws {
        // Comments stripped: the AnyView-erasure doc comments mention
        // "headerButtonsCluster" by name several times and would otherwise
        // inflate this count (feedback_source_guard_tests_must_strip_comments).
        let view = AppSourceGuard.stripComments(try source())
        let occurrences = view.components(separatedBy: "headerButtonsCluster").count - 1
        // 1 declaration + 1 call site (collapsed-header state only —
        // the options-expanded band carries no action buttons since 2026-08-18).
        XCTAssertEqual(
            occurrences, 2,
            "headerButtonsCluster must be referenced from the collapsed header state only " +
            "(1 declaration + 1 call site) — the expanded band carries no action buttons " +
            "(user 2026-08-18), and the cluster must never be duplicated inline."
        )
    }
}
