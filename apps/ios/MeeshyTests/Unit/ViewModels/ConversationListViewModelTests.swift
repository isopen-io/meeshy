import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

@MainActor
final class ConversationListViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        api: MockAPIClientForApp? = nil,
        conversationService: MockConversationService? = nil,
        preferenceService: MockPreferenceService? = nil,
        messageSocket: MockMessageSocket? = nil,
        messageService: MockMessageService? = nil,
        authManager: MockAuthManager? = nil
    ) -> (
        sut: ConversationListViewModel,
        api: MockAPIClientForApp,
        conversationService: MockConversationService,
        preferenceService: MockPreferenceService,
        messageSocket: MockMessageSocket,
        messageService: MockMessageService,
        authManager: MockAuthManager
    ) {
        let api = api ?? MockAPIClientForApp()
        let conversationService = conversationService ?? MockConversationService()
        let preferenceService = preferenceService ?? MockPreferenceService()
        let messageSocket = messageSocket ?? MockMessageSocket()
        let messageService = messageService ?? MockMessageService()
        let authManager = authManager ?? MockAuthManager()
        let sut = ConversationListViewModel(
            api: api,
            conversationService: conversationService,
            preferenceService: preferenceService,
            messageSocket: messageSocket,
            messageService: messageService,
            authManager: authManager
        )
        return (sut, api, conversationService, preferenceService, messageSocket, messageService, authManager)
    }

    private func makeConversation(
        id: String = "000000000000000000000001",
        name: String = "Test Conv",
        isPinned: Bool = false,
        isMuted: Bool = false,
        unreadCount: Int = 0,
        isActive: Bool = true,
        type: Conversation.ConversationType = .direct,
        lastMessageAt: Date = Date(),
        reaction: String? = nil,
        isAnnouncementChannel: Bool = false,
        sectionId: String? = nil
    ) -> Conversation {
        Conversation(
            id: id,
            identifier: id,
            type: type,
            title: name,
            isActive: isActive,
            lastMessageAt: lastMessageAt,
            createdAt: Date(),
            updatedAt: Date(),
            unreadCount: unreadCount,
            isAnnouncementChannel: isAnnouncementChannel,
            isPinned: isPinned,
            sectionId: sectionId,
            isMuted: isMuted,
            reaction: reaction
        )
    }

    private func makeAPIConversationResponse(
        ids: [String] = [],
        hasMore: Bool = false
    ) -> OffsetPaginatedAPIResponse<[APIConversation]> {
        let dataJSON: String
        if ids.isEmpty {
            dataJSON = "[]"
        } else {
            let items = ids.map { id in
                "{\"id\":\"\(id)\",\"type\":\"direct\",\"createdAt\":\"2026-01-01T00:00:00.000Z\"}"
            }
            dataJSON = "[\(items.joined(separator: ","))]"
        }
        return JSONStub.decode("""
        {"success":true,"data":\(dataJSON),"pagination":{"total":\(ids.count),"offset":0,"limit":100,"hasMore":\(hasMore)},"error":null}
        """)
    }

    private func makeAPIConversation(
        id: String = "000000000000000000000001",
        type: String = "direct"
    ) -> APIConversation {
        JSONStub.decode("""
        {"id":"\(id)","type":"\(type)","createdAt":"2026-01-01T00:00:00.000Z"}
        """)
    }

    // MARK: - loadConversations: Success

    func test_loadConversations_populatesConversationsFromAPI() async {
        let api = MockAPIClientForApp()
        let response = makeAPIConversationResponse(ids: ["000000000000000000000001", "000000000000000000000002"])
        api.stub("/conversations", result: response)
        let (sut, _, _, _, _, _, _) = makeSUT(api: api)

        await sut.loadConversations()

        XCTAssertEqual(sut.conversations.count, 2)
        XCTAssertEqual(sut.conversations[0].id, "000000000000000000000001")
        XCTAssertEqual(sut.conversations[1].id, "000000000000000000000002")
    }

    func test_loadConversations_setsIsLoadingToFalseWhenDone() async {
        let api = MockAPIClientForApp()
        let response = makeAPIConversationResponse(ids: [])
        api.stub("/conversations", result: response)
        let (sut, _, _, _, _, _, _) = makeSUT(api: api)

        await sut.loadConversations()

        XCTAssertFalse(sut.isLoading)
    }

    // MARK: - loadConversations: Failure

    func test_loadConversations_handlesAPIError() async {
        let api = MockAPIClientForApp()
        api.errorToThrow = NSError(domain: "test", code: 500)
        let (sut, _, _, _, _, _, _) = makeSUT(api: api)

        await sut.loadConversations()

        XCTAssertFalse(sut.isLoading)
    }

    // MARK: - loadConversations: Cache Valid

    func test_loadConversations_skipsFetchWhenCacheIsValid() async {
        let api = MockAPIClientForApp()
        let response = makeAPIConversationResponse(ids: ["000000000000000000000001"])
        api.stub("/conversations", result: response)
        let (sut, _, _, _, _, _, _) = makeSUT(api: api)

        await sut.loadConversations()
        let countAfterFirst = api.requestCount

        await sut.loadConversations()
        let countAfterSecond = api.requestCount

        XCTAssertEqual(countAfterFirst, countAfterSecond, "Second call should be skipped due to cache TTL")
    }

    func test_loadConversations_refetchesAfterCacheInvalidation() async {
        let api = MockAPIClientForApp()
        let response = makeAPIConversationResponse(ids: ["000000000000000000000001"])
        api.stub("/conversations", result: response)
        let (sut, _, _, _, _, _, _) = makeSUT(api: api)

        await sut.loadConversations()
        let countAfterFirst = api.requestCount

        sut.invalidateCache()
        await sut.loadConversations()
        let countAfterSecond = api.requestCount

        XCTAssertGreaterThan(countAfterSecond, countAfterFirst, "Should refetch after invalidation")
    }

    // MARK: - togglePin: Success

    func test_togglePin_setsIsPinnedOptimistically() async {
        let (sut, _, _, preferenceService, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", isPinned: false)]

        await sut.togglePin(for: "conv1")

        XCTAssertTrue(sut.conversations[0].isPinned)
        XCTAssertEqual(preferenceService.updateConversationPreferencesCallCount, 1)
        XCTAssertEqual(preferenceService.lastUpdateConversationPreferencesId, "conv1")
    }

    // MARK: - togglePin: Failure (rollback)

    func test_togglePin_rollsBackOnFailure() async {
        let preferenceService = MockPreferenceService()
        preferenceService.updateConversationPreferencesResult = .failure(NSError(domain: "test", code: 400))
        let (sut, _, _, _, _, _, _) = makeSUT(preferenceService: preferenceService)
        sut.conversations = [makeConversation(id: "conv1", isPinned: false)]

        await sut.togglePin(for: "conv1")

        XCTAssertFalse(sut.conversations[0].isPinned, "Should rollback to original value on failure")
    }

    // MARK: - toggleMute: Success

    func test_toggleMute_setsIsMutedOptimistically() async {
        let (sut, _, _, preferenceService, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", isMuted: false)]

        await sut.toggleMute(for: "conv1")

        XCTAssertTrue(sut.conversations[0].isMuted)
        XCTAssertEqual(preferenceService.updateConversationPreferencesCallCount, 1)
    }

    // MARK: - toggleMute: Failure (rollback)

    func test_toggleMute_rollsBackOnFailure() async {
        let preferenceService = MockPreferenceService()
        preferenceService.updateConversationPreferencesResult = .failure(NSError(domain: "test", code: 400))
        let (sut, _, _, _, _, _, _) = makeSUT(preferenceService: preferenceService)
        sut.conversations = [makeConversation(id: "conv1", isMuted: false)]

        await sut.toggleMute(for: "conv1")

        XCTAssertFalse(sut.conversations[0].isMuted, "Should rollback to original value on failure")
    }

    // MARK: - markAsRead: Success

    func test_markAsRead_setsUnreadCountToZero() async {
        let (sut, _, conversationService, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", unreadCount: 5)]

        await sut.markAsRead(conversationId: "conv1")

        XCTAssertEqual(sut.conversations[0].unreadCount, 0)
        XCTAssertEqual(conversationService.markReadCallCount, 1)
        XCTAssertEqual(conversationService.lastMarkReadConversationId, "conv1")
    }

    // MARK: - markAsRead: Failure (rollback)

    func test_markAsRead_rollsBackOnFailure() async {
        let conversationService = MockConversationService()
        conversationService.markReadResult = .failure(NSError(domain: "test", code: 500))
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)
        sut.conversations = [makeConversation(id: "conv1", unreadCount: 5)]

        await sut.markAsRead(conversationId: "conv1")

        XCTAssertEqual(sut.conversations[0].unreadCount, 5, "Should rollback to previous count on failure")
    }

    // MARK: - deleteConversation: Success

    func test_deleteConversation_removesFromList() async {
        let (sut, _, conversationService, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "conv1"),
            makeConversation(id: "conv2")
        ]

        await sut.deleteConversation(conversationId: "conv1")

        XCTAssertEqual(sut.conversations.count, 1)
        XCTAssertEqual(sut.conversations[0].id, "conv2")
        XCTAssertEqual(conversationService.deleteForMeCallCount, 1)
        XCTAssertEqual(conversationService.lastDeleteForMeConversationId, "conv1")
    }

    // MARK: - deleteConversation: Failure (re-insert)

    func test_deleteConversation_reInsertsOnFailure() async {
        let conversationService = MockConversationService()
        conversationService.deleteForMeResult = .failure(NSError(domain: "test", code: 500))
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)
        sut.conversations = [
            makeConversation(id: "conv1"),
            makeConversation(id: "conv2")
        ]

        await sut.deleteConversation(conversationId: "conv1")

        XCTAssertEqual(sut.conversations.count, 2, "Should re-insert conversation on failure")
        XCTAssertTrue(sut.conversations.contains(where: { $0.id == "conv1" }))
    }

    // MARK: - Filter Pipeline

    func test_filterPipeline_allFilterShowsActiveConversations() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "active1", isActive: true),
            makeConversation(id: "archived1", isActive: false)
        ]
        sut.selectedFilter = .all

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 1)
        XCTAssertEqual(sut.filteredConversations[0].id, "active1")
    }

    func test_filterPipeline_unreadFilterShowsOnlyUnread() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "read", unreadCount: 0),
            makeConversation(id: "unread", unreadCount: 3)
        ]
        sut.selectedFilter = .unread

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 1)
        XCTAssertEqual(sut.filteredConversations[0].id, "unread")
    }

    func test_filterPipeline_personnelFilterShowsDirectOnly() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "dm", type: .direct),
            makeConversation(id: "grp", type: .group)
        ]
        sut.selectedFilter = .personnel

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 1)
        XCTAssertEqual(sut.filteredConversations[0].id, "dm")
    }

    func test_filterPipeline_priveeFilterShowsGroupOnly() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "dm", type: .direct),
            makeConversation(id: "grp", type: .group)
        ]
        sut.selectedFilter = .privee

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 1)
        XCTAssertEqual(sut.filteredConversations[0].id, "grp")
    }

    func test_filterPipeline_archivedFilterShowsInactiveOnly() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "active", isActive: true),
            makeConversation(id: "archived", isActive: false)
        ]
        sut.selectedFilter = .archived

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 1)
        XCTAssertEqual(sut.filteredConversations[0].id, "archived")
    }

    func test_filterPipeline_searchTextFiltersConversations() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "c1", name: "Alice"),
            makeConversation(id: "c2", name: "Bob"),
            makeConversation(id: "c3", name: "Alice and Bob")
        ]
        sut.selectedFilter = .all
        sut.searchText = "Alice"

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 2)
        let ids = Set(sut.filteredConversations.map(\.id))
        XCTAssertTrue(ids.contains("c1"))
        XCTAssertTrue(ids.contains("c3"))
    }

    func test_filterPipeline_favorisFilterShowsConversationsWithReaction() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "fav", reaction: "heart"),
            makeConversation(id: "nofav", reaction: nil)
        ]
        sut.selectedFilter = .favoris

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 1)
        XCTAssertEqual(sut.filteredConversations[0].id, "fav")
    }

    func test_filterPipeline_channelsFilterShowsAnnouncementChannels() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "ch1", isAnnouncementChannel: true),
            makeConversation(id: "notch", isAnnouncementChannel: false)
        ]
        sut.selectedFilter = .channels

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 1)
        XCTAssertEqual(sut.filteredConversations[0].id, "ch1")
    }

    // MARK: - Socket: Unread Update

    func test_socketUnreadUpdate_updatesConversationUnreadCount() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.conversations = [makeConversation(id: "conv1", unreadCount: 0)]

        messageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "conv1", unreadCount: 7))

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.conversations[0].unreadCount, 7)
    }

    func test_socketUnreadUpdate_ignoresUnknownConversation() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.conversations = [makeConversation(id: "conv1", unreadCount: 0)]

        messageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "unknown", unreadCount: 5))

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.conversations[0].unreadCount, 0, "Should not modify existing conversations")
    }

    // MARK: - Socket: Typing

    func test_socketTypingStarted_addsUsernameToTypingDictionary() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)

        messageSocket.typingStarted.send(TypingEvent(userId: "user1", username: "Alice", conversationId: "conv1"))

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.typingUsernames["conv1"], "Alice")
    }

    func test_socketTypingStopped_removesUsernameFromTypingDictionary() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.typingUsernames["conv1"] = "Alice"

        messageSocket.typingStopped.send(TypingEvent(userId: "user1", username: "Alice", conversationId: "conv1"))

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertNil(sut.typingUsernames["conv1"])
    }

    // MARK: - Socket: New Message

    func test_socketMessageReceived_updatesLastMessagePreview() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.conversations = [makeConversation(id: "conv1")]

        let apiMsg: APIMessage = JSONStub.decode("""
        {
            "id":"msg1",
            "conversationId":"conv1",
            "senderId":"other-user",
            "content":"Hello there!",
            "createdAt":"2026-03-06T12:00:00.000Z",
            "sender":{"id":"other-user","username":"bob","displayName":"Bob"}
        }
        """)
        messageSocket.simulateMessage(apiMsg)

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.conversations[0].lastMessagePreview, "Hello there!")
        XCTAssertEqual(sut.conversations[0].lastMessageSenderName, "Bob")
    }

    // MARK: - totalUnreadCount

    func test_totalUnreadCount_returnsSum() {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "c1", unreadCount: 3),
            makeConversation(id: "c2", unreadCount: 5),
            makeConversation(id: "c3", unreadCount: 0)
        ]

        XCTAssertEqual(sut.totalUnreadCount, 8)
    }

    // MARK: - markAsUnread

    func test_markAsUnread_setsUnreadCountToOneWhenZero() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", unreadCount: 0)]

        await sut.markAsUnread(conversationId: "conv1")

        XCTAssertEqual(sut.conversations[0].unreadCount, 1)
    }

    func test_markAsUnread_rollsBackOnFailure() async {
        let conversationService = MockConversationService()
        conversationService.markUnreadResult = .failure(NSError(domain: "test", code: 500))
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)
        sut.conversations = [makeConversation(id: "conv1", unreadCount: 0)]

        await sut.markAsUnread(conversationId: "conv1")

        XCTAssertEqual(sut.conversations[0].unreadCount, 0, "Should rollback on failure")
    }

    // MARK: - archiveConversation

    func test_archiveConversation_setsIsActiveToFalse() async {
        let (sut, _, _, preferenceService, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", isActive: true)]

        await sut.archiveConversation(conversationId: "conv1")

        XCTAssertFalse(sut.conversations[0].isActive)
        XCTAssertEqual(preferenceService.updateConversationPreferencesCallCount, 1)
    }

    func test_archiveConversation_rollsBackOnFailure() async {
        let preferenceService = MockPreferenceService()
        preferenceService.updateConversationPreferencesResult = .failure(NSError(domain: "test", code: 500))
        let (sut, _, _, _, _, _, _) = makeSUT(preferenceService: preferenceService)
        sut.conversations = [makeConversation(id: "conv1", isActive: true)]

        await sut.archiveConversation(conversationId: "conv1")

        XCTAssertTrue(sut.conversations[0].isActive, "Should rollback on failure")
    }

    // MARK: - unarchiveConversation

    func test_unarchiveConversation_setsIsActiveToTrue() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", isActive: false)]

        await sut.unarchiveConversation(conversationId: "conv1")

        XCTAssertTrue(sut.conversations[0].isActive)
    }

    // MARK: - setFavoriteReaction

    func test_setFavoriteReaction_updatesReactionOptimistically() async {
        let (sut, _, _, preferenceService, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", reaction: nil)]

        await sut.setFavoriteReaction(conversationId: "conv1", emoji: "heart")

        XCTAssertEqual(sut.conversations[0].reaction, "heart")
        XCTAssertEqual(preferenceService.updateConversationPreferencesCallCount, 1)
    }

    func test_setFavoriteReaction_rollsBackOnFailure() async {
        let preferenceService = MockPreferenceService()
        preferenceService.updateConversationPreferencesResult = .failure(NSError(domain: "test", code: 500))
        let (sut, _, _, _, _, _, _) = makeSUT(preferenceService: preferenceService)
        sut.conversations = [makeConversation(id: "conv1", reaction: nil)]

        await sut.setFavoriteReaction(conversationId: "conv1", emoji: "heart")

        XCTAssertNil(sut.conversations[0].reaction, "Should rollback on failure")
    }

    // MARK: - togglePin on unpinned -> pinned -> unpinned

    func test_togglePin_togglesBackAndForth() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", isPinned: false)]

        await sut.togglePin(for: "conv1")
        XCTAssertTrue(sut.conversations[0].isPinned)

        await sut.togglePin(for: "conv1")
        XCTAssertFalse(sut.conversations[0].isPinned)
    }

    // MARK: - toggleMute on unmuted -> muted -> unmuted

    func test_toggleMute_togglesBackAndForth() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", isMuted: false)]

        await sut.toggleMute(for: "conv1")
        XCTAssertTrue(sut.conversations[0].isMuted)

        await sut.toggleMute(for: "conv1")
        XCTAssertFalse(sut.conversations[0].isMuted)
    }

    // MARK: - Non-existent conversation ID

    func test_togglePin_ignoredForUnknownConversation() async {
        let (sut, _, _, preferenceService, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1")]

        await sut.togglePin(for: "unknown")

        XCTAssertEqual(preferenceService.updateConversationPreferencesCallCount, 0)
    }

    func test_markAsRead_ignoredForUnknownConversation() async {
        let (sut, _, conversationService, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", unreadCount: 5)]

        await sut.markAsRead(conversationId: "unknown")

        XCTAssertEqual(conversationService.markReadCallCount, 0)
        XCTAssertEqual(sut.conversations[0].unreadCount, 5)
    }

    func test_deleteConversation_ignoredForUnknownConversation() async {
        let (sut, _, conversationService, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1")]

        await sut.deleteConversation(conversationId: "unknown")

        XCTAssertEqual(conversationService.deleteForMeCallCount, 0)
        XCTAssertEqual(sut.conversations.count, 1)
    }

    // MARK: - Initial State

    func test_initialState_hasEmptyConversationsAndNotLoading() {
        let (sut, _, _, _, _, _, _) = makeSUT()

        XCTAssertTrue(sut.conversations.isEmpty)
        XCTAssertTrue(sut.filteredConversations.isEmpty)
        XCTAssertTrue(sut.groupedConversations.isEmpty)
        XCTAssertFalse(sut.isLoading)
        XCTAssertFalse(sut.isLoadingMore)
        XCTAssertEqual(sut.searchText, "")
        XCTAssertEqual(sut.selectedFilter, .all)
        XCTAssertTrue(sut.typingUsernames.isEmpty)
        XCTAssertEqual(sut.totalUnreadCount, 0)
    }

    // MARK: - Filter: ouvertes (public + community)

    func test_filterPipeline_ouvertesFilterShowsPublicAndCommunity() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "pub", type: .public),
            makeConversation(id: "com", type: .community),
            makeConversation(id: "dm", type: .direct),
            makeConversation(id: "grp", type: .group)
        ]
        sut.selectedFilter = .ouvertes

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 2)
        let ids = Set(sut.filteredConversations.map(\.id))
        XCTAssertTrue(ids.contains("pub"))
        XCTAssertTrue(ids.contains("com"))
    }

    // MARK: - Filter: globales

    func test_filterPipeline_globalesFilterShowsGlobalOnly() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "glob", type: .global),
            makeConversation(id: "dm", type: .direct),
            makeConversation(id: "pub", type: .public)
        ]
        sut.selectedFilter = .globales

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 1)
        XCTAssertEqual(sut.filteredConversations[0].id, "glob")
    }

    // MARK: - Filter: all excludes archived

    func test_filterPipeline_allFilterExcludesArchivedConversations() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "active1", isActive: true),
            makeConversation(id: "active2", isActive: true),
            makeConversation(id: "archived", isActive: false)
        ]
        sut.selectedFilter = .all

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 2)
        XCTAssertFalse(sut.filteredConversations.contains(where: { $0.id == "archived" }))
    }

    // MARK: - Search + Filter Combined

    func test_filterPipeline_searchCombinedWithFilterNarrowsResults() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "c1", name: "Alice DM", unreadCount: 3),
            makeConversation(id: "c2", name: "Alice Group", unreadCount: 0),
            makeConversation(id: "c3", name: "Bob DM", unreadCount: 2)
        ]
        sut.selectedFilter = .unread
        sut.searchText = "Alice"

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 1)
        XCTAssertEqual(sut.filteredConversations[0].id, "c1")
    }

    // MARK: - Search: case insensitive

    func test_filterPipeline_searchIsCaseInsensitive() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "c1", name: "ALICE"),
            makeConversation(id: "c2", name: "Bob")
        ]
        sut.selectedFilter = .all
        sut.searchText = "alice"

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 1)
        XCTAssertEqual(sut.filteredConversations[0].id, "c1")
    }

    // MARK: - Search: empty text shows all

    func test_filterPipeline_emptySearchShowsAllMatchingFilter() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "c1", name: "Alice"),
            makeConversation(id: "c2", name: "Bob")
        ]
        sut.selectedFilter = .all
        sut.searchText = ""

        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 2)
    }

    // MARK: - Sorting: most recent first

    func test_filterPipeline_sortsMostRecentFirst() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        let old = Date(timeIntervalSince1970: 1000)
        let recent = Date(timeIntervalSince1970: 2000)
        let newest = Date(timeIntervalSince1970: 3000)
        sut.conversations = [
            makeConversation(id: "old", lastMessageAt: old),
            makeConversation(id: "newest", lastMessageAt: newest),
            makeConversation(id: "recent", lastMessageAt: recent)
        ]
        sut.selectedFilter = .all

        try await Task.sleep(nanoseconds: 300_000_000)

        XCTAssertFalse(sut.groupedConversations.isEmpty)
        let firstSection = sut.groupedConversations[0].conversations
        XCTAssertEqual(firstSection[0].id, "newest")
        XCTAssertEqual(firstSection[1].id, "recent")
        XCTAssertEqual(firstSection[2].id, "old")
    }

    // MARK: - Grouping: pinned section appears first

    func test_grouping_pinnedConversationsAppearInPinnedSection() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "normal", isPinned: false),
            makeConversation(id: "pinned1", isPinned: true),
            makeConversation(id: "pinned2", isPinned: true)
        ]
        sut.selectedFilter = .all

        try await Task.sleep(nanoseconds: 300_000_000)

        XCTAssertGreaterThanOrEqual(sut.groupedConversations.count, 1)
        let pinnedSection = sut.groupedConversations.first(where: { $0.section.id == "pinned" })
        XCTAssertNotNil(pinnedSection)
        XCTAssertEqual(pinnedSection?.conversations.count, 2)
        let pinnedIds = Set(pinnedSection?.conversations.map(\.id) ?? [])
        XCTAssertTrue(pinnedIds.contains("pinned1"))
        XCTAssertTrue(pinnedIds.contains("pinned2"))
    }

    // MARK: - Grouping: user categories

    func test_grouping_conversationsGroupedByUserCategory() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        let workSection = ConversationSection(id: "cat-work", name: "Work", icon: "briefcase.fill", color: "3498DB", order: 0)
        let familySection = ConversationSection(id: "cat-family", name: "Family", icon: "house.fill", color: "2ECC71", order: 1)
        sut.userCategories = [workSection, familySection]
        sut.conversations = [
            makeConversation(id: "c1", sectionId: "cat-work"),
            makeConversation(id: "c2", sectionId: "cat-family"),
            makeConversation(id: "c3")
        ]
        sut.selectedFilter = .all

        try await Task.sleep(nanoseconds: 300_000_000)

        let sectionIds = sut.groupedConversations.map(\.section.id)
        XCTAssertTrue(sectionIds.contains("cat-work"))
        XCTAssertTrue(sectionIds.contains("cat-family"))

        let workConvs = sut.groupedConversations.first(where: { $0.section.id == "cat-work" })?.conversations
        XCTAssertEqual(workConvs?.count, 1)
        XCTAssertEqual(workConvs?.first?.id, "c1")
    }

    // MARK: - Grouping: uncategorized go to "other"

    func test_grouping_uncategorizedConversationsGoToOtherSection() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.userCategories = []
        sut.conversations = [
            makeConversation(id: "c1"),
            makeConversation(id: "c2")
        ]
        sut.selectedFilter = .all

        try await Task.sleep(nanoseconds: 300_000_000)

        let otherSection = sut.groupedConversations.first(where: { $0.section.id == "other" })
        XCTAssertNotNil(otherSection)
        XCTAssertEqual(otherSection?.conversations.count, 2)
    }

    // MARK: - Grouping: orphaned category conversations go to other

    func test_grouping_orphanedCategoryConversationsGoToOther() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.userCategories = []
        sut.conversations = [
            makeConversation(id: "c1", sectionId: "deleted-category-id")
        ]
        sut.selectedFilter = .all

        try await Task.sleep(nanoseconds: 300_000_000)

        let otherSection = sut.groupedConversations.first(where: { $0.section.id == "other" })
        XCTAssertNotNil(otherSection)
        XCTAssertEqual(otherSection?.conversations.count, 1)
        XCTAssertEqual(otherSection?.conversations.first?.id, "c1")
    }

    // MARK: - Typing: multiple conversations

    func test_socketTyping_tracksMultipleConversationsIndependently() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)

        messageSocket.typingStarted.send(TypingEvent(userId: "u1", username: "Alice", conversationId: "conv1"))
        messageSocket.typingStarted.send(TypingEvent(userId: "u2", username: "Bob", conversationId: "conv2"))

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.typingUsernames["conv1"], "Alice")
        XCTAssertEqual(sut.typingUsernames["conv2"], "Bob")
    }

    // MARK: - Typing: stopped clears only that conversation

    func test_socketTypingStopped_clearsOnlyTargetConversation() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.typingUsernames["conv1"] = "Alice"
        sut.typingUsernames["conv2"] = "Bob"

        messageSocket.typingStopped.send(TypingEvent(userId: "u1", username: "Alice", conversationId: "conv1"))

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertNil(sut.typingUsernames["conv1"])
        XCTAssertEqual(sut.typingUsernames["conv2"], "Bob")
    }

    // MARK: - moveToSection

    func test_moveToSection_updatesSectionIdOptimistically() {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1")]

        sut.moveToSection(conversationId: "conv1", sectionId: "cat-work")

        XCTAssertEqual(sut.conversations[0].sectionId, "cat-work")
    }

    func test_moveToSection_emptySectionIdSetsNil() {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", sectionId: "cat-work")]

        sut.moveToSection(conversationId: "conv1", sectionId: "")

        XCTAssertNil(sut.conversations[0].sectionId)
    }

    func test_moveToSection_ignoredForUnknownConversation() {
        let (sut, _, _, preferenceService, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1")]

        sut.moveToSection(conversationId: "unknown", sectionId: "cat-work")

        XCTAssertEqual(preferenceService.updateConversationPreferencesCallCount, 0)
    }

    // MARK: - totalUnreadCount edge cases

    func test_totalUnreadCount_returnsZeroWhenNoConversations() {
        let (sut, _, _, _, _, _, _) = makeSUT()

        XCTAssertEqual(sut.totalUnreadCount, 0)
    }

    func test_totalUnreadCount_updatesAfterMarkAsRead() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "c1", unreadCount: 3),
            makeConversation(id: "c2", unreadCount: 5)
        ]
        XCTAssertEqual(sut.totalUnreadCount, 8)

        await sut.markAsRead(conversationId: "c1")

        XCTAssertEqual(sut.totalUnreadCount, 5)
    }

    // MARK: - Socket: user preferences updated

    func test_socketUserPreferencesUpdated_updatesPinState() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.conversations = [makeConversation(id: "conv1", isPinned: false)]

        messageSocket.userPreferencesUpdated.send(
            UserPreferencesUpdatedEvent(userId: "user1", category: "conversation", conversationId: "conv1", isPinned: true, isMuted: nil)
        )

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(sut.conversations[0].isPinned)
    }

    func test_socketUserPreferencesUpdated_updatesMuteState() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.conversations = [makeConversation(id: "conv1", isMuted: false)]

        messageSocket.userPreferencesUpdated.send(
            UserPreferencesUpdatedEvent(userId: "user1", category: "conversation", conversationId: "conv1", isPinned: nil, isMuted: true)
        )

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(sut.conversations[0].isMuted)
    }

    func test_socketUserPreferencesUpdated_ignoresUnknownConversation() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.conversations = [makeConversation(id: "conv1", isPinned: false)]

        messageSocket.userPreferencesUpdated.send(
            UserPreferencesUpdatedEvent(userId: "user1", category: "conversation", conversationId: "unknown", isPinned: true, isMuted: nil)
        )

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertFalse(sut.conversations[0].isPinned)
    }

    // MARK: - markAsUnread: preserves existing unread count

    func test_markAsUnread_preservesExistingNonZeroUnreadCount() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", unreadCount: 5)]

        await sut.markAsUnread(conversationId: "conv1")

        XCTAssertEqual(sut.conversations[0].unreadCount, 5)
    }

    // MARK: - unarchiveConversation: rollback on failure

    func test_unarchiveConversation_rollsBackOnFailure() async {
        let preferenceService = MockPreferenceService()
        preferenceService.updateConversationPreferencesResult = .failure(NSError(domain: "test", code: 500))
        let (sut, _, _, _, _, _, _) = makeSUT(preferenceService: preferenceService)
        sut.conversations = [makeConversation(id: "conv1", isActive: false)]

        await sut.unarchiveConversation(conversationId: "conv1")

        XCTAssertFalse(sut.conversations[0].isActive, "Should rollback to inactive on failure")
    }

    // MARK: - loadConversations: concurrent guard

    func test_loadConversations_guardsPreviousFetchInProgress() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.invalidateCache()

        async let first: () = sut.loadConversations()
        async let second: () = sut.loadConversations()
        _ = await (first, second)

        XCTAssertFalse(sut.isLoading)
    }

    // MARK: - invalidateCache

    func test_invalidateCache_allowsNextLoadToFetch() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "c1")]

        sut.invalidateCache()

        await sut.loadConversations()

        XCTAssertFalse(sut.isLoading)
    }

    // MARK: - Category Filter Tests (Point 80)

    func test_selectedFilter_filtersConversations() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "dm1", unreadCount: 3, type: .direct),
            makeConversation(id: "dm2", unreadCount: 0, type: .direct),
            makeConversation(id: "grp1", unreadCount: 5, type: .group),
        ]

        // Switch to unread filter: should show only dm1 and grp1
        sut.selectedFilter = .unread
        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.filteredConversations.count, 2)
        let unreadIds = Set(sut.filteredConversations.map(\.id))
        XCTAssertTrue(unreadIds.contains("dm1"))
        XCTAssertTrue(unreadIds.contains("grp1"))
        XCTAssertFalse(unreadIds.contains("dm2"))
    }

    func test_groupedConversations_groupsCorrectly() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        let section = ConversationSection(id: "cat-dev", name: "Dev", icon: "wrench.fill", color: "3498DB", order: 0)
        sut.userCategories = [section]
        sut.conversations = [
            makeConversation(id: "dev1", sectionId: "cat-dev"),
            makeConversation(id: "dev2", sectionId: "cat-dev"),
            makeConversation(id: "other1"),
        ]
        sut.selectedFilter = .all

        try await Task.sleep(nanoseconds: 300_000_000)

        let devSection = sut.groupedConversations.first(where: { $0.section.id == "cat-dev" })
        XCTAssertNotNil(devSection)
        XCTAssertEqual(devSection?.conversations.count, 2)

        let otherSection = sut.groupedConversations.first(where: { $0.section.id == "other" })
        XCTAssertNotNil(otherSection)
        XCTAssertEqual(otherSection?.conversations.count, 1)
    }

    // MARK: - Typing Tests (Point 81)

    func test_typingEvent_setsTypingUsername() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)

        messageSocket.typingStarted.send(TypingEvent(userId: "u1", username: "Charlie", conversationId: "conv-typing"))

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.typingUsernames["conv-typing"], "Charlie")
    }

    // MARK: - Preview Message Tests (Point 82)

    func test_previewMessages_containsLastMessage() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.conversations = [makeConversation(id: "conv-preview")]

        let apiMsg: APIMessage = JSONStub.decode("""
        {
            "id":"preview-msg1",
            "conversationId":"conv-preview",
            "senderId":"user-x",
            "content":"Latest message",
            "createdAt":"2026-03-06T12:00:00.000Z",
            "sender":{"id":"user-x","username":"xavier","displayName":"Xavier"}
        }
        """)
        messageSocket.simulateMessage(apiMsg)

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.conversations[0].lastMessagePreview, "Latest message")
        XCTAssertEqual(sut.conversations[0].lastMessageSenderName, "Xavier")
    }

    func test_newSocketMessage_updatesPreview() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.conversations = [makeConversation(id: "conv-update")]

        // Send first message
        let msg1: APIMessage = JSONStub.decode("""
        {
            "id":"msg-first",
            "conversationId":"conv-update",
            "senderId":"user-a",
            "content":"First message",
            "createdAt":"2026-03-06T12:00:00.000Z",
            "sender":{"id":"user-a","username":"alice","displayName":"Alice"}
        }
        """)
        messageSocket.simulateMessage(msg1)

        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(sut.conversations[0].lastMessagePreview, "First message")

        // Send second message: preview should update
        let msg2: APIMessage = JSONStub.decode("""
        {
            "id":"msg-second",
            "conversationId":"conv-update",
            "senderId":"user-b",
            "content":"Second message",
            "createdAt":"2026-03-06T12:01:00.000Z",
            "sender":{"id":"user-b","username":"bob","displayName":"Bob"}
        }
        """)
        messageSocket.simulateMessage(msg2)

        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(sut.conversations[0].lastMessagePreview, "Second message")
        XCTAssertEqual(sut.conversations[0].lastMessageSenderName, "Bob")
    }
}
