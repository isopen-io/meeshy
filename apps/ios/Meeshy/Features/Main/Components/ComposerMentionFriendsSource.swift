import Foundation
import MeeshySDK
import MeeshyUI

/// **Source des candidats @mention pour un brouillon composer (#3904).**
///
/// `MentionComposerController.Context.composerDraft` n'a aucun id serveur
/// (le contenu n'est pas encore publié) et ne peut donc interroger aucun
/// endpoint contextuel — la SEULE source possible est les amis ACCEPTÉS de
/// l'auteur, chargés une fois à l'ouverture du composer et servis en local.
///
/// **CACHE-FIRST depuis le 2026-09-05** (directive porteur : « déclencher la
/// remontée après `@` avec les amis/contacts, normalement existant en local et
/// en cache »).
///
/// Le suivi que ce doc-comment annonçait — « cache-first via
/// `CacheCoordinator.shared.friends` (aujourd'hui réseau seul — liste vide
/// hors ligne et pendant tout l'aller-retour au démarrage) » — est SOLDÉ.
/// `cachedFriends()` sert le cache instantanément, `acceptedFriends()`
/// rafraîchit ; c'est `ComposerMentionControllerBox.loadCandidates()` qui les
/// enchaîne, et qui ne laisse JAMAIS un échec réseau écraser ce que le cache
/// a déjà servi.
///
/// Ce que la panne du 2026-09-05 a montré : la route des amis rendait 404 en
/// production, `acceptedFriends()` rendait `[]` par son `catch`, et le `@` nu
/// ne proposait personne. **Une source réseau-seule fait dépendre un geste
/// local de la santé d'un serveur** — et son échec, avalé en liste vide, est
/// indiscernable d'un carnet d'adresses vide.
///
/// **Limite CONNUE qui SUBSISTE (revue Opus 2026-08-27) : au-delà d'une page
/// (`pageSize`), un ami existant devient injoignable par la frappe.** Le
/// filtre de `MentionComposerController` est CLIENT (`filterLocals`) et ne
/// s'applique qu'aux candidats déjà chargés. La recherche d'annuaire (dès
/// deux caractères) le rattrape pour l'essentiel — un ami hors page reste
/// trouvable, par l'autre porte. Suivi à ouvrir : pagination jusqu'à
/// `friendsFetchCap`, même patron que `ContactsListViewModel`.
@MainActor
enum ComposerMentionFriendsSource {

    private static let pageSize = 100

    /// **Le cache, sans un octet de réseau.** C'est ce qui répond au `@` nu et
    /// à la première lettre — les deux régimes que `MentionLookupRule` tient
    /// hors de l'API.
    ///
    /// Même magasin et même clé que la liste de contacts et que le sélecteur
    /// d'audience (`FriendsCacheAudienceContacts`, SDK) : trois surfaces qui
    /// nomment « mes contacts » doivent nommer les mêmes personnes.
    static func cachedFriends(
        provider: AudienceContactsProviding = FriendsCacheAudienceContacts(),
        currentUserId: String = AuthManager.shared.currentUser?.id ?? ""
    ) async -> [MentionCandidate] {
        await provider.cachedContacts()
            .filter { $0.id != currentUserId }
            .map {
                MentionCandidate(id: $0.id,
                                 username: $0.username,
                                 displayName: $0.displayName ?? $0.username,
                                 avatarURL: $0.avatar)
            }
    }

    /// `[]` en cas d'échec réseau, ou si aucun utilisateur n'est authentifié
    /// (`currentUserId` vide) — sans cette garde, `FriendListAggregator`
    /// considère systématiquement `sender.id != ""` vrai et l'auteur se
    /// retrouverait dans sa propre liste de mentions.
    static func acceptedFriends(
        friendService: FriendServiceProviding = FriendService.shared,
        currentUserId: String = AuthManager.shared.currentUser?.id ?? ""
    ) async -> [MentionCandidate] {
        guard !currentUserId.isEmpty else { return [] }
        do {
            let page = try await friendService.friendRequests(
                direction: .any, status: "accepted", q: nil, cursor: nil, limit: pageSize
            )
            let friends = FriendListAggregator.aggregate(
                received: page.data, sent: [], currentUserId: currentUserId
            )
            return friends.map {
                MentionCandidate(id: $0.id, username: $0.username, displayName: $0.name, avatarURL: $0.avatar)
            }
        } catch {
            return []
        }
    }
}
