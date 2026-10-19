import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

actor SocketOrderGate {
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

@MainActor
final class ConversationSocketHandlerEventOrderTests: XCTestCase {

    private let conversationId = "000000000000000000000099"
    private let currentUserId = "000000000000000000000001"
    private let otherUserId = "000000000000000000000002"

    private func makeSUT() -> (
        sut: ConversationSocketHandler,
        delegate: MockConversationSocketDelegate,
        socket: MockMessageSocket
    ) {
        let socket = MockMessageSocket()
        let sut = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: currentUserId,
            messageSocket: socket
        )
        let delegate = MockConversationSocketDelegate()
        sut.delegate = delegate
        sut.armSocketSubscriptions()
        return (sut, delegate, socket)
    }

    private func makeIncomingMessage(id: String = "msg1") -> APIMessage {
        JSONStub.decode("""
        {
            "id":"\(id)",
            "conversationId":"\(conversationId)",
            "senderId":"\(otherUserId)",
            "content":"Hello",
            "createdAt":"2026-03-06T12:00:00.000Z",
            "sender":{"id":"\(otherUserId)","username":"alice","displayName":"Alice"}
        }
        """)
    }

    private func waitUntil(timeout: TimeInterval = 5, _ condition: () -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        return condition()
    }

    func test_typingStartAfterIncomingMessage_survivesTheSlowerReconcile() async {
        let (sut, delegate, socket) = makeSUT()
        let gate = SocketOrderGate()
        delegate.decryptGate = { await gate.wait() }

        socket.messageReceived.send(makeIncomingMessage())
        socket.typingStarted.send(TypingEvent(userId: otherUserId, username: "Alice", conversationId: conversationId))
        await drainMainQueue(turns: 3)
        await gate.open()
        let reconciled = await waitUntil { delegate.lastUnreadMessage != nil }
        await sut.awaitPendingSocketEvents()

        XCTAssertTrue(reconciled)
        XCTAssertEqual(
            delegate.typingUsernames, ["Alice"],
            "la frappe, arrivée APRÈS le message, était effacée par la réconciliation plus ancienne"
        )
    }

    func test_typingStopAfterTypingStart_endsWithAnEmptyRoster() async {
        let (sut, delegate, socket) = makeSUT()

        socket.typingStarted.send(TypingEvent(userId: otherUserId, username: "Alice", conversationId: conversationId))
        socket.typingStopped.send(TypingEvent(userId: otherUserId, username: "Alice", conversationId: conversationId))
        await sut.awaitPendingSocketEvents()

        XCTAssertTrue(delegate.typingUsernames.isEmpty)
    }

    func test_armSocketSubscriptions_calledTwice_keepsOneLane() async {
        let (sut, delegate, socket) = makeSUT()
        sut.armSocketSubscriptions()

        socket.typingStarted.send(TypingEvent(userId: otherUserId, username: "Alice", conversationId: conversationId))
        await sut.awaitPendingSocketEvents()

        XCTAssertEqual(delegate.typingUsernames, ["Alice"])
    }

    private func drainMainQueue(turns: Int) async {
        for _ in 0..<turns {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                DispatchQueue.main.async { continuation.resume() }
            }
        }
    }
}
