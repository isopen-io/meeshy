import Testing
import Foundation
@testable import MeeshySDK

/// Locks the canonical presence rule shared with the web
/// (`packages/shared/utils/user-presence.ts`) and Android (`Presence.kt`):
/// - isOnline == true    -> online (GREEN + pulse) — the backend flag is
///   authoritative (kept alive for any active session), with an anti-stale
///   guard: ignored when lastActiveAt is older than 30min
/// - active <= 60s       -> online  (green, pulse)
/// - active <= 5min      -> recent  (green)
/// - active <= 30min     -> away    (orange)
/// - > 30min / no data   -> offline (gray)
@Suite("UserPresenceState")
struct UserPresenceStateTests {

    private let now = Date(timeIntervalSince1970: 1_750_000_000)

    private func presence(isOnline: Bool, activeSecondsAgo: TimeInterval? = nil) -> UserPresence {
        UserPresence(
            isOnline: isOnline,
            lastActiveAt: activeSecondsAgo.map { now.addingTimeInterval(-$0) }
        )
    }

    // MARK: - isOnline backend flag is authoritative

    @Test("online with no lastActiveAt is online")
    func online_noLastActive_isOnline() {
        #expect(presence(isOnline: true).state(now: now) == .online)
    }

    @Test("disconnected with no lastActiveAt is offline")
    func offline_noLastActive_isOffline() {
        #expect(presence(isOnline: false).state(now: now) == .offline)
    }

    @Test("connected user stays online even with minutes-old lastActiveAt")
    func online_staleTimestamp_staysOnline() {
        #expect(presence(isOnline: true, activeSecondsAgo: 61).state(now: now) == .online)
        #expect(presence(isOnline: true, activeSecondsAgo: 600).state(now: now) == .online)
        #expect(presence(isOnline: true, activeSecondsAgo: 1800).state(now: now) == .online)
    }

    @Test("anti-stale guard: isOnline is ignored when lastActiveAt is beyond 30min")
    func online_beyond30min_isOffline() {
        #expect(presence(isOnline: true, activeSecondsAgo: 1860).state(now: now) == .offline)
    }

    // MARK: - Time decay when disconnected

    @Test("active 20 seconds ago is online")
    func active20s_isOnline() {
        #expect(presence(isOnline: false, activeSecondsAgo: 20).state(now: now) == .online)
    }

    @Test("active exactly 60 seconds ago is online (inclusive)")
    func active60s_isOnline() {
        #expect(presence(isOnline: false, activeSecondsAgo: 60).state(now: now) == .online)
    }

    @Test("active 61 seconds ago is recent")
    func active61s_isRecent() {
        #expect(presence(isOnline: false, activeSecondsAgo: 61).state(now: now) == .recent)
    }

    @Test("active 3 minutes ago is recent")
    func active3min_isRecent() {
        #expect(presence(isOnline: false, activeSecondsAgo: 180).state(now: now) == .recent)
    }

    @Test("active exactly 5 minutes ago is recent (inclusive)")
    func active5min_isRecent() {
        #expect(presence(isOnline: false, activeSecondsAgo: 300).state(now: now) == .recent)
    }

    @Test("active 5min 1s ago is away")
    func active5min1s_isAway() {
        #expect(presence(isOnline: false, activeSecondsAgo: 301).state(now: now) == .away)
    }

    @Test("active 10 minutes ago is away")
    func active10min_isAway() {
        #expect(presence(isOnline: false, activeSecondsAgo: 600).state(now: now) == .away)
    }

    @Test("active exactly 30 minutes ago is away (inclusive)")
    func active30min_isAway() {
        #expect(presence(isOnline: false, activeSecondsAgo: 1800).state(now: now) == .away)
    }

    @Test("active 31 minutes ago is offline")
    func active31min_isOffline() {
        #expect(presence(isOnline: false, activeSecondsAgo: 1860).state(now: now) == .offline)
    }

    // MARK: - Freshly disconnected users decay by time

    @Test("disconnected but active 3 minutes ago is recent (green), not away")
    func offline_active3minAgo_isRecent() {
        #expect(presence(isOnline: false, activeSecondsAgo: 180).state(now: now) == .recent)
    }

    @Test("disconnected and active 10 minutes ago is away (orange)")
    func offline_active10minAgo_isAway() {
        #expect(presence(isOnline: false, activeSecondsAgo: 600).state(now: now) == .away)
    }

    @Test("disconnected past 30 minutes is offline (gray)")
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
