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

    /// Round 3 de revue (Minor) : strippait AUPARAVANT uniquement les
    /// espaces, jamais les commentaires — un commentaire citant le motif
    /// cherché (ex. `// ShareCancelPolicy.isCancelAllowed(...)`) suffisait à
    /// garder la garde verte même si le code réel avait régressé vers
    /// `.disabled(isSending)` seul. Passe maintenant par
    /// `ShareSourceCommentStripping`, partagée avec
    /// `ShareExtensionSourceGuardTests`, AVANT de collapser les espaces —
    /// dans cet ordre, car un commentaire `//` a besoin du `\n` d'origine
    /// pour savoir où il se termine.
    private func condensed(_ source: String) -> String {
        ShareSourceCommentStripping.strippingComments(source)
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }

    /// Contre-exemple EXACT du round 3 de revue : avant ce round, ce
    /// commentaire suffisait à faire passer `test_cancelButton_isGatedBy…`
    /// au vert alors même que le code réel aurait régressé vers
    /// `.disabled(isSending)` seul, sans passer par `ShareCancelPolicy`.
    func test_condensed_isNotDefeatedByACommentCitingThePattern() {
        let regressedSourceWithDefeatComment = """
        .disabled(isSending) // ShareCancelPolicy.isCancelAllowed(sendWasAttempted: sendWasAttempted) — désactivé temporairement
        """

        XCTAssertFalse(
            condensed(regressedSourceWithDefeatComment)
                .contains("ShareCancelPolicy.isCancelAllowed(sendWasAttempted: sendWasAttempted)"),
            "un commentaire citant le motif ne doit plus suffire à masquer une régression du "
            + "code réel — le verrou doit être dans du code exécuté, pas dans un commentaire"
        )
    }

    /// Verrou 1, depuis l'écran unique (#10947) : la FERMETURE de la feuille
    /// n'efface les fichiers copiés que par `ShareCancelPolicy`, nourrie de ce
    /// qui les possède — une fiche de studio (`handedOff`) ou un envoi tenté
    /// (`ExtensionShareDispatcher.holdsStagedMedia`, armé AVANT le premier
    /// `await`, vérifié à l'exécution par `ExtensionShareDispatcherTests`).
    func test_closing_discardsOnlyThroughTheCancelPolicy_fedByWhatOwnsTheFiles() throws {
        let source = condensed(try shareSource())

        XCTAssertTrue(
            source.contains("let ownedByAFiche = handedOff || dispatcher?.holdsStagedMedia == true"),
            "La fermeture doit savoir si une fiche possède les fichiers copiés."
        )
        XCTAssertTrue(
            source.contains("if ShareCancelPolicy.isCancelAllowed(sendWasAttempted: ownedByAFiche) { discardStagedMedia() }"),
            "Les fichiers ne s'effacent qu'à travers ShareCancelPolicy — jamais sur un simple « fermer »."
        )
    }

    /// `handedOff` est un verrou à SENS UNIQUE : posé une fois la fiche de
    /// studio écrite, jamais remis à `false`.
    func test_handedOff_isNeverResetToFalseAfterInit() throws {
        let source = ShareSourceCommentStripping.strippingComments(try shareSource())

        XCTAssertTrue(source.contains("private var handedOff = false"))
        XCTAssertEqual(source.components(separatedBy: "handedOff = false").count - 1, 1)
        XCTAssertTrue(source.contains("handedOff = true"))
    }

    /// Verrou 2 (effet secondaire à traiter) : `complete()` ne doit pouvoir
    /// atteindre `extensionContext?.completeRequest` qu'une seule fois, que
    /// l'appel vienne de la fermeture, du studio ou de l'ouverture de l'app.
    func test_complete_routesThroughTheCompletionGate() throws {
        let source = condensed(try shareSource())

        XCTAssertTrue(
            source.contains("completionGate.fireOnce"),
            "complete() doit passer par ShareCompletionGate.fireOnce pour n'atteindre "
            + "extensionContext?.completeRequest qu'une seule fois."
        )
    }
}
