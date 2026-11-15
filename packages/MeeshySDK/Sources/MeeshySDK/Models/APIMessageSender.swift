import Foundation

public struct APIMessageSender: Decodable, Sendable {
    public let id: String
    public let username: String?
    public let displayName: String?
    public let avatar: String?
    public let type: String?
    public let userId: String?
    public let firstName: String?
    public let lastName: String?
    public let user: APIMessageSenderUser?
    /// Le contour d'avatar équipé de l'auteur (#10713), servi avec le message. Additif et
    /// tolérant : absent (ancien serveur, aucun contour) ou illisible ⇒ `nil`.
    public var profileDecor: ServedProfileDecor? = nil

    public var name: String {
        nonEmpty(displayName) ?? nonEmpty(user?.displayName) ?? nonEmpty(username) ?? nonEmpty(user?.username) ?? id
    }

    public var resolvedAvatar: String? {
        nonEmpty(avatar) ?? nonEmpty(user?.avatar)
    }

    /// L'auteur a-t-il un COMPTE ?
    ///
    /// `type` était décodé depuis toujours et ne remontait à aucun modèle de
    /// domaine — exactement le même dernier mètre que sur le web, où le champ
    /// était chargé, mappé, puis retiré à la sérialisation. Un participant
    /// `anonymous` s'affichait donc comme n'importe quel inscrit.
    ///
    /// Le PSEUDO ne prouve rien : un compte peut s'appeler `ano_bob`. Seul le
    /// type tranche.
    public var isAnonymous: Bool { type == "anonymous" }

    /// L'auteur a-t-il un COMPTE qui l'engage (#10286) ? Fail-closed : seuls
    /// `user` et `bot` le prouvent ; un type absent ou inconnu vaut invité,
    /// et ses adresses restent du texte brut.
    public var hasAccount: Bool { type == "user" || type == "bot" }

    public var resolvedUserId: String? {
        userId ?? user?.id
    }

    private func nonEmpty(_ s: String?) -> String? {
        guard let s, !s.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return s
    }
}
