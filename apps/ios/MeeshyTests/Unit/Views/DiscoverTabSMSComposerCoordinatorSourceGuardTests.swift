import XCTest

/// Dette Swift 6 concurrency (backlog item 4, `tasks/ios-debt-routine-progress.md`) —
/// `SMSComposerView.Coordinator.messageComposeViewController(_:didFinishWith:)` est un callback
/// `nonisolated` de `MFMessageComposeViewControllerDelegate` : iOS peut l'invoquer hors MainActor.
/// Il sautait sur main via `DispatchQueue.main.async` brut au lieu de l'idiome structuré déjà
/// utilisé pour la même catégorie de hop nonisolated → MainActor ailleurs dans le code (cf.
/// `WebRTCService.swift` : « The delegate extension below is `nonisolated` and hops via
/// `Task { @MainActor in }` »).
///
/// Source-only : `MFMessageComposeViewController` exige un appareil capable d'envoyer un SMS et
/// une session de composeur réellement présentée pour recevoir ce callback — pas exerçable en
/// XCTest. Même technique que `P2PWebRTCClientConcurrencySourceTests` (concurrency hop non
/// exerçable behaviorally, gardé au niveau source).
final class DiscoverTabSMSComposerCoordinatorSourceGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Contacts/DiscoverTab.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Isole le corps du callback (jusqu'à la fin du fichier — c'est le dernier membre du dernier
    /// type déclaré) plutôt que de grepper le fichier entier : une future occurrence non liée de
    /// `DispatchQueue.main.async` ailleurs dans `DiscoverTab.swift` ne doit ni faire échouer ni
    /// masquer cette garde précise.
    private func callbackBody(in src: String) throws -> String {
        let marker = "func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {"
        guard let range = src.range(of: marker) else {
            XCTFail("Signature du callback introuvable — DiscoverTab.swift a changé de forme.")
            throw XCTSkip("marker")
        }
        return String(src[range.lowerBound...])
    }

    func test_messageComposeDelegateCallback_hopsToMainActorViaStructuredTask() throws {
        let stripped = AppSourceGuard.stripComments(try source())
        let callback = try callbackBody(in: stripped)

        XCTAssertFalse(
            callback.contains("DispatchQueue.main.async"),
            "Le callback nonisolated ne doit plus sauter sur main via GCD brut — `Task { @MainActor in }` " +
            "est l'idiome déjà utilisé pour cette catégorie de hop nonisolated → MainActor ailleurs dans " +
            "le code (cf. WebRTCService.swift)."
        )
        XCTAssertTrue(
            callback.contains("Task { @MainActor in"),
            "Le callback doit sauter sur MainActor via une Task structurée pour appeler dismiss(animated:)."
        )
    }
}
