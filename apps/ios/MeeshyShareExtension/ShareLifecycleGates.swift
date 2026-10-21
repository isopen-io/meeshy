import Foundation
import os

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
/// précédent que `ShareMediaStaging`/`SharePendingShare` : l'app-extension
/// n'est pas liable depuis le bundle de tests.
///
/// Depuis l'écran unique (#10947), la question est posée à la FERMETURE de la
/// feuille : on n'efface les fichiers copiés que si aucun envoi n'a été tenté
/// et qu'aucune fiche (studio, relais) ne les décrit
/// (`ShareViewController.finish`, `ExtensionShareDispatcher.holdsStagedMedia`).

/// Décide si la fermeture peut effacer les fichiers copiés.
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
/// fois » — qu'un second appel vienne d'`onCancel` ou du réveil du `Task` qui
/// appelle `onFinish()`.
///
/// La décision d'état est atomique (`OSAllocatedUnfairLock`, `Sendable` par
/// construction : ni `@unchecked` ni `nonisolated(unsafe)`). Preuve de la race :
/// `ShareLifecycleGatesTests
/// .test_fireOnce_underGenuineConcurrentThreads_firesTheActionExactlyOnce`.
nonisolated final class ShareCompletionGate: Sendable {
    private let fired = OSAllocatedUnfairLock(initialState: false)

    init() {}

    var hasFired: Bool {
        fired.withLock { $0 }
    }

    @discardableResult
    func fireOnce(_ action: () -> Void) -> Bool {
        let shouldFire = fired.withLock { state -> Bool in
            guard !state else { return false }
            state = true
            return true
        }
        // `action()` s'exécute HORS du verrou : une action qui rappellerait
        // `fireOnce` ne doit pas pouvoir s'interbloquer.
        guard shouldFire else { return false }
        action()
        return true
    }
}
