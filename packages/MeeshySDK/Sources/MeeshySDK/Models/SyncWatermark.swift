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

    // MARK: - Conversation-list delta watermark (`updatedSince`)
    //
    // JUMEAU WEB — `conversationDeltaWatermark`
    // (`apps/web/lib/conversations/delta-merge.ts`). Même règle « le curseur
    // vit en temps SERVEUR », exprimée sur la source que chaque plateforme
    // détient : iOS fait avancer une valeur persistée, le web recalcule le plus
    // récent `updatedAt` de son cache et le borne par `now`. Les deux
    // garantissent la même chose — la fenêtre ne saute jamais une mise à jour
    // réelle, au pire elle en relit.

    /// Next INCREMENTAL delta watermark. The `/conversations?updatedSince=`
    /// query is compared SERVER-side against server `updatedAt`, so the cursor
    /// must live in server time — never `Date()` from the device clock, which,
    /// when ahead of the server, pushes `updatedSince` past real updates in
    /// `[serverNow, deviceNow]` and drops them. Advances to the newest server
    /// `updatedAt` observed, never regressing below `previous` (a stray older
    /// row can't pull the cursor back); an empty delta keeps `previous`.
    static func advanced(previous: Date, receivedUpdatedAt: [Date]) -> Date {
        Swift.max(previous, receivedUpdatedAt.max() ?? previous)
    }

    /// Next cursor for a delta page known to be FULL — i.e. cut at the server
    /// cap, with an unknown number of rows left behind.
    ///
    /// The route orders a delta page by (`updatedAt` asc, `id` asc), so the cut
    /// can fall INSIDE a group of rows sharing one `updatedAt`. `advanced` would
    /// push the cursor to the page max, and the next page's strict `gt` bound
    /// would skip that group's survivors for good. Resuming just BELOW the top
    /// group re-reads it whole on the next page: rows already applied are
    /// upserted again (idempotent), none is skipped.
    ///
    /// `nil` means "no cursor can make progress here": the page carries a SINGLE
    /// distinct `updatedAt` (mass write past the cap), so there is nothing below
    /// the top group to resume from. The caller must escalate to a full
    /// reconcile rather than advance — this is the residue the server ordering
    /// alone cannot rescue.
    static func resumeAfterFullPage(receivedUpdatedAt: [Date]) -> Date? {
        Set(receivedUpdatedAt).sorted().dropLast().last
    }

    /// AUTHORITATIVE watermark after a full sync. A full fetch is the ground
    /// truth for every conversation, so the cursor is SET to the newest server
    /// `updatedAt` returned — deliberately ignoring `previous` so a stale
    /// device-clock value stored by an older build (a server-FUTURE cursor that
    /// would otherwise freeze delta sync until server time caught up) is flushed.
    /// An account with no conversations keeps `fallback`.
    static func fromFullSync(receivedUpdatedAt: [Date], fallback: Date) -> Date {
        receivedUpdatedAt.max() ?? fallback
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
