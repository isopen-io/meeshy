import Foundation
import os

public struct CachePolicy: Sendable {
    public let ttl: TimeInterval
    public let staleTTL: TimeInterval?
    public let maxItemCount: Int?
    public let storageLocation: StorageLocation

    private static let logger = Logger(subsystem: "com.meeshy.sdk", category: "cache-policy")

    public enum StorageLocation: Sendable, Equatable {
        case grdb
        case disk(subdir: String, maxBytes: Int)
    }

    public enum Freshness: Sendable, Equatable {
        case fresh
        case stale
        case expired
    }

    public init(ttl: TimeInterval, staleTTL: TimeInterval?, maxItemCount: Int?, storageLocation: StorageLocation) {
        self.ttl = ttl
        self.maxItemCount = maxItemCount
        self.storageLocation = storageLocation

        if let stale = staleTTL, stale > ttl {
            Self.logger.warning("staleTTL (\(stale)s) > ttl (\(ttl)s) — clamping staleTTL to ttl")
            self.staleTTL = ttl
        } else {
            self.staleTTL = staleTTL
        }
    }

    public func freshness(age: TimeInterval) -> Freshness {
        if let stale = staleTTL {
            if age < stale { return .fresh }
            if age < ttl { return .stale }
            return .expired
        } else {
            return age < ttl ? .fresh : .expired
        }
    }
}

// MARK: - Predefined Policies

extension CachePolicy {
    public static let conversations = CachePolicy(ttl: .hours(24), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
    public static let messages = CachePolicy(ttl: .months(6), staleTTL: .minutes(2), maxItemCount: 600, storageLocation: .grdb)
    public static let participants = CachePolicy(ttl: .hours(24), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
    /// Profil d'un autre utilisateur. TTL 30 j + fenêtre fraîche courte : affichage
    /// cache instantané, prolongé à chaque visite via `touch`, revalidation SWR
    /// silencieuse au-delà de la fenêtre fraîche.
    public static let userProfiles = CachePolicy(ttl: .days(30), staleTTL: .minutes(5), maxItemCount: 100, storageLocation: .grdb)
    public static let mediaImages = CachePolicy(ttl: .years(1), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Images", maxBytes: 300_000_000))
    public static let mediaAudio = CachePolicy(ttl: .months(6), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Audio", maxBytes: 200_000_000))
    /// 1 Go : une seule story vidéo peut peser ~275 Mo — à 500 Mo, deux stories
    /// suffisaient à déclencher l'éviction LRU des reels/vidéos de conversation
    /// non épinglés, donc leur re-téléchargement (violation local-first).
    public static let mediaVideo = CachePolicy(ttl: .months(6), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Video", maxBytes: 1_000_000_000))
    public static let thumbnails = CachePolicy(ttl: .days(7), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Thumbnails", maxBytes: 50_000_000))
    /// Fil d'actualité. TTL 7 jours : une fois un post chargé, il reste servable
    /// (et disponible hors-ligne) pendant 7 jours sans nouveau téléchargement du
    /// payload liste — les médias (images 1 an / vidéo-audio 6 mois) ne sont jamais
    /// re-téléchargés dans cette fenêtre. La fenêtre fraîche de 5 min garde l'UI
    /// instantanée au cold-start / réouverture rapide ; au-delà, SWR sert le cache
    /// immédiatement et revalide en silence (les events socket du feed gardent la
    /// liste vivante entre-temps). Avant : TTL 6 h → expiration et refetch bloquant
    /// plusieurs fois par jour, contraire à « ne pas re-télécharger sur 7 jours ».
    public static let feedPosts = CachePolicy(ttl: .days(7), staleTTL: .minutes(5), maxItemCount: 100, storageLocation: .grdb)
    public static let comments = CachePolicy(ttl: .hours(1), staleTTL: .minutes(2), maxItemCount: 500, storageLocation: .grdb)
    public static let stories = CachePolicy(ttl: .hours(24), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
    public static let notifications = CachePolicy(ttl: .hours(24), staleTTL: .minutes(2), maxItemCount: 200, storageLocation: .grdb)
    /// Call journal. Calls are immutable once terminal, so a long TTL is safe;
    /// the 5-min fresh window keeps the Calls tab instant on cold start / quick
    /// reopen, then SWR serves cache + revalidates silently. The 3-month server
    /// window bounds growth; `maxItemCount: 300` caps the local mirror.
    public static let callHistory = CachePolicy(ttl: .days(30), staleTTL: .minutes(5), maxItemCount: 300, storageLocation: .grdb)
    public static let userStats = CachePolicy(ttl: .hours(6), staleTTL: .minutes(10), maxItemCount: 10, storageLocation: .grdb)
    public static let linksAndTokens = CachePolicy(ttl: .hours(12), staleTTL: .minutes(5), maxItemCount: 100, storageLocation: .grdb)
    public static let statuses = CachePolicy(ttl: .hours(1), staleTTL: .minutes(2), maxItemCount: 100, storageLocation: .grdb)
    /// User preferences (categories, tags, app prefs, conversation prefs).
    /// Change rarely (explicit gesture) but read on every list/sheet open.
    /// Long fresh window keeps the UI snappy; 10-min stale window guarantees
    /// a server-truth revalidate within minutes of session resume.
    public static let preferences = CachePolicy(ttl: .hours(24), staleTTL: .minutes(10), maxItemCount: 500, storageLocation: .grdb)
    /// User communities list — 24 h TTL, 5 min fresh window. Communities
    /// change rarely (explicit gesture: join / leave / create / get invited)
    /// so most reads can be served from cache. The 5-min fresh window lets
    /// the conversation list show communities instantly on cold start /
    /// quick reopen; anything older falls into the `.stale` branch which
    /// surfaces cached data immediately and revalidates silently in the
    /// background. The 24 h ttl ceiling prevents a multi-day-old cache from
    /// silently driving the UI; beyond that we fall through to `.expired`
    /// and gate a full refetch on the spinner path.
    public static let communities = CachePolicy(ttl: .hours(24), staleTTL: .minutes(5), maxItemCount: 500, storageLocation: .grdb)
    /// Per-conversation message drafts. Drafts are local-only (no server
    /// sync) so the SWR notion of "stale" doesn't apply: `staleTTL` is set
    /// equal to `ttl` to keep every read in the `.fresh` branch until the
    /// 30-day eviction horizon. The horizon exists only to bound disk usage
    /// — an abandoned draft from six months ago has approximately zero
    /// chance of being resumed, so we let LRU + TTL recycle the slot.
    /// `maxItemCount: 500` matches `preferences` and covers the practical
    /// ceiling of concurrent open conversations per user.
    public static let drafts = CachePolicy(ttl: .days(30), staleTTL: .days(30), maxItemCount: 500, storageLocation: .grdb)
}

// MARK: - TimeInterval Helpers

extension TimeInterval {
    public static func minutes(_ n: Double) -> TimeInterval { n * 60 }
    public static func hours(_ n: Double) -> TimeInterval { n * 3600 }
    public static func days(_ n: Double) -> TimeInterval { n * 86400 }
    public static func months(_ n: Double) -> TimeInterval { n * 30 * 86400 }
    public static func years(_ n: Double) -> TimeInterval { n * 365 * 86400 }
}
