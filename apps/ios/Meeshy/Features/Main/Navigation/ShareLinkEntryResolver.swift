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

        let facts = ShareLinkEntryFacts(
            conversationId: info.conversation.id,
            isAuthenticated: isAuthenticated,
            isAlreadyMember: knownConversationIds.contains(info.conversation.id),
            linkRequiresAccount: info.requireAccount,
            hasStoredGuestSession: storedGuestSessionLookup(identifier)
        )

        return Resolution(
            intent: ShareLinkEntryPolicy.intent(for: facts),
            conversationTitle: info.conversation.title
        )
    }
}
