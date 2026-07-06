import XCTest
import MeeshySDK
@testable import Meeshy

// MARK: - Mock API Client for PendingStatusQueue

/// Minimal `APIClientProviding` mock that records calls and returns
/// configurable results. Uses JSON round-trip to synthesise any `Decodable T`.
/// `@unchecked Sendable` — lock protects mutable state.
final class MockStatusFlushClient: APIClientProviding, @unchecked Sendable {
    var baseURL: String = "https://mock.meeshy.test"
    var authToken: String?
    var anonymousSessionToken: String?

    private let lock = NSLock()
    private var _calledEndpoints: [String] = []
    private var _errorToThrow: Error?

    var calledEndpoints: [String] { lock.withLock { _calledEndpoints } }
    var callCount: Int { lock.withLock { _calledEndpoints.count } }

    func setError(_ error: Error?) { lock.withLock { _errorToThrow = error } }

    // Synthesise T by decoding a minimal valid JSON envelope.
    // Works for any T that decodes from `{"success":true,"data":{}}` or
    // array variants. PendingStatusQueue only uses APIResponse<[String:String]>.
    private func makeResponse<T: Decodable>(for type: T.Type) throws -> T {
        let json = Data(#"{"success":true,"data":{},"error":null}"#.utf8)
        return try JSONDecoder().decode(T.self, from: json)
    }

    func request<T: Decodable>(
        endpoint: String,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?
    ) async throws -> T {
        lock.withLock { _calledEndpoints.append(endpoint) }
        if let error = lock.withLock({ _errorToThrow }) { throw error }
        return try makeResponse(for: T.self)
    }

    func paginatedRequest<T: Decodable>(
        endpoint: String,
        cursor: String?,
        limit: Int
    ) async throws -> PaginatedAPIResponse<[T]> {
        throw NSError(domain: "MockStatusFlushClient.notImplemented", code: 0)
    }

    func offsetPaginatedRequest<T: Decodable>(
        endpoint: String,
        offset: Int,
        limit: Int
    ) async throws -> OffsetPaginatedAPIResponse<[T]> {
        throw NSError(domain: "MockStatusFlushClient.notImplemented", code: 0)
    }

    func post<T: Decodable, U: Encodable>(endpoint: String, body: U) async throws -> APIResponse<T> {
        throw NSError(domain: "MockStatusFlushClient.notImplemented", code: 0)
    }

    func put<T: Decodable, U: Encodable>(endpoint: String, body: U) async throws -> APIResponse<T> {
        throw NSError(domain: "MockStatusFlushClient.notImplemented", code: 0)
    }

    func patch<T: Decodable, U: Encodable>(endpoint: String, body: U) async throws -> APIResponse<T> {
        throw NSError(domain: "MockStatusFlushClient.notImplemented", code: 0)
    }

    func delete(endpoint: String) async throws -> APIResponse<[String: Bool]> {
        throw NSError(domain: "MockStatusFlushClient.notImplemented", code: 0)
    }

    func delete<T: Decodable, U: Encodable>(endpoint: String, body: U) async throws -> APIResponse<T> {
        throw NSError(domain: "MockStatusFlushClient.notImplemented", code: 0)
    }
}

@MainActor
final class PendingStatusQueueTests: XCTestCase {

    // PendingStatusQueue is an actor using UserDefaults for persistence.
    // We test enqueue, FIFO ordering, capacity, and data model serialization.

    private let testKey = "meeshy_pending_status_actions"

    // MARK: - Factory

    /// Builds a PendingStatusQueue backed by the test UserDefaults key.
    /// Each test owns its own mock so state is isolated.
    private func makeSUT(
        client: MockStatusFlushClient = MockStatusFlushClient()
    ) -> (sut: PendingStatusQueue, client: MockStatusFlushClient) {
        let sut = PendingStatusQueue(apiClient: client)
        return (sut, client)
    }

    /// Awaits the actor-isolated `pendingCount()` and asserts it equals `expected`.
    /// Hoists the `await` out of the `XCTAssertEqual` autoclosure (autoclosures do
    /// not support concurrency). Forwards `file`/`line` so failures point at the caller.
    private func assertPendingCount(
        _ expected: Int,
        in sut: PendingStatusQueue,
        _ message: @autoclosure () -> String = "",
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        let actual = await sut.pendingCount()
        XCTAssertEqual(actual, expected, message(), file: file, line: line)
    }

    override func setUp() async throws {
        UserDefaults.standard.removeObject(forKey: testKey)
    }

    override func tearDown() async throws {
        UserDefaults.standard.removeObject(forKey: testKey)
    }

    // MARK: - PendingAction Data Model

    func test_pendingAction_encodesAndDecodes() throws {
        let action = PendingStatusQueue.PendingAction(
            conversationId: "conv123",
            type: "read",
            timestamp: Date(timeIntervalSince1970: 1000)
        )

        let data = try JSONEncoder().encode(action)
        let decoded = try JSONDecoder().decode(PendingStatusQueue.PendingAction.self, from: data)

        XCTAssertEqual(decoded.conversationId, "conv123")
        XCTAssertEqual(decoded.type, "read")
        XCTAssertEqual(decoded.timestamp, Date(timeIntervalSince1970: 1000))
    }

    func test_pendingAction_storesConversationId() {
        let action = PendingStatusQueue.PendingAction(
            conversationId: "abc",
            type: "received",
            timestamp: Date()
        )
        XCTAssertEqual(action.conversationId, "abc")
    }

    func test_pendingAction_storesType() {
        let action = PendingStatusQueue.PendingAction(
            conversationId: "abc",
            type: "read",
            timestamp: Date()
        )
        XCTAssertEqual(action.type, "read")
    }

    // MARK: - Enqueue

    func test_enqueue_persistsActionToUserDefaults() async {
        let queue = PendingStatusQueue.shared
        let action = PendingStatusQueue.PendingAction(
            conversationId: "conv1",
            type: "read",
            timestamp: Date()
        )

        await queue.enqueue(action)

        let data = UserDefaults.standard.data(forKey: testKey)
        XCTAssertNotNil(data)

        let actions = try? JSONDecoder().decode([PendingStatusQueue.PendingAction].self, from: data!)
        XCTAssertEqual(actions?.count, 1)
        XCTAssertEqual(actions?.first?.conversationId, "conv1")
    }

    func test_enqueue_multipleActions_preservesFIFOOrder() async {
        let queue = PendingStatusQueue.shared

        for i in 0..<3 {
            let action = PendingStatusQueue.PendingAction(
                conversationId: "conv\(i)",
                type: "read",
                timestamp: Date()
            )
            await queue.enqueue(action)
        }

        let data = UserDefaults.standard.data(forKey: testKey)!
        let actions = try! JSONDecoder().decode([PendingStatusQueue.PendingAction].self, from: data)

        XCTAssertEqual(actions.count, 3)
        XCTAssertEqual(actions[0].conversationId, "conv0")
        XCTAssertEqual(actions[1].conversationId, "conv1")
        XCTAssertEqual(actions[2].conversationId, "conv2")
    }

    // MARK: - Capacity Limit

    func test_enqueue_overMaxActions_trimsByDroppingOldest() async {
        let queue = PendingStatusQueue.shared

        for i in 0..<105 {
            let action = PendingStatusQueue.PendingAction(
                conversationId: "conv\(i)",
                type: "read",
                timestamp: Date()
            )
            await queue.enqueue(action)
        }

        let data = UserDefaults.standard.data(forKey: testKey)!
        let actions = try! JSONDecoder().decode([PendingStatusQueue.PendingAction].self, from: data)

        XCTAssertLessThanOrEqual(actions.count, 100)
        XCTAssertEqual(actions.last?.conversationId, "conv104")
    }

    // MARK: - peek() and pendingCount()

    func test_peek_returnsAllEnqueuedActionsWithoutRemoving() async {
        let (sut, _) = makeSUT()

        await sut.enqueue(.init(conversationId: "c1", type: "read", timestamp: Date()))
        await sut.enqueue(.init(conversationId: "c2", type: "received", timestamp: Date()))

        let peeked = await sut.peek()

        XCTAssertEqual(peeked.count, 2)
        XCTAssertEqual(peeked.map(\.conversationId), ["c1", "c2"])

        let stillThere = await sut.peek()
        XCTAssertEqual(stillThere.count, 2, "peek must not remove actions")
    }

    func test_pendingCount_matchesEnqueuedCount() async {
        let (sut, _) = makeSUT()

        await assertPendingCount(0, in: sut)

        await sut.enqueue(.init(conversationId: "c1", type: "read", timestamp: Date()))
        await assertPendingCount(1, in: sut)

        await sut.enqueue(.init(conversationId: "c2", type: "received", timestamp: Date()))
        await assertPendingCount(2, in: sut)
    }

    // MARK: - clearAll()

    func test_clearAll_removesAllPendingActions() async {
        let (sut, _) = makeSUT()

        await sut.enqueue(.init(conversationId: "c1", type: "read", timestamp: Date()))
        await sut.enqueue(.init(conversationId: "c2", type: "read", timestamp: Date()))
        await sut.clearAll()

        await assertPendingCount(0, in: sut)
    }

    // MARK: - flush()

    func test_flush_callsMarkAsReadEndpoint_forReadActions() async {
        let (sut, client) = makeSUT()

        await sut.enqueue(.init(conversationId: "abc123", type: "read", timestamp: Date()))
        await sut.flush()

        XCTAssertEqual(client.callCount, 1)
        XCTAssertEqual(client.calledEndpoints.first,
                       "/conversations/abc123/mark-as-read")
    }

    func test_flush_callsMarkAsReceivedEndpoint_forReceivedActions() async {
        let (sut, client) = makeSUT()

        await sut.enqueue(.init(conversationId: "abc456", type: "received", timestamp: Date()))
        await sut.flush()

        XCTAssertEqual(client.callCount, 1)
        XCTAssertEqual(client.calledEndpoints.first,
                       "/conversations/abc456/mark-as-received")
    }

    func test_flush_emptiesQueue_afterSuccessfulDispatch() async {
        let (sut, _) = makeSUT()

        await sut.enqueue(.init(conversationId: "c1", type: "read", timestamp: Date()))
        await sut.flush()

        await assertPendingCount(0, in: sut)
    }

    func test_flush_retainsFailedActions_whenAPIThrows() async {
        let (sut, client) = makeSUT()
        client.setError(NSError(domain: "network", code: -1))

        await sut.enqueue(.init(conversationId: "c1", type: "read", timestamp: Date()))
        await sut.flush()

        await assertPendingCount(1, in: sut, "failed actions must remain for next retry")
    }

    func test_flush_dropsActionsWithEmptyConversationId() async {
        let (sut, client) = makeSUT()

        // Empty conversationId is the legacy bug — must be silently dropped,
        // not retried (it would 404 forever at /conversations//mark-as-read).
        await sut.enqueue(.init(conversationId: "", type: "read", timestamp: Date()))
        await sut.flush()

        XCTAssertEqual(client.callCount, 0,
                       "empty conversationId actions must be silently dropped")
        await assertPendingCount(0, in: sut)
    }

    func test_flush_dropsExpiredActions_olderThan24h() async {
        let (sut, client) = makeSUT()

        let expired = Date().addingTimeInterval(-(25 * 60 * 60))
        await sut.enqueue(.init(conversationId: "c1", type: "read", timestamp: expired))
        await sut.flush()

        XCTAssertEqual(client.callCount, 0,
                       "expired actions (> 24h old) must be discarded without API calls")
        await assertPendingCount(0, in: sut)
    }

    func test_flush_processesMultipleActions_inOrder() async {
        let (sut, client) = makeSUT()

        await sut.enqueue(.init(conversationId: "conv-A", type: "read", timestamp: Date()))
        await sut.enqueue(.init(conversationId: "conv-B", type: "received", timestamp: Date()))
        await sut.enqueue(.init(conversationId: "conv-C", type: "read", timestamp: Date()))

        await sut.flush()

        XCTAssertEqual(client.callCount, 3)
        XCTAssertEqual(client.calledEndpoints[0], "/conversations/conv-A/mark-as-read")
        XCTAssertEqual(client.calledEndpoints[1], "/conversations/conv-B/mark-as-received")
        XCTAssertEqual(client.calledEndpoints[2], "/conversations/conv-C/mark-as-read")
    }

    func test_flush_noOp_whenQueueIsEmpty() async {
        let (sut, client) = makeSUT()

        await sut.flush()

        XCTAssertEqual(client.callCount, 0)
    }

    func test_flush_blanketFailure_retainsAllActions() async {
        let (sut, client) = makeSUT()

        // Configure failure before enqueuing so flush always throws.
        client.setError(NSError(domain: "network", code: -1009))

        await sut.enqueue(.init(conversationId: "ok-conv", type: "read", timestamp: Date()))
        await sut.enqueue(.init(conversationId: "fail-conv", type: "read", timestamp: Date()))
        await sut.flush()

        await assertPendingCount(2, in: sut, "all actions must be retained when all API calls fail")
        XCTAssertEqual(client.callCount, 2,
                       "both endpoints must be attempted even though both fail")
    }
}
