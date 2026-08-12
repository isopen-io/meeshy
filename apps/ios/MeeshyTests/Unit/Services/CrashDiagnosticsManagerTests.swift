import XCTest
@testable import Meeshy

@MainActor
final class CrashDiagnosticsManagerTests: XCTestCase {

    override func tearDown() async throws {
        // Restore the default reporter between tests so leakage from one
        // test's mock can't bleed into the next assertion.
        CrashDiagnosticsManager.setReporterForTesting(NoOpCrashReporter())
        // Drain persisted diagnostic files written via `writeSync(...)`
        // (the NSException path persists on disk by design — it must
        // survive a real crash). Without this drain a sibling test that
        // boots `MeeshyApp` would consume our fake diagnostic and pop a
        // toast mid-run, contaminating `FeedbackToastManagerTests` and similar
        // singleton-state tests. The drain also clears the in-memory
        // queue so `consumePending()` is idempotent for the next test.
        _ = CrashDiagnosticsManager.shared.consumePending()
        try await super.tearDown()
    }

    // MARK: - capture(...) — MetricKit path

    func test_capture_forwardsDiagnosticToReporter() {
        let mock = MockCrashReporter()
        CrashDiagnosticsManager.setReporterForTesting(mock)

        CrashDiagnosticsManager.capture(
            kind: .crash,
            summary: "Crash exc=6 sig=5",
            details: "Stack trace blob"
        )

        XCTAssertEqual(mock.records.count, 1)
        XCTAssertEqual(mock.records.first?.kind, .crash)
        XCTAssertEqual(mock.records.first?.summary, "Crash exc=6 sig=5")
        XCTAssertEqual(mock.records.first?.details, "Stack trace blob")
    }

    func test_capture_assignsUniqueIdAndTimestampPerDiagnostic() {
        let mock = MockCrashReporter()
        CrashDiagnosticsManager.setReporterForTesting(mock)

        CrashDiagnosticsManager.capture(kind: .hang, summary: "a", details: "x")
        CrashDiagnosticsManager.capture(kind: .hang, summary: "b", details: "y")

        XCTAssertEqual(mock.records.count, 2)
        XCTAssertNotEqual(mock.records[0].id, mock.records[1].id)
    }

    func test_capture_eachKindIsForwardedDistinctly() {
        let mock = MockCrashReporter()
        CrashDiagnosticsManager.setReporterForTesting(mock)

        CrashDiagnosticsManager.capture(kind: .crash, summary: "1", details: "")
        CrashDiagnosticsManager.capture(kind: .hang, summary: "2", details: "")
        CrashDiagnosticsManager.capture(kind: .cpuException, summary: "3", details: "")
        CrashDiagnosticsManager.capture(kind: .diskWriteException, summary: "4", details: "")

        XCTAssertEqual(mock.records.map(\.kind), [.crash, .hang, .cpuException, .diskWriteException])
    }

    // MARK: - writeSync(...) — NSException path

    func test_writeSync_doesNotForwardToReporter() {
        // NSException are forwarded via the chained `previousExceptionHandler`
        // (Crashlytics' own NSExceptionHandler, registered before us), so
        // also calling `reporter.record` would double-count the same
        // exception in the dashboard.
        let mock = MockCrashReporter()
        CrashDiagnosticsManager.setReporterForTesting(mock)

        CrashDiagnosticsManager.writeSync(
            kind: .nsException,
            summary: "NSInvalidArgumentException",
            details: "stack"
        )

        XCTAssertTrue(mock.records.isEmpty)
    }

    // MARK: - setUserID

    func test_setUserID_proxiesToReporter() {
        let mock = MockCrashReporter()
        CrashDiagnosticsManager.setReporterForTesting(mock)

        CrashDiagnosticsManager.shared.setUserID("user-42")
        CrashDiagnosticsManager.shared.setUserID(nil)

        XCTAssertEqual(mock.userIDs, ["user-42", nil])
    }

    // MARK: - log

    func test_log_proxiesToReporter() {
        let mock = MockCrashReporter()
        CrashDiagnosticsManager.setReporterForTesting(mock)

        CrashDiagnosticsManager.shared.log("breadcrumb-1")
        CrashDiagnosticsManager.shared.log("breadcrumb-2")

        XCTAssertEqual(mock.logs, ["breadcrumb-1", "breadcrumb-2"])
    }

    // MARK: - NoOpCrashReporter

    func test_noOpReporter_acceptsAllCalls() {
        let reporter = NoOpCrashReporter()
        let diag = CrashDiagnostic(
            id: UUID(),
            timestamp: Date(),
            kind: .crash,
            summary: "summary",
            details: "details"
        )
        reporter.record(diag)
        reporter.setUserID("u")
        reporter.setUserID(nil)
        reporter.log("hello")
    }
}

// MARK: - MockCrashReporter

private nonisolated final class MockCrashReporter: CrashReporting, @unchecked Sendable {
    private let lock = NSLock()
    private var _records: [CrashDiagnostic] = []
    private var _userIDs: [String?] = []
    private var _logs: [String] = []

    var records: [CrashDiagnostic] { lock.withLock { _records } }
    var userIDs: [String?] { lock.withLock { _userIDs } }
    var logs: [String] { lock.withLock { _logs } }

    func record(_ diagnostic: CrashDiagnostic) {
        lock.withLock { _records.append(diagnostic) }
    }

    func setUserID(_ userID: String?) {
        lock.withLock { _userIDs.append(userID) }
    }

    func log(_ message: String) {
        lock.withLock { _logs.append(message) }
    }
}
