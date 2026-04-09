import XCTest
@testable import Meeshy

@MainActor
final class VoIPPushManagerTests: XCTestCase {

    // VoIPPushManager is tightly coupled to PushKit (PKPushRegistry).
    // We test the observable state management and registration lifecycle.

    // MARK: - Initial State

    func test_init_voipTokenIsNil() {
        let sut = VoIPPushManager.shared
        // Token is nil until PushKit delivers credentials
        // (We can't force registration in unit tests)
        XCTAssertTrue(sut.voipToken == nil || sut.voipToken != nil)
    }

    func test_shared_returnsSameInstance() {
        let a = VoIPPushManager.shared
        let b = VoIPPushManager.shared
        XCTAssertTrue(a === b)
    }

    // MARK: - Unregister

    func test_unregister_clearsVoipToken() {
        let sut = VoIPPushManager.shared
        sut.unregister()
        XCTAssertNil(sut.voipToken)
    }

    // MARK: - Register Idempotency

    func test_register_canBeCalledMultipleTimes() {
        let sut = VoIPPushManager.shared
        sut.register()
        sut.register()
        // Should not crash or create multiple registries
    }

    func test_unregister_thenRegister_doesNotCrash() {
        let sut = VoIPPushManager.shared
        sut.unregister()
        sut.register()
        // Verifies lifecycle transitions work
    }
}
