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

/// `ActiveCallSession` mirrors the gateway's raw `callSessionSchema` — a JSON
/// decode test locks in field-name parity (unlike `APICallRecord`, which
/// mirrors a differently-shaped, route-specific serializer).
struct ActiveCallSessionTests {

    @Test func decodesGatewayShape_withParticipants() throws {
        let json = """
        {
            "id": "call-1",
            "conversationId": "conv-1",
            "mode": "video",
            "status": "active",
            "participants": [
                { "userId": "user-1", "user": { "id": "user-1", "username": "alice", "displayName": "Alice" } },
                { "userId": "user-2", "user": { "id": "user-2", "username": "bob", "displayName": "Bob" } }
            ]
        }
        """.data(using: .utf8)!

        let session = try JSONDecoder().decode(ActiveCallSession.self, from: json)

        #expect(session.id == "call-1")
        #expect(session.isVideo)
        #expect(session.remoteParticipant(currentUserId: "user-1")?.user?.username == "bob")
    }

    @Test func remoteParticipant_returnsNil_whenOnlySelfPresent() {
        let session = ActiveCallSession(
            id: "call-1", conversationId: "conv-1", mode: "voice", status: "active",
            participants: [ActiveCallParticipant(userId: "user-1", user: nil)]
        )
        #expect(session.remoteParticipant(currentUserId: "user-1") == nil)
    }
}
