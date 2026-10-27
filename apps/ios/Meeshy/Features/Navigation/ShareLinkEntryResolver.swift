import Foundation
import MeeshySDK

/// Réunit les faits qu'un lien de partage réclame, puis pose la question à la
/// règle pure (`ShareLinkEntryPolicy`, SDK).
///
/// Deux vues authentifiées reçoivent ces liens — `RootView` (iPhone) et
/// `iPadRootView`. Elles portaient chacune leur copie du même raccourci
/// (« rejoindre avec le compte, sans demander ») et auraient porté chacune leur
/// copie du remplacement. Ce dépôt s'est déjà fait mordre par ce motif : deux
/// constructeurs de payload jumeaux qui divergent en silence, et un bug de
/// parité qui revient une troisième fois (cf. la note sur
/// `_buildMessagePayload` dans `MeeshySocketIOManager`). La résolution vit donc
/// ici, à un seul exemplaire ; chaque vue ne garde que sa PRÉSENTATION.
///
/// App-side et non SDK : elle appelle un service réseau et consulte l'état de
/// l'app. La décision, elle, est dans le SDK — c'est la frontière posée par la
/// règle de pureté.
@MainActor
enum ShareLinkEntryResolver {

    struct Resolution {
        let intent: ShareLinkEntryIntent
        let conversationTitle: String?
        /// Le lien déjà résolu : la page d'invitation s'affiche avec, sans
        /// second appel ni indicateur de chargement (#7795).
        let info: ShareLinkInfo
        let hasStoredGuestSession: Bool

        /// La page d'invitation à présenter, ou `nil` quand il n'y a rien à
        /// montrer (déjà membre) ou rien à décider sur elle.
        ///
        /// `.joinWithAccount` passe AUSSI par la page depuis #7795 : un lien
        /// exigeant un compte engageait le compte en silence, sans que la
        /// personne voie où elle entrait. La page ne lui propose alors que
        /// « Rejoindre avec mon compte ».
        func landing(identifier: String) -> ShareLinkIdentityChoice? {
            switch intent {
            case .chooseIdentity(let conversationId), .joinWithAccount(let conversationId):
                return ShareLinkIdentityChoice(
                    identifier: identifier,
                    conversationId: conversationId,
                    conversationTitle: conversationTitle,
                    resumesGuestSession: hasStoredGuestSession,
                    info: info
                )
            case .openConversation, .joinAnonymously, .resumeGuestSession, .requiresAccount:
                return nil
            }
        }
    }

    /// `nil` quand le lien n'a pas pu être résolu — l'appelant retombe alors
    /// sur la jointure par compte. Un lien qui n'ouvre rien serait pire qu'un
    /// lien qui ne propose pas le choix.
    ///
    /// `knownConversationIds` est la liste EN MÉMOIRE de l'appelant. Une liste
    /// paginée peut ignorer une conversation ancienne : le faux « pas membre »
    /// coûte une question de plus, jamais une mauvaise entrée — la branche
    /// « continuer avec mon compte » appelle une jointure idempotente.
    static func resolve(
        identifier: String,
        isAuthenticated: Bool,
        knownConversationIds: Set<String>,
        service: ShareLinkInfoProviding = ShareLinkService.shared,
        storedGuestSessionLookup: (String) -> Bool = { AnonymousSessionStore.load(linkId: $0) != nil }
    ) async -> Resolution? {
        guard let info = try? await service.getLinkInfo(identifier: identifier) else { return nil }

        let hasStoredGuestSession = storedGuestSessionLookup(identifier)
        let facts = ShareLinkEntryFacts(
            conversationId: info.conversation.id,
            isAuthenticated: isAuthenticated,
            isAlreadyMember: knownConversationIds.contains(info.conversation.id),
            linkRequiresAccount: info.requireAccount,
            hasStoredGuestSession: hasStoredGuestSession
        )

        return Resolution(
            intent: ShareLinkEntryPolicy.intent(for: facts),
            conversationTitle: info.conversation.title,
            info: info,
            hasStoredGuestSession: hasStoredGuestSession
        )
    }
}
