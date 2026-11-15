import Foundation

/// A4 — Time-windowed dedup ring for VoIP push `callId`s.
///
/// PushKit may retry the same push if APNs times out before our ack. The
/// classic non-timestamped ring (`[String]` capped at N) was vulnerable to
/// a network jitter burst: 13 retries of the same callId in 2 seconds would
/// fill and rotate the ring, then the 14th delivery looked novel and
/// triggered a phantom CallKit card.
///
/// This struct keeps both a count cap (`capacity`) and a time-to-live (`ttl`).
/// Entries older than `ttl` are evicted on every `contains`/`insert` call —
/// genuine retries within seconds are deduped, stale entries from older calls
/// expire so a *real* second call with a reused callId (extremely unlikely
/// but possible) is not silently dropped forever.
///
/// Public surface is `internal` for tests; production callers should only
/// invoke via the `VoIPPushManager` ivar.
struct VoIPDedupRing {

    private struct Entry {
        let callId: String
        let reportedAt: Date
    }

    private var entries: [Entry] = []
    private let capacity: Int
    private let ttl: TimeInterval

    init(capacity: Int = 24, ttl: TimeInterval = 30) {
        self.capacity = capacity
        self.ttl = ttl
    }

    /// Returns true if `callId` was reported within the last `ttl` seconds.
    /// Side effect: expires older entries to keep the ring tight.
    mutating func contains(_ callId: String, now: Date) -> Bool {
        purgeExpired(now: now)
        return entries.contains(where: { $0.callId == callId })
    }

    /// Records a new (callId, now) pair. If the ring is at capacity after
    /// purging, drops the oldest entry to make room. Re-inserting an
    /// existing callId refreshes its timestamp (so the dedup window slides
    /// forward — matches APNs-retry semantics).
    mutating func insert(_ callId: String, now: Date) {
        purgeExpired(now: now)
        entries.removeAll { $0.callId == callId }
        entries.append(Entry(callId: callId, reportedAt: now))
        if entries.count > capacity {
            entries.removeFirst(entries.count - capacity)
        }
    }

    /// Evicts `callId` so a subsequent push for the same id is not treated as
    /// a duplicate. Used when `reportNewIncomingCall` genuinely fails (e.g.
    /// CallKit refuses the transaction) and the call is torn down locally —
    /// without eviction, a legitimate APNs retry within `ttl` would be
    /// silently phantom-acked instead of re-ringing.
    mutating func remove(_ callId: String) {
        entries.removeAll { $0.callId == callId }
    }

    /// Internal testing helper — number of live (non-expired) entries.
    var count: Int { entries.count }

    private mutating func purgeExpired(now: Date) {
        let cutoff = now.addingTimeInterval(-ttl)
        entries.removeAll { $0.reportedAt < cutoff }
    }
}
