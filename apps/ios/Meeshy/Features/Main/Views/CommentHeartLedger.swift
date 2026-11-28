import Foundation
import MeeshySDK
import MeeshyUI

/// The hearts of a comment thread, owned by whoever shows the thread: which
/// comments I liked, the optimistic offset laid over the server count, and
/// the hearts still in flight. Displayed likes are `likes + delta`; a socket
/// aggregate is authoritative and clears the delta.
nonisolated struct CommentHeartLedger: Equatable, Sendable {
    private(set) var likedIds: Set<String> = []
    private(set) var likeDelta: [String: Int] = [:]
    private(set) var inFlightIds: Set<String> = []

    func isLiked(_ commentId: String) -> Bool { likedIds.contains(commentId) }

    func isInFlight(_ commentId: String) -> Bool { inFlightIds.contains(commentId) }

    func displayedLikes(of comment: FeedComment) -> Int {
        max(0, comment.likes + (likeDelta[comment.id] ?? 0))
    }

    /// Flips the heart optimistically and locks it until `settle`. Returns the
    /// state before the tap, or `nil` when a tap on this heart is still in flight.
    mutating func begin(_ commentId: String) -> Bool? {
        guard !inFlightIds.contains(commentId) else { return nil }
        inFlightIds.insert(commentId)
        let wasLiked = likedIds.contains(commentId)
        flip(commentId, toLiked: !wasLiked)
        return wasLiked
    }

    /// Unlocks the heart; an undelivered tap is rolled back.
    mutating func settle(_ commentId: String, wasLiked: Bool, delivered: Bool) {
        inFlightIds.remove(commentId)
        guard !delivered else { return }
        flip(commentId, toLiked: wasLiked)
    }

    /// Additive seeding from the server state of rows that just arrived —
    /// never undoes a heart already toggled here.
    mutating func seed(from comments: [FeedComment]) {
        markLiked(Self.likedIds(in: comments))
    }

    mutating func markLiked(_ commentIds: Set<String>) {
        likedIds.formUnion(commentIds)
    }

    /// The direction a heart event carries, read from the wire `action`
    /// (`"add"` / `"remove"`). `nil` for anything else: an unknown direction
    /// must not move my heart in either sense — the only producer of these
    /// events is our own gateway, so this is a fail-safe, not a code path.
    enum HeartChange: Sendable, Equatable {
        case added
        case removed

        init?(wireAction: String) {
            switch wireAction {
            case "add": self = .added
            case "remove": self = .removed
            default: return nil
            }
        }
    }

    /// Applies the absolute aggregate of a heart event and returns the count
    /// the row must show.
    ///
    /// **« My heart » is derived from the ACTOR and the direction, never from a
    /// reactor list** (#20410). It used to read `aggregation.userIds`, which
    /// made the heart of a comment depend on a roster the payload is about to
    /// stop carrying — and that roster is already filtered per reader on the
    /// ack paths, so a blocked pair could silently flip a heart. The only
    /// reader whose membership in the roster CHANGES is the actor, and
    /// `(actorUserId, change)` determines it entirely; for anybody else, their
    /// own heart is untouched by the event. Never `hasCurrentUser` either — the
    /// gateway computes it for the event's ACTOR, so it is false for every
    /// other recipient of a broadcast.
    ///
    /// **Two things this gives up, both on purpose.** A stale local heart is no
    /// longer corrected by a third party's event — it comes back with the REST
    /// read, which is nominative and filtered. And a third party's aggregate
    /// that lands while my own tap is still IN FLIGHT keeps my optimistic
    /// offset, which over-counts by one in the narrow race where the server has
    /// already committed my tap but my own echo has not arrived yet; my own
    /// echo clears it, and it is exactly the window during which the optimistic
    /// offset is legitimate.
    mutating func reconcile(commentId: String, count: Int, change: HeartChange?,
                            actorUserId: String, myUserId: String?) -> Int {
        /* Sans session, il n'y a aucun « moi » à reconnaître — donc aucun geste
           optimiste à préserver : le compte du serveur fait autorité, seul. */
        guard let myUserId else {
            likeDelta[commentId] = nil
            return count
        }
        guard actorUserId == myUserId, let change else {
            /* A third party's aggregate (or a direction we cannot read). The
               server count already carries my COMMITTED state; only a tap of
               mine still in flight is missing from it, so its offset stays. */
            if !inFlightIds.contains(commentId) { likeDelta[commentId] = nil }
            return count
        }
        /* My own action, echoed by the server: its count is authoritative for
           me, so the optimistic offset has nothing left to correct. */
        likeDelta[commentId] = nil
        switch change {
        case .added: likedIds.insert(commentId)
        case .removed: likedIds.remove(commentId)
        }
        return count
    }

    mutating func reset() { self = CommentHeartLedger() }

    static func likedIds(in comments: [FeedComment]) -> Set<String> {
        Set(comments.filter { $0.currentUserReactions?.contains(MeeshyQuickReactions.heart) == true }.map(\.id))
    }

    private mutating func flip(_ commentId: String, toLiked liked: Bool) {
        if liked {
            likedIds.insert(commentId)
        } else {
            likedIds.remove(commentId)
        }
        likeDelta[commentId, default: 0] += liked ? 1 : -1
    }
}
