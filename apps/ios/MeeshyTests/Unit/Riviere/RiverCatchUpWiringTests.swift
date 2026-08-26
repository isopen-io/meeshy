import XCTest
@testable import Meeshy

/// #3901 — la Rivière ne rend jamais bulle par bulle
/// (`MessageListViewController.rendersThread` est faux pour `.river`, voir
/// `MessageListSeenTrackingModeGateTests`) : aucun `seenIds` n'existe pour
/// prouver individuellement la lecture, donc `markAsRead(messageIds:)` seul
/// ne peut jamais y faire avancer le curseur serveur.
///
/// La preuve de consultation PROPRE à la Rivière est d'avoir atteint le
/// PRÉSENT (`RiverConversationMapping.isAtPresent`, testé directement dans
/// `RiverConversationMappingTests`) — ce fichier garde son CÂBLAGE : (1)
/// `RiverConversationHost` appelle `onReachPresent?()` exactement quand le
/// curseur devient « au présent », et (2) `ConversationView` relie ce
/// callback à `ConversationViewModel.markCaughtUpFromSummaryOrRiver()`.
/// Ni l'un ni l'autre fichier n'est montable ici (vues SwiftUI, aucun
/// ViewInspector dans ce dépôt, voir `RiverSourceGuardTests`) : garde de
/// SOURCE.
final class RiverCatchUpWiringTests: XCTestCase {

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Riviere
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private func normalized(_ relativePath: String) throws -> String {
        let raw = try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
        return AppSourceGuard.stripComments(raw)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func riverConversationHostCode() throws -> String {
        try normalized("Meeshy/Features/Main/Riviere/View/RiverConversationHost.swift")
    }

    private func conversationViewCode() throws -> String {
        try normalized("Meeshy/Features/Main/Views/ConversationView.swift")
    }

    /// La branche `.river` seule, bornée par la branche `.summary` qui la
    /// suit immédiatement dans le même `ZStack` (`ConversationView`) — même
    /// technique de délimitation que `LivingSummaryMountIdentityTests
    /// .summaryBranch()`, pour que l'assertion ne se satisfasse pas d'une
    /// occurrence appartenant à un autre mode.
    private func riverBranch() throws -> String {
        let code = try conversationViewCode()
        let start = try XCTUnwrap(
            code.range(of: "if readingModeController.mode == .river {"),
            "La branche de montage `mode == .river` a disparu de `ConversationView`."
        )
        let end = try XCTUnwrap(
            code.range(of: "if readingModeController.mode == .summary {", options: [], range: start.upperBound ..< code.endIndex),
            "La branche `.summary` qui borne `.river` est introuvable."
        )
        return String(code[start.upperBound ..< end.lowerBound])
    }

    // MARK: - RiverConversationHost : le curseur ATTEINT le présent

    private static let reachPresentHook =
        ".adaptiveOnChange(of: navigation.cursor) { _, newCursor in " +
        "guard RiverConversationMapping.isAtPresent(cursor: newCursor, geometry: geometry) else { return } " +
        "onReachPresent?() }"

    func test_riverConversationHost_callsOnReachPresent_exactlyWhenTheCursorReachesThePresent() throws {
        let code = try riverConversationHostCode()
        XCTAssertTrue(
            code.contains(Self.reachPresentHook),
            "`RiverConversationHost` doit appeler `onReachPresent?()` uniquement quand le curseur " +
            "devient « au présent » (`RiverConversationMapping.isAtPresent`) — sans cette garde, " +
            "l'appelant ne peut jamais savoir QUAND déclarer le rattrapage."
        )
    }

    // MARK: - ConversationView : le callback avance le curseur serveur

    private static let onReachPresentWiring =
        "onReachPresent: { viewModel.markCaughtUpFromSummaryOrRiver() },"

    func test_conversationView_wiresOnReachPresent_toMarkCaughtUpFromSummaryOrRiver() throws {
        let branch = try riverBranch()
        XCTAssertTrue(
            branch.contains(Self.onReachPresentWiring),
            "la branche `.river` de `ConversationView` doit relier `RiverConversationHost." +
            "onReachPresent` à `viewModel.markCaughtUpFromSummaryOrRiver()` — sans ce câblage, " +
            "`RiverConversationHost` peut détecter le présent mais rien n'avance le curseur serveur."
        )
    }
}
