import XCTest
@testable import Meeshy

// MARK: - La règle : quand un rappel peut partir

@MainActor
final class CallDialReadinessSnapshotTests: XCTestCase {

    private func snapshot(resolved: Bool, authenticated: Bool, connected: Bool) -> CallDialReadinessSnapshot {
        CallDialReadinessSnapshot(sessionResolved: resolved, authenticated: authenticated, socketConnected: connected)
    }

    func test_verdict_sessionAndSocketUp_isReady() {
        XCTAssertEqual(snapshot(resolved: true, authenticated: true, connected: true).verdict, .ready)
    }

    func test_verdict_socketStillDown_keepsWaiting() {
        XCTAssertNil(snapshot(resolved: true, authenticated: true, connected: false).verdict)
    }

    func test_verdict_sessionNotYetRead_keepsWaiting() {
        XCTAssertNil(snapshot(resolved: false, authenticated: false, connected: false).verdict)
    }

    func test_verdict_sessionReadWithoutAccount_isSignedOut() {
        XCTAssertEqual(snapshot(resolved: true, authenticated: false, connected: false).verdict, .signedOut)
    }

    func test_mayQueueDial_beforeTheSessionIsRead_keepsTheRequest() {
        XCTAssertTrue(CallDialReadinessSnapshot.mayQueueDial(sessionResolved: false, authenticated: false))
        XCTAssertTrue(CallDialReadinessSnapshot.mayQueueDial(sessionResolved: true, authenticated: true))
        XCTAssertFalse(CallDialReadinessSnapshot.mayQueueDial(sessionResolved: true, authenticated: false))
    }
}

// MARK: - L'attente : session et socket

@MainActor
final class CallDialReadinessTests: XCTestCase {

    @MainActor
    private final class World {
        var snapshot: CallDialReadinessSnapshot
        var connectCalls = 0
        var polls = 0
        var onPoll: (World) -> Void = { _ in }

        init(resolved: Bool, authenticated: Bool, connected: Bool) {
            snapshot = CallDialReadinessSnapshot(sessionResolved: resolved, authenticated: authenticated, socketConnected: connected)
        }
    }

    private func readiness(_ world: World, timeout: Duration = .seconds(2)) -> CallDialReadiness {
        CallDialReadiness(
            snapshot: {
                world.polls += 1
                world.onPoll(world)
                return world.snapshot
            },
            connect: { world.connectCalls += 1 },
            timeout: timeout,
            pollInterval: .milliseconds(5)
        )
    }

    func test_waitUntilReady_readyAtOnce_returnsReady_withoutForcingTheSocket() async {
        let world = World(resolved: true, authenticated: true, connected: true)
        let sut = readiness(world)

        let outcome = await sut.waitUntilReady()

        XCTAssertEqual(outcome, .ready)
        XCTAssertEqual(world.connectCalls, 0)
        XCTAssertTrue(sut.isReady)
    }

    func test_waitUntilReady_sessionThenSocketArriveLater_returnsReady_andConnectsOnce() async {
        let world = World(resolved: false, authenticated: false, connected: false)
        world.onPoll = { world in
            if world.polls == 3 {
                world.snapshot = CallDialReadinessSnapshot(sessionResolved: true, authenticated: true, socketConnected: false)
            }
            if world.polls == 8 {
                world.snapshot = CallDialReadinessSnapshot(sessionResolved: true, authenticated: true, socketConnected: true)
            }
        }
        let sut = readiness(world)

        let outcome = await sut.waitUntilReady()

        XCTAssertEqual(outcome, .ready)
        XCTAssertEqual(world.connectCalls, 1)
    }

    func test_waitUntilReady_neverReady_timesOut() async {
        let world = World(resolved: true, authenticated: true, connected: false)
        let sut = readiness(world, timeout: .milliseconds(60))

        let outcome = await sut.waitUntilReady()

        XCTAssertEqual(outcome, .timedOut)
        XCTAssertEqual(world.connectCalls, 1)
        XCTAssertFalse(sut.isReady)
    }

    func test_waitUntilReady_sessionReadWithoutAccount_stopsAtOnce() async {
        let world = World(resolved: true, authenticated: false, connected: false)
        let sut = readiness(world)

        let outcome = await sut.waitUntilReady()

        XCTAssertEqual(outcome, .signedOut)
        XCTAssertEqual(world.connectCalls, 0)
    }
}

// MARK: - Le composeur attend avant de composer (#8199)

@MainActor
final class CallBackDialerColdLaunchTests: XCTestCase {

    @MainActor
    private final class GatedReadiness: CallDialReadinessProviding {
        var isReady: Bool
        private(set) var waitCount = 0
        private var waiters: [CheckedContinuation<CallDialReadinessOutcome, Never>] = []

        init(isReady: Bool) {
            self.isReady = isReady
        }

        nonisolated deinit {}

        func waitUntilReady() async -> CallDialReadinessOutcome {
            waitCount += 1
            return await withCheckedContinuation { waiters.append($0) }
        }

        func release(_ outcome: CallDialReadinessOutcome) {
            let pending = waiters
            waiters = []
            pending.forEach { $0.resume(returning: outcome) }
        }

        func settle(waiters expected: Int) async {
            for _ in 0..<1_000 where waitCount < expected {
                await Task.yield()
            }
        }
    }

    private final class Recorder {
        var started: [CallBackRequest] = []
        var notConnected = 0
        var unavailable = 0
        var fetched: [String] = []
    }

    private var ada: CallBackRequest { CallBackRequest(userId: "u-ada", displayName: "Ada", isVideo: false, conversationId: "c-ada") }
    private var bob: CallBackRequest { CallBackRequest(userId: "u-bob", displayName: "Bob", isVideo: true, conversationId: "c-bob") }

    private func dialer(
        _ recorder: Recorder,
        readiness: CallDialReadinessProviding,
        cached: [String: CallPeer] = [:]
    ) -> CallBackDialer {
        CallBackDialer(
            start: { request, _ in recorder.started.append(request) },
            cachedPeer: { cached[$0] },
            fetchPeer: { id in
                recorder.fetched.append(id)
                return nil
            },
            openProfile: { _ in },
            showUnavailable: { recorder.unavailable += 1 },
            readiness: readiness,
            showNotConnected: { recorder.notConnected += 1 }
        )
    }

    func test_dial_sessionReadyAtOnce_placesTheCallImmediately() {
        let recorder = Recorder()
        let readiness = GatedReadiness(isReady: true)

        dialer(recorder, readiness: readiness).dial(ada)

        XCTAssertEqual(recorder.started, [ada])
        XCTAssertEqual(readiness.waitCount, 0)
    }

    func test_dial_sessionReadyLater_waitsThenPlacesTheCallOnce() async {
        let recorder = Recorder()
        let readiness = GatedReadiness(isReady: false)
        let sut = dialer(recorder, readiness: readiness)

        sut.dial(ada)
        let pending = sut.inFlightDial
        XCTAssertTrue(recorder.started.isEmpty, "rien ne part avant la connexion")

        await readiness.settle(waiters: 1)
        readiness.release(.ready)
        await pending?.value

        XCTAssertEqual(recorder.started, [ada])
        XCTAssertEqual(recorder.notConnected, 0)
    }

    func test_dial_neverReady_placesNothing_andSaysSo() async {
        let recorder = Recorder()
        let readiness = GatedReadiness(isReady: false)
        let sut = dialer(recorder, readiness: readiness)

        sut.dialFromProfile(ProfileCallRequest(userId: "u-ada", displayName: "Ada", isVideo: false, conversationId: "c-ada"))
        let pending = sut.inFlightDial
        await readiness.settle(waiters: 1)
        readiness.release(.timedOut)
        await pending?.value

        XCTAssertTrue(recorder.started.isEmpty)
        XCTAssertEqual(recorder.notConnected, 1)
    }

    func test_dial_signedOut_placesNothing_silently() async {
        let recorder = Recorder()
        let readiness = GatedReadiness(isReady: false)
        let sut = dialer(recorder, readiness: readiness)

        sut.dial(ada)
        let pending = sut.inFlightDial
        await readiness.settle(waiters: 1)
        readiness.release(.signedOut)
        await pending?.value

        XCTAssertTrue(recorder.started.isEmpty)
        XCTAssertEqual(recorder.notConnected, 0)
    }

    func test_dial_twiceWhileWaiting_placesOnlyTheLatestRequest() async {
        let recorder = Recorder()
        let readiness = GatedReadiness(isReady: false)
        let sut = dialer(recorder, readiness: readiness)

        sut.dial(ada)
        let first = sut.inFlightDial
        sut.dial(bob)
        let second = sut.inFlightDial
        await readiness.settle(waiters: 2)
        readiness.release(.ready)
        await first?.value
        await second?.value

        XCTAssertEqual(recorder.started, [bob])
    }

    func test_dialConversation_coldLaunch_resolvesThePeerOnlyOnceReady() async {
        let recorder = Recorder()
        let readiness = GatedReadiness(isReady: false)
        let sut = dialer(recorder, readiness: readiness, cached: ["c-ada": CallPeer(userId: "u-ada", displayName: "Ada")])

        let dialing = Task { await sut.dialConversation(id: "c-ada", isVideo: true) }
        await readiness.settle(waiters: 1)
        XCTAssertTrue(recorder.started.isEmpty)
        readiness.release(.ready)
        await dialing.value

        XCTAssertEqual(recorder.started, [CallBackRequest(userId: "u-ada", displayName: "Ada", isVideo: true, conversationId: "c-ada")])
    }

    func test_dialConversation_neverReady_saysNotConnected_andResolvesNothing() async {
        let recorder = Recorder()
        let readiness = GatedReadiness(isReady: false)
        let sut = dialer(recorder, readiness: readiness)

        let dialing = Task { await sut.dialConversation(id: "c-ghost", isVideo: false) }
        await readiness.settle(waiters: 1)
        readiness.release(.timedOut)
        await dialing.value

        XCTAssertTrue(recorder.started.isEmpty)
        XCTAssertTrue(recorder.fetched.isEmpty)
        XCTAssertEqual(recorder.notConnected, 1)
        XCTAssertEqual(recorder.unavailable, 0)
    }
}
