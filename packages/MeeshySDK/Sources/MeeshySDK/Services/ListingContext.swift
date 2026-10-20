import Foundation

// MARK: - Le contexte de listing d'une impression (#10501)
//
// La passerelle sert, avec une page de listing, un identifiant OPAQUE de page
// (`meta.feedRequestId`) et la source de classement de chaque élément
// (`rankingSource`). L'impression d'une carte les recopie dans `listing`, avec
// le rang auquel la carte est RENDUE. Ce registre garde, par surface, de quelle
// page vient chaque élément : le même post servi par le fil puis par un
// hashtag a deux contextes, un par listing. Rien n'entre dans `FeedPost` — une
// carte ne se redessine pas pour être située.

/// Un élément d'une page servie : son identifiant, et sa source de classement
/// telle que la passerelle l'a dite.
public struct ListedItem: Sendable, Equatable {
    public let id: String
    public let rankingSource: String?

    public init(id: String, rankingSource: String? = nil) {
        self.id = id
        self.rankingSource = rankingSource
    }
}

/// Qui sait de quelle page vient un élément d'un listing.
public protocol ListingContextProviding: Sendable {
    /// Une page vient d'être servie à `surface`.
    func note(surface: ReachSurface, feedRequestId: String?, items: [ListedItem])
    /// Le contexte de l'élément `postId` rendu au rang `position` de `surface`.
    /// `nil` quand rien n'est connu — ni rang, ni page, ni source.
    func listing(on surface: ReachSurface?, postId: String, position: Int?) -> SocialListing?
}

/// La règle, sans verrou ni singleton.
public struct ListingPageIndex: Sendable, Equatable {
    /// Au-delà, les éléments servis les plus anciens sont oubliés.
    public static let capacity = 2_000
    /// Un identifiant de page plus long que cela n'est pas un des nôtres.
    public static let maxFeedRequestIdLength = 128

    struct Key: Hashable, Sendable {
        let surface: ReachSurface
        let postId: String
    }

    struct Served: Sendable, Equatable {
        let feedRequestId: String?
        let rankingSource: SocialRankingSource?
    }

    private var served: [Key: Served] = [:]
    private var order: [Key] = []

    public init() {}

    public var count: Int { served.count }

    /// Une page qui ne dit rien — ni identifiant de page, ni source — ne
    /// laisse aucune trace : la dernière page qui a SITUÉ un élément reste.
    public mutating func note(surface: ReachSurface, feedRequestId: String?, items: [ListedItem]) {
        let page = feedRequestId.flatMap { $0.isEmpty || $0.count > Self.maxFeedRequestIdLength ? nil : $0 }
        for item in items where !item.id.isEmpty {
            let source = item.rankingSource.map { SocialRankingSource(served: $0) }
            guard page != nil || source != nil else { continue }
            let key = Key(surface: surface, postId: item.id)
            if served.updateValue(Served(feedRequestId: page, rankingSource: source), forKey: key) == nil {
                order.append(key)
            }
        }
        let overflow = order.count - Self.capacity
        guard overflow > 0 else { return }
        order.prefix(overflow).forEach { served[$0] = nil }
        order.removeFirst(overflow)
    }

    public func listing(on surface: ReachSurface?, postId: String, position: Int?) -> SocialListing? {
        let known = surface.flatMap { served[Key(surface: $0, postId: postId)] }
        let rank = position.flatMap { $0 >= 0 ? $0 : nil }
        guard rank != nil || known != nil else { return nil }
        return SocialListing(feedRequestId: known?.feedRequestId, position: rank, rankingSource: known?.rankingSource)
    }
}

/// Le registre partagé : `PostService` et `NearbyDiscoveryService` y notent
/// chaque page servie, la file d'impressions de l'app y lit le contexte d'une
/// carte. Rien n'est persisté, et l'identifiant de page n'est rattaché à
/// aucun compte.
public final class ListingContextLedger: ListingContextProviding, Sendable {
    public static let shared = ListingContextLedger()

    private let index = Locked(ListingPageIndex())

    public init() {}

    public func note(surface: ReachSurface, feedRequestId: String?, items: [ListedItem]) {
        index.mutate { $0.note(surface: surface, feedRequestId: feedRequestId, items: items) }
    }

    public func listing(on surface: ReachSurface?, postId: String, position: Int?) -> SocialListing? {
        index.read { $0.listing(on: surface, postId: postId, position: position) }
    }

    /// À la déconnexion : les pages d'un compte ne situent pas le suivant.
    public func reset() {
        index.mutate { $0 = ListingPageIndex() }
    }
}
