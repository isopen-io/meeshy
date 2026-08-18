import Foundation

/// Les quatre faits qui suffisent à décider comment on entre par un lien.
///
/// Volontairement des VALEURS, pas des services : la règle ne doit rien
/// chercher elle-même. L'appelant résout le lien (`ShareLinkService.getLinkInfo`),
/// consulte son store de sessions invitées et sa liste de conversations, puis
/// pose la question.
public struct ShareLinkEntryFacts: Equatable, Sendable {
    /// Conversation visée, telle que le lien la résout.
    public let conversationId: String
    /// Un compte est disponible sur cet appareil.
    public let isAuthenticated: Bool
    /// Ce compte est déjà membre de la conversation visée.
    public let isAlreadyMember: Bool
    /// Le lien refuse les visiteurs sans compte (`requireAccount`).
    public let linkRequiresAccount: Bool
    /// Une session invitée existe déjà pour ce lien (`AnonymousSessionStore`).
    public let hasStoredGuestSession: Bool

    public init(
        conversationId: String,
        isAuthenticated: Bool,
        isAlreadyMember: Bool,
        linkRequiresAccount: Bool,
        hasStoredGuestSession: Bool
    ) {
        self.conversationId = conversationId
        self.isAuthenticated = isAuthenticated
        self.isAlreadyMember = isAlreadyMember
        self.linkRequiresAccount = linkRequiresAccount
        self.hasStoredGuestSession = hasStoredGuestSession
    }
}

/// Ce que l'app doit faire d'un lien de conversation. Une intention, pas une
/// navigation : la présentation reste app-side.
public enum ShareLinkEntryIntent: Equatable, Sendable {
    /// Ouvrir la conversation — rien à rejoindre.
    case openConversation(conversationId: String)
    /// Rejoindre avec le compte présent, sans poser de question.
    case joinWithAccount(conversationId: String)
    /// Ouvrir le formulaire de jonction anonyme.
    case joinAnonymously
    /// Reprendre la session invitée déjà enregistrée pour ce lien.
    case resumeGuestSession
    /// Demander : ce compte, ou anonyme ?
    case chooseIdentity(conversationId: String)
    /// Le lien exige un compte et l'appareil n'en a pas.
    case requiresAccount
}

/// Comment entre-t-on par un lien de conversation ?
///
/// L'app répondait par son seul état d'authentification : pas de compte → flux
/// invité, un compte → jointure SILENCIEUSE avec ce compte. La personne n'avait
/// jamais le choix, au moment précis où il lui revient — un lien public s'ouvre
/// à visage découvert ou sous pseudonyme, et une jointure ne se défait pas d'un
/// geste. Un lien reçu dans un groupe inconnu engageait le compte réel — nom,
/// photo, historique — sans rien demander.
///
/// La règle est PURE : quatre faits en entrée, une intention en sortie, aucun
/// I/O, aucun état. Elle vit dans le SDK à ce titre ; les feuilles de choix et
/// la navigation restent app-side (`MeeshyApp`, `RootView`).
public enum ShareLinkEntryPolicy {

    public static func intent(for facts: ShareLinkEntryFacts) -> ShareLinkEntryIntent {
        guard facts.isAuthenticated else {
            // Sans compte, l'ordre compte : une session invitée déjà ouverte sur
            // CE lien est une identité acquise dans cette conversation — la
            // seule que la personne y possède. La redemander l'effacerait.
            if facts.hasStoredGuestSession { return .resumeGuestSession }
            return facts.linkRequiresAccount ? .requiresAccount : .joinAnonymously
        }

        // Déjà membre : il n'y a rien à décider, et poser la question laisserait
        // croire qu'une seconde identité est possible là où l'on est déjà nommé.
        if facts.isAlreadyMember { return .openConversation(conversationId: facts.conversationId) }

        // Proposer l'anonymat sur un lien qui exige un compte serait proposer une
        // porte que le serveur refuse (403 `REQUIRES_ACCOUNT`).
        if facts.linkRequiresAccount { return .joinWithAccount(conversationId: facts.conversationId) }

        // Une session invitée dormante n'enlève pas le choix à quelqu'un qui a
        // désormais un compte : elle devient l'une des deux branches, que la
        // présentation étiquette « reprendre en anonyme ».
        return .chooseIdentity(conversationId: facts.conversationId)
    }
}
