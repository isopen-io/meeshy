import XCTest
@testable import Meeshy

private struct StubHook: MediaPipelineHook {
    let identifier: String
}

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
