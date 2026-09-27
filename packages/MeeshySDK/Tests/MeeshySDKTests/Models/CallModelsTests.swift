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

/// Le journal des appels (#8066) : un appel de groupe nomme ses participants,
/// et la recherche les trouve — sans accents ni casse, comme le web.
struct CallRecordParticipantsTests {

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private func decode(_ extra: String) throws -> APICallRecord {
        let json = """
        {"callId":"g1","conversationId":"conv-g","conversationType":"group","conversationTitle":"Équipe","conversationAvatar":null,"mode":"sfu","status":"ended","endReason":null,"direction":"outgoing","isVideo":false,"startedAt":"2026-09-20T10:00:00Z","answeredAt":null,"endedAt":null,"durationSec":60,"bytesSent":null,"bytesReceived":null,"peer":null\(extra)}
        """
        return try Self.decoder.decode(APICallRecord.self, from: Data(json.utf8))
    }

    private func participant(_ name: String, username: String? = nil) -> CallHistoryParticipant {
        CallHistoryParticipant(participantId: "p-\(name)", userId: nil, username: username, displayName: name, avatar: nil)
    }

    private func group(_ participants: [CallHistoryParticipant]) -> APICallRecord {
        APICallRecord(
            callId: "g1", conversationId: "conv-g", conversationType: "group", conversationTitle: "Équipe",
            mode: "sfu", status: "ended", direction: "outgoing", isVideo: false,
            startedAt: Date(timeIntervalSince1970: 0), durationSec: 0,
            participants: participants
        )
    }

    @Test func decodesGroupParticipants() throws {
        let record = try decode(#","participants":[{"participantId":"p1","userId":"u1","username":"ada","displayName":"Ada","avatar":null},{"participantId":"p2","userId":null,"username":null,"displayName":"Invité","avatar":"g.jpg"}]"#)
        #expect(record.participants.map(\.displayName) == ["Ada", "Invité"])
        #expect(record.participants.last?.avatar == "g.jpg")
    }

    @Test func missingParticipants_decodesAsEmpty() throws {
        let record = try decode("")
        #expect(record.participants.isEmpty)
    }

    @Test func participantSummary_namesTheFirstAndCountsTheRest() {
        let record = group(["Ada", "Bruno", "Chloé", "Dia"].map { participant($0) })
        #expect(record.participantSummary(limit: 2) == CallParticipantSummary(names: ["Ada", "Bruno"], more: 2))
        #expect(record.participantSummary(limit: 5) == CallParticipantSummary(names: ["Ada", "Bruno", "Chloé", "Dia"], more: 0))
    }

    @Test func matches_foldsAccentsAndCase_onNamePeerAndParticipants() {
        let record = group([participant("Chloé", username: "chloe_b")])
        let direct = APICallRecord(
            callId: "d1", conversationId: "conv-d", conversationType: "direct",
            mode: "p2p", status: "ended", direction: "incoming", isVideo: false,
            startedAt: Date(timeIntervalSince1970: 0), durationSec: 0,
            peer: CallHistoryPeer(userId: "u1", username: "eloi", displayName: "Éloi")
        )
        #expect(record.matches(query: "EQUIPE", fallback: "Inconnu"))
        #expect(record.matches(query: "chloe", fallback: "Inconnu"))
        #expect(record.matches(query: "chloe_b", fallback: "Inconnu"))
        #expect(!record.matches(query: "eloi", fallback: "Inconnu"))
        #expect(direct.matches(query: "ELOI", fallback: "Inconnu"))
        #expect(direct.matches(query: "   ", fallback: "Inconnu"))
    }
}
