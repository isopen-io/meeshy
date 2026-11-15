import XCTest
@testable import Meeshy

/// **Rien ne chauffe** (#9349, spec § 5) : chaque palier thermique fixe ce que
/// l'aperçu et la bande ont le droit de coûter.
@MainActor
final class ComposerThermalBudgetTests: XCTestCase {

    func test_budget_eachThermalTier_matchesTheSpecTable() {
        XCTAssertEqual(ComposerThermalBudget.budget(for: .nominal),
                       ComposerThermalBudget(previewFPS: 30, thumbnailFPS: 12, thumbnailCells: 8,
                                             surfaceScale: 1, systemLayerOnly: false))
        XCTAssertEqual(ComposerThermalBudget.budget(for: .fair),
                       ComposerThermalBudget(previewFPS: 24, thumbnailFPS: 6, thumbnailCells: 5,
                                             surfaceScale: 1, systemLayerOnly: false))
        XCTAssertEqual(ComposerThermalBudget.budget(for: .serious),
                       ComposerThermalBudget(previewFPS: 15, thumbnailFPS: 0, thumbnailCells: 5,
                                             surfaceScale: 0.75, systemLayerOnly: false))
        XCTAssertEqual(ComposerThermalBudget.budget(for: .critical),
                       ComposerThermalBudget(previewFPS: 0, thumbnailFPS: 0, thumbnailCells: 0,
                                             surfaceScale: 1, systemLayerOnly: true))
    }

    func test_whileRecording_onlyTheChosenThumbnailLives() {
        XCTAssertEqual(ComposerThermalBudget.budget(for: .nominal).whileRecording().thumbnailCells, 1)
        XCTAssertEqual(ComposerThermalBudget.budget(for: .critical).whileRecording().thumbnailCells, 0)
    }

    func test_session_followsTheInjectedThermalState() {
        let thermique = MockThermalStateMonitor(state: .fair)
        let session = ComposerCaptureSession(thermal: thermique)
        session.watchThermalState()
        XCTAssertEqual(thermique.startCount, 1)
        XCTAssertEqual(session.thermalBudget.previewFPS, 24)
        thermique.emit(.critical)
        XCTAssertTrue(session.thermalBudget.systemLayerOnly)
        session.disarm()
        XCTAssertEqual(thermique.stopCount, 1, "le viseur fermé ne guette plus la température")
    }

    /// La prise posée ferme la session sans passer par `disarm` : elle cesse
    /// aussi de guetter la température, sinon l'observateur survit au viseur.
    func test_finishCapture_stopsWatchingTheThermalState() {
        let thermique = MockThermalStateMonitor(state: .nominal)
        let session = ComposerCaptureSession(thermal: thermique)
        session.watchThermalState()
        session.finishCapture()
        XCTAssertEqual(thermique.stopCount, 1, "la prise posée ne guette plus la température")
        thermique.emit(.critical)
        XCTAssertFalse(session.thermalBudget.systemLayerOnly, "un palier émis après la prise ne touche plus le budget")
    }
}

/// La cible de tests compile en isolation `nonisolated` par défaut (`project.yml`) :
/// le double d'un protocole de l'app (isolé MainActor) se déclare `@MainActor`.
@MainActor
final class MockThermalStateMonitor: ThermalStateMonitorProviding {
    var currentState: ProcessInfo.ThermalState
    var onStateChange: ((ProcessInfo.ThermalState) -> Void)?
    private(set) var startCount = 0
    private(set) var stopCount = 0

    nonisolated deinit {}

    init(state: ProcessInfo.ThermalState) { currentState = state }

    func startMonitoring() { startCount += 1 }
    func stopMonitoring() { stopCount += 1 }

    func emit(_ state: ProcessInfo.ThermalState) {
        currentState = state
        onStateChange?(state)
    }
}
