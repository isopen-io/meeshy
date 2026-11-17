import XCTest
@testable import Meeshy

/// **La fermeture d'une session E2EE n'attend jamais une étape réseau pendue**
/// (IOSX-05, #18948) — et les étapes gardent leur ordre (audit #12769).
@MainActor
final class EndToEndLifecycleQueueTests: XCTestCase {

    private func eventually(timeout: TimeInterval = 5, _ condition: () -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() {
            guard Date() < deadline else { return false }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        return true
    }

    private func hungCatchUp(_ log: StepLog) -> @concurrent @Sendable () async -> Void {
        {
            log.record("rattrapage commencé")
            do { try await Task.sleep(nanoseconds: 60_000_000_000) } catch { log.record("rattrapage annulé") }
        }
    }

    func test_closing_doesNotWaitForAHungStep_andCancelsIt() async {
        let queue = EndToEndLifecycleQueue()
        let log = StepLog()
        queue.enqueue(hungCatchUp(log))
        let started = await eventually { log.contains("rattrapage commencé") }
        XCTAssertTrue(started)

        queue.closeAhead { log.record("session fermée") }

        let closed = await eventually(timeout: 2) { log.contains("session fermée") }
        XCTAssertTrue(closed, "la fermeture n'attend pas un rattrapage qu'une passerelle ne termine pas")
        let cancelled = await eventually { log.contains("rattrapage annulé") }
        XCTAssertTrue(cancelled)
    }

    func test_stepsWaitingBehindAHungStep_neverStartOnceClosed() async {
        let queue = EndToEndLifecycleQueue()
        let log = StepLog()
        queue.enqueue(hungCatchUp(log))
        queue.enqueue { log.record("migration") }
        let started = await eventually { log.contains("rattrapage commencé") }
        XCTAssertTrue(started)

        queue.closeAhead { log.record("session fermée") }
        await queue.tail?.value

        XCTAssertFalse(log.contains("migration"), "une étape de la session fermée ne commence plus")
        XCTAssertEqual(queue.unfinishedSteps, 0)
    }

    func test_whatFollowsTheClosing_waitsForTheClosingAndTheCancelledSteps() async {
        let queue = EndToEndLifecycleQueue()
        let log = StepLog()
        queue.enqueue(hungCatchUp(log))
        let started = await eventually { log.contains("rattrapage commencé") }
        XCTAssertTrue(started)

        queue.closeAhead { log.record("session fermée") }
        queue.enqueue { log.record("ouverture du compte suivant") }
        await queue.tail?.value

        let entries = log.entries
        guard let opening = entries.firstIndex(of: "ouverture du compte suivant"),
              let closed = entries.firstIndex(of: "session fermée"),
              let cancelled = entries.firstIndex(of: "rattrapage annulé") else {
            return XCTFail("chaque étape a eu lieu : \(entries)")
        }
        XCTAssertLessThan(closed, opening)
        XCTAssertLessThan(cancelled, opening, "le compte suivant ne s'ouvre qu'après la fin des étapes de l'ancien")
    }

    func test_steps_runInTheOrderTheyAreAsked_andAreForgottenOnceDone() async {
        let queue = EndToEndLifecycleQueue()
        let log = StepLog()

        ["ouverture", "rattrapage", "migration"].forEach { name in queue.enqueue { log.record(name) } }
        await queue.tail?.value

        XCTAssertEqual(log.entries, ["ouverture", "rattrapage", "migration"])
        XCTAssertEqual(queue.unfinishedSteps, 0)
    }
}

/// Ce que les étapes ont fait, dans l'ordre.
private final class StepLog: @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [String] = []

    func record(_ entry: String) { lock.withLock { recorded.append(entry) } }
    func contains(_ entry: String) -> Bool { lock.withLock { recorded.contains(entry) } }
    var entries: [String] { lock.withLock { recorded } }
}
