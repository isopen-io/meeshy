import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Ce que la face Liens sait de mes liens créés à un instant : une liste par famille, `nil` tant qu'elle n'est pas
/// lue. Une famille qui échoue au réseau garde ce que le cache avait (loi 8 : cache d'abord).
struct ProfileLinksSnapshot: Sendable {
    var share: [MyShareLink]?
    var tracking: [TrackingLink]?
    var community: [CommunityLink]?
    var referral: [AffiliateToken]?
    /// Toutes les familles lues étaient fraîches : le réseau n'a rien à revalider.
    var isFresh = false

    static let none = ProfileLinksSnapshot()

    var isEmpty: Bool { share == nil && tracking == nil && community == nil && referral == nil }

    /// Ce que `newer` a lu remplace ce que j'avais ; ce qu'il n'a pas lu reste.
    func merging(_ newer: ProfileLinksSnapshot) -> ProfileLinksSnapshot {
        ProfileLinksSnapshot(share: newer.share ?? share, tracking: newer.tracking ?? tracking,
                             community: newer.community ?? community, referral: newer.referral ?? referral,
                             isFresh: newer.isFresh)
    }

    var summary: LinksFaceSummary {
        LinksFaceSummary(share: share, tracking: tracking, community: community, referral: referral)
    }
}

/// D'où la face Liens lit mes liens créés : le cache, puis le réseau. Injecté pour les témoins.
struct ProfileLinksSources {
    let cached: () async -> ProfileLinksSnapshot
    let fetch: () async -> ProfileLinksSnapshot
    let save: (ProfileLinksSnapshot) async -> Void

    @MainActor static let live = ProfileLinksSources(
        cached: { await ProfileLinksLiveSources.cached() },
        fetch: { await ProfileLinksLiveSources.fetch() },
        save: { await ProfileLinksLiveSources.save($0) }
    )
}

/// Où partent les interrupteurs posés depuis les billets : le même service que le détail de chaque famille.
struct ProfileLinksSwitches {
    let share: @Sendable (_ linkId: String, _ isActive: Bool) async throws -> Void
    let tracking: @Sendable (_ token: String, _ isActive: Bool) async throws -> Void

    @MainActor static let live = ProfileLinksSwitches(
        share: { linkId, isActive in try await ShareLinkService.shared.toggleLink(linkId: linkId, isActive: isActive) },
        tracking: { token, isActive in try await TrackingLinkService.shared.setActive(token: token, isActive: isActive) }
    )
}

/// « Liens créés » de la face Liens (#18871) : le cache se peint tout de suite, le réseau revalide en silence. Pas de
/// squelette sur un cache non vide ; une erreur sans rien à montrer a « Réessayer ».
@MainActor
final class ProfileLinksFaceModel: ObservableObject {
    nonisolated deinit {}

    enum Phase: Equatable {
        case loading
        case ready
        case failed
    }

    @Published private(set) var snapshot: ProfileLinksSnapshot = .none
    @Published private(set) var phase: Phase = .loading
    @Published var filter: LinksFaceFilter = .all

    private let sources: ProfileLinksSources
    private let switches: ProfileLinksSwitches

    init(sources: ProfileLinksSources = .live, switches: ProfileLinksSwitches = .live) {
        self.sources = sources
        self.switches = switches
    }

    var summary: LinksFaceSummary { snapshot.summary }

    var visibleTickets: [LinksFaceTicket] { summary.tickets(for: filter) }

    func load() async {
        let cached = await sources.cached()
        if !cached.isEmpty {
            snapshot = snapshot.merging(cached)
            phase = .ready
        }
        if cached.isFresh && !cached.isEmpty { return }
        await refresh()
    }

    func refresh() async {
        let fetched = await sources.fetch()
        snapshot = snapshot.merging(fetched)
        phase = snapshot.isEmpty ? .failed : .ready
        if !fetched.isEmpty { await sources.save(fetched) }
        if !summary.filters.contains(filter) { filter = .all }
    }

    func shareLink(id: String) -> MyShareLink? { snapshot.share?.first { "share:\($0.id)" == id } }
    func trackingLink(id: String) -> TrackingLink? { snapshot.tracking?.first { "tracking:\($0.id)" == id } }
    func communityLink(id: String) -> CommunityLink? { snapshot.community?.first { "community:\($0.id)" == id } }

    /// Un lien de partage modifié ou retiré depuis son détail : la face le reflète tout de suite.
    func replace(_ link: MyShareLink) {
        snapshot.share = snapshot.share?.map { $0.id == link.id ? link : $0 }
    }

    func remove(shareLinkId: String) {
        snapshot.share = snapshot.share?.filter { $0.id != shareLinkId }
    }

    func replace(_ link: TrackingLink) {
        snapshot.tracking = snapshot.tracking?.map { $0.id == link.id ? link : $0 }
    }

    /// « Lien actif » posé depuis le billet (planche `Etat-Erreur` vue 4) : le billet change tout de suite, le serveur
    /// confirme ensuite, et un refus défait le geste. Rend `false` quand le geste n'a pas tenu.
    @discardableResult
    func setActive(_ isActive: Bool, ticketId: String) async -> Bool {
        if let link = shareLink(id: ticketId) {
            replace(link.withActive(isActive))
            guard await Self.succeeds({ try await self.switches.share(link.linkId, isActive) }) else {
                replace(link)
                return false
            }
            await sources.save(ProfileLinksSnapshot(share: snapshot.share))
            return true
        }
        guard let link = trackingLink(id: ticketId) else { return false }
        replace(link.withActive(isActive))
        guard await Self.succeeds({ try await self.switches.tracking(link.token, isActive) }) else {
            replace(link)
            return false
        }
        await sources.save(ProfileLinksSnapshot(tracking: snapshot.tracking))
        return true
    }

    private static func succeeds(_ send: () async throws -> Void) async -> Bool {
        do {
            try await send()
            return true
        } catch {
            return false
        }
    }
}

/// La lecture réelle : les mêmes stores et services que les pages de chaque famille, sous la même clé.
enum ProfileLinksLiveSources {
    static let key = "list"

    static func cached() async -> ProfileLinksSnapshot {
        let cache = CacheCoordinator.shared
        let share = read(await cache.shareLinks.load(for: key))
        let tracking = read(await cache.trackingLinks.load(for: key))
        let community = read(await cache.communityLinks.load(for: key))
        let referral = read(await cache.affiliateTokens.load(for: key))
        let freshness = [share.isFresh, tracking.isFresh, community.isFresh, referral.isFresh]
        return ProfileLinksSnapshot(share: share.items, tracking: tracking.items, community: community.items,
                                    referral: referral.items, isFresh: !freshness.contains(false))
    }

    static func fetch() async -> ProfileLinksSnapshot {
        async let share = try? ShareLinkService.shared.listMyLinks()
        async let tracking = try? TrackingLinkService.shared.listLinks()
        async let community = try? CommunityLinkService.shared.listCommunityLinks()
        async let referral = try? AffiliateService.shared.listTokens()
        return await ProfileLinksSnapshot(share: share, tracking: tracking, community: community, referral: referral,
                                          isFresh: true)
    }

    static func save(_ snapshot: ProfileLinksSnapshot) async {
        let cache = CacheCoordinator.shared
        if let share = snapshot.share {
            await bestEffort("profileLinksFace.shareLinks.save", category: .cache) { try await cache.shareLinks.save(share, for: key) }
        }
        if let tracking = snapshot.tracking {
            await bestEffort("profileLinksFace.trackingLinks.save", category: .cache) { try await cache.trackingLinks.save(tracking, for: key) }
        }
        if let community = snapshot.community {
            await bestEffort("profileLinksFace.communityLinks.save", category: .cache) { try await cache.communityLinks.save(community, for: key) }
        }
        if let referral = snapshot.referral {
            await bestEffort("profileLinksFace.affiliateTokens.save", category: .cache) { try await cache.affiliateTokens.save(referral, for: key) }
        }
    }

    /// Un résultat de cache, sans jamais confondre « périmé » et « absent » : `.stale` se montre et se revalide.
    private static func read<T: Sendable>(_ result: CacheResult<[T]>) -> (items: [T]?, isFresh: Bool) {
        switch result {
        case .fresh(let items, _): return (items, true)
        case .stale(let items, _): return (items, false)
        case .expired, .empty: return (nil, false)
        }
    }
}
