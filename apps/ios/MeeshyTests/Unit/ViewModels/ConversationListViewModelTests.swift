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
        authManager: MockAuthManager? = nil,
        storyService: MockStoryService? = nil,
        syncEngine: MockConversationSyncEngine? = nil
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
        let storyService = storyService ?? MockStoryService()
        let syncEngine = syncEngine ?? MockConversationSyncEngine()
        let sut = ConversationListViewModel(
            api: api,
            conversationService: conversationService,
            preferenceService: preferenceService,
            messageSocket: messageSocket,
            messageService: messageService,
            authManager: authManager,
            storyService: storyService,
            syncEngine: syncEngine
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

    func test_loadConversations_callsSyncEngineOnEmptyCache() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let syncEngine = MockConversationSyncEngine()
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)

        await sut.loadConversations()

        XCTAssertEqual(syncEngine.fullSyncCallCount, 1)
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadConversations_setsIsLoadingToFalseWhenDone() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let syncEngine = MockConversationSyncEngine()
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)

        await sut.loadConversations()

        XCTAssertFalse(sut.isLoading)
    }

    // MARK: - loadConversations: Failure

    func test_loadConversations_handlesAPIError() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let syncEngine = MockConversationSyncEngine()
        syncEngine.fullSyncResult = false
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)

        await sut.loadConversations()

        XCTAssertFalse(sut.isLoading)
    }

    // MARK: - loadConversations: Cache Valid

    func test_loadConversations_skipsFetchWhenCacheIsFresh() async {
        // Pre-populate cache so second call finds fresh data
        let conversation = makeConversation(id: "000000000000000000000001")
        await CacheCoordinator.shared.conversations.save([conversation], for: "list")

        let syncEngine = MockConversationSyncEngine()
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)

        // First call: cache is fresh, no sync needed
        await sut.loadConversations()
        XCTAssertEqual(syncEngine.fullSyncCallCount, 0, "Should not sync when cache is fresh")
        XCTAssertEqual(sut.conversations.count, 1)
    }

    func test_loadConversations_refetchesAfterCacheInvalidation() async {
        // Pre-populate cache
        let conversation = makeConversation(id: "000000000000000000000001")
        await CacheCoordinator.shared.conversations.save([conversation], for: "list")

        let syncEngine = MockConversationSyncEngine()
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)

        await sut.loadConversations()
        let countAfterFirst = syncEngine.fullSyncCallCount

        // Invalidate the cache (both local TTL and CacheCoordinator)
        sut.invalidateCache()
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await sut.loadConversations()
        let countAfterSecond = syncEngine.fullSyncCallCount

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

    func test_filterPipeline_archivedFilterShowsUserArchivedOnly() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        var archivedConv = makeConversation(id: "archived", isActive: true)
        archivedConv.isArchivedByUser = true
        sut.conversations = [
            makeConversation(id: "active", isActive: true),
            archivedConv
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

    // MARK: - Unread Update (via direct mutation, sync engine handles socket)

    func test_unreadCountUpdatedDirectly_reflectsInConversation() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", unreadCount: 0)]

        // Simulate what the sync engine does when it receives an unread update
        sut.conversations[0].unreadCount = 7

        XCTAssertEqual(sut.conversations[0].unreadCount, 7)
    }

    func test_unreadCountUpdatedForSpecificConversation_doesNotAffectOthers() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "conv1", unreadCount: 0),
            makeConversation(id: "conv2", unreadCount: 3)
        ]

        sut.conversations[0].unreadCount = 5

        XCTAssertEqual(sut.conversations[0].unreadCount, 5)
        XCTAssertEqual(sut.conversations[1].unreadCount, 3, "Other conversations should not be affected")
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

    // MARK: - Socket: New Message (via sync engine)

    func test_conversationPreviewUpdatesWhenSetDirectly() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        var conv = makeConversation(id: "conv1")
        sut.conversations = [conv]

        // Simulate what the sync engine does: update preview on the conversation
        conv.lastMessagePreview = "Hello there!"
        conv.lastMessageSenderName = "Bob"
        sut.conversations = [conv]

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

    func test_archiveConversation_setsIsArchivedByUserToTrue() async {
        let (sut, _, _, preferenceService, _, _, _) = makeSUT()
        sut.conversations = [makeConversation(id: "conv1", isActive: true)]

        await sut.archiveConversation(conversationId: "conv1")

        XCTAssertTrue(sut.conversations[0].isArchivedByUser)
        XCTAssertTrue(sut.conversations[0].isActive, "isActive (server-level) should NOT change when user archives")
        XCTAssertEqual(preferenceService.updateConversationPreferencesCallCount, 1)
    }

    func test_archiveConversation_rollsBackOnFailure() async {
        let preferenceService = MockPreferenceService()
        preferenceService.updateConversationPreferencesResult = .failure(NSError(domain: "test", code: 500))
        let (sut, _, _, _, _, _, _) = makeSUT(preferenceService: preferenceService)
        sut.conversations = [makeConversation(id: "conv1", isActive: true)]

        await sut.archiveConversation(conversationId: "conv1")

        XCTAssertFalse(sut.conversations[0].isArchivedByUser, "Should rollback on failure")
    }

    // MARK: - unarchiveConversation

    func test_unarchiveConversation_setsIsArchivedByUserToFalse() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        var conv = makeConversation(id: "conv1", isActive: true)
        conv.isArchivedByUser = true
        sut.conversations = [conv]

        await sut.unarchiveConversation(conversationId: "conv1")

        XCTAssertFalse(sut.conversations[0].isArchivedByUser)
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
        var archived = makeConversation(id: "conv1", isActive: true)
        archived.isArchivedByUser = true
        sut.conversations = [archived]

        await sut.unarchiveConversation(conversationId: "conv1")

        XCTAssertTrue(sut.conversations[0].isArchivedByUser, "Should rollback to archived on failure")
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

    func test_previewMessages_reflectsConversationState() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        var conv = makeConversation(id: "conv-preview")
        conv.lastMessagePreview = "Latest message"
        conv.lastMessageSenderName = "Xavier"
        sut.conversations = [conv]

        XCTAssertEqual(sut.conversations[0].lastMessagePreview, "Latest message")
        XCTAssertEqual(sut.conversations[0].lastMessageSenderName, "Xavier")
    }

    func test_conversationPreview_updatesOnMutation() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        var conv = makeConversation(id: "conv-update")
        conv.lastMessagePreview = "First message"
        conv.lastMessageSenderName = "Alice"
        sut.conversations = [conv]

        XCTAssertEqual(sut.conversations[0].lastMessagePreview, "First message")

        // Update preview (simulating sync engine update)
        sut.conversations[0].lastMessagePreview = "Second message"
        sut.conversations[0].lastMessageSenderName = "Bob"

        XCTAssertEqual(sut.conversations[0].lastMessagePreview, "Second message")
        XCTAssertEqual(sut.conversations[0].lastMessageSenderName, "Bob")
    }

    // MARK: - deinit: Task Cancellation

    func test_deinit_cancelsStoryPrefetchTask() async {
        var viewModel: ConversationListViewModel? = makeSUT().sut
        viewModel!.prefetchRecentStories()
        XCTAssertNotNil(viewModel!.storyPrefetchTask)

        let taskRef = viewModel!.storyPrefetchTask

        // Trigger dealloc
        viewModel = nil

        try? await Task.sleep(for: .milliseconds(50))
        // After viewModel deinit, the task should have been cancelled
        XCTAssertTrue(taskRef?.isCancelled ?? true)
    }

    // MARK: - setConversations (Phase 1: list write surface)
    //
    // Every write into `conversations` must funnel through `setConversations`
    // so the list invariant (sorted by lastMessageAt DESC) holds without
    // depending on the grouping pipeline. The grouping pipeline still re-
    // sorts for display, but consumers reading `conversations` directly
    // (badges, NotificationCoordinator, prefetch) must see a sorted array.

    func test_setConversations_unsortedData_returnsListSortedByLastMessageAtDesc() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        let oldest = Date(timeIntervalSince1970: 1_000)
        let middle = Date(timeIntervalSince1970: 2_000)
        let newest = Date(timeIntervalSince1970: 3_000)
        sut.setConversations([
            makeConversation(id: "older", lastMessageAt: oldest),
            makeConversation(id: "newest", lastMessageAt: newest),
            makeConversation(id: "middle", lastMessageAt: middle)
        ])

        XCTAssertEqual(sut.conversations.map(\.id), ["newest", "middle", "older"])
    }

    func test_appendConversations_appendsAndKeepsSortOrder() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        let oldest = Date(timeIntervalSince1970: 1_000)
        let middle = Date(timeIntervalSince1970: 2_000)
        let newest = Date(timeIntervalSince1970: 3_000)
        sut.setConversations([
            makeConversation(id: "newest", lastMessageAt: newest),
            makeConversation(id: "older", lastMessageAt: oldest)
        ])

        sut.appendConversations([
            makeConversation(id: "middle", lastMessageAt: middle),
            makeConversation(id: "older", lastMessageAt: oldest) // duplicate must be deduped
        ])

        XCTAssertEqual(sut.conversations.map(\.id), ["newest", "middle", "older"])
    }

    // MARK: - bumpToTop (Phase 1: socket-driven re-sort)

    func test_bumpToTop_existingConversation_movesToFirstPosition() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        let baseDate = Date(timeIntervalSince1970: 2_000)
        sut.setConversations([
            makeConversation(id: "first", lastMessageAt: Date(timeIntervalSince1970: 5_000)),
            makeConversation(id: "second", lastMessageAt: Date(timeIntervalSince1970: 4_000)),
            makeConversation(id: "third", lastMessageAt: baseDate)
        ])

        let newer = Date(timeIntervalSince1970: 9_000)
        sut.bumpToTop(conversationId: "third", newLastMessageAt: newer)

        XCTAssertEqual(sut.conversations.first?.id, "third")
        XCTAssertEqual(sut.conversations.first?.lastMessageAt.timeIntervalSinceReferenceDate ?? 0,
                       newer.timeIntervalSinceReferenceDate, accuracy: 0.01)
        XCTAssertEqual(sut.conversations.map(\.id), ["third", "first", "second"])
    }

    func test_bumpToTop_unknownConversationId_isNoOp() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        let originalIds = ["a", "b", "c"]
        sut.setConversations(originalIds.enumerated().map { (i, id) in
            makeConversation(id: id, lastMessageAt: Date(timeIntervalSince1970: TimeInterval(3_000 - i * 100)))
        })
        let originalSnapshot = sut.conversations.map(\.id)

        sut.bumpToTop(conversationId: "ghost", newLastMessageAt: Date())

        XCTAssertEqual(sut.conversations.map(\.id), originalSnapshot,
                       "bumpToTop on unknown id must leave the list untouched")
    }

    // MARK: - conversation:updated socket event with lastMessageAt

    func test_conversationUpdatedEvent_withLastMessageAt_triggersBumpToTop() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.setConversations([
            makeConversation(id: "a", lastMessageAt: Date(timeIntervalSince1970: 5_000)),
            makeConversation(id: "b", lastMessageAt: Date(timeIntervalSince1970: 4_000)),
            makeConversation(id: "c", lastMessageAt: Date(timeIntervalSince1970: 3_000))
        ])

        let newer = Date(timeIntervalSince1970: 9_000)
        let event = makeConversationUpdatedEvent(conversationId: "c", lastMessageAt: newer)
        messageSocket.conversationUpdated.send(event)

        try await Task.sleep(nanoseconds: 80_000_000)

        XCTAssertEqual(sut.conversations.first?.id, "c",
                       "Event with lastMessageAt must promote the conversation to the top")
    }

    /// Pins the production payload shape: handlers/MessageHandler.ts emits
    /// CONVERSATION_UPDATED on every new message WITHOUT `updatedBy`. If
    /// the SDK ever requires that field again the decode silently fails,
    /// the publisher never fires, and bumpToTop dies — exactly the bug
    /// the spec review caught. This test fails loudly if that regression
    /// returns.
    func test_conversationUpdatedEvent_messageDriven_withoutUpdatedBy_triggersBumpToTop() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.setConversations([
            makeConversation(id: "a", lastMessageAt: Date(timeIntervalSince1970: 5_000)),
            makeConversation(id: "b", lastMessageAt: Date(timeIntervalSince1970: 4_000)),
            makeConversation(id: "c", lastMessageAt: Date(timeIntervalSince1970: 3_000))
        ])

        let newer = Date(timeIntervalSince1970: 9_000)
        let event = makeConversationUpdatedEvent(
            conversationId: "c",
            lastMessageAt: newer,
            includeUpdatedBy: false
        )
        XCTAssertNil(event.updatedBy, "Factory must produce a payload mirroring the gateway's message-driven shape")
        messageSocket.conversationUpdated.send(event)

        try await Task.sleep(nanoseconds: 80_000_000)

        XCTAssertEqual(sut.conversations.first?.id, "c",
                       "Message-driven payload (no updatedBy) must still promote the conversation to the top")
    }

    /// Régression-guard pour le bug "DM nouvellement créés invisibles".
    /// Quand quelqu'un crée un DM avec self ET envoie un message, le gateway
    /// émet CONVERSATION_UPDATED dans ROOMS.user(self). Mais self n'a JAMAIS
    /// reçu MESSAGE_NEW (il n'a pas joint ROOMS.conversation(id)) — donc
    /// l'event arrive sur un id que la VM ne connaît pas. Avant fix, le
    /// guard `convIndex == nil { return }` rendait la conversation
    /// invisible jusqu'au prochain pull-to-refresh. Maintenant la VM doit
    /// fetch via getById et prepend.
    func test_conversationUpdatedEvent_unknownId_fetchesAndPrepends() async throws {
        let messageSocket = MockMessageSocket()
        let conversationService = MockConversationService()
        let newConvJSON = """
        {"id":"69fe1c6626e040042fd28140","type":"direct","title":null,
         "lastMessageAt":"2026-05-09T12:42:24.289Z",
         "createdAt":"2026-05-08T17:24:54.327Z"}
        """
        conversationService.getByIdResult = .success(JSONStub.decode(newConvJSON))
        let (sut, _, _, _, _, _, _) = makeSUT(
            conversationService: conversationService,
            messageSocket: messageSocket
        )
        sut.setConversations([
            makeConversation(id: "a", lastMessageAt: Date(timeIntervalSince1970: 5_000)),
            makeConversation(id: "b", lastMessageAt: Date(timeIntervalSince1970: 4_000))
        ])

        let event = makeConversationUpdatedEvent(
            conversationId: "69fe1c6626e040042fd28140",
            lastMessageAt: Date(timeIntervalSince1970: 9_000),
            includeUpdatedBy: false
        )
        messageSocket.conversationUpdated.send(event)

        // Wait for the async fetch + main-actor hop.
        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            if sut.conversations.first?.id == "69fe1c6626e040042fd28140" { break }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }

        XCTAssertEqual(conversationService.getByIdCallCount, 1,
                       "Unknown conversationId must trigger a getById fetch")
        XCTAssertEqual(conversationService.lastGetByIdConversationId, "69fe1c6626e040042fd28140")
        XCTAssertEqual(sut.conversations.first?.id, "69fe1c6626e040042fd28140",
                       "Fetched conversation must be prepended at index 0")
        XCTAssertEqual(sut.conversations.count, 3,
                       "Pre-existing rows must be preserved (a, b) + the new one")
    }

    /// Burst dedup: rapid successive CONVERSATION_UPDATED for the same
    /// brand-new id must coalesce into a single getById call so we don't
    /// hammer the API on a noisy socket.
    func test_conversationUpdatedEvent_unknownId_burstDedupsFetches() async throws {
        let messageSocket = MockMessageSocket()
        let conversationService = MockConversationService()
        let newConvJSON = """
        {"id":"69fe0bb526e040042fd28121","type":"direct","title":null,
         "createdAt":"2026-05-08T16:13:41.121Z"}
        """
        conversationService.getByIdResult = .success(JSONStub.decode(newConvJSON))
        let (sut, _, _, _, _, _, _) = makeSUT(
            conversationService: conversationService,
            messageSocket: messageSocket
        )

        let event = makeConversationUpdatedEvent(
            conversationId: "69fe0bb526e040042fd28121",
            lastMessageAt: Date(timeIntervalSince1970: 9_000),
            includeUpdatedBy: false
        )
        // Three near-simultaneous events for the same id.
        messageSocket.conversationUpdated.send(event)
        messageSocket.conversationUpdated.send(event)
        messageSocket.conversationUpdated.send(event)

        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            if sut.conversations.first?.id == "69fe0bb526e040042fd28121" { break }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }

        XCTAssertEqual(conversationService.getByIdCallCount, 1,
                       "Burst of events for the same unknown id must dedup to a single fetch")
        XCTAssertEqual(sut.conversations.first?.id, "69fe0bb526e040042fd28121")
    }

    // MARK: - notificationReceived: realtime new conversation

    /// Quand le gateway pousse une notification `new_conversation_direct` pour
    /// une conversation que le client ne connait pas encore, la liste doit
    /// fetcher la conversation via `getById` et la prepend, sans attendre le
    /// premier message (qui declencherait sinon `CONVERSATION_UPDATED`).
    func test_notificationReceived_newConversationDirect_unknownId_fetchesAndPrepends() async throws {
        let messageSocket = MockMessageSocket()
        let conversationService = MockConversationService()
        let newConvId = "69fe2a7726e040042fd28200"
        let newConvJSON = """
        {"id":"\(newConvId)","type":"direct","title":null,
         "lastMessageAt":"2026-05-09T18:30:00.000Z",
         "createdAt":"2026-05-09T18:30:00.000Z"}
        """
        conversationService.getByIdResult = .success(JSONStub.decode(newConvJSON))
        let (sut, _, _, _, _, _, _) = makeSUT(
            conversationService: conversationService,
            messageSocket: messageSocket
        )
        sut.setConversations([
            makeConversation(id: "a", lastMessageAt: Date(timeIntervalSince1970: 5_000))
        ])

        let notifJSON = """
        {"id":"notif1","userId":"u1","type":"new_conversation_direct",
         "content":"Nouvelle conversation",
         "context":{"conversationId":"\(newConvId)","conversationType":"direct"}}
        """
        let event: SocketNotificationEvent = JSONStub.decode(notifJSON)
        messageSocket.notificationReceived.send(event)

        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            if sut.conversations.first?.id == newConvId { break }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }

        XCTAssertEqual(conversationService.getByIdCallCount, 1,
                       "new_conversation_direct must trigger a getById fetch")
        XCTAssertEqual(conversationService.lastGetByIdConversationId, newConvId)
        XCTAssertEqual(sut.conversations.first?.id, newConvId,
                       "Fetched conversation must be prepended at index 0")
        XCTAssertEqual(sut.conversations.count, 2)
    }

    /// Idem pour `new_conversation_group` (creation d'un groupe ou l'utilisateur
    /// est invite des le depart).
    func test_notificationReceived_newConversationGroup_unknownId_fetchesAndPrepends() async throws {
        let messageSocket = MockMessageSocket()
        let conversationService = MockConversationService()
        let newConvId = "69fe2a7726e040042fd28201"
        let newConvJSON = """
        {"id":"\(newConvId)","type":"group","title":"Equipe Design",
         "createdAt":"2026-05-09T18:30:00.000Z"}
        """
        conversationService.getByIdResult = .success(JSONStub.decode(newConvJSON))
        let (sut, _, _, _, _, _, _) = makeSUT(
            conversationService: conversationService,
            messageSocket: messageSocket
        )

        let notifJSON = """
        {"id":"notif2","userId":"u1","type":"new_conversation_group",
         "content":"Invitation au groupe Equipe Design",
         "context":{"conversationId":"\(newConvId)","conversationType":"group"}}
        """
        let event: SocketNotificationEvent = JSONStub.decode(notifJSON)
        messageSocket.notificationReceived.send(event)

        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            if sut.conversations.first?.id == newConvId { break }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }

        XCTAssertEqual(conversationService.getByIdCallCount, 1)
        XCTAssertEqual(sut.conversations.first?.id, newConvId)
    }

    /// `added_to_conversation` (quelqu'un m'ajoute a un groupe existant) suit
    /// le meme chemin : on fetch la conversation et on l'insere en tete.
    func test_notificationReceived_addedToConversation_unknownId_fetchesAndPrepends() async throws {
        let messageSocket = MockMessageSocket()
        let conversationService = MockConversationService()
        let newConvId = "69fe2a7726e040042fd28202"
        let newConvJSON = """
        {"id":"\(newConvId)","type":"group","title":"Backend",
         "createdAt":"2026-05-09T18:30:00.000Z"}
        """
        conversationService.getByIdResult = .success(JSONStub.decode(newConvJSON))
        let (sut, _, _, _, _, _, _) = makeSUT(
            conversationService: conversationService,
            messageSocket: messageSocket
        )

        let notifJSON = """
        {"id":"notif3","userId":"u1","type":"added_to_conversation",
         "content":"Ajoute au groupe Backend",
         "context":{"conversationId":"\(newConvId)","conversationType":"group"}}
        """
        let event: SocketNotificationEvent = JSONStub.decode(notifJSON)
        messageSocket.notificationReceived.send(event)

        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            if sut.conversations.first?.id == newConvId { break }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }

        XCTAssertEqual(conversationService.getByIdCallCount, 1)
        XCTAssertEqual(sut.conversations.first?.id, newConvId)
    }

    /// Si la conversation est deja dans la liste (ex: le createur recoit une
    /// notification echo), pas de re-fetch.
    func test_notificationReceived_newConversation_knownId_doesNotFetch() async throws {
        let messageSocket = MockMessageSocket()
        let conversationService = MockConversationService()
        let knownId = "69fe2a7726e040042fd28203"
        let (sut, _, _, _, _, _, _) = makeSUT(
            conversationService: conversationService,
            messageSocket: messageSocket
        )
        sut.setConversations([makeConversation(id: knownId)])

        let notifJSON = """
        {"id":"notif4","userId":"u1","type":"new_conversation_direct",
         "content":"echo",
         "context":{"conversationId":"\(knownId)","conversationType":"direct"}}
        """
        let event: SocketNotificationEvent = JSONStub.decode(notifJSON)
        messageSocket.notificationReceived.send(event)

        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(conversationService.getByIdCallCount, 0,
                       "Already-known conversation must NOT trigger a refetch")
        XCTAssertEqual(sut.conversations.count, 1)
    }

    /// Les autres types de notifications (ex: message recu, reaction) ne doivent
    /// pas declencher de fetch de conversation.
    func test_notificationReceived_unrelatedType_doesNotFetch() async throws {
        let messageSocket = MockMessageSocket()
        let conversationService = MockConversationService()
        let (sut, _, _, _, _, _, _) = makeSUT(
            conversationService: conversationService,
            messageSocket: messageSocket
        )

        let notifJSON = """
        {"id":"notif5","userId":"u1","type":"new_message",
         "content":"Nouveau message",
         "context":{"conversationId":"69fe2a7726e040042fd28204","conversationType":"direct"}}
        """
        let event: SocketNotificationEvent = JSONStub.decode(notifJSON)
        messageSocket.notificationReceived.send(event)

        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(conversationService.getByIdCallCount, 0,
                       "Non-conversation-creation notifications must not fetch")
        XCTAssertTrue(sut.conversations.isEmpty)
    }

    // MARK: - conversation:new socket event (creator + invitee unified path)

    /// Primary discovery path: gateway emits `conversation:new` to user-rooms
    /// of EVERY participant — creator AND invitees. The VM fetches enriched
    /// payload and prepends, regardless of whether self was the creator.
    func test_conversationNewSocketEvent_unknownId_fetchesAndPrepends() async throws {
        let messageSocket = MockMessageSocket()
        let conversationService = MockConversationService()
        let newConvId = "69fe2a7726e040042fd28b01"
        let newConvJSON = """
        {"id":"\(newConvId)","type":"direct","title":null,
         "lastMessageAt":"2026-05-11T12:00:00.000Z",
         "createdAt":"2026-05-11T12:00:00.000Z"}
        """
        conversationService.getByIdResult = .success(JSONStub.decode(newConvJSON))
        let (sut, _, _, _, _, _, _) = makeSUT(
            conversationService: conversationService,
            messageSocket: messageSocket
        )
        sut.setConversations([
            makeConversation(id: "a", lastMessageAt: Date(timeIntervalSince1970: 5_000))
        ])

        let event = ConversationNewEvent(
            conversationId: newConvId,
            conversationType: "direct",
            title: nil,
            creatorId: "u1",
            participantIds: ["u1", "u2"],
            createdAt: "2026-05-11T12:00:00.000Z"
        )
        messageSocket.conversationNew.send(event)

        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            if sut.conversations.first?.id == newConvId { break }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }

        XCTAssertEqual(conversationService.getByIdCallCount, 1,
                       "conversation:new for unknown id must trigger a getById fetch")
        XCTAssertEqual(conversationService.lastGetByIdConversationId, newConvId)
        XCTAssertEqual(sut.conversations.first?.id, newConvId,
                       "Fetched conversation must be prepended at index 0")
        XCTAssertEqual(sut.conversations.count, 2)
    }

    /// Already-known id (rare race where cache load surfaced it before the
    /// socket event arrives) must be a no-op.
    func test_conversationNewSocketEvent_knownId_doesNotFetch() async throws {
        let messageSocket = MockMessageSocket()
        let conversationService = MockConversationService()
        let knownId = "69fe2a7726e040042fd28b02"
        let (sut, _, _, _, _, _, _) = makeSUT(
            conversationService: conversationService,
            messageSocket: messageSocket
        )
        sut.setConversations([makeConversation(id: knownId)])

        let event = ConversationNewEvent(
            conversationId: knownId,
            conversationType: "direct",
            title: nil,
            creatorId: "u1",
            participantIds: ["u1", "u2"],
            createdAt: "2026-05-11T12:00:00.000Z"
        )
        messageSocket.conversationNew.send(event)
        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(conversationService.getByIdCallCount, 0,
                       "Already-known conversation must NOT trigger a refetch")
        XCTAssertEqual(sut.conversations.count, 1)
    }

    /// Critical regression guard: during the rollout window the gateway emits
    /// BOTH `conversation:new` (typed) and `notification:new` (legacy with
    /// type=new_conversation_direct) for the same brand-new id. The
    /// `pendingMissingFetches` dedup must coalesce both signals into a
    /// single getById call so we don't double-fetch or duplicate the row.
    func test_conversationNewSocketEvent_burstWithLegacyNotification_dedupsToSingleFetch() async throws {
        let messageSocket = MockMessageSocket()
        let conversationService = MockConversationService()
        let newConvId = "69fe2a7726e040042fd28b03"
        let newConvJSON = """
        {"id":"\(newConvId)","type":"direct","title":null,
         "createdAt":"2026-05-11T12:00:00.000Z"}
        """
        conversationService.getByIdResult = .success(JSONStub.decode(newConvJSON))
        let (sut, _, _, _, _, _, _) = makeSUT(
            conversationService: conversationService,
            messageSocket: messageSocket
        )

        let typedEvent = ConversationNewEvent(
            conversationId: newConvId,
            conversationType: "direct",
            title: nil,
            creatorId: "u1",
            participantIds: ["u1", "u2"],
            createdAt: "2026-05-11T12:00:00.000Z"
        )
        messageSocket.conversationNew.send(typedEvent)

        let notifJSON = """
        {"id":"notif-burst","userId":"u1","type":"new_conversation_direct",
         "content":"legacy echo",
         "context":{"conversationId":"\(newConvId)","conversationType":"direct"}}
        """
        let legacyEvent: SocketNotificationEvent = JSONStub.decode(notifJSON)
        messageSocket.notificationReceived.send(legacyEvent)

        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            if sut.conversations.first?.id == newConvId { break }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }

        XCTAssertEqual(conversationService.getByIdCallCount, 1,
                       "Typed + legacy events for same id must dedup to single fetch")
        XCTAssertEqual(sut.conversations.filter { $0.id == newConvId }.count, 1,
                       "Single row must be prepended, not duplicated")
    }

    // MARK: - recentlyCreatedAt merge protection

    /// Race scenario: creator just made a conversation (broadcaster →
    /// fetchAndPrepend tagged it in recentlyCreatedAt). A foreground delta
    /// sync immediately runs and returns a snapshot from the gateway
    /// aggregate that doesn't yet include the new row (eventual
    /// consistency). Without this guard, setConversations would clobber
    /// the new row and the user would see it disappear within seconds.
    func test_setConversations_preservesRecentlyCreatedRowMissingFromIncoming() {
        let (sut, _, _, _, _, _, _) = makeSUT()
        let oldA = makeConversation(id: "a", lastMessageAt: Date(timeIntervalSince1970: 5_000))
        let oldB = makeConversation(id: "b", lastMessageAt: Date(timeIntervalSince1970: 4_000))
        let fresh = makeConversation(id: "fresh", lastMessageAt: Date(timeIntervalSince1970: 9_000))
        sut.setConversations([oldA, oldB, fresh])
        sut.recentlyCreatedAt["fresh"] = Date()

        // Server snapshot doesn't include "fresh" yet (aggregate lag).
        sut.setConversations([oldA, oldB])

        XCTAssertTrue(sut.conversations.contains(where: { $0.id == "fresh" }),
                      "Recently-created row must survive a snapshot that omits it")
        XCTAssertEqual(sut.conversations.first?.id, "fresh",
                       "Sort order must keep the fresh (newest lastMessageAt) row at index 0")
    }

    /// After the TTL window expires, the protection MUST drop so a legitimate
    /// cross-device delete (or aggregate purge) can take effect.
    func test_setConversations_dropsRecentlyCreatedAfterTTLExpires() {
        let (sut, _, _, _, _, _, _) = makeSUT()
        let t0 = Date(timeIntervalSince1970: 10_000)
        sut.dateProvider = { t0 }
        let oldA = makeConversation(id: "a", lastMessageAt: Date(timeIntervalSince1970: 5_000))
        let stale = makeConversation(id: "stale", lastMessageAt: Date(timeIntervalSince1970: 9_000))
        sut.setConversations([oldA, stale])
        sut.recentlyCreatedAt["stale"] = t0

        // Advance past TTL (30s + safety).
        sut.dateProvider = { t0.addingTimeInterval(60) }
        sut.setConversations([oldA])

        XCTAssertFalse(sut.conversations.contains(where: { $0.id == "stale" }),
                       "Expired recently-created entry must NOT preserve the row")
        XCTAssertEqual(sut.conversations.map(\.id), ["a"])
    }

    /// fetchAndPrependMissingConversation must tag the inserted id so the
    /// recentlyCreatedAt protection kicks in immediately for downstream
    /// snapshots (no gap window between insert and tag).
    func test_fetchAndPrependMissingConversation_tagsRecentlyCreated() async throws {
        let conversationService = MockConversationService()
        let newConvId = "69fe2a7726e040042fd28b04"
        let newConvJSON = """
        {"id":"\(newConvId)","type":"direct","title":null,
         "createdAt":"2026-05-11T12:00:00.000Z"}
        """
        conversationService.getByIdResult = .success(JSONStub.decode(newConvJSON))
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)

        sut.fetchAndPrependMissingConversation(id: newConvId)

        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            if sut.recentlyCreatedAt[newConvId] != nil { break }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }

        XCTAssertNotNil(sut.recentlyCreatedAt[newConvId],
                        "Inserted conversation must be tagged in recentlyCreatedAt")
    }

    // MARK: - schedulePersist: coalesced cache writes

    /// 5 rapid mutations within the debounce window MUST collapse to a
    /// single GRDB write. Without this, a noisy socket (e.g. group chat
    /// where 5 participants change presence in 100 ms) would write the
    /// entire ~50 KB conversations blob 5 times back-to-back, hammering
    /// the disk for no benefit.
    func test_schedulePersist_burstWithinDebounceWindow_coalesces() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.setConversations([makeConversation(id: "a")])
        sut.persistCallCount = 0

        // 5 calls within 50 ms — all should cancel each other.
        for _ in 0..<5 {
            sut.schedulePersist(debounce: 0.1)
            try? await Task.sleep(nanoseconds: 10_000_000)
        }

        // Wait long enough for the LAST scheduled persist to complete.
        try? await Task.sleep(nanoseconds: 250_000_000)

        XCTAssertEqual(sut.persistCallCount, 1,
                       "5 rapid schedulePersist calls within debounce must collapse to 1 save")
    }

    /// Spaced calls (each beyond the debounce window) must each persist —
    /// proves the debounce is a coalesce, not a "throttle / drop after one".
    func test_schedulePersist_spacedBeyondDebounceWindow_persistsEach() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.setConversations([makeConversation(id: "a")])
        sut.persistCallCount = 0

        sut.schedulePersist(debounce: 0.05)
        try? await Task.sleep(nanoseconds: 120_000_000)
        sut.schedulePersist(debounce: 0.05)
        try? await Task.sleep(nanoseconds: 120_000_000)

        XCTAssertEqual(sut.persistCallCount, 2,
                       "Two persists separated by > debounce window must each save")
    }

    // MARK: - loadMore: cursor-based pagination

    func test_loadMore_initialFetch_setsCursorAndStateFromResponse() async {
        let conversationService = MockConversationService()
        conversationService.listPageResult = .success(
            ConversationPage(
                items: [makeConversation(id: "a"), makeConversation(id: "b")],
                nextCursor: "b",
                hasMore: true
            )
        )
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)

        await sut.loadMore()

        XCTAssertEqual(conversationService.listPageCallCount, 1)
        XCTAssertNil(conversationService.lastListPageCursor, "First call must pass nil cursor")
        XCTAssertEqual(sut.conversations.map(\.id).sorted(), ["a", "b"])
        XCTAssertEqual(sut.paginationState, .idle)
        XCTAssertTrue(sut.hasMore)
    }

    func test_loadMore_secondCall_passesPreviousNextCursor() async {
        let conversationService = MockConversationService()
        conversationService.listPageHandler = { cursor in
            if cursor == nil {
                return .success(ConversationPage(items: [], nextCursor: "tail-1", hasMore: true))
            } else {
                return .success(ConversationPage(items: [], nextCursor: "tail-2", hasMore: true))
            }
        }
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)

        await sut.loadMore()
        await sut.loadMore()

        XCTAssertEqual(conversationService.listPageCallCount, 2)
        XCTAssertEqual(conversationService.lastListPageCursor, "tail-1",
                       "Second loadMore must forward the cursor returned by the first page")
    }

    func test_loadMore_appendsToExistingList_preservesSortOrder() async {
        let conversationService = MockConversationService()
        let now = Date()
        let older = makeConversation(id: "older", lastMessageAt: now.addingTimeInterval(-3600))
        conversationService.listPageResult = .success(
            ConversationPage(items: [older], nextCursor: "older", hasMore: false)
        )
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)
        let newer = makeConversation(id: "newer", lastMessageAt: now)
        sut.conversations = [newer]

        await sut.loadMore()

        XCTAssertEqual(sut.conversations.map(\.id), ["newer", "older"],
                       "loadMore must append rows and keep the lastMessageAt DESC sort")
    }

    func test_loadMore_whenHasMoreFalse_doesNotFetch() async {
        let conversationService = MockConversationService()
        conversationService.listPageResult = .success(
            ConversationPage(items: [], nextCursor: nil, hasMore: false)
        )
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)

        // First call sets hasMore=false and paginationState=.exhausted
        await sut.loadMore()
        XCTAssertEqual(sut.paginationState, .exhausted)
        XCTAssertFalse(sut.hasMore)

        // Second call must short-circuit without hitting the network
        await sut.loadMore()
        XCTAssertEqual(conversationService.listPageCallCount, 1,
                       "loadMore must short-circuit when hasMore=false")
    }

    func test_loadMore_whenAlreadyLoading_doesNotFetchTwice() async {
        let conversationService = MockConversationService()
        conversationService.listPageResult = .success(
            ConversationPage(items: [], nextCursor: nil, hasMore: true)
        )
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)

        // Fire two concurrent loadMore calls; the guard inside the
        // ViewModel must coalesce them into a single network request.
        async let first: Void = sut.loadMore()
        async let second: Void = sut.loadMore()
        _ = await (first, second)

        XCTAssertEqual(conversationService.listPageCallCount, 1,
                       "Concurrent loadMore calls must be coalesced via the .loadingMore guard")
    }

    func test_loadMore_failure_setsErrorPaginationState() async {
        let conversationService = MockConversationService()
        struct TestError: Error {}
        conversationService.listPageResult = .failure(TestError())
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)

        await sut.loadMore()

        if case .error = sut.paginationState {
            // expected
        } else {
            XCTFail("Expected paginationState=.error, got \(sut.paginationState)")
        }
        XCTAssertTrue(sut.hasMore, "Transient errors must keep hasMore=true so the user can retry")
    }

    func test_loadMore_persistsSnapshotToCache() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let conversationService = MockConversationService()
        let conv = makeConversation(id: "persisted")
        conversationService.listPageResult = .success(
            ConversationPage(items: [conv], nextCursor: "persisted", hasMore: false)
        )
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)

        await sut.loadMore()
        // Wait for the fire-and-forget cache save Task
        try? await Task.sleep(nanoseconds: 200_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list")
        let cachedItems = cached.value ?? []
        XCTAssertTrue(cachedItems.contains(where: { $0.id == "persisted" }),
                      "loadMore must persist the merged list to the cache")
    }

    // MARK: - pullToRefresh

    func test_pullToRefresh_resetsCursorAndRefetches() async {
        let conversationService = MockConversationService()
        let syncEngine = MockConversationSyncEngine()
        // Seed an "advanced" cursor by running loadMore once
        conversationService.listPageResult = .success(
            ConversationPage(items: [], nextCursor: "deep-cursor", hasMore: true)
        )
        let (sut, _, _, _, _, _, _) = makeSUT(
            conversationService: conversationService,
            syncEngine: syncEngine
        )
        await sut.loadMore()
        XCTAssertEqual(conversationService.lastListPageCursor, nil)
        XCTAssertEqual(conversationService.listPageCallCount, 1)

        // Now mock a second loadMore that, before pullToRefresh, would
        // pass "deep-cursor" — after pullToRefresh it must pass nil.
        await sut.pullToRefresh()
        XCTAssertEqual(syncEngine.fullSyncCallCount, 1,
                       "pullToRefresh must trigger a fullSync via forceRefresh")

        await sut.loadMore()
        XCTAssertEqual(conversationService.lastListPageCursor, nil,
                       "After pullToRefresh the cursor must reset so the next loadMore starts from the top")
    }

    func test_initialState_paginationStateIsIdleAndHasMoreIsTrue() {
        let (sut, _, _, _, _, _, _) = makeSUT()

        XCTAssertEqual(sut.paginationState, .idle)
        XCTAssertTrue(sut.hasMore)
        XCTAssertEqual(sut.loadState, .idle)
    }

    // MARK: - Cursor persistence across restarts (spec AC §4.8.3)

    func test_loadMore_persistsCursorToCache() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let conversationService = MockConversationService()
        conversationService.listPageResult = .success(
            ConversationPage(items: [makeConversation(id: "tail")], nextCursor: "tail", hasMore: true)
        )
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)

        await sut.loadMore()
        // Wait for the fire-and-forget cache save Task
        try? await Task.sleep(nanoseconds: 200_000_000)

        let persisted = await CacheCoordinator.shared.conversations.loadCursor(for: "list")
        XCTAssertEqual(persisted?.nextCursor, "tail",
                       "loadMore must persist nextCursor so a cold start can resume")
        XCTAssertEqual(persisted?.hasMore, true)
    }

    func test_loadMore_afterCachedCursor_resumesFromTail() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let conversationService = MockConversationService()
        conversationService.listPageResult = .success(
            ConversationPage(items: [makeConversation(id: "next")], nextCursor: "next", hasMore: true)
        )
        // Simulate a previous session that paged down to "deep-tail"
        // and persisted that cursor.
        await CacheCoordinator.shared.conversations.saveCursor(
            nextCursor: "deep-tail",
            hasMore: true,
            for: "list"
        )

        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)
        // Hydrate the in-memory cursor from cache as the cold-start
        // load path would.
        await sut.loadConversations()
        await sut.loadMore()

        XCTAssertEqual(conversationService.lastListPageCursor, "deep-tail",
                       "Cold start must resume from the persisted cursor instead of refetching page 1")
    }
}

// MARK: - ConversationUpdatedEvent factory

private func makeConversationUpdatedEvent(
    conversationId: String,
    lastMessageAt: Date?,
    title: String? = nil,
    avatar: String? = nil,
    includeUpdatedBy: Bool = true
) -> ConversationUpdatedEvent {
    let isoFormatter = ISO8601DateFormatter()
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    var json: [String: Any] = [
        "conversationId": conversationId,
        "updatedAt": isoFormatter.string(from: Date())
    ]
    if includeUpdatedBy {
        json["updatedBy"] = ["id": "test-user"]
    }
    if let title { json["title"] = title }
    if let avatar { json["avatar"] = avatar }
    if let lastMessageAt {
        json["lastMessageAt"] = isoFormatter.string(from: lastMessageAt)
    }
    let data = try! JSONSerialization.data(withJSONObject: json)
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom { decoder in
        let container = try decoder.singleValueContainer()
        let str = try container.decode(String.self)
        if let date = isoFormatter.date(from: str) { return date }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date")
    }
    return try! decoder.decode(ConversationUpdatedEvent.self, from: data)
}
