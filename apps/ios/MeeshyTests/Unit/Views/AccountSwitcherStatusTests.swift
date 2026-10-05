import XCTest
import MeeshySDK
@testable import Meeshy

/// « Changer de compte » (#8286) — ce que chaque rangée de la liste des comptes
/// DIT, et la remise d'une intention à l'écran de connexion.
@MainActor
final class AccountSwitcherStatusTests: XCTestCase {

    private func account(_ id: String) -> SavedAccount {
        SavedAccount(id: id, username: id, displayName: nil, avatarURL: nil, lastActiveAt: Date())
    }

    func test_status_activeAccount_isCurrent_evenWhenPreserved() {
        XCTAssertEqual(SavedAccountStatus.of(account("a"), activeId: "a", isPreserved: true), .current)
    }

    func test_status_preservedOtherAccount_isSignedIn() {
        XCTAssertEqual(SavedAccountStatus.of(account("b"), activeId: "a", isPreserved: true), .signedIn)
    }

    func test_status_accountWithoutSession_isSignedOut() {
        XCTAssertEqual(SavedAccountStatus.of(account("b"), activeId: "a", isPreserved: false), .signedOut)
    }

    func test_status_onlyAPreservedAccount_opensWithoutPassword() {
        XCTAssertTrue(SavedAccountStatus.signedIn.opensWithoutPassword)
        XCTAssertFalse(SavedAccountStatus.signedOut.opensWithoutPassword)
        XCTAssertFalse(SavedAccountStatus.current.opensWithoutPassword)
    }

    func test_handoff_isTakenOnce() {
        let handoff = LoginAccountHandoff()
        handoff.hold(.account(id: "b"))

        XCTAssertEqual(handoff.take(), .account(id: "b"))
        XCTAssertNil(handoff.take(), "une intention ne sert qu'une fois : la connexion suivante part du sélecteur")
    }
}
