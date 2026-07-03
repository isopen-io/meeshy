import Foundation

/// Pure rule engine for the message gap-recovery high-water mark.
///
/// The client backfills the messages it missed while disconnected by asking the
/// gateway for everything with `createdAt > watermark`. The gateway compares
/// against SERVER-stamped timestamps, so the watermark must be derived ONLY from
/// timestamps the server itself produced — never from a local guess.
///
/// An OWN message that is still optimistic (`.sending` / `.invisible` /
/// `.clock` / `.slow` / `.failed`) carries a `createdAt` stamped from the LOCAL
/// device clock at compose time. If that clock runs ahead of the server, using
/// such a message as the watermark pushes the cutoff past real missed messages
/// (whose server `createdAt` is behind the skewed clock), silently dropping them
/// from the backfill. Received messages and server-confirmed own messages
/// (`.sent` / `.delivered` / `.read`) always carry a server timestamp and are
/// safe boundaries.
///
/// Stateless and pure — safe to call from any actor. Placement: SDK rule engine
/// (grain test — pure function over an SDK model); the reconnect orchestration
/// that consumes it stays app-side.
public enum SyncWatermark {
    /// Newest server-authoritative `createdAt` among `messages`, or `nil` when
    /// none qualify (the caller then does a full load instead of a poisoned
    /// backfill). Order-independent (`.max()`); excludes optimistic own-sends.
    public static func newest(among messages: [MeeshyMessage]) -> Date? {
        messages.lazy.filter(\.isServerTimestamped).map(\.createdAt).max()
    }
}

public extension MeeshyMessage {
    /// True when this message's `createdAt` originates from the server and can
    /// therefore be trusted as a gap-recovery boundary.
    ///
    /// Received messages (`isMe == false`) always came from the server. An own
    /// message only qualifies once the server has confirmed it — `.sent` /
    /// `.delivered` / `.read`; while still optimistic (`.sending` / `.invisible`
    /// / `.clock` / `.slow` / `.failed`) its `createdAt` is a local device-clock
    /// value that a skewed clock could push ahead of real server time.
    var isServerTimestamped: Bool {
        guard isMe else { return true }
        switch deliveryStatus {
        case .sent, .delivered, .read:
            return true
        case .sending, .invisible, .clock, .slow, .failed:
            return false
        }
    }
}
