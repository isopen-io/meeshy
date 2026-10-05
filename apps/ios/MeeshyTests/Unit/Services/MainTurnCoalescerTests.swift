import XCTest
@testable import Meeshy

/// #9089 — cinq sources de `CallManager` déclenchent chacune la resynchronisation
/// du maillage, en rafale pendant la négociation. Une rafale ⇒ UNE synchronisation,
/// au prochain tour de boucle principale — sans attendre davantage.
@MainActor
final class MainTurnCoalescerTests: XCTestCase {

    @MainActor
    private final class ManualTurn {
        private(set) var pending: [@MainActor () -> Void] = []
        func schedule(_ work: @escaping @MainActor () -> Void) { pending.append(work) }
        func runNextTurn() {
            let due = pending
            pending = []
            due.forEach { $0() }
        }
    }

    private func makeSUT() -> (sut: MainTurnCoalescer, turn: ManualTurn, runs: () -> Int) {
        let turn = ManualTurn()
        var count = 0
        let sut = MainTurnCoalescer(schedule: { turn.schedule($0) }) { count += 1 }
        return (sut, turn, { count })
    }

    func test_request_burst_runsTheActionOnceOnTheNextTurn() {
        let (sut, turn, runs) = makeSUT()

        (0..<5).forEach { _ in sut.request() }

        XCTAssertEqual(turn.pending.count, 1, "la rafale ne programme qu'un seul tour")
        XCTAssertEqual(runs(), 0)
        turn.runNextTurn()
        XCTAssertEqual(runs(), 1)
    }

    func test_request_firstRequest_isScheduledImmediately() {
        let (sut, turn, _) = makeSUT()

        sut.request()

        XCTAssertEqual(turn.pending.count, 1, "aucun délai au-delà du tour suivant : la première synchro n'attend pas")
    }

    func test_request_afterTheTurnRan_schedulesAgain() {
        let (sut, turn, runs) = makeSUT()
        sut.request()
        turn.runNextTurn()

        sut.request()
        turn.runNextTurn()

        XCTAssertEqual(runs(), 2)
    }

    func test_meshBinding_coalescesItsFiveSourcesWithoutDuplicates() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager+GroupMesh.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        guard let start = source.range(of: "let state = manager.$callState") else {
            return XCTFail("le binding du maillage doit écouter l'état de CallManager")
        }
        let tail = String(source[start.lowerBound...].prefix(900))

        XCTAssertEqual(tail.components(separatedBy: ".removeDuplicates()").count - 1, 5, "chaque source ne publie que ce qui CHANGE")
        XCTAssertTrue(tail.contains("syncCoalescer.request()"), "une rafale ⇒ une synchronisation")
    }
}
