import XCTest
import CoreMedia
@testable import Meeshy

private struct EmptyHook: MediaPipelineHook {
    let identifier = "test.empty"
}

@MainActor
final class MediaPipelineHookTests: XCTestCase {

    func test_callContext_initStoresAllFields() {
        let context = CallContext(callId: "abc123", isVideo: true, role: .caller, peerId: "peer1")
        XCTAssertEqual(context.callId, "abc123")
        XCTAssertTrue(context.isVideo)
        XCTAssertEqual(context.role, .caller)
        XCTAssertEqual(context.peerId, "peer1")
    }

    func test_callRole_callerNotEqualCallee() {
        XCTAssertNotEqual(CallRole.caller, CallRole.callee)
    }

    func test_emptyHook_defaultImplementations_areNoop() async {
        let hook = EmptyHook()
        let context = CallContext(callId: "x", isVideo: false, role: .caller, peerId: nil)
        var config = CallMediaConfig()
        try? await hook.willConfigure(call: context, config: &config)
        // No assertion: default impl is a no-op; we verify it doesn't throw or mutate.
        XCTAssertEqual(config.audio.maxBitrateBps, 64_000)
    }
}
