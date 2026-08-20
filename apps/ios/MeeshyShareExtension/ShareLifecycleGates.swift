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
///
/// Round 3 de revue (Important) : le corps était auparavant
/// `guard !hasFired else { return false }; hasFired = true; action()`, SANS
/// verrou — non atomique, donc deux appels réellement concurrents pouvaient
/// tous deux franchir le `guard` avant qu'aucun n'ait eu la chance d'écrire
/// `hasFired`. Ça « marchait » aujourd'hui uniquement parce que les deux
/// appelants réels (`ShareViewController.swift`, `onCancel`/`onFinish`)
/// s'exécutent tous les deux sur le MainActor — une coïncidence d'isolation,
/// pas une garantie du type, alors que le type est délibérément
/// `nonisolated` et qu'une extension de partage est précisément l'endroit où
/// des callbacks arrivent sur des files arbitraires. Même idiome que
/// `ExtractionBox`/`StagingBox` (`ShareViewController.swift`) : `NSLock` +
/// `@unchecked Sendable` + `nonisolated(unsafe)` sur le stockage — le verrou
/// EST la synchronisation que le compilateur ne peut pas voir à travers
/// l'isolation d'acteur. Preuve de la race : `ShareLifecycleGatesTests
/// .test_fireOnce_underGenuineConcurrentThreads_firesTheActionExactlyOnce`.
nonisolated final class ShareCompletionGate: @unchecked Sendable {
    private let lock = NSLock()
    // `nonisolated(unsafe)` : mutée uniquement sous `lock`, jamais lue ni
    // écrite ailleurs — même rationale qu'`ExtractionBox.text`/`.url`.
    nonisolated(unsafe) private var _hasFired = false

    init() {}

    /// Lecture protégée : un accès direct à la variable de stockage
    /// contournerait le verrou et redeviendrait une lecture non synchronisée.
    var hasFired: Bool {
        lock.lock(); defer { lock.unlock() }
        return _hasFired
    }

    @discardableResult
    func fireOnce(_ action: () -> Void) -> Bool {
        lock.lock()
        let shouldFire = !_hasFired
        if shouldFire { _hasFired = true }
        lock.unlock()

        // `action()` s'exécute HORS du verrou : elle peut être un closure
        // arbitraire (ici `extensionContext?.completeRequest`), et tenir le
        // verrou pendant son exécution risquerait un deadlock si elle
        // rappelait un jour dans `fireOnce` — la décision d'état, elle,
        // reste atomique.
        guard shouldFire else { return false }
        action()
        return true
    }
}
