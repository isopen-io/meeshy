import XCTest
@testable import MeeshySDK

private final class FakeTransport: RetirableTransport {
    var reconnects = true
    private(set) var disconnectCount = 0
    private let onDisconnect: () -> Void

    init(onDisconnect: @escaping () -> Void = {}) {
        self.onDisconnect = onDisconnect
    }

    func disconnect() {
        disconnectCount += 1
        onDisconnect()
    }
}

private actor GraceGate {
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

final class SocketTransportRetirementTests: XCTestCase {

    private func makeRetirement(gate: GraceGate) -> SocketTransportRetirement {
        SocketTransportRetirement(grace: .seconds(12), sleep: { _ in
            await gate.wait()
            return true
        })
    }

    func test_retire_stopsTheReconnectLoopAndKeepsTheTransportUntilTheGraceEnds() {
        let retirement = makeRetirement(gate: GraceGate())
        let transport = FakeTransport()

        retirement.retire(transport)

        XCTAssertFalse(transport.reconnects, "un transport retiré garde ses accusés en vol, jamais sa boucle de reconnexion")
        XCTAssertEqual(retirement.retiredCount, 1)
        XCTAssertEqual(transport.disconnectCount, 0)
    }

    func test_retire_closesTheTransportOnceAfterTheGrace_thenReleasesIt() async {
        let gate = GraceGate()
        let retirement = makeRetirement(gate: gate)
        let closed = expectation(description: "le transport est fermé")
        let transport = FakeTransport(onDisconnect: { closed.fulfill() })

        retirement.retire(transport)
        await gate.open()
        await fulfillment(of: [closed], timeout: 2)

        XCTAssertEqual(transport.disconnectCount, 1)
        XCTAssertEqual(retirement.retiredCount, 0)
    }

    func test_retireNil_doesNothing() {
        let retirement = makeRetirement(gate: GraceGate())

        retirement.retire(nil)

        XCTAssertEqual(retirement.retiredCount, 0)
    }

    func test_twoTransports_areClosedOneByOne() async {
        let gate = GraceGate()
        let retirement = makeRetirement(gate: gate)
        let closed = expectation(description: "les deux transports sont fermés")
        closed.expectedFulfillmentCount = 2
        let first = FakeTransport(onDisconnect: { closed.fulfill() })
        let second = FakeTransport(onDisconnect: { closed.fulfill() })

        retirement.retire(first)
        retirement.retire(second)
        XCTAssertEqual(retirement.retiredCount, 2)
        await gate.open()
        await fulfillment(of: [closed], timeout: 2)

        XCTAssertEqual([first.disconnectCount, second.disconnectCount], [1, 1])
        XCTAssertEqual(retirement.retiredCount, 0)
    }
}
