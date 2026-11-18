import Foundation
import Combine
import MeeshySDK

/// La fiche détails + édition d'un lien de conversation (#7797).
///
/// Cache-first : le lien s'affiche IMMÉDIATEMENT depuis la ligne de liste qui
/// l'a ouvert (servie avec `expand=conversation,policy`), les statistiques se
/// chargent ensuite sans jamais bloquer la fiche. Chaque action est optimiste :
/// l'écran change d'abord, le réseau confirme ensuite, et un échec rend l'état
/// d'avant — le brouillon, lui, reste, pour qu'on puisse réessayer sans tout
/// ressaisir.
@MainActor
final class ShareLinkDetailViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au
    // démontage hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    enum StatsState: Equatable {
        case loading
        case loaded(ShareLinkArrivalStats)
        /// La route n'existe pas encore (404) ou le réseau manque : la fiche
        /// montre des tirets, jamais un plantage ni un indicateur éternel.
        case unavailable
    }

    @Published private(set) var link: MyShareLink
    @Published private(set) var stats: StatsState = .loading
    @Published var draft: ShareLinkSettings
    @Published private(set) var isSaving = false
    @Published private(set) var isDeleted = false

    private let service: ShareLinkManaging
    private let removeParticipant: @Sendable (String, String) async throws -> Void
    private let onLinkChanged: @MainActor (MyShareLink) -> Void
    private let onLinkDeleted: @MainActor (String) -> Void

    init(
        link: MyShareLink,
        service: ShareLinkManaging = ShareLinkService.shared,
        removeParticipant: @escaping @Sendable (String, String) async throws -> Void,
        onLinkChanged: @escaping @MainActor (MyShareLink) -> Void = { _ in },
        onLinkDeleted: @escaping @MainActor (String) -> Void = { _ in }
    ) {
        self.link = link
        self.draft = link.settings
        self.service = service
        self.removeParticipant = removeParticipant
        self.onLinkChanged = onLinkChanged
        self.onLinkDeleted = onLinkDeleted
    }

    var hasChanges: Bool { draft != link.settings }

    var canSave: Bool { hasChanges && draft.isValid && !isSaving }

    // MARK: - Stats

    func loadStats() async {
        do {
            stats = .loaded(try await service.fetchLinkStats(linkId: link.linkId))
        } catch {
            stats = .unavailable
        }
    }

    /// La pile de l'en-tête (#19496, planche `Lien-Partage`) : les dernières arrivées, une fois les statistiques lues.
    var headFaces: [LinksFaceMember] {
        guard case .loaded(let snapshot) = stats else { return [] }
        return LinksFaceMember.stack(snapshot.recentArrivals.map { LinksFaceMember(arrival: $0) })
    }

    // MARK: - Arrivals

    /// Retirer un arrivant demande la conversation que le lien ouvre ; sans elle, le geste n'est pas offert.
    var canRemoveArrivals: Bool { link.conversation?.id != nil }

    /// Optimiste : la rangée part tout de suite, et revient si le serveur refuse.
    @discardableResult
    func removeArrival(participantId: String) async -> Bool {
        guard let conversationId = link.conversation?.id, case .loaded(let snapshot) = stats else { return false }
        stats = .loaded(snapshot.removingArrival(participantId))
        do {
            try await removeParticipant(conversationId, participantId)
            return true
        } catch {
            stats = .loaded(snapshot)
            return false
        }
    }

    // MARK: - Edit

    func discardChanges() {
        draft = link.settings
    }

    /// Enregistre le brouillon. `false` = échec, lien restauré, brouillon gardé.
    @discardableResult
    func save() async -> Bool {
        guard canSave else { return false }
        let snapshot = link
        let optimistic = link.applying(draft)
        isSaving = true
        publish(optimistic)
        defer { isSaving = false }
        do {
            try await service.updateLink(linkId: snapshot.linkId, settings: draft)
            return true
        } catch {
            publish(snapshot)
            return false
        }
    }

    // MARK: - Activation

    @discardableResult
    func toggleActive() async -> Bool {
        let snapshot = link
        let target = !snapshot.isActive
        publish(snapshot.withActive(target))
        do {
            try await service.toggleLink(linkId: snapshot.linkId, isActive: target)
            return true
        } catch {
            publish(snapshot)
            return false
        }
    }

    // MARK: - Deletion

    @discardableResult
    func delete() async -> Bool {
        do {
            try await service.deleteLink(linkId: link.linkId)
            isDeleted = true
            onLinkDeleted(link.id)
            return true
        } catch {
            return false
        }
    }

    private func publish(_ value: MyShareLink) {
        link = value
        onLinkChanged(value)
    }
}
