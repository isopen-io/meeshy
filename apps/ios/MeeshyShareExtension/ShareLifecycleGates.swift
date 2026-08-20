import Foundation

/// Deux verrous purs pour le cycle de vie de l'écran de partage — round 2 de
/// revue (Critical).
///
/// Le bug corrigé : après un envoi, `isSending` repasse à `false` AVANT le
/// délai d'affichage (`Task.sleep`) qui précède `onFinish()`. Pendant cette
/// fenêtre de ~700 ms, le bouton Annuler — dont le seul verrou était
/// `.disabled(isSending)` — redevenait actif, alors que la fiche de reprise
/// est déjà committée sur disque (`ShareSender.send` écrit AVANT le premier
/// POST) et référence encore les fichiers copiés. Un tap dans cette fenêtre
/// les effaçait, alors qu'une reprise différée les attendait.
///
/// Compilés DANS `MeeshyShareExtension` (glob de répertoire) ET listés
/// explicitement dans les `sources:` de `MeeshyTests` (`project.yml`) — même
/// précédent que `ShareLimits`/`ShareMediaStaging`/`SharePendingShare` :
/// l'app-extension n'est pas liable depuis le bundle de tests.

/// Décide si le bouton Annuler doit rester actif.
nonisolated enum ShareCancelPolicy {
    /// Une fois qu'un envoi a été TENTÉ (fiche committée), Annuler n'a plus
    /// de sens : le partage est déjà pris en charge, même différé. Ne dépend
    /// QUE de `sendWasAttempted` — jamais de `isSending`, qui redevient
    /// `false` bien avant que l'écran ne se ferme et rouvrirait la même
    /// fenêtre si on l'utilisait ici à la place.
    static func isCancelAllowed(sendWasAttempted: Bool) -> Bool {
        !sendWasAttempted
    }
}

/// Verrou à sens unique : la première invocation de `fireOnce` exécute
/// l'action et arme le verrou ; toute invocation suivante est un no-op
/// silencieux. Porte l'invariant « `complete()` ne peut être atteint deux
/// fois » — qu'un second appel vienne d'`onCancel` (tapé pendant la fenêtre
/// avant round 2) ou du réveil du `Task` qui appelle `onFinish()`.
nonisolated final class ShareCompletionGate {
    private(set) var hasFired = false

    init() {}

    @discardableResult
    func fireOnce(_ action: () -> Void) -> Bool {
        guard !hasFired else { return false }
        hasFired = true
        action()
        return true
    }
}
