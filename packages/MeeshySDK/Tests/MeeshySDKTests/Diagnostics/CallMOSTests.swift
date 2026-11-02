import XCTest
@testable import MeeshySDK

/// #11294 — **un MOS résume la qualité d'un appel** : l'E-model simplifié de
/// l'UIT-T G.107, sur le délai (aller-retour, gigue) et la perte.
final class CallMOSTests: XCTestCase {

    func test_estimate_aCleanLink_isExcellent() {
        XCTAssertGreaterThan(CallMOS.estimate(roundTripTimeMs: 0, jitterMs: 0, packetLossPercent: 0), 4.3)
    }

    func test_estimate_aTypicalMobileLink_isGood() {
        let mos = CallMOS.estimate(roundTripTimeMs: 200, jitterMs: 20, packetLossPercent: 2)
        XCTAssertEqual(mos, 3.76, accuracy: 0.05)
    }

    func test_estimate_aBrokenLink_isBad() {
        XCTAssertLessThan(CallMOS.estimate(roundTripTimeMs: 600, jitterMs: 50, packetLossPercent: 10), 1.5)
    }

    func test_estimate_fallsAsLossRises() {
        let pertes = [0.0, 1, 3, 8, 20].map { CallMOS.estimate(roundTripTimeMs: 100, jitterMs: 10, packetLossPercent: $0) }
        XCTAssertEqual(pertes, pertes.sorted(by: >))
        XCTAssertEqual(Set(pertes).count, pertes.count, "chaque palier de perte se voit")
    }

    func test_estimate_fallsAsDelayRises() {
        let delais = [50.0, 200, 400, 800].map { CallMOS.estimate(roundTripTimeMs: $0, jitterMs: 10, packetLossPercent: 1) }
        XCTAssertEqual(delais, delais.sorted(by: >))
    }

    /// La passerelle refuse un MOS hors de [1, 5] : l'estimation n'en sort jamais,
    /// même sur des mesures aberrantes.
    func test_estimate_staysWithinTheRangeTheGatewayAccepts() {
        let extremes = [
            CallMOS.estimate(roundTripTimeMs: -50, jitterMs: -1, packetLossPercent: -3),
            CallMOS.estimate(roundTripTimeMs: 100_000, jitterMs: 10_000, packetLossPercent: 100),
            CallMOS.estimate(roundTripTimeMs: .nan, jitterMs: 0, packetLossPercent: 0),
        ]
        extremes.forEach {
            XCTAssertGreaterThanOrEqual($0, 1)
            XCTAssertLessThanOrEqual($0, 4.5)
        }
    }
}
