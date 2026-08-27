import Foundation
import MeeshySDK

/// **Source des candidats @mention pour un brouillon composer (#3904).**
///
/// `MentionComposerController.Context.composerDraft` n'a aucun id serveur
/// (le contenu n'est pas encore publié) et ne peut donc interroger aucun
/// endpoint contextuel — la SEULE source possible est les amis ACCEPTÉS de
/// l'auteur, chargés une fois à l'ouverture du composer et servis en local.
///
/// **Limite CONNUE, pas une abstraction volontairement omise (revue Opus
/// 2026-08-27) : au-delà d'une page (`pageSize`), un ami existant devient
/// injoignable par la frappe.** Le filtre de `MentionComposerController` est
/// CLIENT (`filterLocals`) et ne s'applique qu'aux candidats déjà chargés —
/// `ForwardPickerViewModel` documente exactement ce cas et pagine en
/// conséquence. Suivi à ouvrir : pagination jusqu'à `friendsFetchCap` (même
/// patron que `ContactsListViewModel`/`ForwardPickerViewModel`) et
/// cache-first via `CacheCoordinator.shared.friends` (aujourd'hui réseau
/// seul — liste vide hors ligne et pendant tout l'aller-retour au démarrage).
@MainActor
enum ComposerMentionFriendsSource {

    private static let pageSize = 100

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
            let page = try await friendService.allFriendRequests(
                status: "accepted", offset: 0, limit: pageSize
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
