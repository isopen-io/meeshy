import Foundation
import Combine
import MeeshySDK

/// « 🔥 série · N (M) » du lecteur, par conversation (#8906).
///
/// Deux chemins l'alimentent, sans ordre garanti entre eux : la liste et le
/// détail (`viewerEngagement`, porté par `MeeshyConversation` jusque dans le
/// cache) et le socket (`engagement:conversation-updated`, poussé au seul
/// lecteur crédité). Le magasin garde, par conversation, l'instantané le plus
/// récent (`ConversationEngagementSnapshot.isFresher(than:)`) : une liste
/// relue du cache après un geste ne fait jamais reculer la pastille.
///
/// Ce qui s'AFFICHE est projeté sur le jour du lecteur (`displayed(for:seed:at:)`) :
/// les points du jour retombent à 0 à minuit, la série à 0 après un jour sans
/// geste — sans attendre le serveur.
protocol ConversationEngagementProviding: AnyObject {
    func snapshot(for conversationId: String) -> ConversationEngagementSnapshot?
    func displayed(for conversationId: String, seed: ConversationEngagementSnapshot?, at now: Date) -> ConversationEngagementSnapshot?
    func seed(_ snapshot: ConversationEngagementSnapshot?)
}

@MainActor
final class ConversationEngagementStore: ObservableObject, ConversationEngagementProviding {
    static let shared = ConversationEngagementStore()

    nonisolated deinit {}

    @Published private(set) var snapshots: [String: ConversationEngagementSnapshot] = [:]

    private let calendar: Calendar
    private let fetch: @Sendable @concurrent (String) async throws -> ConversationEngagementSnapshot
    private var cancellables = Set<AnyCancellable>()

    init(
        updates: AnyPublisher<ConversationEngagementSnapshot, Never> = MessageSocketManager.shared.conversationEngagementUpdated.eraseToAnyPublisher(),
        authentication: AnyPublisher<Bool, Never> = AuthManager.shared.$isAuthenticated.eraseToAnyPublisher(),
        calendar: Calendar = .current,
        fetch: @escaping @Sendable @concurrent (String) async throws -> ConversationEngagementSnapshot = {
            try await ConversationService.shared.engagement(conversationId: $0)
        }
    ) {
        self.calendar = calendar
        self.fetch = fetch

        updates
            .receive(on: DispatchQueue.main)
            .sink { [weak self] snapshot in
                self?.seed(snapshot)
            }
            .store(in: &cancellables)

        // Les points d'un compte ne survivent pas à sa déconnexion : le compte
        // suivant peut partager des conversations avec lui.
        authentication
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.reset()
            }
            .store(in: &cancellables)
    }

    func snapshot(for conversationId: String) -> ConversationEngagementSnapshot? {
        snapshots[conversationId]
    }

    /// L'état à rendre à l'instant `now`, ou `nil` quand la pastille se tait
    /// (aucun instantané, ou aucun point gagné dans cette conversation).
    ///
    /// `seed` est ce que la conversation affichée porte déjà (liste, détail,
    /// cache) : il concourt avec l'instantané tenu ici, le plus récent gagne.
    /// Une lecture pure — la vue peut rendre avant d'avoir semé.
    func displayed(
        for conversationId: String,
        seed: ConversationEngagementSnapshot? = nil,
        at now: Date = Date()
    ) -> ConversationEngagementSnapshot? {
        let stored = snapshots[conversationId]
        let candidate = seed.flatMap { $0.conversationId == conversationId ? $0 : nil }
        let pick: ConversationEngagementSnapshot?
        switch (stored, candidate) {
        case let (held?, offered?):
            pick = offered.isFresher(than: held) ? offered : held
        default:
            pick = stored ?? candidate
        }
        guard let freshest = pick, freshest.totalPoints > 0 else { return nil }
        return freshest.forDay(ConversationEngagementSnapshot.dayString(for: now, calendar: calendar))
    }

    func seed(_ snapshot: ConversationEngagementSnapshot?) {
        guard let snapshot else { return }
        if let current = snapshots[snapshot.conversationId], !snapshot.isFresher(than: current) { return }
        snapshots[snapshot.conversationId] = snapshot
    }

    /// Relit l'état serveur à l'ouverture d'une conversation : un geste crédité
    /// sur un autre appareil n'a pas poussé ici. Silencieux en cas d'échec — la
    /// pastille garde ce qu'elle avait.
    func revalidate(_ conversationId: String) async {
        guard !conversationId.isEmpty,
              let fetched = try? await fetch(conversationId),
              fetched.conversationId == conversationId else { return }
        seed(fetched)
    }

    func reset() {
        guard !snapshots.isEmpty else { return }
        snapshots = [:]
    }
}
