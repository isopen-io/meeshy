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

    /// Applies the absolute aggregate of a heart event and returns the count
    /// the row must show. « My heart » comes from the reactor list, never from
    /// `hasCurrentUser` (computed for the event's ACTOR); a third party's
    /// aggregate that lands while my like is in flight does not know me yet.
    mutating func reconcile(commentId: String, count: Int, reactorUserIds: [String],
                            actorUserId: String, myUserId: String?) -> Int {
        likeDelta[commentId] = nil
        guard let myUserId else { return count }
        if reactorUserIds.contains(myUserId) {
            likedIds.insert(commentId)
            return count
        }
        if actorUserId == myUserId {
            likedIds.remove(commentId)
            return count
        }
        return likedIds.contains(commentId) ? count + 1 : count
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
