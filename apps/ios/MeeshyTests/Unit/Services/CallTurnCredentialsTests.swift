import XCTest
@testable import Meeshy

/// `CallTurnCredentials` possède l'échéance de rafraîchissement TURN et son
/// chien de garde (#11522) : planifier arme l'échéance et remet le compteur de
/// relances à zéro, annuler la retire, la fin d'appel retire tout.
@MainActor
final class CallTurnCredentialsTests: XCTestCase {

    func test_scheduling_armsTheRefresh_withAFreshRetryCounter() {
        let credentials = CallTurnCredentials()
        credentials.scheduleTURNCredentialRefresh(ttl: 600)

        XCTAssertTrue(credentials.isRefreshScheduled)
        XCTAssertFalse(credentials.isWatchdogArmed)
        XCTAssertEqual(credentials.turnRefreshRetryAttempt, 0)
        credentials.cancelAll()
    }

    func test_cancellingThePeriodicRefresh_disarmsIt() {
        let credentials = CallTurnCredentials()
        credentials.scheduleTURNCredentialRefresh(ttl: 600)

        credentials.cancelPeriodicRefresh()

        XCTAssertFalse(credentials.isRefreshScheduled)
    }

    func test_cancellingAll_leavesNothingArmed() {
        let credentials = CallTurnCredentials()
        credentials.scheduleTURNCredentialRefresh(ttl: 0)

        credentials.cancelAll()

        XCTAssertFalse(credentials.isRefreshScheduled)
        XCTAssertFalse(credentials.isWatchdogArmed)
        XCTAssertEqual(credentials.turnRefreshRetryAttempt, 0)
    }
}
