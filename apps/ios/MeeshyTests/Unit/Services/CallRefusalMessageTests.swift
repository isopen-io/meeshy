import XCTest
@testable import Meeshy

/// « Appels hors contacts » (#8073) — l'appelant refusé lit un motif clair,
/// dans SA langue, jamais la phrase anglaise de la passerelle.
final class CallRefusalMessageTests: XCTestCase {

    func test_localized_calleeRefusesNonContacts_returnsTheLocalizedReason() {
        let message = CallRefusalMessage.localized(forCode: "CALLEE_REFUSES_NON_CONTACTS")

        XCTAssertEqual(
            message,
            String(localized: "call.error.callee_refuses_non_contacts", defaultValue: "Cette personne n'accepte que les appels de ses contacts", bundle: .main)
        )
    }

    func test_localized_unknownCode_returnsNil() {
        XCTAssertNil(CallRefusalMessage.localized(forCode: "RATE_LIMIT_EXCEEDED"))
    }

    func test_localized_nilCode_returnsNil() {
        XCTAssertNil(CallRefusalMessage.localized(forCode: nil))
    }
}
