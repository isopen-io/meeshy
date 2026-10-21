import XCTest
@testable import Meeshy

final class CallErrorDispositionTests: XCTestCase {
    private func resolve(
        code: String? = nil,
        errorCallId: String? = nil,
        currentCallId: String? = "call-1",
        isTransientDuringResume: Bool = false,
        callIsActive: Bool = true
    ) -> CallErrorDisposition {
        CallErrorDisposition.resolve(
            code: code,
            errorCallId: errorCallId,
            currentCallId: currentCallId,
            isTransientDuringResume: isTransientDuringResume,
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
}
