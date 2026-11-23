import Combine
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les cercles de mes liens, tels que servis, remis à tous les avatars de l'app (#20178). Le cache d'abord (la liste
/// que « Mes cercles » garde), puis une revalidation par session, puis chaque élévation reçue en direct. Aucun niveau
/// n'est inventé : une personne absente des liens servis n'a pas de pastille, ni moi-même.
@MainActor
final class AvatarCircleDirectory: ObservableObject {
    @Published private(set) var levels = AvatarCircleLevels.none
    private var served: [String: RelationLevel] = [:]
    private var loadedFor: String?
    private var cancellable: AnyCancellable?

    init(levelEvents: AnyPublisher<RelationLevelRaisedEvent, Never> = RelationEvents.levelRaised) {
        cancellable = levelEvents
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.receive(event, viewerId: AuthManager.shared.currentUser?.id)
            }
    }

    nonisolated deinit {}

    static func levels(from links: [RelationLink], viewerId: String?) -> AvatarCircleLevels {
        AvatarCircleLevels(table(from: links, viewerId: viewerId))
    }

    private static func table(from links: [RelationLink], viewerId: String?) -> [String: RelationLevel] {
        links.reduce(into: [:]) { table, link in
            guard link.userId != viewerId, link.effectiveLevel > .public else { return }
            table[link.userId] = link.effectiveLevel
        }
    }

    func apply(links: [RelationLink], viewerId: String?) {
        served = Self.table(from: links, viewerId: viewerId)
        publish()
    }

    func receive(_ event: RelationLevelRaisedEvent, viewerId: String?) {
        guard event.userId != viewerId else { return }
        served[event.userId] = event.level
        publish()
    }

    func reset() {
        served = [:]
        loadedFor = nil
        publish()
    }

    /// Une fois par compte connecté : le cache, puis le serveur ; un autre compte repart de zéro.
    func load(viewerId: String?) async {
        guard let viewerId, !viewerId.isEmpty else { return reset() }
        guard loadedFor != viewerId else { return }
        if loadedFor != nil { reset() }
        loadedFor = viewerId
        let store = await CirclesLinkStore.live()
        if let cached = await store.loadIgnoringExpiry(for: CirclesViewModel.cacheKey) {
            apply(links: cached.items, viewerId: viewerId)
        }
        guard let fresh = try? await RelationsService.shared.links() else { return }
        apply(links: fresh, viewerId: viewerId)
        await bestEffort("avatarCircleDirectory.links.save", category: .cache) {
            try await store.save(fresh, for: CirclesViewModel.cacheKey)
        }
    }

    private func publish() {
        let next = AvatarCircleLevels(served)
        if next != levels { levels = next }
    }
}

/// L'injection unique des cercles dans l'environnement des avatars, rechargée au changement de compte. L'annuaire vit
/// avec la session connectée : une déconnexion l'emporte avec elle.
struct AvatarCircleEnvironment: ViewModifier {
    @StateObject private var directory = AvatarCircleDirectory()
    let viewerId: String?

    func body(content: Content) -> some View {
        content
            .environment(\.avatarCircleLevels, directory.levels)
            .task(id: viewerId) { await directory.load(viewerId: viewerId) }
    }
}
