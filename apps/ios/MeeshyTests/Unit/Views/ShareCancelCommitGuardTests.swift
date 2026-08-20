import XCTest

/// Garde contre la RÉAPPARITION de la régression Critical du round 2 de
/// revue : le bouton Annuler redevenait actif pendant ~700 ms après un envoi
/// tenté, entre la pose de `isSending = false` et le réveil du `Task` qui
/// appelle `onFinish()`. La fiche de reprise est déjà committée sur disque à
/// ce moment (`ShareSender.send` écrit AVANT le premier POST) et référence
/// encore les fichiers copiés — un tap sur Annuler dans cette fenêtre les
/// effaçait alors qu'une reprise différée les attendait.
///
/// `MeeshyShareExtension` est une cible `app-extension`, illiable depuis ce
/// bundle : ces assertions lisent le source — même idiome que
/// `ShareExtensionAccessibilityTests`/`ShareExtensionLocalizationTests`. Le
/// MÉCANISME lui-même (`ShareCancelPolicy`, `ShareCompletionGate`) est,
/// contrairement à `ShareViewController`, compilé dans ce bundle
/// (`project.yml`) et vérifié par exécution réelle dans
/// `ShareLifecycleGatesTests`.
final class ShareCancelCommitGuardTests: XCTestCase {

    private func shareSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Views
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("MeeshyShareExtension/ShareViewController.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func condensed(_ source: String) -> String {
        source.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// Verrou 1 : Annuler doit passer par `ShareCancelPolicy`, jamais par
    /// `isSending` seul — `isSending` redevient `false` bien avant
    /// `onFinish()`, exactement la fenêtre qui a laissé passer la régression.
    func test_cancelButton_isGatedByShareCancelPolicy_notByIsSendingAlone() throws {
        let source = condensed(try shareSource())

        XCTAssertTrue(
            source.contains("ShareCancelPolicy.isCancelAllowed(sendWasAttempted: sendWasAttempted)"),
            "Le bouton Annuler doit consulter ShareCancelPolicy.isCancelAllowed(sendWasAttempted:) — "
            + "un verrou qui ne redevient jamais false, contrairement à isSending."
        )
    }

    /// `sendWasAttempted` doit être un verrou à SENS UNIQUE : initialisé à
    /// `false`, jamais réassigné à `false` ailleurs dans le fichier — sinon
    /// la même fenêtre se rouvrirait sous un autre nom (c'est exactement le
    /// piège que « déplacer isSending = false après le sleep » aurait recréé).
    func test_sendWasAttempted_isNeverResetToFalseAfterInit() throws {
        let source = try shareSource()

        XCTAssertTrue(
            source.contains("@State private var sendWasAttempted = false"),
            "sendWasAttempted doit être déclaré comme @State, initialisé à false."
        )

        let occurrencesOfFalse = source.components(separatedBy: "sendWasAttempted = false").count - 1
        XCTAssertEqual(
            occurrencesOfFalse, 1,
            "sendWasAttempted ne doit être assigné à false QU'À sa déclaration — le "
            + "réassigner ailleurs recréerait un état « annulable » implicite."
        )

        XCTAssertTrue(
            source.contains("sendWasAttempted = true"),
            "sendWasAttempted doit être armé au tout début d'un envoi tenté, avant le premier POST."
        )
    }

    /// Verrou 2 (effet secondaire à traiter) : `complete()` ne doit pouvoir
    /// atteindre `extensionContext?.completeRequest` qu'une seule fois, que
    /// l'appel vienne d'`onCancel` ou d'`onFinish`.
    func test_complete_routesThroughTheCompletionGate() throws {
        let source = condensed(try shareSource())

        XCTAssertTrue(
            source.contains("completionGate.fireOnce"),
            "complete() doit passer par ShareCompletionGate.fireOnce pour n'atteindre "
            + "extensionContext?.completeRequest qu'une seule fois."
        )
    }
}
