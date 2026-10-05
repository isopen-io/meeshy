import Foundation
import MeeshySDK

/// **Une conversation DÉCOUVERTE entre dans la liste RICHE** (#8561).
///
/// `conversation:new` (ajout à un groupe, premier direct reçu) ne porte que des
/// identifiants. La ligne se lisait par `GET /conversations/:id`, qui ne sert
/// PAS le dernier message : un membre ajouté voyait « Nouvelle conversation »
/// au-dessus d'un fil qui disait « Demo a ajouté Recette Appel ». Et la ligne
/// restait fausse au-delà d'une relance : le delta `/sync` ne réhydrate une
/// ligne connue que si son `lastMessageAt` bouge
/// (`ConversationSyncEngine.doitEtreRehydratee`), or le détail sert déjà le bon.
///
/// La règle est celle du moteur (« la ligne de liste ne s'écrit que riche ») :
/// la première page de `GET /conversations` — où une conversation qui vient de
/// s'animer est en tête — porte l'aperçu, sa carte du Prisme et sa protection.
/// Le détail reste le repli quand la ligne n'y est pas ou que la page échoue.
struct ConversationDiscoveryRowFetcher {
    static let richWindow = 20

    let service: ConversationServiceProviding

    func row(id: String, currentUserId: String) async throws -> MeeshyConversation {
        if let rich = try? await service.listPage(before: nil, limit: Self.richWindow, currentUserId: currentUserId)
            .items.first(where: { $0.id == id }) {
            return rich
        }
        return try await service.getById(id).toConversation(currentUserId: currentUserId)
    }
}
