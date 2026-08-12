import XCTest
import MeeshySDK
@testable import Meeshy

/// `ThreadView.loadReplies()` used to apply the cache seed unconditionally
/// (`if !seeded.isEmpty { replies = seeded }`), even when it runs as the
/// post-send refresh in `sendReply()` — AFTER an optimistic reply had
/// already been appended to `replies`. Since `CacheCoordinator.shared
/// .messages` is never written to by the send path, `seeded` never carries
/// that optimistic row, so the unconditional overwrite silently dropped a
/// reply that had just been sent successfully. `shouldApplyCacheSeed` is
/// the pure decision extracted from that call site: seed only fills a cold
/// (empty) view, it never clobbers replies already on screen.
final class ThreadViewCacheSeedTests: XCTestCase {

    private func makeReply(id: String = "r1") -> MeeshyMessage {
        MeeshyMessage(id: id, conversationId: "conv-1", content: "hello")
    }

    func test_shouldApplyCacheSeed_emptyCurrentAndNonEmptySeed_returnsTrue() {
        XCTAssertTrue(
            ThreadView.shouldApplyCacheSeed(currentReplies: [], seeded: [makeReply()])
        )
    }

    func test_shouldApplyCacheSeed_emptyCurrentAndEmptySeed_returnsFalse() {
        XCTAssertFalse(
            ThreadView.shouldApplyCacheSeed(currentReplies: [], seeded: [])
        )
    }

    /// The regression this guards: an optimistic reply is already in
    /// `replies` (current is non-empty) when the post-send refresh calls
    /// `loadReplies()` again — the cache seed must NOT replace it, even
    /// though the cache snapshot itself is non-empty (it just doesn't
    /// contain the reply that was only just sent).
    func test_shouldApplyCacheSeed_nonEmptyCurrent_returnsFalseEvenWithNonEmptySeed() {
        XCTAssertFalse(
            ThreadView.shouldApplyCacheSeed(
                currentReplies: [makeReply(id: "optimistic-1")],
                seeded: [makeReply(id: "cached-1"), makeReply(id: "cached-2")]
            )
        )
    }

    func test_shouldApplyCacheSeed_nonEmptyCurrentAndEmptySeed_returnsFalse() {
        XCTAssertFalse(
            ThreadView.shouldApplyCacheSeed(
                currentReplies: [makeReply(id: "optimistic-1")],
                seeded: []
            )
        )
    }
}
