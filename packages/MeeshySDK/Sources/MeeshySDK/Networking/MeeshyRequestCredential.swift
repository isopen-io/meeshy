import Foundation

/// L'identifiant présenté au gateway, indissociable de SON en-tête.
///
/// Le gateway connaît deux populations et deux protocoles : un compte inscrit
/// s'annonce par `Authorization: Bearer <JWT>`, un invité de lien partagé par
/// `X-Session-Token: <anon_…>`. Les deux sont lus par des middlewares
/// différents, et le second n'est pas un JWT : le présenter en `Bearer` fait
/// répondre « Invalid JWT token », c'est-à-dire un refus qui ressemble à une
/// panne d'authentification alors que l'identité est parfaitement valide.
///
/// Le type existe pour que la question « sous quel en-tête ? » n'ait jamais à
/// être re-répondue par un appelant. Passer un `String` nu la lui repose à
/// chaque site, et il suffit d'un site distrait pour exclure toute une
/// population — c'est littéralement ce qui est arrivé au client web
/// (2026-08-18) : `ApiService` supposait `Bearer` partout, et trois sites
/// d'appel compensaient à la main pendant que tous les autres échouaient.
public struct MeeshyRequestCredential: Sendable, Equatable {
    /// Nom de l'en-tête HTTP — `Authorization` ou `X-Session-Token`.
    public let header: String
    /// Valeur complète, préfixe `Bearer ` compris quand il s'applique.
    public let value: String

    public init(header: String, value: String) {
        self.header = header
        self.value = value
    }

    /// Un compte inscrit.
    public static func bearer(_ token: String) -> MeeshyRequestCredential {
        MeeshyRequestCredential(header: "Authorization", value: "Bearer \(token)")
    }

    /// Un invité de lien partagé — jamais de préfixe, ce n'est pas un JWT.
    public static func anonymousSession(_ token: String) -> MeeshyRequestCredential {
        MeeshyRequestCredential(header: "X-Session-Token", value: token)
    }

    /// Vrai pour un compte inscrit. Les ressources que le gateway réserve aux
    /// comptes — médias de post, de story, de statut, de commentaire — se
    /// gardent là-dessus plutôt que d'attendre le 403 du serveur.
    public var isAccount: Bool { header == "Authorization" }
}
