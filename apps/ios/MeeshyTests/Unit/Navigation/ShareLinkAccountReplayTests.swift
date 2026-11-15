import XCTest
@testable import Meeshy
import MeeshySDK

/// « Se connecter » / « Créer un compte » depuis une invitation (#7795) : le
/// lien ne doit pas se perdre en route vers le compte.
@MainActor
final class ShareLinkAccountReplayTests: XCTestCase {

    func test_requestAccount_asksForTheAccountScreen_withoutNavigatingYet() {
        let router = DeepLinkRouter()

        router.requestAccount(.signUp, forShareLink: "mshy_abc")

        XCTAssertEqual(router.requestedAccountEntry, .signUp)
        XCTAssertEqual(router.shareLinkAwaitingAccount, "mshy_abc")
        XCTAssertNil(router.pendingDeepLink)
    }

    func test_replay_onceTheAccountExists_turnsTheInvitationBackIntoADestination() {
        let router = DeepLinkRouter()
        router.requestAccount(.signIn, forShareLink: "mshy_abc")

        router.replayShareLinkAwaitingAccount()

        XCTAssertEqual(router.pendingDeepLink, .chatLink(identifier: "mshy_abc"))
        XCTAssertNil(router.shareLinkAwaitingAccount)
    }

    func test_replay_withoutAPendingInvitation_doesNothing() {
        let router = DeepLinkRouter()

        router.replayShareLinkAwaitingAccount()

        XCTAssertNil(router.pendingDeepLink)
    }
}
