import Foundation
import MeeshySDK

/// Quand le talkie se propose (#16927, #17093) : dès Proche, par le lien ou par le niveau d'outil servi (deux comptes
/// de l'équipe sont Sang sans lien, #16623) ; jamais dans l'en-tête d'un direct chiffré, que la passerelle refuse.
nonisolated enum TalkieOfferRule {
    static func offers(_ link: RelationLink) -> Bool {
        max(link.effectiveLevel, link.toolLevel) >= .close
    }

    /// Quelqu'un peut-il me parler par talkie ? Alors l'appareil tient un canal PushToTalk rejoint : sans lui, iOS
    /// jette les réveils et la voix n'arrive jamais Meeshy fermé.
    static func reachable(links: [RelationLink], role: String?) -> Bool {
        PlatformRole(raw: role)?.isTeam == true || links.contains(where: offers)
    }

    static func mayShowInHeader(encryptionMode: String?) -> Bool {
        encryptionMode != "e2ee"
    }
}

/// La proposition du talkie pour UNE personne : le cache des liens d'abord, puis le lien servi, qui a le dernier mot.
@MainActor
final class TalkieOfferModel: ObservableObject {
    @Published private(set) var offered = false

    let userId: String
    private let relations: RelationsProviding
    private let networkMonitor: any NetworkMonitorProviding
    private let linksStore: @concurrent @Sendable () async -> GRDBCacheStore<String, RelationLink>

    nonisolated deinit {}

    init(
        userId: String,
        relations: RelationsProviding = RelationsService.shared,
        networkMonitor: any NetworkMonitorProviding = NetworkMonitor.shared,
        linksStore: @escaping @concurrent @Sendable () async -> GRDBCacheStore<String, RelationLink> = CirclesLinkStore.live
    ) {
        self.userId = userId
        self.relations = relations
        self.networkMonitor = networkMonitor
        self.linksStore = linksStore
    }

    func load() async {
        let relations = self.relations
        let userId = self.userId
        let loader = CacheFirstLoader(store: await linksStore(), key: CirclesViewModel.cacheKey, networkMonitor: networkMonitor)
        let fetch: @Sendable () async throws -> [RelationLink] = { try await relations.links() }
        let apply: @MainActor @Sendable ([RelationLink]) -> Void = { [weak self] served in
            guard let mine = served.first(where: { $0.userId == userId }) else { return }
            self?.offered = TalkieOfferRule.offers(mine)
        }
        let revalidation = await loader.load(fetch: fetch, setLoadState: { _ in }, apply: apply)
        await revalidation?.value
        guard let served = try? await relations.link(userId: userId), served.userId.lowercased() == userId.lowercased() else {
            return
        }
        offered = TalkieOfferRule.offers(served)
    }
}
