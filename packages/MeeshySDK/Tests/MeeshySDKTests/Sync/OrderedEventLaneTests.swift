import XCTest
import Combine
@testable import MeeshySDK

actor LaneTestGate {
    private var opened = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        guard !opened else { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        opened = true
        waiters.forEach { $0.resume() }
        waiters.removeAll()
    }
}

actor LaneTestJournal {
    private(set) var entries: [String] = []

    func record(_ entry: String) {
        entries.append(entry)
    }
}

final class OrderedEventLaneTests: XCTestCase {

    private func waitUntil(timeout: TimeInterval = 2, _ condition: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        return await condition()
    }

    func test_submit_jobsRunInSubmissionOrder_evenWhenFirstJobSuspends() async {
        let lane = OrderedEventLane()
        let gate = LaneTestGate()
        let journal = LaneTestJournal()

        lane.submit {
            await gate.wait()
            await journal.record("1")
        }
        lane.submit { await journal.record("2") }
        await gate.open()
        await lane.barrier()

        let entries = await journal.entries
        XCTAssertEqual(entries, ["1", "2"])
    }

    func test_barrier_returnsOnlyAfterEveryPreviouslySubmittedJob() async {
        let lane = OrderedEventLane()
        let journal = LaneTestJournal()

        ["a", "b", "c"].forEach { mark in
            lane.submit {
                await Task.yield()
                await journal.record(mark)
            }
        }
        await lane.barrier()

        let entries = await journal.entries
        XCTAssertEqual(entries, ["a", "b", "c"])
    }

    func test_close_skipsBufferedJobs_andNeverHangsABarrier() async {
        let lane = OrderedEventLane()
        let gate = LaneTestGate()
        let journal = LaneTestJournal()

        lane.submit {
            await journal.record("started")
            await gate.wait()
            await journal.record("1")
        }
        lane.submit { await journal.record("2") }
        let started = await waitUntil { await journal.entries == ["started"] }
        XCTAssertTrue(started)
        lane.close()
        await gate.open()
        await lane.barrier()

        let settled = await waitUntil { await journal.entries == ["started", "1"] }
        XCTAssertTrue(settled, "le job en cours se termine")
        let entries = await journal.entries
        XCTAssertFalse(entries.contains("2"), "le job en tampon est abandonné")
    }

    func test_submitAfterClose_isIgnored() async {
        let lane = OrderedEventLane()
        let journal = LaneTestJournal()

        lane.close()
        lane.submit { await journal.record("late") }
        await lane.barrier()
        try? await Task.sleep(nanoseconds: 50_000_000)

        let entries = await journal.entries
        XCTAssertTrue(entries.isEmpty)
    }

    func test_storeIn_removeAll_closesTheLane() async {
        let lane = OrderedEventLane()
        let journal = LaneTestJournal()
        var subscriptions = Set<AnyCancellable>()
        lane.store(in: &subscriptions)

        subscriptions.removeAll()
        lane.submit { await journal.record("late") }
        await lane.barrier()
        try? await Task.sleep(nanoseconds: 50_000_000)

        let entries = await journal.entries
        XCTAssertTrue(entries.isEmpty)
    }

    func test_relay_preservesPublisherOrder() async {
        let lane = OrderedEventLane()
        let journal = LaneTestJournal()
        let subject = PassthroughSubject<Int, Never>()
        let subscription = subject.relay(through: lane) { value in
            await Task.yield()
            await journal.record(String(value))
        }

        (1...50).forEach { subject.send($0) }
        await lane.barrier()

        let entries = await journal.entries
        XCTAssertEqual(entries, (1...50).map(String.init))
        subscription.cancel()
    }
}
