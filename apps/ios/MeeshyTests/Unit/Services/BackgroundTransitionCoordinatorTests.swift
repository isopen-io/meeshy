import XCTest
@testable import Meeshy

/// `runBounded` is the timeout that keeps the non-critical, durable engagement
/// flush from holding the background-task budget hostage (0x8BADF00D watchdog).
final class BackgroundTransitionCoordinatorTests: XCTestCase {

    func test_runBounded_slowOperation_returnsAtBudgetNotOperationDuration() async {
        let start = Date()
        let completed = await BackgroundTransitionCoordinator.runBounded(seconds: 0.1) {
            try? await Task.sleep(nanoseconds: 3_000_000_000)   // 3s of "network"
        }
        let elapsed = Date().timeIntervalSince(start)

        XCTAssertFalse(completed, "a slow operation must report as timed-out, not completed")
        XCTAssertLessThan(elapsed, 1.5, "must return near the 0.1s bound, never the 3s operation")
    }

    func test_runBounded_fastOperation_reportsCompleted() async {
        let completed = await BackgroundTransitionCoordinator.runBounded(seconds: 5.0) { }
        XCTAssertTrue(completed, "an operation that finishes inside the bound reports completed")
    }

    // MARK: - grdb-05 — maintenance DB sous la garde beginBackgroundTask

    private func sourceOf(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Services
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_enterBackground_runsDbMaintenanceAsLastStepBeforeEndingTheTask() throws {
        let src = try sourceOf("Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift")
        XCTAssertTrue(
            src.contains("DatabaseMaintenance.runIncrementalVacuum"),
            "incremental_vacuum tient un verrou d'écriture sur le fichier App Group partagé avec la NSE — il DOIT tourner sous la garde beginBackgroundTask du coordinator (0xdead10cc sinon)"
        )
        guard let maintenancePos = src.range(of: "DatabaseMaintenance.runIncrementalVacuum"),
              // L'appel FINAL d'enterBackground (8 espaces, sans self?.) —
              // pas le handler d'expiration ni la déclaration de la méthode.
              let endPos = src.range(of: "\n        endBackgroundTask()") else {
            return XCTFail("ancres introuvables")
        }
        XCTAssertTrue(
            maintenancePos.lowerBound < endPos.lowerBound,
            "la maintenance doit précéder endBackgroundTask() — dernier step, le plus sacrifiable"
        )
    }

    func test_meeshyApp_backgroundCase_noLongerRunsUngatedDbMaintenance() throws {
        let src = try sourceOf("Meeshy/MeeshyApp.swift")
        XCTAssertFalse(
            src.contains("DatabaseMaintenance.runIncrementalVacuum"),
            "la Task.detached hors beginBackgroundTask de MeeshyApp pouvait chevaucher la suspension en tenant le verrou — supprimée au profit du step gardé du coordinator"
        )
    }

}
