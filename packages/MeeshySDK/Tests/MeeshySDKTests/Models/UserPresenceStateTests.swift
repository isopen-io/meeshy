import Testing
import Foundation
@testable import MeeshySDK

/// Locks the canonical presence-dot rule shared with the web's
/// `getUserStatus` (`apps/web/lib/user-status.ts`):
/// - online: isOnline && (no lastActiveAt || active < 5 min)
/// - away:   isOnline && inactive >= 5 min, OR disconnected < 30 min ago
/// - offline: disconnected && (no lastActiveAt || inactive >= 30 min)
@Suite("UserPresenceState")
struct UserPresenceStateTests {

    private func presence(isOnline: Bool, activeSecondsAgo: TimeInterval? = nil) -> UserPresence {
        UserPresence(
            isOnline: isOnline,
            lastActiveAt: activeSecondsAgo.map { Date().addingTimeInterval(-$0) }
        )
    }

    @Test("online with no lastActiveAt is online")
    func online_noLastActive_isOnline() {
        #expect(presence(isOnline: true).state == .online)
    }

    @Test("online and active 4 minutes ago is online")
    func online_active4min_isOnline() {
        #expect(presence(isOnline: true, activeSecondsAgo: 240).state == .online)
    }

    @Test("online but inactive 6 minutes is away")
    func online_inactive6min_isAway() {
        #expect(presence(isOnline: true, activeSecondsAgo: 360).state == .away)
    }

    @Test("online never falls below away, even after 45 minutes idle")
    func online_inactive45min_isAway() {
        #expect(presence(isOnline: true, activeSecondsAgo: 2700).state == .away)
    }

    @Test("disconnected but active 10 minutes ago is away")
    func offline_active10minAgo_isAway() {
        #expect(presence(isOnline: false, activeSecondsAgo: 600).state == .away)
    }

    @Test("disconnected past 30 minutes is offline")
    func offline_active31minAgo_isOffline() {
        #expect(presence(isOnline: false, activeSecondsAgo: 1860).state == .offline)
    }

    @Test("disconnected with no lastActiveAt is offline")
    func offline_noLastActive_isOffline() {
        #expect(presence(isOnline: false).state == .offline)
    }

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
