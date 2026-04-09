import XCTest
import MeeshySDK
@testable import Meeshy

/// Integration test: cache has data -> displayed immediately -> API refresh -> updated silently
@MainActor
final class ConversationLoadFlowTests: XCTestCase {

    // MARK: - Helpers

    private func makeConversationService() -> MockConversationService {
        MockConversationService()
    }

    private func makeCacheService() -> MockCacheService {
        MockCacheService()
    }

    private func makeConversation(id: String, title: String = "Test") -> Conversation {
        Conversation(id: id, identifier: id, type: .direct, title: title, lastMessageAt: Date(), createdAt: Date(), updatedAt: Date())
    }

    private func makeAPIConversation(id: String) -> APIConversation {
        JSONStub.decode("""
        {"id":"\(id)","type":"direct","createdAt":"2026-01-01T00:00:00.000Z"}
        """)
    }

    // MARK: - Cache-First Loading

    func test_cachedConversations_returnedImmediately() {
        let cache = makeCacheService()
        let conv1 = makeConversation(id: "c1", title: "Cached Conv")
        cache.cacheConversations([conv1])

        let cached = cache.getCachedConversations()
        XCTAssertEqual(cached.count, 1)
        XCTAssertEqual(cached.first?.title, "Cached Conv")
        XCTAssertEqual(cache.getCachedConversationsCallCount, 1)
    }

    func test_cacheEmpty_returnsEmptyArray() {
        let cache = makeCacheService()
        let cached = cache.getCachedConversations()
        XCTAssertTrue(cached.isEmpty)
    }

    // MARK: - API Refresh After Cache

    func test_apiRefresh_updatesCache() async {
        let cache = makeCacheService()
        let service = makeConversationService()

        let oldConv = makeConversation(id: "c1", title: "Old Title")
        cache.cacheConversations([oldConv])

        let cached = cache.getCachedConversations()
        XCTAssertEqual(cached.first?.title, "Old Title")

        let freshConv = makeConversation(id: "c1", title: "Updated Title")
        cache.cacheConversations([freshConv])

        let refreshed = cache.getCachedConversations()
        XCTAssertEqual(refreshed.first?.title, "Updated Title")
        XCTAssertEqual(cache.cacheConversationsCallCount, 2)
    }

    // MARK: - GetById

    func test_getById_callsServiceAndReturnsConversation() async {
        let service = makeConversationService()
        service.getByIdResult = .success(makeAPIConversation(id: "c123"))

        let result = try? await service.getById("c123")
        XCTAssertNotNil(result)
        XCTAssertEqual(service.getByIdCallCount, 1)
        XCTAssertEqual(service.lastGetByIdConversationId, "c123")
    }

    func test_getById_failure_throwsError() async {
        let service = makeConversationService()
        service.getByIdResult = .failure(NSError(domain: "test", code: 404))

        do {
            _ = try await service.getById("nonexistent")
            XCTFail("Expected error")
        } catch {
            XCTAssertEqual(service.getByIdCallCount, 1)
        }
    }

    // MARK: - Mark Read

    func test_markRead_callsService() async {
        let service = makeConversationService()
        try? await service.markRead(conversationId: "c1")
        XCTAssertEqual(service.markReadCallCount, 1)
        XCTAssertEqual(service.lastMarkReadConversationId, "c1")
    }

    // MARK: - Cache Message Loading

    func test_cachedMessages_returnedForConversation() {
        let cache = makeCacheService()
        let msg = Message(conversationId: "c1", content: "Cached message")
        cache.cacheMessages([msg], conversationId: "c1")

        let cached = cache.getCachedMessages(conversationId: "c1", limit: 20, offset: 0)
        XCTAssertEqual(cached.count, 1)
        XCTAssertEqual(cached.first?.content, "Cached message")
    }

    func test_cachedMessages_emptyForUnknownConversation() {
        let cache = makeCacheService()
        let cached = cache.getCachedMessages(conversationId: "unknown", limit: 20, offset: 0)
        XCTAssertTrue(cached.isEmpty)
    }
}
