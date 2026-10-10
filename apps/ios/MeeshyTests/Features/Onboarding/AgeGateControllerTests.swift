import XCTest
import MeeshySDK
@testable import Meeshy

/// #9929 — un compte de moins de 13 ans reçoit 403 `AGE_BELOW_MINIMUM` à la
/// connexion et au rafraîchissement du jeton. L'app montre alors l'écran
/// « Meeshy est réservé aux 13 ans et plus », et rien d'autre.
@MainActor
final class AgeGateControllerTests: XCTestCase {

    private final class SignOutSpy {
        var callCount = 0
    }

    private func makeSUT(isAuthenticated: Bool) -> (AgeGateController, NotificationCenter, SignOutSpy) {
        let center = NotificationCenter()
        let spy = SignOutSpy()
        let sut = AgeGateController(
            center: center,
            isAuthenticated: { isAuthenticated },
            signOut: { spy.callCount += 1 }
        )
        return (sut, center, spy)
    }

    private func awaitShowing(_ sut: AgeGateController) async {
        for _ in 0..<50 where !sut.isShowing {
            await Task.yield()
        }
    }

    private var ageRefusalBody: Data {
        Data(#"{"success":false,"error":"Âge","code":"AGE_BELOW_MINIMUM"}"#.utf8)
    }

    func test_init_isNotShowing() {
        let (sut, _, _) = makeSUT(isAuthenticated: false)

        XCTAssertFalse(sut.isShowing)
    }

    func test_ageRefusalOnSignIn_showsTheGate() async {
        let (sut, center, _) = makeSUT(isAuthenticated: false)

        AgeGateSignal.signal(statusCode: 403, body: ageRefusalBody, center: center)
        await awaitShowing(sut)

        XCTAssertTrue(sut.isShowing)
    }

    func test_otherForbiddenRefusal_keepsTheGateHidden() async {
        let (sut, center, _) = makeSUT(isAuthenticated: false)

        AgeGateSignal.signal(statusCode: 403, body: Data(#"{"code":"USER_BLOCKED"}"#.utf8), center: center)
        for _ in 0..<10 { await Task.yield() }

        XCTAssertFalse(sut.isShowing)
    }

    func test_acknowledge_signedOut_hidesWithoutSigningOutAgain() async {
        let (sut, center, spy) = makeSUT(isAuthenticated: false)
        AgeGateSignal.signal(statusCode: 403, body: ageRefusalBody, center: center)
        await awaitShowing(sut)

        await sut.acknowledge()

        XCTAssertFalse(sut.isShowing)
        XCTAssertEqual(spy.callCount, 0)
    }

    func test_acknowledge_stillAuthenticated_closesTheSession() async {
        let (sut, center, spy) = makeSUT(isAuthenticated: true)
        AgeGateSignal.signal(statusCode: 403, body: ageRefusalBody, center: center)
        await awaitShowing(sut)

        await sut.acknowledge()

        XCTAssertEqual(spy.callCount, 1)
    }

    func test_acknowledge_whenNotShowing_doesNothing() async {
        let (sut, _, spy) = makeSUT(isAuthenticated: true)

        await sut.acknowledge()

        XCTAssertEqual(spy.callCount, 0)
    }
}
