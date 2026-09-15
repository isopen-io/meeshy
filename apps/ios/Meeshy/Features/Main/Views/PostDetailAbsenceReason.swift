import Foundation
import MeeshySDK

/// **Pourquoi il n'y a rien à montrer — la question que l'écran ne posait pas.**
///
/// `PostDetailView` rendait son état « ce contenu n'est plus disponible » dès
/// que le post était `nil` hors chargement. Deux causes très différentes
/// tombaient donc dans la même phrase : la cible a disparu, ou la requête a
/// échoué (#4903). Puis « échec » a voulu dire « tout sauf 404 », si bien
/// qu'un 500 serveur disait « vérifiez votre connexion » à des utilisateurs
/// parfaitement connectés (#6503, #6508).
///
/// La règle vit ici, pure et testable, plutôt que dans une condition de `body`
/// — c'est ce qui permet d'éprouver l'ORDRE des questions, la partie facile à
/// casser. La CAUSE d'un échec vient de `ContentFetchFailure.classify(_:)`.
///
/// `nonisolated` sur le type ET sur la fonction : le target app compile en
/// `defaultIsolation MainActor`, si bien qu'une règle pure y devient isolée par
/// défaut et cesse d'être appelable depuis le bundle de tests, qui est
/// `nonisolated`. La même note vit sur `StoryViewerContainer.isGroupReadyToPresent`.
nonisolated enum PostDetailAbsenceReason: Equatable {
    /// Il y a un post : aucune des branches d'absence ne s'applique.
    case present
    /// Une tentative est en cours — aucun verdict, sinon l'écran ment le temps
    /// que la réponse arrive.
    case stillLoading
    /// La cible n'est pas là pour ce lecteur : rien n'a échoué, ou le serveur a
    /// répondu 403 / 404. Réessayer échouerait identiquement.
    case unavailable
    /// La requête n'est pas arrivée : l'écran dit la connexion et offre de réessayer.
    case networkFailed
    /// Le serveur a répondu et a échoué : l'écran offre de réessayer SANS
    /// jamais parler de connexion.
    case serverFailed

    /// L'ordre des trois questions EST la règle :
    ///
    /// 1. **ai-je quelque chose à montrer ?** — `refreshPost` ne remet pas la
    ///    cause à `nil` en cas de succès, donc un échec suivi d'une réussite
    ///    laisse le champ garni ; interroger l'échec en premier ferait
    ///    disparaître un post parfaitement chargé ;
    /// 2. **une tentative tourne-t-elle ?** — sinon une cause ANCIENNE
    ///    trancherait pendant qu'une nouvelle requête est en vol ;
    /// 3. **qu'est-ce qui a échoué ?** — seulement alors.
    nonisolated static func resolve(hasPost: Bool, isLoading: Bool, failure: ContentFetchFailure?) -> PostDetailAbsenceReason {
        if hasPost { return .present }
        if isLoading { return .stillLoading }
        switch failure {
        case .network: return .networkFailed
        case .server: return .serverFailed
        case .forbidden, .notFound, nil: return .unavailable
        }
    }
}
