import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// ios-systeme-6 (#18911) — le compte que désigne un toucher de bannière.
///
/// Au toucher, l'application marque la charge du compte que l'appareil désigne
/// alors : `nil` après une déconnexion, le compte persisté au lancement à froid.
/// Une charge qui NOMME son destinataire (FCM) pour un autre compte n'est
/// adressée à personne.
@MainActor
final class PushTapAddresseeTests: XCTestCase {

    func test_resolve_withASession_marksTheTapWithTheActiveAccount() {
        XCTAssertEqual(PushTapAddressee.resolve(userInfo: ["type": "message"], currentUserId: "user-B"), "user-B")
    }

    func test_resolve_withoutASession_marksNothing() {
        XCTAssertNil(PushTapAddressee.resolve(userInfo: ["type": "message"], currentUserId: nil))
    }

    func test_resolve_whenThePayloadNamesAnotherRecipient_marksNothing() {
        XCTAssertNil(PushTapAddressee.resolve(
            userInfo: ["type": "message", "recipientUserId": "user-A"], currentUserId: "user-B"))
    }

    func test_resolve_whenThePayloadNamesTheActiveAccount_marksIt() {
        XCTAssertEqual(PushTapAddressee.resolve(
            userInfo: ["type": "message", "recipientUserId": "user-B"], currentUserId: "user-B"), "user-B")
    }
}
