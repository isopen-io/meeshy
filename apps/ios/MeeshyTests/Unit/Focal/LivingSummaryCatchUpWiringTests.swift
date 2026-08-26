import XCTest
@testable import Meeshy

/// #3901 — au-delà de 25 non-lus, `ReadingModeOrchestrator` bascule
/// l'ouverture en Résumé Vivant, un mode qui ne rend JAMAIS bulle par bulle
/// (`MessageListViewController.rendersThread` est faux pour `.summary`, voir
/// `MessageListSeenTrackingModeGateTests`) — donc n'alimente jamais
/// `seenIds`. Sans un site DÉDIÉ, `markAsRead(messageIds:)` ne peut
/// structurellement jamais y faire avancer le curseur serveur : le badge
/// reste bloqué à vie, peu importe combien de fois la conversation est
/// rouverte (vérifié en base de production, compteur figé à 125).
///
/// `ConversationViewModel.markCaughtUpFromSummaryOrRiver()` est le
/// correctif (testé directement dans `ConversationViewModelTests`) ; ce
/// fichier garde son CÂBLAGE dans `ConversationView.swift` — non montable
/// ici (vue SwiftUI, aucun ViewInspector dans ce dépôt, voir
/// `LivingSummaryMountIdentityTests`) : garde de SOURCE.
final class LivingSummaryCatchUpWiringTests: XCTestCase {

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private func conversationViewCode() throws -> String {
        let raw = try String(
            contentsOf: Self.iosRoot.appendingPathComponent("Meeshy/Features/Main/Views/ConversationView.swift"),
            encoding: .utf8
        )
        return AppSourceGuard.stripComments(raw)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    /// Même délimitation que `LivingSummaryMountIdentityTests.summaryBranch()` :
    /// la branche `.summary` seule, bornée par le pont UIKit qui la suit.
    private func summaryBranch() throws -> String {
        let code = try conversationViewCode()
        let start = try XCTUnwrap(
            code.range(of: "if readingModeController.mode == .summary {"),
            "La branche de montage `mode == .summary` a disparu de `ConversationView`."
        )
        let end = try XCTUnwrap(
            code.range(of: "MessageListView(", options: [], range: start.upperBound ..< code.endIndex),
            "Le pont UIKit qui borne la branche `.summary` est introuvable."
        )
        return String(code[start.upperBound ..< end.lowerBound])
    }

    /// La chaîne exacte du rattrapage : quitter `.summary` (`old == .summary`)
    /// pour n'importe quel autre mode (`new != .summary`) appelle directement
    /// `markCaughtUpFromSummaryOrRiver()` — jamais `markAsRead()` seul, qui
    /// laisserait le gateway sur son repli par fenêtre temporelle.
    private static let catchUpOnLeavingSummary =
        ".adaptiveOnChange(of: readingModeController.mode) { old, new in " +
        "guard old == .summary, new != .summary else { return } " +
        "viewModel.markCaughtUpFromSummaryOrRiver() }"

    func test_conversationView_marksCaughtUpFromSummaryOrRiver_whenLeavingSummaryMode() throws {
        let code = try conversationViewCode()
        XCTAssertTrue(
            code.contains(Self.catchUpOnLeavingSummary),
            "`ConversationView` doit appeler `viewModel.markCaughtUpFromSummaryOrRiver()` dès que " +
            "`readingModeController.mode` quitte `.summary` — sans ce câblage, le correctif de la " +
            "ViewModel existe mais n'est jamais invoqué et le badge reste bloqué en production."
        )
    }

    /// **Le piège que ce câblage évite** : un `onChange` posé SUR la branche
    /// `.summary` elle-même ne se déclencherait JAMAIS à la sortie, puisque
    /// cette branche disparaît du même geste qui fait sortir `mode` de
    /// `.summary` — SwiftUI ne notifie pas un modificateur porté par une vue
    /// en train d'être démontée. Le rattrapage doit donc vivre sur le ZStack
    /// ENGLOBANT, jamais dans la branche conditionnelle.
    func test_theCatchUpHook_livesOutsideTheSummaryBranch_notInsideIt() throws {
        let branch = try summaryBranch()
        XCTAssertFalse(
            branch.contains(Self.catchUpOnLeavingSummary),
            "le rattrapage est câblé DANS la branche `.summary` — cette branche se démonte au " +
            "moment même où `mode` change, un `onChange` qui y vivrait ne se déclencherait jamais " +
            "à la sortie."
        )
        let code = try conversationViewCode()
        XCTAssertTrue(
            code.contains(Self.catchUpOnLeavingSummary),
            "combiné au test ci-dessus : le câblage doit exister QUELQUE PART dans le fichier, " +
            "hors de la branche `.summary`."
        )
    }
}
