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
    public static let messages = CachePolicy(ttl: .months(6), staleTTL: nil, maxItemCount: 200, storageLocation: .grdb)
    public static let participants = CachePolicy(ttl: .hours(24), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
    public static let userProfiles = CachePolicy(ttl: .hours(1), staleTTL: .minutes(5), maxItemCount: 100, storageLocation: .grdb)
    public static let mediaImages = CachePolicy(ttl: .years(1), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Images", maxBytes: 300_000_000))
    public static let mediaAudio = CachePolicy(ttl: .months(6), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Audio", maxBytes: 200_000_000))
    public static let mediaVideo = CachePolicy(ttl: .months(6), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Video", maxBytes: 500_000_000))
    public static let thumbnails = CachePolicy(ttl: .days(7), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Thumbnails", maxBytes: 50_000_000))
    public static let feedPosts = CachePolicy(ttl: .hours(6), staleTTL: .minutes(2), maxItemCount: 100, storageLocation: .grdb)
    public static let stories = CachePolicy(ttl: .hours(24), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
}

// MARK: - TimeInterval Helpers

extension TimeInterval {
    public static func minutes(_ n: Double) -> TimeInterval { n * 60 }
    public static func hours(_ n: Double) -> TimeInterval { n * 3600 }
    public static func days(_ n: Double) -> TimeInterval { n * 86400 }
    public static func months(_ n: Double) -> TimeInterval { n * 30 * 86400 }
    public static func years(_ n: Double) -> TimeInterval { n * 365 * 86400 }
}
