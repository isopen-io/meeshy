import Testing
import Foundation
@testable import MeeshySDK

/// Pure-model tests for `APICallRecord.displayName(fallback:)` — the SDK
/// must stay UI-copy-agnostic (SDK Purity) and let the app inject a
/// localized fallback string instead of hardcoding "Inconnu".
struct CallModelsTests {

    private func makeRecord(
        conversationTitle: String? = nil,
        peer: CallHistoryPeer? = nil
    ) -> APICallRecord {
        APICallRecord(
            callId: "c1",
            conversationId: "conv1",
            conversationType: "direct",
            conversationTitle: conversationTitle,
            mode: "p2p",
            status: "ended",
            direction: "outgoing",
            isVideo: false,
            startedAt: Date(timeIntervalSince1970: 0),
            durationSec: 0,
            peer: peer
        )
    }

    @Test func displayName_prefersPeerDisplayName() {
        let record = makeRecord(
            conversationTitle: "Group",
            peer: CallHistoryPeer(userId: "u1", username: "bob", displayName: "Bob Dupont")
        )
        #expect(record.displayName(fallback: "fallback") == "Bob Dupont")
    }

    @Test func displayName_fallsBackToPeerUsername_whenDisplayNameEmpty() {
        let record = makeRecord(peer: CallHistoryPeer(userId: "u1", username: "bob", displayName: ""))
        #expect(record.displayName(fallback: "fallback") == "bob")
    }

    @Test func displayName_fallsBackToConversationTitle_whenNoPeer() {
        let record = makeRecord(conversationTitle: "Team Standup", peer: nil)
        #expect(record.displayName(fallback: "fallback") == "Team Standup")
    }

    @Test func displayName_usesInjectedFallback_whenNothingElseAvailable() {
        let record = makeRecord(conversationTitle: nil, peer: nil)
        #expect(record.displayName(fallback: "Unknown") == "Unknown")
    }
}
