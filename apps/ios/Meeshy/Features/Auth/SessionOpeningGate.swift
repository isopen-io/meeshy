import Foundation
import Combine

/// Le point UNIQUE par lequel une session prouvée s'ouvre pendant que l'écran
/// de connexion présente une porte d'accès (code, lien de connexion,
/// inscription, mot de passe oublié) — #8076.
///
/// Ouvrir la session bascule la racine de l'app : `MeeshyApp` remplace
/// `LoginView`, et ce que `LoginView` présente encore reste orphelin, figé,
/// sans « Fermer » qui réponde (#8059). La séquence est donc toujours la même,
/// quelle que soit la source de la preuve : prouver → REFERMER → ouvrir.
///
/// - la saisie du code se referme ELLE-MÊME (le temps de lire « Email
///   vérifié ! ») : elle confie sa session par `openWhenDismissed` ;
/// - un lien reçu par e-mail arrive de l'EXTÉRIEUR, pendant n'importe quelle
///   présentation : `open` demande à l'hôte de la refermer.
///
/// Dans les deux cas, la session s'ouvre dans `presentationEnded`, que l'hôte
/// appelle depuis le `onDismiss` de sa présentation.
@MainActor
final class SessionOpeningGate: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au
    // démontage hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = SessionOpeningGate()

    /// L'hôte doit refermer sa présentation d'accès : une session attend.
    @Published private(set) var dismissalRequested = false

    private(set) var isPresenting = false
    private var pendingOpener: ProvenSessionOpener?

    /// Une présentation d'accès est affichée par l'écran de connexion.
    func presentationBegan() {
        isPresenting = true
    }

    /// Plus aucune présentation d'accès : la session en attente s'ouvre.
    func presentationEnded() {
        isPresenting = false
        dismissalRequested = false
        guard let open = pendingOpener else { return }
        pendingOpener = nil
        open()
    }

    /// Ouvre la session dès qu'aucune présentation d'accès n'est affichée, en
    /// demandant à l'hôte de refermer celle qui l'est (lien reçu par e-mail).
    func open(_ opener: @escaping ProvenSessionOpener) {
        guard isPresenting else { return opener() }
        pendingOpener = opener
        dismissalRequested = true
    }

    /// Ouvre la session quand la présentation, qui se referme elle-même, sera
    /// partie (saisie du code, lien de connexion, inscription).
    func openWhenDismissed(_ opener: @escaping ProvenSessionOpener) {
        guard isPresenting else { return opener() }
        pendingOpener = opener
    }
}
