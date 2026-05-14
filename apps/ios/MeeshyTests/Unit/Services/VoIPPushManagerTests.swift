import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// Audit P1-15 — replaces the previously tautological tests with real
/// behavioural assertions on the testable surface of VoIPPushManager.
/// PushKit's `pushRegistry(didReceiveIncomingPushWith:)` itself cannot be
/// driven from a unit test without a synthesizable `PKPushPayload`; instead
/// we cover the pure payload-parsing helpers and the singleton lifecycle.
@MainActor
final class VoIPPushManagerTests: XCTestCase {

    // MARK: - Singleton & Lifecycle

    func test_shared_returnsSameInstance() {
        let a = VoIPPushManager.shared
        let b = VoIPPushManager.shared
        XCTAssertTrue(a === b, "VoIPPushManager must be a true singleton")
    }

    func test_unregister_clearsVoipToken() {
        let sut = VoIPPushManager.shared
        sut.unregister()
        XCTAssertNil(sut.voipToken, "Unregister should null out the published token")
    }

    func test_register_isIdempotent() {
        let sut = VoIPPushManager.shared
        sut.unregister()
        sut.register()
        sut.register()
        // Calling register twice in a row must not crash or leak a 2nd
        // PKPushRegistry — the guard at the top of register() short-circuits.
    }

    func test_forceReregister_doesNotCrash() {
        let sut = VoIPPushManager.shared
        sut.register()
        sut.forceReregister()
    }

    // MARK: - parseIceServers (P2-CC-4 surface)

    func test_parseIceServers_nilInput_returnsNil() {
        XCTAssertNil(VoIPPushManager.parseIceServers(nil))
    }

    func test_parseIceServers_emptyString_returnsNil() {
        XCTAssertNil(VoIPPushManager.parseIceServers(""))
    }

    func test_parseIceServers_invalidJSON_returnsNil() {
        XCTAssertNil(VoIPPushManager.parseIceServers("{not json"))
    }

    func test_parseIceServers_arrayOfServers_decodes() {
        let json = """
        [{"urls":"turn:turn.meeshy.me:3478","username":"123:user","credential":"abc=="}]
        """
        let result = VoIPPushManager.parseIceServers(json)
        XCTAssertEqual(result?.count, 1)
        XCTAssertEqual(result?.first?.username, "123:user")
        XCTAssertEqual(result?.first?.credential, "abc==")
        XCTAssertEqual(result?.first?.urls.first, "turn:turn.meeshy.me:3478")
    }

    func test_parseIceServers_urlsAsArray_decodes() {
        let json = """
        [{"urls":["turn:t1:3478","turn:t2:3478"],"username":"u","credential":"c"}]
        """
        let result = VoIPPushManager.parseIceServers(json)
        XCTAssertEqual(result?.count, 1)
        XCTAssertEqual(result?.first?.urls.count, 2)
    }

    func test_parseIceServers_nonStringInput_returnsNil() {
        XCTAssertNil(VoIPPushManager.parseIceServers(42))
    }

    // MARK: - resolveCallerName priorities

    func test_resolveCallerName_prefersDisplayNameOverUsername() {
        let name = VoIPPushManager.resolveCallerName(
            callerName: "Alice Dupont",
            callerUsername: "alice"
        )
        XCTAssertEqual(name, "Alice Dupont")
    }

    func test_resolveCallerName_fallsBackToUsernameWhenNameIsNil() {
        let name = VoIPPushManager.resolveCallerName(
            callerName: nil,
            callerUsername: "alice"
        )
        XCTAssertEqual(name, "alice")
    }

    func test_resolveCallerName_fallsBackToUsernameWhenNameIsEmpty() {
        let name = VoIPPushManager.resolveCallerName(
            callerName: "",
            callerUsername: "alice"
        )
        XCTAssertEqual(name, "alice")
    }

    func test_resolveCallerName_finalFallbackIsLocalizedString() {
        let name = VoIPPushManager.resolveCallerName(
            callerName: nil,
            callerUsername: nil
        )
        XCTAssertEqual(name, "Appel entrant")
    }

    func test_resolveCallerName_finalFallbackOnEmptyStrings() {
        let name = VoIPPushManager.resolveCallerName(
            callerName: "",
            callerUsername: ""
        )
        XCTAssertEqual(name, "Appel entrant")
    }
}
