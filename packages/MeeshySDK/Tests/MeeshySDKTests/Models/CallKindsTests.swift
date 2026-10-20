import Testing
import Foundation
@testable import MeeshySDK

private struct KindsProbe: Codable {
    let status: CallStatus
    let mode: CallMode
    let kind: CallKind
    let direction: CallDirection
}

private struct KnownProbe: Codable {
    let direction: CallDirection
    let mode: CallMode
    let status: CallStatus
}

struct CallKindsTests {

    private func makeRecord(mode: String = "p2p", status: String = "ended", direction: String = "outgoing") -> APICallRecord {
        APICallRecord(
            callId: "c1",
            conversationId: "conv1",
            conversationType: "direct",
            mode: mode,
            status: status,
            direction: direction,
            isVideo: false,
            startedAt: Date(timeIntervalSince1970: 0),
            durationSec: 0
        )
    }

    @Test func test_callStatus_decodesEveryCurrentPrismaValue() {
        for raw in ["initiated", "ringing", "connecting", "active", "reconnecting", "ended", "missed", "rejected", "failed"] {
            #expect(CallStatus(raw: raw) != .unknown)
            #expect(CallStatus(raw: raw).rawValue == raw)
        }
        for raw in ["p2p", "sfu"] {
            #expect(CallMode(raw: raw) != .unknown)
            #expect(CallMode(raw: raw).rawValue == raw)
        }
        for raw in ["audio", "video"] {
            #expect(CallKind(raw: raw) != .unknown)
            #expect(CallKind(raw: raw).rawValue == raw)
        }
        for raw in ["incoming", "outgoing", "missed"] {
            #expect(CallDirection(raw: raw) != .unknown)
            #expect(CallDirection(raw: raw).rawValue == raw)
        }
    }

    @Test func test_unknownString_fallsBackToUnknown_withoutThrowing() throws {
        let json = Data(#"{"status":"teleporting","mode":"mesh","kind":"hologram","direction":"sideways"}"#.utf8)
        let decoded = try JSONDecoder().decode(KindsProbe.self, from: json)
        #expect(decoded.status == .unknown)
        #expect(decoded.mode == .unknown)
        #expect(decoded.kind == .unknown)
        #expect(decoded.direction == .unknown)
    }

    @Test func test_callDirection_rawInit_unknownValue_isUnknown() {
        #expect(CallDirection(raw: "sideways") == .unknown)
        #expect(makeRecord(direction: "sideways").isMissed == false)
    }

    @Test func test_knownValues_roundTripBytesIdentical() throws {
        let json = Data(#"{"direction":"missed","mode":"sfu","status":"ended"}"#.utf8)
        let decoded = try JSONDecoder().decode(KnownProbe.self, from: json)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        #expect(try encoder.encode(decoded) == json)
    }

    @Test func test_record_typedAccessors_projectStoredStrings() {
        let record = makeRecord(mode: "sfu", status: "missed")
        #expect(record.modeKind == .sfu)
        #expect(record.statusKind == .missed)
        #expect(record.mode == "sfu")

        let video = ActiveCallSession(
            id: "a1", conversationId: "conv1", mode: "p2p", status: "ringing",
            metadata: ActiveCallMetadata(type: "video"), participants: []
        )
        #expect(video.callKind == .video)
        #expect(video.isVideo == true)
        #expect(video.modeKind == .p2p)
        #expect(video.statusKind == .ringing)

        let bare = ActiveCallSession(id: "a2", conversationId: "conv1", mode: "p2p", status: "active", metadata: nil, participants: [])
        #expect(bare.callKind == .unknown)
    }
}
