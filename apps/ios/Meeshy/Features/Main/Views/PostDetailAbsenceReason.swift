import Foundation
import MeeshySDK

/// **Pourquoi il n'y a rien à montrer — la question que l'écran ne posait pas.**
///
/// `PostDetailView` rendait son état « ce contenu n'est plus disponible » dès
/// que le post était `nil` hors chargement. Deux causes très différentes
/// tombaient donc dans la même phrase : la cible a disparu, ou la requête a
/// échoué. Le ViewModel les distinguait déjà — `error` est posé dans le `catch`
/// de `refreshPost` — mais personne ne lisait ce champ.
///
/// Le coût n'est pas rédactionnel. L'écran AFFIRMAIT une suppression qui
/// n'avait pas eu lieu, et n'offrait que « Retour » : il retirait la seule
/// action utile, réessayer. Un tunnel devenait « votre ami a supprimé sa
/// story ».
///
/// La règle vit ici, pure et testable, plutôt que dans une condition de `body`
/// — c'est ce qui permet d'éprouver l'ORDRE des questions, qui est la partie
/// facile à casser (#4903).
///
/// `nonisolated` sur le type ET sur la fonction : le target app compile en
/// `defaultIsolation MainActor`, si bien qu'une règle pure y devient isolée par
/// défaut et cesse d'être appelable depuis le bundle de tests, qui est
/// `nonisolated`. Sans ce modificateur, une règle parfaitement pure est
/// intestable — la même note vit sur `StoryViewerContainer.isGroupReadyToPresent`.
nonisolated enum PostDetailAbsenceReason: Equatable {
    /// Il y a un post : aucune des branches d'absence ne s'applique.
    case present
    /// Une tentative est en cours — aucun verdict, sinon l'écran ment le temps
    /// que la réponse arrive.
    case stillLoading
    /// Rien n'est arrivé ET rien n'a échoué : la cible n'existe plus.
    case unavailable
    /// Une requête a échoué. Ne dit RIEN sur l'existence de la cible, et
    /// appelle une seule chose : réessayer.
    case loadFailed

    /// L'ordre des trois questions EST la règle :
    ///
    /// 1. **ai-je quelque chose à montrer ?** — `refreshPost` ne remet pas
    ///    `error` à `nil` en cas de succès, donc un échec suivi d'une réussite
    ///    laisse le champ garni ; interroger l'erreur en premier ferait
    ///    disparaître un post parfaitement chargé ;
    /// 2. **une tentative tourne-t-elle ?** — sinon une erreur ANCIENNE
    ///    trancherait pendant qu'une nouvelle requête est en vol ;
    /// 3. **qu'est-ce qui a échoué ?** — seulement alors.

    /// **Un 404 n'est pas un échec — c'est une réponse.**
    ///
    /// Le serveur a répondu, et il a dit « cette ressource n'existe pas ».
    /// Confondre les deux ferait mentir l'écran dans l'AUTRE sens : une story
    /// réellement supprimée inviterait à « vérifier la connexion » et à
    /// réessayer une requête qui échouera identiquement.
    ///
    /// **Le type testé est `MeeshyError`, et c'est tout le sujet.**
    ///
    /// J'ai d'abord copié la règle voisine, qui filtre `APIError.serverError`.
    /// Elle ne peut pas matcher : `APIClient` compte **23 `throw MeeshyError`
    /// et zéro `throw APIError`** (mesuré), si bien qu'une garde écrite contre
    /// `APIError` ne s'exécute jamais sur un appel passé par `api.request`.
    /// `StoryViewerView` documente déjà cette confusion pour l'avoir payée.
    ///
    /// Une règle recopiée hérite de ses défauts en silence : celle-ci serait
    /// née MORTE, et son témoin l'aurait déclarée juste — un test écrit avec
    /// le même `APIError` que le code passe au vert sans rien prouver du
    /// terrain. C'est pourquoi les témoins construisent l'erreur telle que
    /// l'`APIClient` la lève.
    nonisolated static func isNotFound(_ error: Error) -> Bool {
        if case MeeshyError.server(let statusCode, _) = error { return statusCode == 404 }
        return false
    }

    nonisolated static func resolve(hasPost: Bool, isLoading: Bool, error: String?) -> PostDetailAbsenceReason {
        if hasPost { return .present }
        if isLoading { return .stillLoading }
        return error == nil ? .unavailable : .loadFailed
    }
}
