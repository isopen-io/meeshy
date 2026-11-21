import Combine
import Foundation
import MeeshySDK

// MARK: - Hors ligne, ce qui attend de partir vers cette personne (#19465, planche `Etat-HorsLigne`)
//
// La fiche d'un autre, lue depuis le cache faute de réseau, dit ce que la file hors ligne garde POUR LUI : chaque envoi
// vers notre conversation directe, à son rang dans la file, annulable. Le SDK ne connaît ni les conversations en cache
// ni la file de l'app : l'app remet une source (`ProfilePendingQueueProviding`) et la fiche n'en lit que des valeurs.

/// Une action en attente de réseau qui concerne la personne de la fiche.
public nonisolated struct ProfilePendingAction: Equatable, Sendable, Identifiable {
    /// L'identifiant de la ligne dans la file.
    public let id: String
    /// L'identifiant du message que la ligne enverra, celui de sa bulle optimiste.
    public let clientMessageId: String
    /// Ce qui partira, tel que la file le résume ; `nil` quand elle n'en dit rien.
    public let preview: String?
    /// L'aperçu est le texte écrit (il se cite entre guillemets) plutôt qu'un libellé de pièce jointe.
    public let isWrittenText: Bool
    /// Le rang dans la file entière, 1 pour la prochaine à partir ; `nil` pour un envoi qui a renoncé.
    public let rank: Int?
    public let isFailed: Bool
    /// Une ligne déjà en vol ne s'annule plus.
    public let isCancellable: Bool

    public init(id: String, clientMessageId: String, preview: String?, isWrittenText: Bool, rank: Int?,
                isFailed: Bool, isCancellable: Bool) {
        self.id = id
        self.clientMessageId = clientMessageId
        self.preview = preview
        self.isWrittenText = isWrittenText
        self.rank = rank
        self.isFailed = isFailed
        self.isCancellable = isCancellable
    }
}

/// La loi : de toute la file, les envois vers les conversations de la personne, dans l'ordre où ils partiront.
public nonisolated enum ProfilePendingActions {

    public static func resolve(_ items: [OutboxUIItem],
                               conversationIds: Set<String>,
                               withdrawn: Set<String> = []) -> [ProfilePendingAction] {
        guard !conversationIds.isEmpty else { return [] }
        let ordered = items.sorted { ($0.createdAt, $0.id) < ($1.createdAt, $1.id) }
        let departing = ordered.filter { !isTerminal($0.status) && !withdrawn.contains($0.id) }
        let ranks = Dictionary(uniqueKeysWithValues: departing.enumerated().map { ($1.id, $0 + 1) })
        return ordered.compactMap { item in
            guard !withdrawn.contains(item.id), item.kind == .message,
                  case .conversation(let conversationId, let messageId?) = item.source,
                  conversationIds.contains(conversationId) else { return nil }
            let failed = isTerminal(item.status)
            return ProfilePendingAction(
                id: item.id, clientMessageId: messageId, preview: shownPreview(item.titlePreview),
                isWrittenText: item.iconKind == .text, rank: ranks[item.id], isFailed: failed,
                isCancellable: item.status != .inflight
            )
        }
    }

    private static func isTerminal(_ status: OutboxStatus) -> Bool {
        status == .failed || status == .exhausted
    }

    private static func shownPreview(_ preview: String?) -> String? {
        guard let trimmed = preview?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty,
              trimmed != "(message)" else { return nil }
        return trimmed
    }
}

/// Ce que l'app fournit : les conversations directes avec la personne (depuis le cache), la file telle qu'elle change,
/// le retrait d'un envoi et la relance de ceux qui ont renoncé. Absente, la fiche ne pose pas le bloc.
@MainActor
public protocol ProfilePendingQueueProviding: AnyObject {
    func directConversationIds(with userId: String) async -> Set<String>
    func pendingItems() -> AnyPublisher<[OutboxUIItem], Never>
    /// Retire l'envoi de la file et sa bulle du fil ; `false` quand rien n'a pu être retiré.
    func withdraw(_ action: ProfilePendingAction) async -> Bool
    func retry(_ actions: [ProfilePendingAction]) async
}

/// L'état du bloc : la file lue, les conversations de la personne, et les retraits déjà montrés avant que la file ne
/// les confirme (mise à jour optimiste, défaite si le retrait échoue).
@MainActor
final class ProfilePendingModel: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var actions: [ProfilePendingAction] = []

    private var items: [OutboxUIItem] = []
    private var conversationIds: Set<String> = []
    private var withdrawn: Set<String> = []

    func scope(to conversationIds: Set<String>) {
        self.conversationIds = conversationIds
        recompute()
    }

    func receive(_ next: [OutboxUIItem]) {
        items = next
        withdrawn = withdrawn.filter { id in next.contains { $0.id == id } }
        recompute()
    }

    func observe(userId: String, queue: any ProfilePendingQueueProviding) async {
        scope(to: await queue.directConversationIds(with: userId))
        for await next in queue.pendingItems().values {
            receive(next)
        }
    }

    func cancel(_ action: ProfilePendingAction, queue: any ProfilePendingQueueProviding) async {
        guard action.isCancellable else { return }
        withdrawn.insert(action.id)
        recompute()
        guard await queue.withdraw(action) else {
            withdrawn.remove(action.id)
            recompute()
            return
        }
    }

    func retry(queue: any ProfilePendingQueueProviding) async {
        await queue.retry(actions.filter(\.isFailed))
    }

    private func recompute() {
        actions = ProfilePendingActions.resolve(items, conversationIds: conversationIds, withdrawn: withdrawn)
    }
}
