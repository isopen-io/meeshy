import XCTest
@testable import MeeshySDK

/// Source-level guards for `MessageSocketManager` call emit methods and
/// call event publishers.  These can't be behavioral tests because there's
/// no Socket.IO mock — the socket is a concrete third-party client.
/// Each guard pins the exact event name and payload key so a rename or
/// typo is caught at the test layer rather than at runtime.
///
/// Two families:
///  1. **Emit guards** — verify `socket?.emit("call:X", [...])` contains
///     the expected event string and required payload keys.
///  2. **Publisher guards** — verify each incoming `call:*` event registration
///     calls the corresponding `PassthroughSubject.send()`.
final class CallEmitSourceGuardTests: XCTestCase {

    private func managerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Sockets/MessageSocketManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Emit: call:join

    func test_emitCallJoin_emitsCorrectEventWithCallId() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("socket?.emit(\"call:join\", [\"callId\": callId])"),
            "emitCallJoin must emit 'call:join' with {callId} payload — any rename breaks gateway handler"
        )
    }

    // MARK: - Emit: call:leave

    func test_emitCallLeave_emitsCorrectEventWithCallId() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("socket?.emit(\"call:leave\", [\"callId\": callId])"),
            "emitCallLeave must emit 'call:leave' with {callId} payload"
        )
    }

    // MARK: - Emit: call:request-ice-servers

    func test_emitRequestIceServers_emitsCorrectEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("socket?.emit(\"call:request-ice-servers\", [\"callId\": callId])"),
            "emitRequestIceServers must emit 'call:request-ice-servers' with {callId}"
        )
    }

    // MARK: - Emit: call:toggle-audio

    func test_emitCallToggleAudio_emitsCorrectEventWithEnabled() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("socket?.emit(\"call:toggle-audio\", [\"callId\": callId, \"enabled\": enabled])"),
            "emitCallToggleAudio must emit 'call:toggle-audio' with {callId, enabled}"
        )
    }

    // MARK: - Emit: call:toggle-video

    func test_emitCallToggleVideo_emitsCorrectEventWithEnabled() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("socket?.emit(\"call:toggle-video\", [\"callId\": callId, \"enabled\": enabled])"),
            "emitCallToggleVideo must emit 'call:toggle-video' with {callId, enabled}"
        )
    }

    // MARK: - Emit: call:end

    func test_emitCallEnd_emitsCorrectEventWithCallId() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("socket?.emit(\"call:end\", [\"callId\": callId])"),
            "emitCallEnd must emit 'call:end' with {callId}"
        )
    }

    // MARK: - Emit: call:heartbeat

    func test_emitCallHeartbeat_emitsCorrectEventWithCallId() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("socket?.emit(\"call:heartbeat\", [\"callId\": callId])"),
            "emitCallHeartbeat must emit 'call:heartbeat' with {callId}"
        )
    }

    // MARK: - Emit: call:quality-report

    func test_emitCallQualityReport_emitsWithStatsWrapper() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("socket?.emit(\"call:quality-report\", [\"callId\": callId, \"stats\": stats])"),
            "emitCallQualityReport must emit 'call:quality-report' with {callId, stats} — " +
            "gateway unwraps stats.rtt / stats.packetLoss"
        )
    }

    func test_emitCallQualityReport_statsContainsRttAndPacketLoss() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("\"rtt\": rtt"),
            "quality-report stats payload must include 'rtt' key"
        )
        XCTAssertTrue(
            src.contains("\"packetLoss\": packetLoss"),
            "quality-report stats payload must include 'packetLoss' key"
        )
    }

    // MARK: - Emit: call:reconnecting

    func test_emitCallReconnecting_emitsWithParticipantIdAndAttempt() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("socket?.emit(\"call:reconnecting\","),
            "emitCallReconnecting must emit 'call:reconnecting'"
        )
        XCTAssertTrue(
            src.contains("\"participantId\": participantId") && src.contains("\"attempt\": attempt"),
            "call:reconnecting payload must include participantId and attempt"
        )
    }

    // MARK: - Emit: call:reconnected

    func test_emitCallReconnected_emitsWithParticipantId() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("socket?.emit(\"call:reconnected\","),
            "emitCallReconnected must emit 'call:reconnected'"
        )
        XCTAssertTrue(
            src.contains("\"participantId\": participantId"),
            "call:reconnected payload must include participantId"
        )
    }

    // MARK: - Emit: call:signal

    func test_emitCallSignal_emitsWithSignalWrapper() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("socket?.emit(\"call:signal\", [\"callId\": callId, \"signal\": signal])"),
            "emitCallSignal must emit 'call:signal' with {callId, signal}"
        )
    }

    // MARK: - Publisher: incoming call events

    func test_callOfferReceived_publisherFiredOnSocketEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("self?.callOfferReceived.send("),
            "callOfferReceived publisher must be fired when 'call:*' offer event arrives from gateway"
        )
    }

    func test_callAnswerReceived_publisherFiredOnSocketEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("self?.callAnswerReceived.send("),
            "callAnswerReceived publisher must be fired when gateway relays the remote SDP answer"
        )
    }

    func test_callICECandidateReceived_publisherFiredOnSocketEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("self?.callICECandidateReceived.send("),
            "callICECandidateReceived publisher must be fired for each trickle ICE candidate"
        )
    }

    func test_callEnded_publisherFiredOnSocketEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("self?.callEnded.send("),
            "callEnded publisher must be fired when gateway emits call:ended"
        )
    }

    func test_callMissed_publisherFiredOnSocketEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("self?.callMissed.send("),
            "callMissed publisher must be fired when gateway emits call:missed"
        )
    }

    func test_callAlreadyAnswered_publisherFiredOnSocketEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("self?.callAlreadyAnswered.send("),
            "callAlreadyAnswered publisher must be fired so CallKit CallAction can be un-fulfilled"
        )
    }

    func test_callParticipantJoined_publisherFiredOnSocketEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("self.callParticipantJoined.send(") || src.contains("self?.callParticipantJoined.send("),
            "callParticipantJoined publisher must be fired when a participant joins the call"
        )
    }

    func test_callParticipantLeft_publisherFiredOnSocketEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("self?.callParticipantLeft.send("),
            "callParticipantLeft publisher must be fired when a participant leaves the call"
        )
    }

    func test_callMediaToggled_publisherFiredOnSocketEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("self?.callMediaToggled.send("),
            "callMediaToggled publisher must be fired so UI can reflect remote mute/video state"
        )
    }

    func test_callError_publisherFiredOnSocketEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("self?.callError.send("),
            "callError publisher must be fired on gateway call:error so CallManager can present UI"
        )
    }

    func test_callIceServersRefreshed_publisherFiredOnSocketEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("self?.callIceServersRefreshed.send("),
            "callIceServersRefreshed publisher must be fired so CallManager can update TURN credentials"
        )
    }

    func test_callQualityAlert_publisherFiredOnSocketEvent() throws {
        let src = try managerSource()
        XCTAssertTrue(
            src.contains("self?.callQualityAlert.send("),
            "callQualityAlert publisher must be fired on call:quality-alert so CallManager can set isRemoteQualityDegraded"
        )
    }
}
