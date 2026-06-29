import XCTest
@testable import Meeshy

// MARK: - Test Doubles

private struct StubHook: MediaPipelineHook {
    let identifier: String
}

/// Actor-isolated spy that records every `callDidTransition` invocation.
private actor SpyHook: MediaPipelineHook {
    nonisolated let identifier: String
    private var _transitions: [(state: CallState, context: CallContext)] = []

    init(id: String = "spy") { self.identifier = id }

    func callDidTransition(_ state: CallState, in context: CallContext) async {
        _transitions.append((state, context))
    }

    func transitions() -> [(state: CallState, context: CallContext)] { _transitions }
}

// MARK: - Phase 0: Scaffold

@MainActor
final class CallEventQueueTests: XCTestCase {

    func test_initialState_isIdle() async {
        let queue = CallEventQueue()
        let state = await queue.state
        let version = await queue.version
        let callId = await queue.currentCallId
        XCTAssertEqual(state, .idle)
        XCTAssertEqual(version, 0)
        XCTAssertNil(callId)
    }

    func test_register_addsHookToList() async {
        let queue = CallEventQueue()
        await queue.register(hook: StubHook(identifier: "h1"))
        await queue.register(hook: StubHook(identifier: "h2"))
        let hooks = await queue.currentHooks()
        XCTAssertEqual(hooks.map(\.identifier), ["h1", "h2"])
    }

    func test_unregister_removesByIdentifier() async {
        let queue = CallEventQueue()
        await queue.register(hook: StubHook(identifier: "h1"))
        await queue.register(hook: StubHook(identifier: "h2"))
        await queue.unregister(hookIdentifier: "h1")
        let hooks = await queue.currentHooks()
        XCTAssertEqual(hooks.map(\.identifier), ["h2"])
    }

    func test_unregister_unknownIdentifier_isNoop() async {
        let queue = CallEventQueue()
        await queue.register(hook: StubHook(identifier: "h1"))
        await queue.unregister(hookIdentifier: "nope")
        let hooks = await queue.currentHooks()
        XCTAssertEqual(hooks.map(\.identifier), ["h1"])
    }
}

// MARK: - Phase 1: FSM Transitions — Outgoing Call Path

@MainActor
final class CallEventQueueOutgoingTests: XCTestCase {

    func test_outgoingStarted_fromIdle_transitionsToRingingOutgoing() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: true, peerId: "p1"))
        let state = await queue.state
        XCTAssertEqual(state, .ringing(isOutgoing: true))
    }

    func test_outgoingStarted_setsCurrentCallId() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "call-42", isVideo: false, peerId: "peer-1"))
        let callId = await queue.currentCallId
        XCTAssertEqual(callId, "call-42")
    }

    func test_outgoingStarted_setsContextWithCallerRole() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: true, peerId: "p1"))
        let context = await queue.currentContext
        XCTAssertEqual(context?.role, .caller)
        XCTAssertEqual(context?.callId, "c1")
        XCTAssertEqual(context?.peerId, "p1")
        XCTAssertTrue(context?.isVideo == true)
    }

    func test_outgoingStarted_incrementsVersion() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: true, peerId: "p1"))
        let version = await queue.version
        XCTAssertEqual(version, 1)
    }

    func test_peerJoined_fromRingingOutgoing_transitionsToOffering() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: true, peerId: "p1"))
        try await queue.handle(.peerJoined)
        let state = await queue.state
        XCTAssertEqual(state, .offering)
    }

    func test_negotiating_fromOffering_transitionsToConnecting() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: true, peerId: "p1"))
        try await queue.handle(.peerJoined)
        try await queue.handle(.negotiating)
        let state = await queue.state
        XCTAssertEqual(state, .connecting)
    }

    func test_fullOutgoingCallFlow_happy() async throws {
        let queue = CallEventQueue()

        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: true, peerId: "p1"))
        XCTAssertEqual(await queue.state, .ringing(isOutgoing: true))

        try await queue.handle(.peerJoined)
        XCTAssertEqual(await queue.state, .offering)

        try await queue.handle(.negotiating)
        XCTAssertEqual(await queue.state, .connecting)

        try await queue.handle(.established)
        XCTAssertEqual(await queue.state, .connected)

        try await queue.handle(.ended(reason: .local))
        XCTAssertEqual(await queue.state, .ended(reason: .local))

        try await queue.handle(.reset)
        XCTAssertEqual(await queue.state, .idle)
        XCTAssertNil(await queue.currentCallId)
    }
}

// MARK: - Phase 1: FSM Transitions — Incoming Call Path

@MainActor
final class CallEventQueueIncomingTests: XCTestCase {

    func test_incomingReceived_fromIdle_transitionsToRingingIncoming() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.incomingReceived(callId: "c2", isVideo: false, peerId: "p2"))
        let state = await queue.state
        XCTAssertEqual(state, .ringing(isOutgoing: false))
    }

    func test_incomingReceived_setsContextWithCalleeRole() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.incomingReceived(callId: "c2", isVideo: false, peerId: "p2"))
        let context = await queue.currentContext
        XCTAssertEqual(context?.role, .callee)
        XCTAssertEqual(context?.callId, "c2")
        XCTAssertEqual(context?.peerId, "p2")
        XCTAssertFalse(context?.isVideo == true)
    }

    func test_negotiating_fromRingingIncoming_transitionsToConnecting() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.incomingReceived(callId: "c2", isVideo: false, peerId: "p2"))
        try await queue.handle(.negotiating)
        let state = await queue.state
        XCTAssertEqual(state, .connecting)
    }

    func test_fullIncomingCallFlow_happy() async throws {
        let queue = CallEventQueue()

        try await queue.handle(.incomingReceived(callId: "c2", isVideo: false, peerId: "p2"))
        XCTAssertEqual(await queue.state, .ringing(isOutgoing: false))

        try await queue.handle(.negotiating)
        XCTAssertEqual(await queue.state, .connecting)

        try await queue.handle(.established)
        XCTAssertEqual(await queue.state, .connected)

        try await queue.handle(.ended(reason: .remote))
        XCTAssertEqual(await queue.state, .ended(reason: .remote))
    }
}

// MARK: - Phase 1: FSM Transitions — Reconnect Path

@MainActor
final class CallEventQueueReconnectTests: XCTestCase {

    private func makeConnected() async throws -> CallEventQueue {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: true, peerId: "p1"))
        try await queue.handle(.peerJoined)
        try await queue.handle(.negotiating)
        try await queue.handle(.established)
        return queue
    }

    func test_established_fromConnecting_transitionsToConnected() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: true, peerId: "p1"))
        try await queue.handle(.peerJoined)
        try await queue.handle(.negotiating)
        try await queue.handle(.established)
        XCTAssertEqual(await queue.state, .connected)
    }

    func test_reconnecting_fromConnected_transitionsToReconnecting() async throws {
        let queue = try await makeConnected()
        try await queue.handle(.reconnecting(attempt: 1))
        XCTAssertEqual(await queue.state, .reconnecting(attempt: 1))
    }

    func test_reconnecting_fromConnecting_transitionsToReconnecting() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: true, peerId: "p1"))
        try await queue.handle(.peerJoined)
        try await queue.handle(.negotiating)
        try await queue.handle(.reconnecting(attempt: 1))
        XCTAssertEqual(await queue.state, .reconnecting(attempt: 1))
    }

    func test_reconnecting_fromReconnecting_escalatesAttempt() async throws {
        let queue = try await makeConnected()
        try await queue.handle(.reconnecting(attempt: 1))
        try await queue.handle(.reconnecting(attempt: 2))
        XCTAssertEqual(await queue.state, .reconnecting(attempt: 2))
    }

    func test_reconnected_fromReconnecting_transitionsToConnected() async throws {
        let queue = try await makeConnected()
        try await queue.handle(.reconnecting(attempt: 1))
        try await queue.handle(.reconnected)
        XCTAssertEqual(await queue.state, .connected)
    }

    func test_fullReconnectFlow() async throws {
        let queue = try await makeConnected()

        try await queue.handle(.reconnecting(attempt: 1))
        XCTAssertEqual(await queue.state, .reconnecting(attempt: 1))

        try await queue.handle(.reconnecting(attempt: 2))
        XCTAssertEqual(await queue.state, .reconnecting(attempt: 2))

        try await queue.handle(.reconnected)
        XCTAssertEqual(await queue.state, .connected)
    }
}

// MARK: - Phase 1: FSM Transitions — Ended + Reset

@MainActor
final class CallEventQueueEndedResetTests: XCTestCase {

    func test_ended_fromConnected_transitionsToEnded() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        try await queue.handle(.peerJoined)
        try await queue.handle(.negotiating)
        try await queue.handle(.established)
        try await queue.handle(.ended(reason: .local))
        XCTAssertEqual(await queue.state, .ended(reason: .local))
    }

    func test_ended_fromConnecting_transitionsToEnded() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        try await queue.handle(.peerJoined)
        try await queue.handle(.negotiating)
        try await queue.handle(.ended(reason: .connectionLost))
        XCTAssertEqual(await queue.state, .ended(reason: .connectionLost))
    }

    func test_ended_fromRinging_transitionsToEnded() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.incomingReceived(callId: "c2", isVideo: false, peerId: "p2"))
        try await queue.handle(.ended(reason: .rejected))
        XCTAssertEqual(await queue.state, .ended(reason: .rejected))
    }

    func test_ended_fromReconnecting_transitionsToEnded() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        try await queue.handle(.peerJoined)
        try await queue.handle(.negotiating)
        try await queue.handle(.established)
        try await queue.handle(.reconnecting(attempt: 1))
        try await queue.handle(.ended(reason: .connectionLost))
        XCTAssertEqual(await queue.state, .ended(reason: .connectionLost))
    }

    func test_reset_fromConnected_transitionsToIdle() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        try await queue.handle(.peerJoined)
        try await queue.handle(.negotiating)
        try await queue.handle(.established)
        try await queue.handle(.reset)
        XCTAssertEqual(await queue.state, .idle)
    }

    func test_reset_clearsCurrentCallId() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        try await queue.handle(.reset)
        XCTAssertNil(await queue.currentCallId)
    }

    func test_reset_clearsCurrentContext() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        try await queue.handle(.reset)
        XCTAssertNil(await queue.currentContext)
    }

    func test_reset_fromIdle_remainsIdle() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.reset)
        XCTAssertEqual(await queue.state, .idle)
        XCTAssertEqual(await queue.version, 1)
    }

    func test_reset_fromEnded_transitionsToIdle() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        try await queue.handle(.ended(reason: .remote))
        try await queue.handle(.reset)
        XCTAssertEqual(await queue.state, .idle)
    }
}

// MARK: - Phase 1: Illegal Transitions

@MainActor
final class CallEventQueueIllegalTransitionTests: XCTestCase {

    func test_peerJoined_fromIdle_throws() async {
        let queue = CallEventQueue()
        do {
            try await queue.handle(.peerJoined)
            XCTFail("Expected illegalTransition")
        } catch CallEventError.illegalTransition(let from, _) {
            XCTAssertEqual(from, .idle)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func test_established_fromIdle_throws() async {
        let queue = CallEventQueue()
        do {
            try await queue.handle(.established)
            XCTFail("Expected illegalTransition")
        } catch CallEventError.illegalTransition(let from, _) {
            XCTAssertEqual(from, .idle)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func test_negotiating_fromRingingOutgoing_throws() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        do {
            try await queue.handle(.negotiating)
            XCTFail("Outgoing call must go through peerJoined → offering before negotiating")
        } catch CallEventError.illegalTransition(let from, _) {
            XCTAssertEqual(from, .ringing(isOutgoing: true))
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func test_peerJoined_fromRingingIncoming_throws() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.incomingReceived(callId: "c2", isVideo: false, peerId: "p2"))
        do {
            try await queue.handle(.peerJoined)
            XCTFail("Incoming call does not go through offering")
        } catch CallEventError.illegalTransition(let from, _) {
            XCTAssertEqual(from, .ringing(isOutgoing: false))
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func test_incomingReceived_fromConnecting_throws() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        try await queue.handle(.peerJoined)
        try await queue.handle(.negotiating)
        do {
            try await queue.handle(.incomingReceived(callId: "c2", isVideo: false, peerId: "p2"))
            XCTFail("Expected illegalTransition")
        } catch CallEventError.illegalTransition(let from, _) {
            XCTAssertEqual(from, .connecting)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func test_anyNonResetEvent_fromEnded_throws() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.incomingReceived(callId: "c2", isVideo: false, peerId: "p2"))
        try await queue.handle(.ended(reason: .missed))
        do {
            try await queue.handle(.established)
            XCTFail("Expected illegalTransition from ended")
        } catch CallEventError.illegalTransition(let from, _) {
            if case .ended = from { /* correct */ } else {
                XCTFail("Expected from to be .ended, got \(from)")
            }
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func test_illegalTransition_doesNotUpdateState() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        let versionBefore = await queue.version

        do {
            try await queue.handle(.established)
        } catch {}

        XCTAssertEqual(await queue.state, .ringing(isOutgoing: true))
        XCTAssertEqual(await queue.version, versionBefore)
    }

    func test_illegalTransition_doesNotClearCallId() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))

        do {
            try await queue.handle(.reconnected)
        } catch {}

        XCTAssertEqual(await queue.currentCallId, "c1")
    }
}

// MARK: - Phase 1: Version Tracking

@MainActor
final class CallEventQueueVersionTests: XCTestCase {

    func test_eachAcceptedTransition_incrementsVersion() async throws {
        let queue = CallEventQueue()
        XCTAssertEqual(await queue.version, 0)

        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        XCTAssertEqual(await queue.version, 1)

        try await queue.handle(.peerJoined)
        XCTAssertEqual(await queue.version, 2)

        try await queue.handle(.negotiating)
        XCTAssertEqual(await queue.version, 3)

        try await queue.handle(.established)
        XCTAssertEqual(await queue.version, 4)
    }

    func test_illegalTransition_doesNotIncrementVersion() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        let versionBefore = await queue.version

        do { try await queue.handle(.reconnected) } catch {}

        XCTAssertEqual(await queue.version, versionBefore)
    }

    func test_reset_incrementsVersion() async throws {
        let queue = CallEventQueue()
        try await queue.handle(.reset)
        XCTAssertEqual(await queue.version, 1)
    }
}

// MARK: - Phase 1: Hook Dispatch

@MainActor
final class CallEventQueueHookDispatchTests: XCTestCase {

    func test_handle_dispatchesHookWithNewState() async throws {
        let queue = CallEventQueue()
        let spy = SpyHook(id: "spy1")
        await queue.register(hook: spy)

        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: true, peerId: "p1"))

        let captured = await spy.transitions()
        XCTAssertEqual(captured.count, 1)
        XCTAssertEqual(captured.first?.state, .ringing(isOutgoing: true))
    }

    func test_handle_dispatchesHookWithContext() async throws {
        let queue = CallEventQueue()
        let spy = SpyHook(id: "spy1")
        await queue.register(hook: spy)

        try await queue.handle(.outgoingStarted(callId: "call-99", isVideo: true, peerId: "peer-99"))

        let captured = await spy.transitions()
        XCTAssertEqual(captured.first?.context.callId, "call-99")
        XCTAssertEqual(captured.first?.context.role, .caller)
    }

    func test_handle_dispatchesAllRegisteredHooks() async throws {
        let queue = CallEventQueue()
        let spy1 = SpyHook(id: "spy1")
        let spy2 = SpyHook(id: "spy2")
        await queue.register(hook: spy1)
        await queue.register(hook: spy2)

        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))

        let t1 = await spy1.transitions()
        let t2 = await spy2.transitions()
        XCTAssertEqual(t1.count, 1)
        XCTAssertEqual(t2.count, 1)
    }

    func test_handle_noHookDispatch_whenNoContext() async throws {
        let queue = CallEventQueue()
        let spy = SpyHook(id: "spy1")
        await queue.register(hook: spy)

        // reset from idle → no context, no dispatch
        try await queue.handle(.reset)

        let captured = await spy.transitions()
        XCTAssertTrue(captured.isEmpty)
    }

    func test_handle_hookDispatch_onReset_withActiveContext() async throws {
        let queue = CallEventQueue()
        let spy = SpyHook(id: "spy1")
        await queue.register(hook: spy)

        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        try await queue.handle(.reset)

        let captured = await spy.transitions()
        // Expect 2: one for ringing, one for reset→idle
        XCTAssertEqual(captured.count, 2)
        XCTAssertEqual(captured.last?.state, .idle)
    }

    func test_handle_illegalTransition_doesNotDispatchHooks() async throws {
        let queue = CallEventQueue()
        let spy = SpyHook(id: "spy1")
        await queue.register(hook: spy)

        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))
        do { try await queue.handle(.reconnected) } catch {}

        let captured = await spy.transitions()
        // Only ringing was dispatched; the illegal event did not dispatch
        XCTAssertEqual(captured.count, 1)
    }

    func test_unregisteredHook_doesNotReceiveTransitions() async throws {
        let queue = CallEventQueue()
        let spy = SpyHook(id: "spy1")
        await queue.register(hook: spy)
        await queue.unregister(hookIdentifier: "spy1")

        try await queue.handle(.outgoingStarted(callId: "c1", isVideo: false, peerId: "p1"))

        let captured = await spy.transitions()
        XCTAssertTrue(captured.isEmpty)
    }
}
