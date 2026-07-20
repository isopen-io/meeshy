import Testing
import Foundation
@testable import MeeshySDK

/// Locks the canonical 1/3/5 presence rule shared with the web
/// (`packages/shared/utils/user-presence.ts`) and Android (`Presence.kt`):
/// - isOnline == true    -> online (GREEN + pulse) — the backend flag is
///   authoritative (kept alive for any active session), with an anti-stale
///   guard: ignored when lastActiveAt is older than 5min
/// - active <= 60s       -> online  (green, pulse)
/// - active <= 3min      -> away    (orange)
/// - active <= 5min      -> idle    (gray, DISPLAYED)
/// - > 5min / no data    -> offline (nothing rendered on avatar dots)
@Suite("UserPresenceState")
struct UserPresenceStateTests {

    private let now = Date(timeIntervalSince1970: 1_750_000_000)

    private func presence(isOnline: Bool, activeSecondsAgo: TimeInterval? = nil) -> UserPresence {
        UserPresence(
            isOnline: isOnline,
            lastActiveAt: activeSecondsAgo.map { now.addingTimeInterval(-$0) }
        )
    }

    // MARK: - isOnline backend flag is authoritative (5min anti-stale guard)

    @Test("online with no lastActiveAt is online")
    func online_noLastActive_isOnline() {
        #expect(presence(isOnline: true).state(now: now) == .online)
    }

    @Test("disconnected with no lastActiveAt is offline")
    func offline_noLastActive_isOffline() {
        #expect(presence(isOnline: false).state(now: now) == .offline)
    }

    @Test("connected user stays online with minutes-old lastActiveAt up to 5min")
    func online_staleTimestamp_staysOnlineWithinGuard() {
        #expect(presence(isOnline: true, activeSecondsAgo: 61).state(now: now) == .online)
        #expect(presence(isOnline: true, activeSecondsAgo: 240).state(now: now) == .online)
        #expect(presence(isOnline: true, activeSecondsAgo: 299).state(now: now) == .online)
        #expect(presence(isOnline: true, activeSecondsAgo: 300).state(now: now) == .online)
    }

    @Test("anti-stale guard: isOnline is ignored when lastActiveAt is beyond 5min")
    func online_beyond5min_decays() {
        #expect(presence(isOnline: true, activeSecondsAgo: 301).state(now: now) == .offline)
        #expect(presence(isOnline: true, activeSecondsAgo: 1800).state(now: now) == .offline)
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

    @Test("active 61 seconds ago is away")
    func active61s_isAway() {
        #expect(presence(isOnline: false, activeSecondsAgo: 61).state(now: now) == .away)
    }

    @Test("active 2 minutes ago is away")
    func active2min_isAway() {
        #expect(presence(isOnline: false, activeSecondsAgo: 120).state(now: now) == .away)
    }

    @Test("active exactly 3 minutes ago is away (inclusive)")
    func active3min_isAway() {
        #expect(presence(isOnline: false, activeSecondsAgo: 180).state(now: now) == .away)
    }

    @Test("active 3min 1s ago is idle")
    func active3min1s_isIdle() {
        #expect(presence(isOnline: false, activeSecondsAgo: 181).state(now: now) == .idle)
    }

    @Test("active 4 minutes ago is idle")
    func active4min_isIdle() {
        #expect(presence(isOnline: false, activeSecondsAgo: 240).state(now: now) == .idle)
    }

    @Test("active exactly 5 minutes ago is idle (inclusive)")
    func active5min_isIdle() {
        #expect(presence(isOnline: false, activeSecondsAgo: 300).state(now: now) == .idle)
    }

    @Test("active 5min 1s ago is offline")
    func active5min1s_isOffline() {
        #expect(presence(isOnline: false, activeSecondsAgo: 301).state(now: now) == .offline)
    }

    @Test("active 10 minutes ago is offline")
    func active10min_isOffline() {
        #expect(presence(isOnline: false, activeSecondsAgo: 600).state(now: now) == .offline)
    }

    @Test("active 30 minutes ago is offline")
    func active30min_isOffline() {
        #expect(presence(isOnline: false, activeSecondsAgo: 1800).state(now: now) == .offline)
    }

    // MARK: - Parity edge cases (mirror TS NaN / Kotlin parse-failure / future)

    @Test("future lastActiveAt (clock skew) is online")
    func futureTimestamp_isOnline() {
        #expect(presence(isOnline: false, activeSecondsAgo: -30).state(now: now) == .online)
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
