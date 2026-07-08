import Testing
import Foundation
@testable import MeeshySDK

/// Locks the canonical presence-dot rule shared with the web's `getUserStatus`
/// (`apps/web/lib/user-status.ts`) and Android (`Presence.kt`), pure time decay
/// on lastActiveAt (frozen by the gateway on disconnect):
/// - online  (orange + pulse): active <= 60s
/// - recent  (orange):         active <= 5min
/// - away    (gray):           active <= 30min
/// - offline (no dot):         > 30min, or disconnected with no lastActiveAt
@Suite("UserPresenceState")
struct UserPresenceStateTests {

    private let now = Date(timeIntervalSince1970: 1_750_000_000)

    private func presence(isOnline: Bool, activeSecondsAgo: TimeInterval? = nil) -> UserPresence {
        UserPresence(
            isOnline: isOnline,
            lastActiveAt: activeSecondsAgo.map { now.addingTimeInterval(-$0) }
        )
    }

    // MARK: - Fallback on isOnline when no lastActiveAt

    @Test("online with no lastActiveAt is online")
    func online_noLastActive_isOnline() {
        #expect(presence(isOnline: true).state(now: now) == .online)
    }

    @Test("disconnected with no lastActiveAt is offline")
    func offline_noLastActive_isOffline() {
        #expect(presence(isOnline: false).state(now: now) == .offline)
    }

    // MARK: - Time decay drives the color regardless of isOnline

    @Test("active 20 seconds ago is online")
    func active20s_isOnline() {
        #expect(presence(isOnline: true, activeSecondsAgo: 20).state(now: now) == .online)
    }

    @Test("active exactly 60 seconds ago is online (inclusive)")
    func active60s_isOnline() {
        #expect(presence(isOnline: true, activeSecondsAgo: 60).state(now: now) == .online)
    }

    @Test("active 61 seconds ago is recent")
    func active61s_isRecent() {
        #expect(presence(isOnline: true, activeSecondsAgo: 61).state(now: now) == .recent)
    }

    @Test("active 3 minutes ago is recent")
    func active3min_isRecent() {
        #expect(presence(isOnline: true, activeSecondsAgo: 180).state(now: now) == .recent)
    }

    @Test("active exactly 5 minutes ago is recent (inclusive)")
    func active5min_isRecent() {
        #expect(presence(isOnline: true, activeSecondsAgo: 300).state(now: now) == .recent)
    }

    @Test("active 5min 1s ago is away")
    func active5min1s_isAway() {
        #expect(presence(isOnline: true, activeSecondsAgo: 301).state(now: now) == .away)
    }

    @Test("active 10 minutes ago is away")
    func active10min_isAway() {
        #expect(presence(isOnline: true, activeSecondsAgo: 600).state(now: now) == .away)
    }

    @Test("active exactly 30 minutes ago is away (inclusive)")
    func active30min_isAway() {
        #expect(presence(isOnline: true, activeSecondsAgo: 1800).state(now: now) == .away)
    }

    @Test("active 31 minutes ago is offline")
    func active31min_isOffline() {
        #expect(presence(isOnline: true, activeSecondsAgo: 1860).state(now: now) == .offline)
    }

    // MARK: - Freshly disconnected users decay by time (the reported bug fix)

    @Test("disconnected but active 3 minutes ago is recent (orange), not away")
    func offline_active3minAgo_isRecent() {
        #expect(presence(isOnline: false, activeSecondsAgo: 180).state(now: now) == .recent)
    }

    @Test("disconnected and active 10 minutes ago is away (gray), not orange")
    func offline_active10minAgo_isAway() {
        #expect(presence(isOnline: false, activeSecondsAgo: 600).state(now: now) == .away)
    }

    @Test("disconnected past 30 minutes is offline (no dot)")
    func offline_active31minAgo_isOffline() {
        #expect(presence(isOnline: false, activeSecondsAgo: 1860).state(now: now) == .offline)
    }

    // MARK: - Codable

    @Test("Codable roundtrip preserves both fields")
    func codable_roundtrip_preservesFields() throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let original = UserPresence(isOnline: true, lastActiveAt: Date(timeIntervalSince1970: 1_750_000_000))
        let decoded = try decoder.decode(UserPresence.self, from: encoder.encode(original))
        #expect(decoded.isOnline == original.isOnline)
        #expect(decoded.lastActiveAt == original.lastActiveAt)
    }
}
