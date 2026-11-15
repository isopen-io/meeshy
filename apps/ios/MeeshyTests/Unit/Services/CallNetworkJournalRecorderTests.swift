import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

@MainActor
final class CallNetworkJournalRecorderTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_000)

    private func reading(loss: Double = 0.5, rtt: Double = 80, jitter: Double = 5, relayed: Bool? = nil, profile: CallDataProfile? = nil) -> CallQualityReading {
        CallQualityReading(packetLossPercent: loss, roundTripTimeMs: rtt, jitterMs: jitter, audioKbps: 24, videoKbps: 300, relayed: relayed, profile: profile)
    }

    private func run(_ inputs: [(CallNetworkJournalInput, TimeInterval)], from start: CallNetworkJournalRecorder = .idle) -> (CallNetworkJournalRecorder, [CallNetworkEventKind]) {
        inputs.reduce((start, [CallNetworkEventKind]())) { acc, step in
            let (next, events) = acc.0.reducing(step.0, at: t0.addingTimeInterval(step.1))
            return (next, acc.1 + events.map(\.kind))
        }
    }

    func test_reducing_withoutCall_recordsNothing() {
        let (_, kinds) = run([(.state(.reconnecting(attempt: 1)), 0), (.reading(reading()), 1)])

        XCTAssertEqual(kinds, [])
    }

    func test_reducing_newCall_anchorsTheJournalAtItsStart() {
        let (recorder, _) = run([(.call(id: "call-1"), 3)])

        XCTAssertEqual(recorder.callId, "call-1")
        XCTAssertEqual(recorder.startedAt, t0.addingTimeInterval(3))
    }

    func test_reducing_reconnectionCycle_recordsAttemptThenRecovery() {
        let (_, kinds) = run([
            (.call(id: "call-1"), 0),
            (.state(.connected), 1),
            (.state(.reconnecting(attempt: 1)), 2),
            (.state(.reconnecting(attempt: 2)), 3),
            (.state(.connected), 4)
        ])

        XCTAssertEqual(kinds, [.reconnecting(attempt: 1), .reconnecting(attempt: 2), .reconnected])
    }

    func test_reducing_linkState_recordsEachChangeOnce() {
        let (_, kinds) = run([
            (.call(id: "call-1"), 0),
            (.link(.new), 0),
            (.link(.connecting), 1),
            (.link(.connected), 2),
            (.link(.connected), 3),
            (.link(.disconnected), 4)
        ])

        XCTAssertEqual(kinds, [.link(state: "connecting"), .link(state: "connected"), .link(state: "disconnected")])
    }

    func test_reducing_readings_sampleEveryIntervalOnAStableLink() {
        let (_, kinds) = run([
            (.call(id: "call-1"), 0),
            (.reading(reading()), 1),
            (.reading(reading()), 6),
            (.reading(reading()), 11),
            (.reading(reading()), 16)
        ])

        XCTAssertEqual(kinds.filter { if case .sample = $0 { return true } else { return false } }.count, 2)
    }

    func test_reducing_readingCrossingAGrade_isSampledAtOnce() {
        let (_, kinds) = run([
            (.call(id: "call-1"), 0),
            (.reading(reading(loss: 0.5)), 1),
            (.reading(reading(loss: 6)), 3)
        ])

        XCTAssertEqual(kinds.last, .sample(CallNetworkSample(packetLossPercent: 6, roundTripTimeMs: 80, jitterMs: 5, audioKbps: 24, videoKbps: 300)))
    }

    func test_reducing_routeAndProfile_recordedOnChangeOnly() {
        let (_, kinds) = run([
            (.call(id: "call-1"), 0),
            (.reading(reading(relayed: false, profile: .wifi)), 1),
            (.reading(reading(relayed: false, profile: .wifi)), 2),
            (.reading(reading(relayed: true, profile: .cellular)), 3)
        ])

        let milestones = kinds.filter { if case .sample = $0 { return false } else { return true } }
        XCTAssertEqual(milestones, [.route(relayed: false), .profile(name: "wifi"), .route(relayed: true), .profile(name: "cellular")])
    }

    func test_reducing_tier_recordedOnChangeOnly() {
        let (_, kinds) = run([
            (.call(id: "call-1"), 0),
            (.tier(.good), 1),
            (.tier(.good), 2),
            (.tier(.poor), 3)
        ])

        XCTAssertEqual(kinds, [.tier(level: "good"), .tier(level: "poor")])
    }

    func test_reducing_endedCall_recordsTheReasonThenStops() {
        let (_, kinds) = run([
            (.call(id: "call-1"), 0),
            (.state(.ended(reason: .connectionLost)), 5),
            (.call(id: nil), 5),
            (.reading(reading()), 6),
            (.mediaFault("late"), 7)
        ])

        XCTAssertEqual(kinds, [.ended(reason: "connectionLost")])
    }

    func test_reducing_nextCall_startsAFreshJournal() {
        let (recorder, kinds) = run([
            (.call(id: "call-1"), 0),
            (.tier(.poor), 1),
            (.state(.ended(reason: .local)), 2),
            (.call(id: "call-2"), 10),
            (.tier(.poor), 11)
        ])

        XCTAssertEqual(recorder.callId, "call-2")
        XCTAssertEqual(kinds, [.tier(level: "poor"), .ended(reason: "local"), .tier(level: "poor")])
    }

    func test_reducing_mediaFault_isRecordedVerbatim() {
        let (_, kinds) = run([(.call(id: "call-1"), 0), (.mediaFault("camera: denied"), 1)])

        XCTAssertEqual(kinds, [.mediaFault(reason: "camera: denied")])
    }

    func test_faultReason_isBounded() {
        struct LongError: LocalizedError { var errorDescription: String? { String(repeating: "x", count: 500) } }

        let reason = CallMediaFaultFeed.reason(stage: "camera", error: LongError())

        XCTAssertEqual(reason.count, CallMediaFaultFeed.reasonLimit)
        XCTAssertTrue(reason.hasPrefix("camera: "))
    }
}

@MainActor
final class CallNetworkJournalBindingTests: XCTestCase {

    private final class RecordingStore: CallNetworkJournalStoreProviding, @unchecked Sendable {
        private let lock = NSLock()
        private var stored: [(String, CallNetworkEvent)] = []

        var appended: [(callId: String, kind: CallNetworkEventKind)] {
            lock.withLock { stored.map { ($0.0, $0.1.kind) } }
        }

        func append(_ event: CallNetworkEvent, callId: String, startedAt: Date) async {
            lock.withLock { stored.append((callId, event)) }
        }

        func journal(for callId: String) async -> CallNetworkJournal? { nil }
        func remove(callId: String) async {}
    }

    private struct Harness {
        let binding: CallNetworkJournalBinding
        let store: RecordingStore
        let callIds: CurrentValueSubject<String?, Never>
        let states: CurrentValueSubject<CallState, Never>
        let readings: PassthroughSubject<CallQualityReading?, Never>
        let faults: PassthroughSubject<String, Never>
    }

    private func makeHarness() -> Harness {
        let store = RecordingStore()
        let readings = PassthroughSubject<CallQualityReading?, Never>()
        let faults = PassthroughSubject<String, Never>()
        let binding = CallNetworkJournalBinding(
            store: store,
            readings: readings.eraseToAnyPublisher(),
            faults: faults.eraseToAnyPublisher(),
            now: { Date(timeIntervalSince1970: 0) }
        )
        let callIds = CurrentValueSubject<String?, Never>(nil)
        let states = CurrentValueSubject<CallState, Never>(.idle)
        binding.bind(
            callIds: callIds.eraseToAnyPublisher(),
            states: states.eraseToAnyPublisher(),
            links: Empty().eraseToAnyPublisher(),
            tiers: Empty().eraseToAnyPublisher()
        )
        return Harness(binding: binding, store: store, callIds: callIds, states: states, readings: readings, faults: faults)
    }

    private func drain(_ harness: Harness) async {
        let delivered = expectation(description: "main queue drained")
        DispatchQueue.main.async { delivered.fulfill() }
        await fulfillment(of: [delivered], timeout: 1)
        await harness.binding.flush()
    }

    func test_bind_writesTheCallEventsUnderItsCallId() async {
        let harness = makeHarness()

        harness.callIds.send("call-9")
        harness.states.send(.reconnecting(attempt: 1))
        harness.faults.send("camera: denied")
        harness.states.send(.ended(reason: .local))
        await drain(harness)

        XCTAssertEqual(harness.store.appended.map { $0.callId }, ["call-9", "call-9", "call-9"])
        XCTAssertEqual(harness.store.appended.map { $0.kind }, [.reconnecting(attempt: 1), .mediaFault(reason: "camera: denied"), .ended(reason: "local")])
    }

    func test_bind_beforeAnyCall_writesNothing() async {
        let harness = makeHarness()

        harness.faults.send("camera: denied")
        await drain(harness)

        XCTAssertTrue(harness.store.appended.isEmpty)
    }
}
