import SwiftUI
import XCTest
@testable import Meeshy

/// La pastille de synchronisation ne bat qu'au premier plan (#17250) : en arrière-plan, ni battement de 0,5 s, ni
/// rotation de 2,7 s, donc aucun réveil du processeur et aucune relecture des chaînes du bundle.
final class SyncPillBackgroundClockTests: XCTestCase {

    func test_runs_onlyWhileTheSceneIsActive() {
        XCTAssertTrue(SyncPillDotClock.runs(in: .active))
        XCTAssertFalse(SyncPillDotClock.runs(in: .inactive))
        XCTAssertFalse(SyncPillDotClock.runs(in: .background))
    }

    func test_rotates_onlyInTheForeground_andNeverWhenPausedByTheUser() {
        XCTAssertTrue(SyncPillDotClock.rotates(in: .active, pausedByUser: false))
        XCTAssertFalse(SyncPillDotClock.rotates(in: .active, pausedByUser: true))
        XCTAssertFalse(SyncPillDotClock.rotates(in: .background, pausedByUser: false))
        XCTAssertFalse(SyncPillDotClock.rotates(in: .inactive, pausedByUser: false))
    }

    @MainActor
    func test_aRotatorPausedForTheBackground_stopsTicking() {
        let rotator = SyncPillRotator()
        rotator.setItemCount(3)
        rotator.setAutoRotation(SyncPillDotClock.rotates(in: .background, pausedByUser: false))

        rotator.simulateTick()

        XCTAssertEqual(rotator.currentIndex, 0)
        XCTAssertFalse(rotator.autoRotationEnabled)
    }

    private func syncPillLines() throws -> [String] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Components
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Components/SyncPill.swift")
        return AppSourceGuard.strippedLines(try String(contentsOf: url, encoding: .utf8))
    }

    /// L'abonnement au battement n'existe que sous la condition de premier plan : hors d'elle, la vue qui le porte est
    /// démontée, l'abonnement annulé et l'`autoconnect` déconnecté.
    func test_theDotTimerSubscription_livesOnlyUnderTheForegroundCondition() throws {
        let lines = try syncPillLines()
        let subscriptions = lines.indices.filter { lines[$0].contains(".onReceive(dotTimer)") }
        XCTAssertEqual(subscriptions.count, 1)
        for index in subscriptions {
            let context = lines[max(0, index - 3)..<index].joined(separator: "\n")
            XCTAssertTrue(context.contains("SyncPillDotClock.runs(in: scenePhase)"), "ligne \(index + 1)")
        }
    }

    func test_theRotation_followsTheScenePhase() throws {
        let source = try syncPillLines().joined(separator: "\n")
        XCTAssertTrue(source.contains("SyncPillDotClock.rotates(in:"))
    }
}
