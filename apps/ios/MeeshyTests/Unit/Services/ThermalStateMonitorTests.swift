import XCTest
@testable import Meeshy

final class ThermalStateMonitorTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT() -> ThermalStateMonitor {
        let monitor = ThermalStateMonitor()
        return monitor
    }

    // MARK: - Initial State

    func test_init_currentStateIsNominal() {
        let sut = makeSUT()
        XCTAssertEqual(sut.currentState, .nominal)
    }

    func test_init_delegateIsNil() {
        let sut = makeSUT()
        XCTAssertNil(sut.delegate)
    }

    // MARK: - Recommended Max FPS

    func test_recommendedMaxFps_nominal_returns30() {
        let sut = makeSUT()
        // Default state is nominal
        XCTAssertEqual(sut.recommendedMaxFps, 30)
    }

    // MARK: - Recommended Max Resolution

    func test_recommendedMaxResolution_nominal_returns720p() {
        let sut = makeSUT()
        let resolution = sut.recommendedMaxResolution
        XCTAssertEqual(resolution.width, 1280)
        XCTAssertEqual(resolution.height, 720)
    }

    // MARK: - Should Disable Video

    func test_shouldDisableVideo_nominal_returnsFalse() {
        let sut = makeSUT()
        XCTAssertFalse(sut.shouldDisableVideo)
    }

    // MARK: - Start / Stop Monitoring

    func test_startMonitoring_setsCurrentStateFromProcessInfo() {
        let sut = makeSUT()
        sut.startMonitoring()
        // After starting, currentState should reflect actual device thermal state
        // In simulator this is always .nominal
        XCTAssertEqual(sut.currentState, ProcessInfo.processInfo.thermalState)
        sut.stopMonitoring()
    }

    func test_stopMonitoring_doesNotCrash() {
        let sut = makeSUT()
        sut.startMonitoring()
        sut.stopMonitoring()
        // Should not crash if called without startMonitoring
        sut.stopMonitoring()
    }

    // MARK: - Delegate

    func test_delegate_canBeSet() {
        let sut = makeSUT()
        let delegate = MockThermalDelegate()
        sut.delegate = delegate
        XCTAssertNotNil(sut.delegate)
    }

    func test_delegate_isWeakReference() {
        let sut = makeSUT()
        var delegate: MockThermalDelegate? = MockThermalDelegate()
        sut.delegate = delegate
        delegate = nil
        XCTAssertNil(sut.delegate)
    }
}

// MARK: - Mock Delegate

private final class MockThermalDelegate: ThermalStateMonitorDelegate {
    var lastState: ProcessInfo.ThermalState?
    var callCount = 0

    func thermalStateDidChange(to state: ProcessInfo.ThermalState) {
        lastState = state
        callCount += 1
    }
}
