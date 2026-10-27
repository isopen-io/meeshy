import XCTest
@testable import Meeshy

/// The video-transition chain (#11522): one snapshot of the six in-flight
/// renegotiation / camera tasks, settled before a new actuation starts.
@MainActor
final class VideoTransitionChainTests: XCTestCase {

    private actor Gate {
        private var isOpen = false
        private var waiters: [CheckedContinuation<Void, Never>] = []

        func wait() async {
            if isOpen { return }
            await withCheckedContinuation { waiters.append($0) }
        }

        func open() {
            isOpen = true
            waiters.forEach { $0.resume() }
            waiters = []
        }
    }

    private enum Slot: CaseIterable {
        case toggle, hold, survival, iceRestart, answer, cameraSwitch
    }

    private func chain(gates: [Slot: Gate]) -> VideoTransitionChain {
        func task(_ slot: Slot) -> Task<Void, Never> {
            let gate = gates[slot]!
            return Task { await gate.wait() }
        }
        let survivalGate = gates[.survival]!
        return VideoTransitionChain(
            toggle: task(.toggle),
            hold: task(.hold),
            survival: Task { await survivalGate.wait(); return true },
            iceRestart: task(.iceRestart),
            answer: task(.answer),
            cameraSwitch: task(.cameraSwitch)
        )
    }

    func test_settle_withNoTaskInFlight_returnsImmediately() async {
        let chain = VideoTransitionChain(
            toggle: nil, hold: nil, survival: nil,
            iceRestart: nil, answer: nil, cameraSwitch: nil
        )
        await chain.settle()
    }

    func test_settle_waitsForEverySlot_whicheverFinishesLast() async throws {
        for last in Slot.allCases {
            let gates = Dictionary(uniqueKeysWithValues: Slot.allCases.map { ($0, Gate()) })
            let chain = chain(gates: gates)
            let settled = SettledFlag()
            let waiter = Task { await chain.settle(); await settled.mark() }

            for slot in Slot.allCases where slot != last { await gates[slot]!.open() }
            try await Task.sleep(for: .milliseconds(80))
            let settledEarly = await settled.value
            XCTAssertFalse(settledEarly, "settle() returned before the \(last) task finished")

            await gates[last]!.open()
            await waiter.value
            let settledAtEnd = await settled.value
            XCTAssertTrue(settledAtEnd)
        }
    }

    func test_settle_ignoresTheCancellationOfItsWaiter() async {
        let gate = Gate()
        let toggle = Task { await gate.wait() }
        let chain = VideoTransitionChain(
            toggle: toggle, hold: nil, survival: nil,
            iceRestart: nil, answer: nil, cameraSwitch: nil
        )
        let settled = SettledFlag()
        let waiter = Task { await chain.settle(); await settled.mark() }
        waiter.cancel()
        try? await Task.sleep(for: .milliseconds(50))
        let settledEarly = await settled.value
        XCTAssertFalse(settledEarly, "a cancelled waiter still waits for the in-flight transition")
        await gate.open()
        await waiter.value
        let settledAtEnd = await settled.value
        XCTAssertTrue(settledAtEnd)
    }

    func test_callManager_snapshotsEverySlot_inOnePlace() throws {
        let source = try AppSourceGuard.unit(
            "Meeshy/Features/Main/Services/CallManager.swift",
            alsoIncluding: ["Meeshy/Features/Main/Services/VideoTransitionChain.swift"]
        )
        guard let start = source.range(of: "func videoTransitionsInFlight() -> VideoTransitionChain {"),
              let end = source.range(of: "\n    }\n", range: start.upperBound..<source.endIndex) else {
            return XCTFail("CallManager.videoTransitionsInFlight() not found")
        }
        let body = String(source[start.upperBound..<end.lowerBound])
        for slot in ["toggle: videoToggleTask", "hold: holdVideoTask", "survival: survivalVideoTask",
                     "iceRestart: iceRestartTask", "answer: signalOfferAnswerTask", "cameraSwitch: cameraSwitchTask"] {
            XCTAssertTrue(body.contains(slot), "videoTransitionsInFlight() must capture \(slot)")
        }
        let handRolledSnapshots = source.components(separatedBy: "= videoToggleTask\n").count - 1
            + source.components(separatedBy: "= self.videoToggleTask\n").count - 1
        XCTAssertEqual(handRolledSnapshots, 0, "every site snapshots the chain through videoTransitionsInFlight()")
    }

    private actor SettledFlag {
        private(set) var value = false
        func mark() { value = true }
    }
}
