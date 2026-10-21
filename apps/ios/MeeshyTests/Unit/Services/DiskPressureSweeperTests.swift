import XCTest
@testable import Meeshy

/// **L'éviction sous pression disque ne se déclenche plus seulement à
/// l'écriture (IL8, #11286).** Une application qui ne fait que LIRE (le
/// lancement, le retour au premier plan après qu'une autre app a rempli le
/// volume) ne relâchait jamais rien. Ces témoins jugent la loi de
/// déclenchement : une passe à la demande, jamais deux en même temps, au plus
/// une par intervalle, et jamais sur le fil principal.
@MainActor
final class DiskPressureSweeperTests: XCTestCase {

    private actor SweepLog {
        private(set) var runs = 0
        private(set) var ranOnMainThread: [Bool] = []
        func record(onMainThread: Bool) {
            runs += 1
            ranOnMainThread.append(onMainThread)
        }
    }

    private func makeSweeper(
        log: SweepLog,
        minimumInterval: TimeInterval = 600,
        release: AsyncStream<Void>? = nil
    ) -> DiskPressureSweeper {
        DiskPressureSweeper(minimumInterval: minimumInterval) {
            await log.record(onMainThread: currentThreadIsMain())
            guard let release else { return }
            for await _ in release { break }
        }
    }

    func test_requestSweep_firstRequest_runsOneSweep() async {
        let log = SweepLog()
        let sweeper = makeSweeper(log: log)

        await sweeper.requestSweep(now: Date(timeIntervalSince1970: 1_000))?.value

        let runs = await log.runs
        XCTAssertEqual(runs, 1)
    }

    func test_requestSweep_runsOffTheMainThread() async {
        let log = SweepLog()
        let sweeper = makeSweeper(log: log)

        await sweeper.requestSweep(now: Date(timeIntervalSince1970: 1_000))?.value

        let ranOnMain = await log.ranOnMainThread
        XCTAssertEqual(ranOnMain, [false])
    }

    func test_requestSweep_withinMinimumInterval_skipsSweep() async {
        let log = SweepLog()
        let sweeper = makeSweeper(log: log, minimumInterval: 600)

        await sweeper.requestSweep(now: Date(timeIntervalSince1970: 1_000))?.value
        let second = sweeper.requestSweep(now: Date(timeIntervalSince1970: 1_599))
        await second?.value

        XCTAssertNil(second)
        let runs = await log.runs
        XCTAssertEqual(runs, 1)
    }

    func test_requestSweep_afterMinimumInterval_runsAgain() async {
        let log = SweepLog()
        let sweeper = makeSweeper(log: log, minimumInterval: 600)

        await sweeper.requestSweep(now: Date(timeIntervalSince1970: 1_000))?.value
        await sweeper.requestSweep(now: Date(timeIntervalSince1970: 1_600))?.value

        let runs = await log.runs
        XCTAssertEqual(runs, 2)
    }

    func test_requestSweep_whileSweepInFlight_doesNotStartASecond() async {
        let log = SweepLog()
        let (release, releaser) = AsyncStream<Void>.makeStream()
        let sweeper = makeSweeper(log: log, minimumInterval: 0, release: release)

        let first = sweeper.requestSweep(now: Date(timeIntervalSince1970: 1_000))
        let overlapping = sweeper.requestSweep(now: Date(timeIntervalSince1970: 5_000))
        releaser.yield()
        releaser.finish()
        await first?.value

        XCTAssertNotNil(first)
        XCTAssertNil(overlapping)
        let runs = await log.runs
        XCTAssertEqual(runs, 1)
    }
}

private nonisolated func currentThreadIsMain() -> Bool {
    Thread.isMainThread
}
