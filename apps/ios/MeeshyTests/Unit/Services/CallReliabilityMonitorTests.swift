import XCTest
@testable import Meeshy

/// `CallReliabilityMonitor` possède la tâche du moniteur de fiabilité (#11522) :
/// un démarrage remplace le précédent, l'arrêt le retire, et sans appel attaché
/// la tâche ne touche à rien.
@MainActor
final class CallReliabilityMonitorTests: XCTestCase {

    func test_startingTwice_keepsOneRunningMonitor_andStoppingRemovesIt() {
        let monitor = CallReliabilityMonitor()
        monitor.startReliabilityMonitor()
        monitor.startReliabilityMonitor()
        XCTAssertTrue(monitor.isRunning)

        monitor.stopReliabilityMonitor()

        XCTAssertFalse(monitor.isRunning)
    }
}
