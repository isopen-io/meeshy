import XCTest
@testable import Meeshy

@MainActor
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

    // MARK: - Concurrency (source guard)

    /// Vague 100 — `startMonitoring`'s `NotificationCenter` observer closure
    /// already captures `[weak self]`, but the nested
    /// `Task { @MainActor in ... }` it hops through to reach the MainActor-
    /// isolated `thermalStateChanged()` did NOT repeat the weak capture: an
    /// unstructured `Task` closure captures whatever it references
    /// independently of its enclosing closure's capture list, so omitting
    /// `[weak self]` there re-strongly-captures `self` for the task's
    /// lifetime — this is a long-lived, repeatedly-firing observer (removed
    /// only in `stopMonitoring`), so every thermal-state notification pins a
    /// strong reference for the hop. Not behaviorally exercisable (would
    /// require driving a real `thermalStateDidChangeNotification` on a
    /// background queue), so guarded at the source level — same idiom as
    /// `P2PWebRTCClientConcurrencySourceTests`.
    func test_startMonitoring_notificationTask_capturesSelfWeakly() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/ThermalStateMonitor.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            source.contains("Task { @MainActor [weak self] in self?.thermalStateChanged() }"),
            "startMonitoring's thermal-notification Task must capture [weak self], not just the outer " +
            "NotificationCenter observer closure — an unstructured Task does not inherit its enclosing " +
            "closure's capture list."
        )
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
