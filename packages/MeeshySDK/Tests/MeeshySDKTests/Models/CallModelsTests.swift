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
        // Real wire shape: `mode` is the WebRTC architecture (p2p|sfu) and the
        // call type travels in the whitelisted `metadata.type` — a video call
        // rejoined after crash used to resume as audio because isVideo read
        // `mode == "video"`, which the gateway never sends (fix 2026-07-12).
        let json = """
        {
            "id": "call-1",
            "conversationId": "conv-1",
            "mode": "p2p",
            "status": "active",
            "metadata": { "type": "video" },
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

    @Test func audioCall_p2pModeWithoutVideoMetadata_isNotVideo() throws {
        // An audio p2p call: metadata.type=audio (or absent) must never read
        // as video just because some other field varies.
        let json = """
        {
            "id": "call-2",
            "conversationId": "conv-1",
            "mode": "p2p",
            "status": "active",
            "metadata": { "type": "audio" },
            "participants": []
        }
        """.data(using: .utf8)!

        let session = try JSONDecoder().decode(ActiveCallSession.self, from: json)

        #expect(!session.isVideo)
    }

    @Test func legacySession_withoutMetadata_decodesAndDefaultsToAudio() throws {
        // Sessions serialized before the metadata whitelist (or by an older
        // gateway) carry no metadata: decode must succeed and isVideo falls
        // back to `mode`, which is p2p → audio.
        let json = """
        {
            "id": "call-3",
            "conversationId": "conv-1",
            "mode": "p2p",
            "status": "active",
            "participants": []
        }
        """.data(using: .utf8)!

        let session = try JSONDecoder().decode(ActiveCallSession.self, from: json)

        #expect(!session.isVideo)
    }

    @Test func remoteParticipant_returnsNil_whenOnlySelfPresent() {
        let session = ActiveCallSession(
            id: "call-1", conversationId: "conv-1", mode: "voice", status: "active",
            participants: [ActiveCallParticipant(userId: "user-1", user: nil)]
        )
        #expect(session.remoteParticipant(currentUserId: "user-1") == nil)
    }

    // --- Resilient participant decode (P1-C defence-in-depth) ---

    @Test func participant_fallsBackToNestedUserId_whenTopLevelMissing() throws {
        let json = """
        { "user": { "id": "u2", "username": "bob", "displayName": "Bob" } }
        """.data(using: .utf8)!
        let p = try JSONDecoder().decode(ActiveCallParticipant.self, from: json)
        #expect(p.userId == "u2")
        #expect(p.user?.username == "bob")
    }

    @Test func participant_prefersTopLevelUserId_overNestedId() throws {
        let json = """
        { "userId": "u1", "user": { "id": "u2", "username": "bob" } }
        """.data(using: .utf8)!
        let p = try JSONDecoder().decode(ActiveCallParticipant.self, from: json)
        #expect(p.userId == "u1")
    }

    @Test func participant_emptyTopLevelUserId_fallsBackToNestedId() throws {
        let json = """
        { "userId": "", "user": { "id": "u2", "username": "bob" } }
        """.data(using: .utf8)!
        let p = try JSONDecoder().decode(ActiveCallParticipant.self, from: json)
        #expect(p.userId == "u2")
    }

    @Test func session_decodesWhenAParticipantUsesNestedUserIdFallback() throws {
        // A degraded payload (one participant missing top-level userId) must
        // still yield a usable remoteParticipant instead of failing the WHOLE
        // ActiveCallSession decode and killing crash-recovery.
        let json = """
        {
            "id": "call-1", "conversationId": "conv-1", "mode": "p2p", "status": "active",
            "participants": [
                { "userId": "user-1", "user": { "id": "user-1", "username": "alice" } },
                { "user": { "id": "user-2", "username": "bob" } }
            ]
        }
        """.data(using: .utf8)!
        let session = try JSONDecoder().decode(ActiveCallSession.self, from: json)
        #expect(session.remoteParticipant(currentUserId: "user-1")?.userId == "user-2")
    }
}
