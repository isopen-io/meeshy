import Foundation
import MeeshySDK

// **Les deux coutures de l'écran de partage** (#10947) — d'où viennent les
// destinataires, et qui envoie. L'app branche ses services
// (`LiveShareRecipientDirectory`, `LiveShareDispatcher`) ; l'extension de
// partage branche les siens (`ExtensionShareDirectory`,
// `ExtensionShareDispatcher`), sans aucun singleton de l'app. Ce fichier est
// compilé dans les DEUX cibles (`project.yml`).

/// Ce que la recherche serveur rend, fusionné par l'écran (V5).
struct ShareSearchResults: Equatable, Sendable {
    var people: [ShareRecipient] = []
    var conversations: [ShareRecipient] = []
    var communities: [ShareCommunity] = []
}

/// Une communauté où l'on peut écrire — elle se déplie en ses canaux (D11).
struct ShareCommunity: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let avatarURL: String?
}

/// **D'où viennent les destinataires** — le cache d'abord, toujours.
///
/// L'écran affiche ce que la machine sait déjà (conversations en cache, amis en
/// cache, carnet apparié en cache, communautés en cache) AVANT toute requête ;
/// le réseau ne fait que revalider en silence (cache-first, stale-while-revalidate).
protocol ShareRecipientSourcing: Sendable {
    /// Les conversations du cache « list », `.fresh` ou `.stale` — jamais un
    /// cache expiré présenté comme frais.
    func cachedConversations() async -> [ShareRecipient]
    /// La première page du serveur, pour revalider en silence.
    func freshConversations(currentUserId: String) async throws -> [ShareRecipient]
    /// Amis acceptés et contacts du carnet apparié, depuis leur cache.
    func cachedPeople(currentUserId: String) async -> [ShareRecipient]
    func cachedCommunities() async -> [ShareCommunity]
    /// Recherche serveur fusionnée : personnes, conversations, communautés.
    func search(_ query: String, currentUserId: String) async -> ShareSearchResults
    /// Les canaux d'une communauté où l'utilisateur peut écrire (D11).
    func writableChannels(of community: ShareCommunity, currentUserId: String) async -> [ShareRecipient]
}

/// Ce que l'écran remet à l'envoi, pour UN destinataire.
struct ShareSendRequest {
    let subject: ShareSubject
    /// Les messages qui partent, dans l'ordre (le plan a retiré le protégé, D6).
    let keptMessageIds: [String]
    let caption: String
    let captionPlacement: ShareCaption.Placement?
    let grouping: ShareGrouping
    /// La durée choisie d'une flamme, ramenée à la source par la loi.
    let chosenDurationSeconds: Int?
    /// Source chiffrée : la copie se refait sur l'appareil (D7).
    let copyOnDevice: Bool
}

/// L'issue d'un envoi vers UN destinataire, telle que sa ligne la dit (V6).
enum ShareDeliveryOutcome: Equatable {
    case sent(conversationId: String)
    case queued(conversationId: String)
    case failed(reason: String)

    var conversationId: String? {
        switch self {
        case .sent(let id), .queued(let id): return id
        case .failed: return nil
        }
    }
}

/// **Qui envoie** — injecté dans l'écran, pour que l'extension de partage puisse
/// fournir le sien (relais vers l'app, D7) sans singleton de l'app.
@MainActor
protocol ShareDispatching: AnyObject {
    func deliver(_ request: ShareSendRequest, to recipient: ShareRecipient) async -> ShareDeliveryOutcome
    /// « Créer un groupe avec… » (D12) : la conversation créée, ou `nil`.
    func createGroup(with people: [ShareRecipient]) async -> ShareRecipient?
    /// Publier la pièce désignée en story, post ou réel (D2).
    func publish(attachment: MessageAttachment, to target: PublicationTarget) async -> Bool
    /// Le lien suivi d'une carte (story) — `nil` : l'adresse directe reste.
    func resolvedLink(for card: ShareCard) async -> URL?
    /// L'hôte sait créer une conversation de groupe (D12). L'extension de
    /// partage ne le sait pas : l'interrupteur n'y est pas rendu (loi 4).
    var createsGroups: Bool { get }
}

extension ShareDispatching {
    var createsGroups: Bool { true }
}

