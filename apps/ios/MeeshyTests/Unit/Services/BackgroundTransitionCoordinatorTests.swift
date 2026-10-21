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


    // MARK: - Ré-entrée : arrière-plan → premier plan → arrière-plan pendant la transition

    /// Le second passage en arrière-plan arrivait pendant que la première
    /// transition attendait encore le réseau (accusés de push) : il rentrait
    /// sur la garde `isTransitioning`, et la première, voyant la reprise entre
    /// les deux, sautait la suspension des sockets ET de la base. L'app était
    /// gelée la base ouverte — le motif du kill 0xDEAD10CC (#7059).
    func test_ledger_secondBackgroundDuringTransition_stillSuspends() {
        var ledger = BackgroundTransitionLedger()
        XCTAssertEqual(ledger.enterBackground(), .start)
        ledger.resume()
        XCTAssertFalse(ledger.shouldSuspend, "revenue au premier plan : rien ne se suspend")
        XCTAssertEqual(ledger.enterBackground(), .joined, "une seule transition à la fois")
        XCTAssertTrue(ledger.shouldSuspend, "repartie en arrière-plan : la transition en cours DOIT suspendre")
        ledger.finishTransition()
        XCTAssertEqual(ledger.enterBackground(), .start, "la transition terminée, la suivante repart")
    }

    /// #11041 — le second départ rejoint la transition en cours, mais pas son
    /// étape MÉDIA : elle avait tranché pour ce qui jouait AVANT la reprise. Une
    /// vidéo relancée entre-temps continuait de jouer en arrière-plan, sans PiP
    /// ni pause — le son qui « continue » une fois l'app quittée.
    func test_enterBackground_joinedReEntry_stillPreparesTheMedia() throws {
        let src = try sourceOf("Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift")
        let start = try XCTUnwrap(src.range(of: "guard ledger.enterBackground() == .start else {"))
        let end = try XCTUnwrap(src.range(of: "defer { ledger.finishTransition() }"))
        let joined = String(src[start.upperBound..<end.lowerBound])
        XCTAssertTrue(joined.contains("await joinRunningTransition()"),
            "la ré-entrée rejointe doit rejouer l'étape média")
        XCTAssertTrue(joined.contains("return"), "et seulement elle : sockets et base restent à la transition en cours")
        let helperStart = try XCTUnwrap(src.range(of: "private func joinRunningTransition() async {"))
        let helperEnd = try XCTUnwrap(src.range(of: "// MARK: - Foreground entry"))
        XCTAssertTrue(src[helperStart.upperBound..<helperEnd.lowerBound]
            .contains("await MediaLifecycleBridge.shared.prepareForBackground()"))
    }

    func test_ledger_resumeDuringTransition_skipsTheSuspension() {
        var ledger = BackgroundTransitionLedger()
        XCTAssertEqual(ledger.enterBackground(), .start)
        XCTAssertTrue(ledger.shouldSuspend)
        ledger.resume()
        XCTAssertFalse(ledger.shouldSuspend, "une app visible ne perd ni ses sockets ni sa base")
    }

    // MARK: - Reprise : une seule à la fois, et jamais en arrière-plan

    /// Deux retours au premier plan rapprochés : la première reprise s'arrête
    /// au step suivant, la seconde seule reconstruit sockets et outbox.
    func test_ledger_aNewerResume_supersedesTheRunningOne() {
        var ledger = BackgroundTransitionLedger()
        let first = ledger.resume()
        XCTAssertTrue(ledger.isCurrentResume(first))
        let second = ledger.resume()
        XCTAssertFalse(ledger.isCurrentResume(first), "deux forceReconnect se démolissaient l'un l'autre")
        XCTAssertTrue(ledger.isCurrentResume(second))
    }

    /// Reparti en arrière-plan pendant la reprise : elle ne reconstruit plus
    /// les sockets et n'écrit plus dans une base que la transition va suspendre.
    func test_ledger_goingBackground_stopsTheRunningResume() {
        var ledger = BackgroundTransitionLedger()
        let epoch = ledger.resume()
        _ = ledger.enterBackground()
        XCTAssertFalse(ledger.isCurrentResume(epoch))
    }

    func test_resumeFromBackground_gatesEveryStepOnItsEpoch() throws {
        let src = try sourceOf("Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift")
        let start = try XCTUnwrap(src.range(of: "func resumeFromBackground() async {"))
        let end = try XCTUnwrap(src.range(of: "private static let engagementFlushBudget"))
        let resume = String(src[start.upperBound..<end.lowerBound])
        XCTAssertFalse(resume.contains("await withBudget(\""), "chaque step de reprise passe par resumeStep")
        XCTAssertTrue(resume.contains("await resumeStep(epoch, \"sockets.resume\")"))
    }

    func test_enterBackground_suspendsThroughTheLedger_notAGenerationEquality() throws {
        let src = try sourceOf("Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift")
        XCTAssertFalse(src.contains("guard !isTransitioning else { return }"), "la ré-entrée ne s'avale plus en silence")
        XCTAssertFalse(src.contains("generation == transitionGeneration"), "l'égalité de génération sautait la suspension d'une app repartie")
        XCTAssertTrue(src.contains("if ledger.shouldSuspend {"))
    }
}
