import XCTest
@testable import MeeshyUI

/// #11041 — l'ouverture d'une fenêtre PiP vient de DEUX sources : un toucher
/// (`requested`) ou le système qui part en PiP automatique quand on quitte
/// l'app (`systemWillStart`). Le garde d'arrière-plan doit voir la seconde dès
/// `willStart`, sans attendre `didStart`, sinon il met en pause une fenêtre en
/// train de s'ouvrir.
final class PipStartLedgerTests: XCTestCase {

    func test_systemWillStart_marksTheWindowAsStarting() {
        var ledger = PipStartLedger()
        ledger.systemWillStart()
        XCTAssertTrue(ledger.isStarting)
        XCTAssertFalse(ledger.hasFailed)
    }

    func test_didStart_endsTheStartingPhase() {
        var ledger = PipStartLedger()
        ledger.systemWillStart()
        ledger.didStart()
        XCTAssertFalse(ledger.isStarting)
    }

    func test_failedToStart_afterSystemStart_recordsTheFailureWithoutHalting() {
        var ledger = PipStartLedger()
        ledger.systemWillStart()
        let halts = ledger.failedToStart()
        XCTAssertFalse(halts, "Un auto-PiP raté ne demande pas l'arrêt : c'est le garde d'arrière-plan qui tranche")
        XCTAssertFalse(ledger.isStarting)
        XCTAssertTrue(ledger.hasFailed)
    }

    func test_failedToStart_afterARequestThatHalts_haltsPlayback() {
        var ledger = PipStartLedger()
        ledger.requested(haltsOnFailure: true)
        ledger.systemWillStart()
        XCTAssertTrue(ledger.failedToStart(),
            "willStart d'une demande manuelle ne doit pas effacer « la surface s'est fermée derrière sa demande »")
    }

    func test_aNewStart_clearsAPreviousFailure() {
        var ledger = PipStartLedger()
        ledger.systemWillStart()
        _ = ledger.failedToStart()
        ledger.systemWillStart()
        XCTAssertFalse(ledger.hasFailed)
    }

    func test_failureCount_neverGoesBack_soAWaitIgnoresAStaleFailure() {
        var ledger = PipStartLedger()
        ledger.requested(haltsOnFailure: false)
        _ = ledger.failedToStart()
        ledger.reset()
        XCTAssertFalse(ledger.hasFailed)
        XCTAssertFalse(ledger.isStarting)
        XCTAssertEqual(ledger.failureCount, 1)
        ledger.systemWillStart()
        _ = ledger.failedToStart()
        XCTAssertEqual(ledger.failureCount, 2)
    }

    func test_stopped_endsAnyPendingStart() {
        var ledger = PipStartLedger()
        ledger.requested(haltsOnFailure: true)
        ledger.stopped()
        XCTAssertFalse(ledger.isStarting)
        XCTAssertFalse(ledger.failedToStart())
    }
}
