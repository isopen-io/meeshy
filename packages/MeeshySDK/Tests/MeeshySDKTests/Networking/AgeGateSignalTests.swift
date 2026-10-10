import XCTest
@testable import MeeshySDK

/// #9929 — un 403 `AGE_BELOW_MINIMUM` (connexion, lien magique,
/// rafraîchissement) appelle l'écran « Meeshy est réservé aux 13 ans et
/// plus ». Le transport le signale ; tout autre refus passe sans bruit.
final class AgeGateSignalTests: XCTestCase {

    private final class Counter: @unchecked Sendable {
        var count = 0
    }

    private func observe(_ center: NotificationCenter) -> (Counter, NSObjectProtocol) {
        let counter = Counter()
        let token = center.addObserver(forName: .meeshyAgeBelowMinimum, object: nil, queue: nil) { _ in
            counter.count += 1
        }
        return (counter, token)
    }

    func test_signal_forbiddenWithAgeCode_postsAndReturnsTrue() {
        let center = NotificationCenter()
        let (counter, token) = observe(center)
        defer { center.removeObserver(token) }

        let signalled = AgeGateSignal.signal(
            statusCode: 403,
            body: Data(#"{"success":false,"error":"Âge","code":"AGE_BELOW_MINIMUM"}"#.utf8),
            center: center
        )

        XCTAssertTrue(signalled)
        XCTAssertEqual(counter.count, 1)
    }

    func test_signal_otherForbiddenCode_postsNothing() {
        let center = NotificationCenter()
        let (counter, token) = observe(center)
        defer { center.removeObserver(token) }

        let signalled = AgeGateSignal.signal(statusCode: 403, body: Data(#"{"code":"GLOBAL_ADULTS_ONLY"}"#.utf8), center: center)

        XCTAssertFalse(signalled)
        XCTAssertEqual(counter.count, 0)
    }

    func test_signal_ageCodeOnAnotherStatus_postsNothing() {
        let center = NotificationCenter()
        let (counter, token) = observe(center)
        defer { center.removeObserver(token) }

        let signalled = AgeGateSignal.signal(statusCode: 422, body: Data(#"{"code":"AGE_BELOW_MINIMUM"}"#.utf8), center: center)

        XCTAssertFalse(signalled)
        XCTAssertEqual(counter.count, 0)
    }

    func test_isAgeRefusal_forbiddenWithAgeCode_isTrue() {
        let error = MeeshyError.forbidden(reason: nil, body: Data(#"{"code":"AGE_BELOW_MINIMUM"}"#.utf8))
        XCTAssertTrue(AgeGateSignal.isAgeRefusal(error))
    }

    func test_isAgeRefusal_otherErrors_areFalse() {
        XCTAssertFalse(AgeGateSignal.isAgeRefusal(MeeshyError.forbidden(reason: nil, body: Data(#"{"code":"X"}"#.utf8))))
        XCTAssertFalse(AgeGateSignal.isAgeRefusal(MeeshyError.auth(.sessionExpired)))
        XCTAssertFalse(AgeGateSignal.isAgeRefusal(URLError(.timedOut)))
    }

    func test_signal_withoutBody_postsNothing() {
        let center = NotificationCenter()
        let (counter, token) = observe(center)
        defer { center.removeObserver(token) }

        XCTAssertFalse(AgeGateSignal.signal(statusCode: 403, body: nil, center: center))
        XCTAssertEqual(counter.count, 0)
    }
}
