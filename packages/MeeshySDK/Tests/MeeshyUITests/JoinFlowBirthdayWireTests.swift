import XCTest
@testable import MeeshyUI

/// #6611 — la date de naissance d'une adhésion anonyme part vers la passerelle
/// comme une date-heure (`POST /anonymous/join/:linkId`, `z.iso.datetime()` +
/// `format: 'date-time'`) : le même contrat que toute date du fil, donc `WireDate`.
final class JoinFlowBirthdayWireTests: XCTestCase {

    private static let naissance = Date(timeIntervalSince1970: 1_789_464_863.563)

    func test_birthdayField_requis_voyageEnDateHeureAMillisecondes() {
        XCTAssertEqual(
            JoinFlowViewModel.birthdayField(Self.naissance, required: true),
            "2026-09-15T09:34:23.563Z"
        )
    }

    func test_birthdayField_nonRequis_neVoyagePas() {
        XCTAssertNil(JoinFlowViewModel.birthdayField(Self.naissance, required: false))
    }
}
