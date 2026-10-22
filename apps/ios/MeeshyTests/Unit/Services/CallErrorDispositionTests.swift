import XCTest
import MeeshySDK
@testable import Meeshy

final class CallErrorDispositionTests: XCTestCase {
    private func resolve(
        code: String? = nil,
        errorCallId: String? = nil,
        currentCallId: String? = "call-1",
        isTransientDuringResume: Bool = false,
        answersAccessoryRequest: Bool = false,
        callIsActive: Bool = true
    ) -> CallErrorDisposition {
        CallErrorDisposition.resolve(
            code: code,
            errorCallId: errorCallId,
            currentCallId: currentCallId,
            isTransientDuringResume: isTransientDuringResume,
            answersAccessoryRequest: answersAccessoryRequest,
            callIsActive: callIsActive
        )
    }

    func test_errorForAnotherCall_isIgnored_whateverItsCode() {
        for code in [nil, "FOO", "TARGET_NOT_FOUND", "CALL_ENDED"] as [String?] {
            XCTAssertEqual(resolve(code: code, errorCallId: "call-2", currentCallId: "call-1"), .ignore, "\(code ?? "nil")")
        }
    }

    func test_relayCodes_areNeverFatal_evenDuringAnActiveCall() {
        for code in ["INVALID_SIGNAL", "RATE_LIMIT_EXCEEDED", "TARGET_NOT_FOUND"] {
            XCTAssertEqual(resolve(code: code, callIsActive: true), .ignore, code)
        }
    }

    func test_callEnded_reconcilesToEnd_withTheErrorCallIdThenTheCurrent() {
        XCTAssertEqual(resolve(code: "CALL_ENDED", errorCallId: "call-1"), .reconcileEnd(callId: "call-1"))
        XCTAssertEqual(resolve(code: "CALL_ENDED", errorCallId: nil, currentCallId: "call-9"),
                       .reconcileEnd(callId: "call-9"))
        XCTAssertEqual(resolve(code: "CALL_ENDED", errorCallId: nil, currentCallId: nil), .ignore)
    }

    func test_transientDuringResume_isIgnored() {
        XCTAssertEqual(resolve(code: "NOT_A_PARTICIPANT", isTransientDuringResume: true), .ignore)
    }

    func test_otherCode_surfaces_andEndsOnlyAnActiveCall() {
        XCTAssertEqual(resolve(code: "ROOM_FULL", callIsActive: true), .surface(endsCall: true))
        XCTAssertEqual(resolve(code: "ROOM_FULL", callIsActive: false), .surface(endsCall: false))
    }

    func test_errorWithoutCallId_fallsThroughToPerCodeRules() {
        XCTAssertEqual(resolve(code: "TARGET_NOT_FOUND", errorCallId: nil), .ignore)
        XCTAssertEqual(resolve(code: nil, errorCallId: nil, callIsActive: true), .surface(endsCall: true))
    }

    // MARK: - #11468 — le refus d'une requête accessoire ne termine pas l'appel

    func test_refusalOfAnAccessoryRequest_neverEndsTheCall() {
        for code in ["NOT_A_PARTICIPANT", "PERMISSION_DENIED", "VALIDATION_ERROR", "CALL_STATE_CONFLICT", nil] as [String?] {
            XCTAssertEqual(
                resolve(code: code, errorCallId: "call-1", answersAccessoryRequest: true, callIsActive: true),
                .ignore, code ?? "nil"
            )
        }
    }

    func test_callEnded_stillReconciles_whileAnAccessoryRequestIsAnswered() {
        XCTAssertEqual(resolve(code: "CALL_ENDED", errorCallId: "call-1", answersAccessoryRequest: true),
                       .reconcileEnd(callId: "call-1"))
    }

    func test_unattributedRefusal_stillEndsAnActiveCall() {
        XCTAssertEqual(resolve(code: "NOT_A_PARTICIPANT", answersAccessoryRequest: false, callIsActive: true),
                       .surface(endsCall: true))
    }
}

/// #11468 — `call:error` ne nomme pas l'événement qu'il refuse : le registre des
/// requêtes accessoires émises lui en attribue une.
final class CallAccessoryRequestLedgerTests: XCTestCase {
    private let emitted = Date(timeIntervalSince1970: 1_000)

    private func ledger(_ request: CallAccessoryRequest, callId: String?) -> CallAccessoryRequestLedger {
        var ledger = CallAccessoryRequestLedger()
        ledger.record(request, callId: callId, at: emitted)
        return ledger
    }

    func test_errorShortlyAfterATurnRefresh_isAttributedToIt() {
        let sut = ledger(.turnCredentials, callId: "call-1")
        XCTAssertEqual(sut.request(answeredBy: "call-1", at: emitted.addingTimeInterval(0.3)), .turnCredentials)
        XCTAssertEqual(sut.request(answeredBy: nil, at: emitted.addingTimeInterval(0.3)), .turnCredentials,
                       "une passerelle ancienne ne nomme pas toujours l'appel")
    }

    func test_errorOfAnotherCall_isNotAttributed() {
        XCTAssertNil(ledger(.mediaToggle, callId: "call-1").request(answeredBy: "call-2", at: emitted.addingTimeInterval(0.3)))
    }

    func test_errorAfterTheWindow_isNotAttributed() {
        let late = emitted.addingTimeInterval(CallAccessoryRequestLedger.attributionWindow + 0.1)
        XCTAssertNil(ledger(.turnCredentials, callId: "call-1").request(answeredBy: "call-1", at: late))
    }

    func test_stateQuery_namesNoCall_andAnswersAnyCall() {
        XCTAssertEqual(ledger(.stateQuery, callId: nil).request(answeredBy: "call-7", at: emitted.addingTimeInterval(1)), .stateQuery)
    }

    func test_ledgerStaysBounded() {
        var sut = CallAccessoryRequestLedger()
        (0..<100).forEach { sut.record(.mediaToggle, callId: "call-1", at: emitted.addingTimeInterval(Double($0) * 0.01)) }
        XCTAssertLessThanOrEqual(sut.entries.count, 16)
    }

    func test_socketManager_recordsTheAccessoryRequestsItEmits() {
        let socket = MessageSocketManager.shared
        let callId = "ledger-\(UUID().uuidString)"
        socket.emitRequestIceServers(callId: callId)
        XCTAssertEqual(CallAccessoryRequestLog.shared.request(answeredBy: callId), .turnCredentials)
        socket.emitCallToggleVideo(callId: callId, enabled: false)
        XCTAssertEqual(CallAccessoryRequestLog.shared.request(answeredBy: callId), .mediaToggle)
    }

    func test_callErrorSink_asksTheLedgerBeforeDeciding() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager+Signaling.swift")
        XCTAssertTrue(source.contains("CallAccessoryRequestLog.shared.request(answeredBy: event.callId)"))
        XCTAssertTrue(source.contains("answersAccessoryRequest: accessoryRequest != nil"))
    }
}
