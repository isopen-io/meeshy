import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class VoiceConsentGateTests: XCTestCase {

    private struct ConsentRouteDown: Error {}

    func test_isKnownGranted_readsConfirmedPreference() {
        XCTAssertTrue(VoiceConsentGate(knownGranted: { true }).isKnownGranted)
        XCTAssertFalse(VoiceConsentGate(knownGranted: { false }).isKnownGranted)
    }

    func test_fetchMissing_mapsHasConsentFalseToTrue_andErrorToFalse() async {
        let withoutConsent = await VoiceConsentGate(fetchHasConsent: { false }).fetchMissing()
        let withConsent = await VoiceConsentGate(fetchHasConsent: { true }).fetchMissing()
        let onFailure = await VoiceConsentGate(fetchHasConsent: { throw ConsentRouteDown() }).fetchMissing()

        XCTAssertTrue(withoutConsent)
        XCTAssertFalse(withConsent)
        XCTAssertFalse(onFailure, "fail-safe : on ne redemande pas un consentement sur une panne réseau")
    }

    func test_grant_propagatesThrowingRoute() async {
        let gate = VoiceConsentGate(route: { throw ConsentRouteDown() })

        do {
            try await gate.grant()
            XCTFail("l'échec de la route d'octroi doit remonter")
        } catch {
            XCTAssertTrue(error is ConsentRouteDown)
        }
    }
}
