import Foundation
import MeeshySDK

/// **Quand la base locale de messages doit être purgée** (#5968).
///
/// La règle est PURE parce que c'est la DÉCISION qui se teste : le défaut
/// qu'elle ferme est une course d'abonnement Combine, invisible à toute garde
/// de source et coûteuse à reproduire à l'exécution.
///
/// Elle prend DEUX signaux parce que la question en a trois réponses :
///
/// | `sessionResolved` | `isAuthenticated` | ce que ça veut dire | purge |
/// |---|---|---|---|
/// | `false` | `false` | personne n'a encore regardé | **non** |
/// | `true` | `true` | session valide restaurée | non |
/// | `true` | `false` | fin de session — en vol ou constatée au démarrage | **oui** |
///
/// Le booléen d'authentification SEUL confond la première ligne et la
/// troisième. C'est ce qui a fait effacer 25 messages et 7 lignes d'outbox à
/// chaque démarrage à froid, session parfaitement valide : `isAuthenticated`
/// naît `false`, `checkExistingSession()` est async, et un `@Published` rejoue
/// sa valeur courante à tout nouvel abonné.
enum SessionPurgeDecision {

    /// `true` seulement quand la session a été RÉSOLUE et qu'il n'y en a pas.
    ///
    /// Fail-closed dans le sens qui compte : tant qu'on ne SAIT pas, on ne
    /// détruit rien. L'inverse — purger dans le doute — coûte des données que
    /// l'utilisateur a écrites ; attendre ne coûte qu'un tour de boucle.
    nonisolated static func shouldPurgeLocalMessages(sessionResolved: Bool,
                                                     isAuthenticated: Bool) -> Bool {
        sessionResolved && !isAuthenticated
    }
}

/// **Quelle base locale des messages la session lit** (#8656).
///
/// Même table de vérité que la purge, lue dans l'autre sens :
///
/// | `sessionResolved` | `isAuthenticated` | base |
/// |---|---|---|
/// | `false` | `false` | inchangée — personne n'a encore regardé : la base ouverte au démarrage (celle du compte du trousseau) reste servie, cache-first |
/// | indifférent | `true` | celle du compte ACTIF |
/// | `true` | `false` | celle de personne |
///
/// `isAuthenticated` passe à `true` AVANT `hasResolvedStoredSession` au
/// démarrage à froid : la base d'un compte restauré se sert sans attendre.
nonisolated enum MessageStoreTarget: Equatable {
    case unchanged
    case account(MessageStoreAccountKey?)

    nonisolated static func resolve(
        sessionResolved: Bool,
        isAuthenticated: Bool,
        activeKey: MessageStoreAccountKey?
    ) -> MessageStoreTarget {
        if isAuthenticated { return .account(activeKey) }
        return sessionResolved ? .account(nil) : .unchanged
    }
}
