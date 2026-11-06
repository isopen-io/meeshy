import Foundation

/// **« Désactiver les commentaires » choisi dans le composer, jusqu'à la
/// requête qui crée la publication** (#16541).
///
/// Une publication du composer part par la file durable : l'intention est
/// enfilée (`enqueuePostMedia`) et la requête `POST /posts` ne part qu'au
/// flush — plus tard, ou après un redémarrage. Le choix voyage donc, par
/// l'identifiant de mutation de la publication, dans un registre DURABLE que
/// le dispatcher relit au moment de bâtir le corps (`CreatePostBody`) : la
/// publication naît fermée, dans la même requête, sans fenêtre où elle serait
/// ouverte. Le registre est borné (les plus anciens s'effacent) : un
/// identifiant de mutation ne sert qu'une fois, et un rejeu de la même ligne
/// doit relire le même choix — il n'est donc jamais consommé par la lecture.
///
/// Seul ce qui est FERMÉ s'écrit : l'absence vaut « ouvert », ce que la
/// passerelle applique déjà par défaut.
nonisolated enum PublicationCommentClosure {

    private static let key = "meeshy.publication.commentsDisabled.cmids"
    private static let capacity = 64

    static func record(_ clientMutationId: String, disabled: Bool, defaults: UserDefaults = .standard) {
        guard disabled, !clientMutationId.isEmpty else { return }
        let ids = (defaults.stringArray(forKey: key) ?? []).filter { $0 != clientMutationId }
        defaults.set(Array((ids + [clientMutationId]).suffix(capacity)), forKey: key)
    }

    /// `true` quand la publication doit naître fermée, `nil` sinon — la clé
    /// est alors omise du corps.
    static func commentsDisabled(for clientMutationId: String, defaults: UserDefaults = .standard) -> Bool? {
        (defaults.stringArray(forKey: key) ?? []).contains(clientMutationId) ? true : nil
    }
}
