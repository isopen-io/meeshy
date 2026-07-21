import XCTest
import Combine
import MeeshySDK
import SwiftUI
import MeeshyUI
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
        syncEngine: MockConversationSyncEngine? = nil,
        messageNotificationPublisher: AnyPublisher<String, Never>? = nil,
        draftStore: DraftStore? = nil,
        store: ConversationStore? = nil,
        categoryStore: UserCategoryStore? = nil
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
        let pushPublisher = messageNotificationPublisher
            ?? PassthroughSubject<String, Never>().eraseToAnyPublisher()
        let resolvedDraftStore: DraftStore = {
            if let draftStore { return draftStore }
            let store = DraftStore(userDefaults: UserDefaults(suiteName: "ConvListVMTests-\(UUID().uuidString)")!)
            store.clearAll()
            return store
        }()
        let resolvedStore = store ?? Self.makeTestStore()
        let resolvedCategoryStore = categoryStore ?? UserCategoryStore(service: ConvListTestCategoryWriter())
        let sut = ConversationListViewModel(
            api: api,
            conversationService: conversationService,
            preferenceService: preferenceService,
            messageSocket: messageSocket,
            messageService: messageService,
            authManager: authManager,
            storyService: storyService,
            syncEngine: syncEngine,
            messageNotificationPublisher: pushPublisher,
            draftStore: resolvedDraftStore,
            store: resolvedStore,
            categoryStore: resolvedCategoryStore
        )
        return (sut, api, conversationService, preferenceService, messageSocket, messageService, authManager)
    }

    /// Build an ISOLATED `ConversationStore` (own in-memory outbox + mock
    /// writers) so each VM under test gets its own mutation store instead of
    /// the global `.shared` singleton — prevents cross-test pollution.
    /// `prefError` makes the preference writer throw (e.g. a 4xx for a
    /// permanent-failure rollback test).
    static func makeTestStore(prefError: Error? = nil, lifecycleError: Error? = nil) -> ConversationStore {
        let writer = ConvListTestPreferenceWriter()
        writer.errorToThrow = prefError
        let lifecycle = ConvListTestLifecycleWriter()
        lifecycle.errorToThrow = lifecycleError
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("convlist-vm-outbox-\(UUID().uuidString).db").path
        return ConversationStore(
            preferenceService: writer,
            conversationService: lifecycle,
            outbox: ConversationStateOutbox(dbPath: outboxPath)
        )
    }

    /// Deterministically wait for the `observeStore` merge sink (delivered on
    /// `DispatchQueue.main`) to drain. Enqueued AFTER any pending merge
    /// closures, so FIFO guarantees the merge ran by the time it fulfills.
    private func drainMainQueue() async {
        let exp = expectation(description: "main queue drained")
        DispatchQueue.main.async { exp.fulfill() }
        await fulfillment(of: [exp], timeout: 2.0)
    }

    /// Wait until the list reflects a userState predicate for `id`. Use for
    /// fire-and-forget mutations (e.g. `moveToSection` spawns an internal Task)
    /// where the result lands asynchronously via the store merge sink.
    private func waitForListState(
        _ sut: ConversationListViewModel,
        id: String,
        timeout: TimeInterval = 2.0,
        _ predicate: @escaping (ConversationUserState) -> Bool
    ) async {
        let exp = expectation(description: "list user-state")
        exp.assertForOverFulfill = false
        var token: AnyCancellable?
        token = sut.$conversations.sink { convs in
            if let s = convs.first(where: { $0.id == id })?.userState, predicate(s) { exp.fulfill() }
        }
        await fulfillment(of: [exp], timeout: timeout)
        token?.cancel()
    }

    /// Poll `condition` on the main queue until it holds or `timeout` elapses.
    /// Used for state that isn't a `@Published` mirror (e.g. a mock writer's
    /// recorded calls behind a fire-and-forget store mutation).
    private func waitUntil(timeout: TimeInterval = 2.0, _ condition: @escaping () -> Bool) async {
        let exp = expectation(description: "condition")
        exp.assertForOverFulfill = false
        func poll() {
            if condition() { exp.fulfill(); return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) { poll() }
        }
        poll()
        await fulfillment(of: [exp], timeout: timeout)
    }

    private func makeCat(id: String, name: String, order: Int = 0, isExpanded: Bool = true) -> ConversationCategory {
        ConversationCategory(id: id, name: name, color: "#6366F1", icon: "folder.fill", order: order, isExpanded: isExpanded)
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

    func test_loadConversations_concurrentCallers_coalesceToSingleSync() async {
        // Au lancement, le `.task` de RootView ET celui de ConversationListView
        // appellent loadConversations() sur le MÊME VM partagé. Deux appelants
        // concurrents ne doivent déclencher qu'UN seul fullSync (coalescing),
        // pas deux — sinon thundering herd (double sync + double prefetch).
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let syncEngine = MockConversationSyncEngine()
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)

        async let first: Void = sut.loadConversations()
        async let second: Void = sut.loadConversations()
        _ = await (first, second)

        XCTAssertEqual(syncEngine.fullSyncCallCount, 1)
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
        try? await CacheCoordinator.shared.conversations.save([conversation], for: "list")

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
        try? await CacheCoordinator.shared.conversations.save([conversation], for: "list")

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

    // MARK: - loadConversations: `.expired` cache recovery (P1 — Offline Graceful Degradation)
    //
    // `performLoadConversations`'s `.expired` branch recovers a disk snapshot
    // past the 24h TTL via `loadIgnoringExpiry` and paints it immediately
    // (`.offline`) before attempting a resync, instead of treating an expired
    // entry as empty. These tests drive the REAL `CacheCoordinator.shared.
    // conversations` singleton (not a stub) past its TTL via the
    // `debugRewindFetchTimestamp` test seam, exercising the integration the
    // SDK-level `GRDBCacheStoreFreshnessTests` (isolated `DatabaseQueue`)
    // cannot reach.

    func test_loadConversations_whenCacheExpiredAndSyncFails_paintsRecoveredDataAndReportsOffline() async throws {
        let conversation = makeConversation(id: "000000000000000000000002")
        try await CacheCoordinator.shared.conversations.save([conversation], for: "list")
        await CacheCoordinator.shared.conversations.debugRewindFetchTimestamp(by: 25 * 3600, for: "list")
        let syncEngine = MockConversationSyncEngine()
        syncEngine.fullSyncResult = false
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)

        await sut.loadConversations()

        XCTAssertEqual(sut.conversations.map(\.id), [conversation.id],
                       "an expired-but-present disk cache must be painted immediately, not treated as empty")
        XCTAssertEqual(sut.loadState, .offline,
                       "a failed resync after `.expired` recovery must keep showing the recovered data, not regress to the empty error state")
        XCTAssertFalse(sut.loadFailed, "recovered data means this is NOT the empty-cache failure case")
    }

    func test_loadConversations_whenCacheExpiredAndSyncSucceeds_reportsLoaded() async throws {
        let conversation = makeConversation(id: "000000000000000000000003")
        try await CacheCoordinator.shared.conversations.save([conversation], for: "list")
        await CacheCoordinator.shared.conversations.debugRewindFetchTimestamp(by: 25 * 3600, for: "list")
        let syncEngine = MockConversationSyncEngine()
        syncEngine.fullSyncResult = true
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)

        await sut.loadConversations()

        XCTAssertEqual(sut.loadState, .loaded,
                       "a successful resync following `.expired` recovery must land on `.loaded`, not stay `.offline`")
        XCTAssertFalse(sut.loadFailed)
    }

    // MARK: - togglePin: Success (via ConversationStore — Strategy B 1b-ii-a)

    func test_togglePin_appliesViaStoreAndReflectsInList() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", isPinned: false)])
        await sut.storeHydrationTask?.value

        await sut.togglePin(for: "conv1")
        await drainMainQueue()

        XCTAssertTrue(sut.conversations.first(where: { $0.id == "conv1" })?.userState.isPinned ?? false,
                      "Optimistic pin must reflect into the list via the store merge")
        let stored = await store.conversation(id: "conv1")
        XCTAssertTrue(stored?.userState.isPinned ?? false, "Persistence routed through the store")
    }

    // MARK: - togglePin: Failure (rollback via store on 4xx)

    func test_togglePin_rollsBackOnPermanentFailure() async throws {
        let store = Self.makeTestStore(prefError: MeeshyError.server(statusCode: 422, message: "bad"))
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", isPinned: false)])
        await sut.storeHydrationTask?.value

        await sut.togglePin(for: "conv1")
        await drainMainQueue()

        XCTAssertFalse(sut.conversations.first(where: { $0.id == "conv1" })?.userState.isPinned ?? true,
                       "4xx must roll back the optimistic pin in the list")
        let stored = await store.conversation(id: "conv1")
        XCTAssertFalse(stored?.userState.isPinned ?? true)
    }

    // MARK: - toggleMute: Success

    func test_toggleMute_appliesViaStoreAndReflectsInList() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", isMuted: false)])
        await sut.storeHydrationTask?.value

        await sut.toggleMute(for: "conv1")
        await drainMainQueue()

        XCTAssertTrue(sut.conversations.first(where: { $0.id == "conv1" })?.userState.isMuted ?? false)
        let stored = await store.conversation(id: "conv1")
        XCTAssertTrue(stored?.userState.isMuted ?? false)
    }

    // MARK: - toggleMute: Failure (rollback)

    func test_toggleMute_rollsBackOnPermanentFailure() async throws {
        let store = Self.makeTestStore(prefError: MeeshyError.server(statusCode: 422, message: "bad"))
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", isMuted: false)])
        await sut.storeHydrationTask?.value

        await sut.toggleMute(for: "conv1")
        await drainMainQueue()

        XCTAssertFalse(sut.conversations.first(where: { $0.id == "conv1" })?.userState.isMuted ?? true)
    }

    // MARK: - markAsRead: Success (via store — 1b-ii-c)

    func test_markAsRead_setsUnreadCountToZeroViaStore() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", unreadCount: 5)])
        await sut.storeHydrationTask?.value

        await sut.markAsRead(conversationId: "conv1")
        await drainMainQueue()

        XCTAssertEqual(sut.conversations.first(where: { $0.id == "conv1" })?.userState.unreadCount, 0)
    }

    // MARK: - markAsRead: Failure (rollback)

    func test_markAsRead_rollsBackOnPermanentFailure() async throws {
        let store = Self.makeTestStore(lifecycleError: MeeshyError.server(statusCode: 422, message: "bad"))
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", unreadCount: 5)])
        await sut.storeHydrationTask?.value

        await sut.markAsRead(conversationId: "conv1")
        await drainMainQueue()

        XCTAssertEqual(sut.conversations.first(where: { $0.id == "conv1" })?.userState.unreadCount, 5,
                       "4xx must roll back to the previous unread count")
    }

    // MARK: - deleteConversation: Success (soft delete via store)

    func test_deleteConversation_softDeletesViaStore() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1"), makeConversation(id: "conv2")])
        await sut.storeHydrationTask?.value

        await sut.deleteConversation(conversationId: "conv1")
        await drainMainQueue()

        // Soft delete: deletedForUserAt set; the row is hidden by filterConversations.
        XCTAssertNotNil(sut.conversations.first(where: { $0.id == "conv1" })?.userState.deletedForUserAt,
                        "conv1 must be soft-deleted in the store")
        XCTAssertNil(sut.conversations.first(where: { $0.id == "conv2" })?.userState.deletedForUserAt)
    }

    // MARK: - deleteConversation: Failure (restore)

    func test_deleteConversation_rollsBackOnPermanentFailure() async throws {
        let store = Self.makeTestStore(lifecycleError: MeeshyError.server(statusCode: 422, message: "bad"))
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1"), makeConversation(id: "conv2")])
        await sut.storeHydrationTask?.value

        await sut.deleteConversation(conversationId: "conv1")
        await drainMainQueue()

        XCTAssertNil(sut.conversations.first(where: { $0.id == "conv1" })?.userState.deletedForUserAt,
                     "4xx must restore the conversation (clear deletedForUserAt)")
    }

    // MARK: - deleteConversation: sweeps local call transcripts

    func test_deleteConversation_sweepsLocalCallTranscripts() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv-call-1")])
        await sut.storeHydrationTask?.value

        let callMessage = MeeshyMessage(
            conversationId: "conv-call-1", content: "",
            callSummary: CallSummaryMetadata(
                callId: "call-sweep-1", initiatorId: "user-1", callType: .audio, outcome: .completed,
                durationSeconds: 12, bytesTotal: nil, bytesEstimated: false, networkQuality: nil
            )
        )
        try? await CacheCoordinator.shared.messages.save([callMessage], for: "conv-call-1")
        let transcript = CallTranscript(
            callId: "call-sweep-1", conversationId: "conv-call-1",
            callStartedAt: Date(timeIntervalSince1970: 0), segments: []
        )
        await CallTranscriptStore.shared.saveMerging(transcript)

        await sut.deleteConversation(conversationId: "conv-call-1")
        await drainMainQueue()

        let loaded = await CallTranscriptStore.shared.transcript(for: "call-sweep-1")
        XCTAssertNil(loaded, "deleting a conversation must sweep every local call transcript it carried")
    }

    // MARK: - filterConversations hides soft-deleted rows

    func test_filterConversations_excludesSoftDeleted() {
        var deleted = makeConversation(id: "conv1")
        deleted.userState.deletedForUserAt = Date()
        let visible = makeConversation(id: "conv2")

        for filter in [ConversationFilter.all, .unread, .archived, .personnel] {
            let result = ConversationListViewModel.filterConversations(
                [deleted, visible], searchText: "", filter: filter
            )
            XCTAssertFalse(result.contains(where: { $0.id == "conv1" }),
                           "Soft-deleted conv must be hidden from filter \(filter)")
        }
    }

    /// P2 — a conversation renamed locally (`userState.customName`) must
    /// remain findable by the name the row actually shows. Matching on
    /// `c.name` (server title/identifier) instead of `c.displayName`
    /// (customName ?? title ?? identifier) made a renamed conversation
    /// invisible to search under its own displayed name.
    func test_filterConversations_matchesLocalCustomName_notJustServerTitle() {
        var renamed = makeConversation(id: "conv1", name: "Team Alpha")
        renamed.userState.customName = "Mon Groupe Préféré"
        let untouched = makeConversation(id: "conv2", name: "Team Beta")

        let byCustomName = ConversationListViewModel.filterConversations(
            [renamed, untouched], searchText: "Préféré", filter: .all
        )
        XCTAssertEqual(byCustomName.map(\.id), ["conv1"],
                       "search must match the locally-renamed displayName, not just the server title")

        let byOldServerTitle = ConversationListViewModel.filterConversations(
            [renamed, untouched], searchText: "Alpha", filter: .all
        )
        XCTAssertTrue(byOldServerTitle.isEmpty,
                      "once renamed locally, the row is found by its displayed name — not the superseded server title")
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
        archivedConv.userState.isArchived = true
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
        sut.conversations[0].userState.unreadCount = 7

        XCTAssertEqual(sut.conversations[0].userState.unreadCount, 7)
    }

    func test_unreadCountUpdatedForSpecificConversation_doesNotAffectOthers() async throws {
        let (sut, _, _, _, _, _, _) = makeSUT()
        sut.conversations = [
            makeConversation(id: "conv1", unreadCount: 0),
            makeConversation(id: "conv2", unreadCount: 3)
        ]

        sut.conversations[0].userState.unreadCount = 5

        XCTAssertEqual(sut.conversations[0].userState.unreadCount, 5)
        XCTAssertEqual(sut.conversations[1].userState.unreadCount, 3, "Other conversations should not be affected")
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

    func test_typingStartedEvent_publishesTypingUsername_triggersObjectWillChange() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)

        let expectation = XCTestExpectation(description: "objectWillChange fires on typing event")
        expectation.assertForOverFulfill = false
        let cancellable = sut.objectWillChange.sink { _ in expectation.fulfill() }

        messageSocket.typingStarted.send(TypingEvent(userId: "user1", username: "Alice", conversationId: "conv1"))

        await fulfillment(of: [expectation], timeout: 1.0)
        cancellable.cancel()

        XCTAssertEqual(sut.typingUsernames["conv1"], "Alice")
    }

    func test_socketTypingStarted_storesDisplayName_notHandle() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)

        messageSocket.typingStarted.send(TypingEvent(userId: "u1", username: "alice_handle", displayName: "Alice Martin", conversationId: "conv1"))

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.typingUsernames["conv1"], "Alice Martin")
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

    func test_markAsUnread_setsUnreadCountToOneWhenZero() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", unreadCount: 0)])
        await sut.storeHydrationTask?.value

        await sut.markAsUnread(conversationId: "conv1")
        await drainMainQueue()

        XCTAssertEqual(sut.conversations.first(where: { $0.id == "conv1" })?.userState.unreadCount, 1)
    }

    func test_markAsUnread_rollsBackOnPermanentFailure() async throws {
        let store = Self.makeTestStore(lifecycleError: MeeshyError.server(statusCode: 422, message: "bad"))
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", unreadCount: 0)])
        await sut.storeHydrationTask?.value

        await sut.markAsUnread(conversationId: "conv1")
        await drainMainQueue()

        XCTAssertEqual(sut.conversations.first(where: { $0.id == "conv1" })?.userState.unreadCount, 0,
                       "4xx must roll back the optimistic unread hint")
    }

    // MARK: - archiveConversation

    func test_archiveConversation_setsArchivedViaStore() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", isActive: true)])
        await sut.storeHydrationTask?.value

        await sut.archiveConversation(conversationId: "conv1")
        await drainMainQueue()

        let row = sut.conversations.first(where: { $0.id == "conv1" })
        XCTAssertTrue(row?.userState.isArchived ?? false)
        XCTAssertTrue(row?.isActive ?? false, "isActive (server-level) should NOT change when user archives")
    }

    func test_archiveConversation_rollsBackOnPermanentFailure() async throws {
        let store = Self.makeTestStore(prefError: MeeshyError.server(statusCode: 422, message: "bad"))
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", isActive: true)])
        await sut.storeHydrationTask?.value

        await sut.archiveConversation(conversationId: "conv1")
        await drainMainQueue()

        XCTAssertFalse(sut.conversations.first(where: { $0.id == "conv1" })?.userState.isArchived ?? true,
                       "4xx must roll back the optimistic archive")
    }

    // MARK: - unarchiveConversation

    func test_unarchiveConversation_setsArchivedFalseViaStore() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        var conv = makeConversation(id: "conv1", isActive: true)
        conv.userState.isArchived = true
        sut.setConversations([conv])
        await sut.storeHydrationTask?.value

        await sut.unarchiveConversation(conversationId: "conv1")
        await drainMainQueue()

        XCTAssertFalse(sut.conversations.first(where: { $0.id == "conv1" })?.userState.isArchived ?? true)
    }

    // MARK: - setFavoriteReaction

    func test_setFavoriteReaction_updatesReactionViaStore() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", reaction: nil)])
        await sut.storeHydrationTask?.value

        await sut.setFavoriteReaction(conversationId: "conv1", emoji: "heart")
        await drainMainQueue()

        XCTAssertEqual(sut.conversations.first(where: { $0.id == "conv1" })?.userState.reaction, "heart")
    }

    func test_setFavoriteReaction_rollsBackOnPermanentFailure() async throws {
        let store = Self.makeTestStore(prefError: MeeshyError.server(statusCode: 422, message: "bad"))
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", reaction: nil)])
        await sut.storeHydrationTask?.value

        await sut.setFavoriteReaction(conversationId: "conv1", emoji: "heart")
        await drainMainQueue()

        XCTAssertNil(sut.conversations.first(where: { $0.id == "conv1" })?.userState.reaction,
                     "4xx must roll back the optimistic reaction")
    }

    // MARK: - togglePin on unpinned -> pinned -> unpinned

    func test_togglePin_togglesBackAndForth() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", isPinned: false)])
        await sut.storeHydrationTask?.value

        await sut.togglePin(for: "conv1"); await drainMainQueue()
        XCTAssertTrue(sut.conversations.first(where: { $0.id == "conv1" })?.userState.isPinned ?? false)

        await sut.togglePin(for: "conv1"); await drainMainQueue()
        XCTAssertFalse(sut.conversations.first(where: { $0.id == "conv1" })?.userState.isPinned ?? true)
    }

    // MARK: - toggleMute on unmuted -> muted -> unmuted

    func test_toggleMute_togglesBackAndForth() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", isMuted: false)])
        await sut.storeHydrationTask?.value

        await sut.toggleMute(for: "conv1"); await drainMainQueue()
        XCTAssertTrue(sut.conversations.first(where: { $0.id == "conv1" })?.userState.isMuted ?? false)

        await sut.toggleMute(for: "conv1"); await drainMainQueue()
        XCTAssertFalse(sut.conversations.first(where: { $0.id == "conv1" })?.userState.isMuted ?? true)
    }

    // MARK: - Non-existent conversation ID

    func test_togglePin_ignoredForUnknownConversation() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1")])
        await sut.storeHydrationTask?.value

        await sut.togglePin(for: "unknown")
        await drainMainQueue()

        let unknown = await store.conversation(id: "unknown")
        XCTAssertNil(unknown, "Unknown conversation is never created in the store")
        XCTAssertFalse(sut.conversations.first(where: { $0.id == "conv1" })?.userState.isPinned ?? true)
    }

    func test_markAsRead_ignoredForUnknownConversation() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", unreadCount: 5)])
        await sut.storeHydrationTask?.value

        await sut.markAsRead(conversationId: "unknown")
        await drainMainQueue()

        let unknown = await store.conversation(id: "unknown")
        XCTAssertNil(unknown)
        XCTAssertEqual(sut.conversations.first(where: { $0.id == "conv1" })?.userState.unreadCount, 5)
    }

    func test_deleteConversation_ignoredForUnknownConversation() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1")])
        await sut.storeHydrationTask?.value

        await sut.deleteConversation(conversationId: "unknown")
        await drainMainQueue()

        let unknown = await store.conversation(id: "unknown")
        XCTAssertNil(unknown)
        XCTAssertNil(sut.conversations.first(where: { $0.id == "conv1" })?.userState.deletedForUserAt)
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

    // MARK: - Grouping pipeline wait

    /// Le regroupement passe par debounce(150ms) + Task.detached : un sleep fixe
    /// est flaky sur un runner CI chargé — on poll jusqu'à l'état attendu.
    private func waitForGrouping(
        timeout: TimeInterval = 5.0,
        until condition: @escaping @MainActor () -> Bool
    ) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("Grouping pipeline did not settle within \(timeout)s")
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

        try await waitForGrouping { !sut.groupedConversations.isEmpty }

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

        try await waitForGrouping { sut.groupedConversations.contains { $0.section.id == "pinned" } }

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

        try await waitForGrouping {
            sut.groupedConversations.contains { $0.section.id == "cat-work" }
                && sut.groupedConversations.contains { $0.section.id == "cat-family" }
        }

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

        try await waitForGrouping { sut.groupedConversations.contains { $0.section.id == "other" } }

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

        try await waitForGrouping { sut.groupedConversations.contains { $0.section.id == "other" } }

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

    func test_moveToSection_updatesSectionIdViaStore() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1")])
        await sut.storeHydrationTask?.value

        sut.moveToSection(conversationId: "conv1", sectionId: "cat-work")
        await waitForListState(sut, id: "conv1") { $0.sectionId == "cat-work" }

        XCTAssertEqual(sut.conversations.first(where: { $0.id == "conv1" })?.userState.sectionId, "cat-work")
    }

    func test_moveToSection_emptySectionIdSetsNil() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", sectionId: "cat-work")])
        await sut.storeHydrationTask?.value

        sut.moveToSection(conversationId: "conv1", sectionId: "")
        await waitForListState(sut, id: "conv1") { $0.sectionId == nil }

        XCTAssertNil(sut.conversations.first(where: { $0.id == "conv1" })?.userState.sectionId)
    }

    func test_moveToSection_ignoredForUnknownConversation() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1")])
        await sut.storeHydrationTask?.value

        sut.moveToSection(conversationId: "unknown", sectionId: "cat-work")
        await drainMainQueue()

        let unknown = await store.conversation(id: "unknown")
        XCTAssertNil(unknown, "Unknown conversation is never created in the store")
    }

    // MARK: - totalUnreadCount edge cases

    func test_totalUnreadCount_returnsZeroWhenNoConversations() {
        let (sut, _, _, _, _, _, _) = makeSUT()

        XCTAssertEqual(sut.totalUnreadCount, 0)
    }

    func test_totalUnreadCount_updatesAfterMarkAsRead() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([
            makeConversation(id: "c1", unreadCount: 3),
            makeConversation(id: "c2", unreadCount: 5)
        ])
        await sut.storeHydrationTask?.value
        XCTAssertEqual(sut.totalUnreadCount, 8)

        await sut.markAsRead(conversationId: "c1")
        await drainMainQueue()

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

        XCTAssertTrue(sut.conversations[0].userState.isPinned)
    }

    func test_socketUserPreferencesUpdated_updatesMuteState() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.conversations = [makeConversation(id: "conv1", isMuted: false)]

        messageSocket.userPreferencesUpdated.send(
            UserPreferencesUpdatedEvent(userId: "user1", category: "conversation", conversationId: "conv1", isPinned: nil, isMuted: true)
        )

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(sut.conversations[0].userState.isMuted)
    }

    func test_socketUserPreferencesUpdated_ignoresUnknownConversation() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.conversations = [makeConversation(id: "conv1", isPinned: false)]

        messageSocket.userPreferencesUpdated.send(
            UserPreferencesUpdatedEvent(userId: "user1", category: "conversation", conversationId: "unknown", isPinned: true, isMuted: nil)
        )

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertFalse(sut.conversations[0].userState.isPinned)
    }

    // MARK: - markAsUnread: preserves existing unread count

    func test_markAsUnread_preservesExistingNonZeroUnreadCount() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "conv1", unreadCount: 5)])
        await sut.storeHydrationTask?.value

        await sut.markAsUnread(conversationId: "conv1")
        await drainMainQueue()

        XCTAssertEqual(sut.conversations.first(where: { $0.id == "conv1" })?.userState.unreadCount, 5)
    }

    // MARK: - unarchiveConversation: rollback on failure

    func test_unarchiveConversation_rollsBackOnPermanentFailure() async throws {
        let store = Self.makeTestStore(prefError: MeeshyError.server(statusCode: 422, message: "bad"))
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        var archived = makeConversation(id: "conv1", isActive: true)
        archived.userState.isArchived = true
        sut.setConversations([archived])
        await sut.storeHydrationTask?.value

        await sut.unarchiveConversation(conversationId: "conv1")
        await drainMainQueue()

        XCTAssertTrue(sut.conversations.first(where: { $0.id == "conv1" })?.userState.isArchived ?? false,
                      "4xx must roll back to archived")
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

        try await waitForGrouping {
            sut.groupedConversations.contains { $0.section.id == "cat-dev" }
                && sut.groupedConversations.contains { $0.section.id == "other" }
        }

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

    /// P1 — a lightweight bump (socket relay or push notification) never
    /// carries the new message's sender/attachments/flags. Leaving the
    /// PREVIOUS message's companion fields in place renders a wrong
    /// author, a phantom attachment icon, or summarizes a brand-new text
    /// message as "1 message vue unique" because the stale
    /// `lastMessageIsViewOnce` flag survives the bump.
    ///
    /// P2 (follow-up): the same reasoning applies to `lastMessagePreview`
    /// and its Prisme Linguistique companions (`lastMessageTranslations`,
    /// `lastMessageOriginalLanguage`) — neither caller has the new
    /// message's text either. Resetting only the sender/attachments/flags
    /// while leaving the OLD preview text in place regressed the bug to a
    /// subtler form: an unattributed stale text (no sender label, since
    /// that's now nil) rendered as if it were the new message, and worse,
    /// a stale `lastMessageTranslations` entry matching the viewer's
    /// preferred language would surface a stale TRANSLATED string even
    /// after `lastMessagePreview` itself is cleared.
    func test_bumpToTop_resetsStaleCompanionFields() async {
        let (sut, _, _, _, _, _, _) = makeSUT()
        var conv = makeConversation(id: "conv1", lastMessageAt: Date(timeIntervalSince1970: 1_000))
        conv.lastMessageSenderName = "Alice"
        conv.lastMessageAttachments = [
            MeeshyMessageAttachment(id: "att1", mimeType: "image/jpeg", fileUrl: "https://x/a.jpg", uploadedBy: "alice")
        ]
        conv.lastMessageAttachmentCount = 1
        conv.lastMessageIsBlurred = true
        conv.lastMessageIsViewOnce = true
        conv.lastMessageExpiresAt = Date(timeIntervalSince1970: 2_000)
        conv.lastMessagePreview = "Photo envoyée à l'instant"
        conv.lastMessageTranslations = ["en": "Photo just sent"]
        conv.lastMessageOriginalLanguage = "fr"
        sut.setConversations([conv])

        sut.bumpToTop(conversationId: "conv1", newLastMessageAt: Date(timeIntervalSince1970: 9_000))

        let bumped = sut.conversations[0]
        XCTAssertNil(bumped.lastMessageSenderName, "stale author must not survive the bump")
        XCTAssertTrue(bumped.lastMessageAttachments.isEmpty, "phantom attachment must not survive the bump")
        XCTAssertEqual(bumped.lastMessageAttachmentCount, 0)
        XCTAssertFalse(bumped.lastMessageIsBlurred)
        XCTAssertFalse(bumped.lastMessageIsViewOnce, "a new message must not inherit the old one's 'View once' flag")
        XCTAssertNil(bumped.lastMessageExpiresAt)
        XCTAssertNil(bumped.lastMessagePreview, "stale preview text must not survive the bump — an unattributed old text is worse than a blank row")
        XCTAssertNil(bumped.lastMessageTranslations, "stale translations must not survive the bump — resolvedLastMessagePreview would otherwise surface a stale translated string even with lastMessagePreview cleared")
        XCTAssertNil(bumped.lastMessageOriginalLanguage)
    }

    // MARK: - conversation:updated socket event — graft du titre

    /// Un DM n'est jamais renommable : son `title` client est le NOM DU
    /// PARTICIPANT, dérivé à la conversion REST (`toConversation`). Le
    /// payload socket porte le titre BRUT de la DB — le greffer écraserait
    /// le nom affiché (vu au pin/unpin 2026-07-04 : « sandra raveloson » →
    /// « Sany » après un `setPinned`).
    func test_conversationUpdatedEvent_titleOnDirect_doesNotClobberParticipantName() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.setConversations([
            makeConversation(id: "dm1", name: "sandra raveloson", type: .direct)
        ])

        let event = makeConversationUpdatedEvent(
            conversationId: "dm1", lastMessageAt: nil, title: "Sany")
        messageSocket.conversationUpdated.send(event)

        try await Task.sleep(nanoseconds: 80_000_000)

        XCTAssertEqual(sut.conversations.first?.title, "sandra raveloson",
                       "Le titre brut du payload socket ne doit pas écraser le nom du participant d'un DM")
    }

    func test_conversationUpdatedEvent_titleOnGroup_appliesRename() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        sut.setConversations([
            makeConversation(id: "g1", name: "Ancien nom", type: .group)
        ])

        let event = makeConversationUpdatedEvent(
            conversationId: "g1", lastMessageAt: nil, title: "Nouveau nom")
        messageSocket.conversationUpdated.send(event)

        try await Task.sleep(nanoseconds: 80_000_000)

        XCTAssertEqual(sut.conversations.first?.title, "Nouveau nom",
                       "Le rename d'un groupe doit continuer de se propager via l'event socket")
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

    /// P1 — end-to-end through the real socket sink (not calling
    /// `bumpToTop` directly): CONVERSATION_UPDATED never carries the new
    /// message's sender/attachments/flags, so the row must not keep
    /// rendering the PREVIOUS message's companion state after the bump.
    func test_conversationUpdatedEvent_withLastMessageAt_resetsStaleCompanionFields() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: messageSocket)
        var conv = makeConversation(id: "c", lastMessageAt: Date(timeIntervalSince1970: 3_000))
        conv.lastMessageSenderName = "Alice"
        conv.lastMessageIsViewOnce = true
        conv.lastMessageAttachmentCount = 1
        sut.setConversations([conv])

        let newer = Date(timeIntervalSince1970: 9_000)
        let event = makeConversationUpdatedEvent(conversationId: "c", lastMessageAt: newer)
        messageSocket.conversationUpdated.send(event)

        try await Task.sleep(nanoseconds: 80_000_000)

        let bumped = try XCTUnwrap(sut.conversations.first(where: { $0.id == "c" }))
        XCTAssertNil(bumped.lastMessageSenderName)
        XCTAssertFalse(bumped.lastMessageIsViewOnce,
                       "the row must not summarize a brand-new message as 'View once' from the stale flag")
        XCTAssertEqual(bumped.lastMessageAttachmentCount, 0)
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

        // Allow init-time async subscriptions (receive(on: DispatchQueue.main)) to settle.
        try? await Task.sleep(nanoseconds: 10_000_000)

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

    // MARK: - loadCategories: cache-first

    /// Cache-first guarantees the section grouping has the right buckets
    /// the very first frame after cold start. Without it the
    /// CombineLatest4 grouping pipeline fires with userCategories=[] and
    /// every row lands in "Other" until the network fetch completes,
    /// causing the visible "category flash".
    func test_loadCategories_warmCache_appliesCachedBeforeNetwork() async throws {
        let cachedCat = ConversationCategory(id: "cat-1", name: "Work", color: "FF0000", icon: "briefcase.fill", order: 0, isExpanded: true)
        let preferenceService = MockPreferenceService()
        preferenceService.cachedCategoriesStub = [cachedCat]
        preferenceService.getCategoriesResult = .success([cachedCat])  // network returns same
        let (sut, _, _, _, _, _, _) = makeSUT(preferenceService: preferenceService)

        await sut.loadCategories()

        XCTAssertEqual(sut.userCategories.count, 1, "Cached category must populate userCategories")
        XCTAssertEqual(sut.userCategories.first?.id, "cat-1")
        XCTAssertEqual(preferenceService.loadCachedCategoriesCallCount, 1)
        XCTAssertEqual(preferenceService.revalidateCategoriesCallCount, 1,
                       "Revalidate must run in background even when cache hit")
    }

    /// Cold cache: VM still must populate via network and persist for next
    /// session. No flash because there's nothing to flash from.
    func test_loadCategories_emptyCache_fetchesAndPersists() async throws {
        let fresh = ConversationCategory(id: "cat-1", name: "Family", color: "00FF00", icon: "house.fill", order: 0, isExpanded: true)
        let preferenceService = MockPreferenceService()
        preferenceService.cachedCategoriesStub = nil
        preferenceService.getCategoriesResult = .success([fresh])
        let (sut, _, _, _, _, _, _) = makeSUT(preferenceService: preferenceService)

        await sut.loadCategories()
        await drainMainQueue()  // fresh now flows through the category store publisher

        XCTAssertEqual(sut.userCategories.first?.id, "cat-1")
        XCTAssertEqual(preferenceService.persistCategoriesCallCount, 1,
                       "Empty-cache path must persist the fresh fetch for next session")
        XCTAssertEqual(preferenceService.lastPersistedCategories?.first?.id, "cat-1")
    }

    /// Network failure on revalidate must NOT clobber the already-painted
    /// cached state. Stale-while-revalidate trustfall: cached value lives
    /// until next successful refresh, never replaced with empty.
    func test_loadCategories_networkFailure_keepsCachedValue() async throws {
        struct StubError: Error {}
        let cachedCat = ConversationCategory(id: "cat-1", name: "Friends", color: "0000FF", icon: "person.2.fill", order: 0, isExpanded: true)
        let preferenceService = MockPreferenceService()
        preferenceService.cachedCategoriesStub = [cachedCat]
        preferenceService.getCategoriesResult = .failure(StubError())
        let (sut, _, _, _, _, _, _) = makeSUT(preferenceService: preferenceService)

        await sut.loadCategories()

        XCTAssertEqual(sut.userCategories.first?.id, "cat-1",
                       "Cached value must survive a revalidate failure")
        XCTAssertEqual(preferenceService.persistCategoriesCallCount, 0,
                       "Failed revalidate must NOT persist (no fresh value to write)")
    }

    /// Server-truth race: cache says 1 category, server now has 2 (user
    /// added one on web). The fresh value must override the cached one and
    /// also persist for next session.
    func test_loadCategories_warmCache_freshFetchOverridesAndPersists() async throws {
        let cachedCat = ConversationCategory(id: "cat-1", name: "Work", color: "FF0000", icon: "briefcase.fill", order: 0, isExpanded: true)
        let newCat = ConversationCategory(id: "cat-2", name: "Travel", color: "00FFFF", icon: "airplane", order: 1, isExpanded: true)
        let preferenceService = MockPreferenceService()
        preferenceService.cachedCategoriesStub = [cachedCat]
        preferenceService.getCategoriesResult = .success([cachedCat, newCat])
        let (sut, _, _, _, _, _, _) = makeSUT(preferenceService: preferenceService)

        await sut.loadCategories()
        await drainMainQueue()  // fresh now flows through the category store publisher

        XCTAssertEqual(sut.userCategories.count, 2,
                       "Fresh fetch with new category must replace stale cached value")
        XCTAssertEqual(sut.userCategories.map(\.id).sorted(), ["cat-1", "cat-2"])
        XCTAssertEqual(preferenceService.persistCategoriesCallCount, 1)
        XCTAssertEqual(preferenceService.lastPersistedCategories?.count, 2)
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
        // Sans latence, le 1er appel peut se terminer AVANT que le 2e ne
        // démarre — les deux fetchent alors légitimement (le guard ne
        // coalesce que le chevauchement). Le délai force le chevauchement.
        conversationService.listPageDelayNanoseconds = 200_000_000

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
        let cachedItems = cached.snapshot() ?? []
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

    func test_pullToRefresh_preservesMediaCaches() async {
        // Local-first : les octets média (avatars, bannières, thumbnails)
        // téléchargés une fois ne doivent jamais être re-téléchargés tant que
        // l'app est installée. Le pull-to-refresh rafraîchit les métadonnées,
        // jamais les assets binaires.
        let imageKey = "https://gate.meeshy.me/api/v1/attachments/file/avatars%2Ftest-pullrefresh.jpg"
        let thumbKey = "https://gate.meeshy.me/api/v1/attachments/test-pullrefresh/thumbnail"
        await CacheCoordinator.shared.images.store(Data("avatar-bytes".utf8), for: imageKey)
        await CacheCoordinator.shared.thumbnails.store(Data("thumb-bytes".utf8), for: thumbKey)
        let (sut, _, _, _, _, _, _) = makeSUT()

        await sut.pullToRefresh()

        let imageStillCached = await CacheCoordinator.shared.images.isCached(imageKey)
        let thumbStillCached = await CacheCoordinator.shared.thumbnails.isCached(thumbKey)
        await CacheCoordinator.shared.images.remove(for: imageKey)
        await CacheCoordinator.shared.thumbnails.remove(for: thumbKey)
        XCTAssertTrue(imageStillCached,
                      "pullToRefresh must not wipe the persistent image cache (avatars/banners)")
        XCTAssertTrue(thumbStillCached,
                      "pullToRefresh must not wipe the thumbnail cache")
    }

    /// P1 — TOP RISK: a pull-to-refresh that fails offline must never
    /// destroy the conversations cache it can't repopulate. `forceRefresh`
    /// used to call `invalidateCache()` (wiping L1+L2) BEFORE the fetch —
    /// an offline pull emptied the app. Fetch-then-replace: existing data
    /// must survive an unreachable sync untouched.
    func test_forceRefresh_whenSyncFails_preservesExistingCache() async throws {
        let conversation = makeConversation(id: "000000000000000000000001")
        try await CacheCoordinator.shared.conversations.save([conversation], for: "list")
        let syncEngine = MockConversationSyncEngine()
        syncEngine.fullSyncResult = false
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)
        await sut.loadConversations()
        XCTAssertEqual(sut.conversations.count, 1, "precondition: cache seeded")

        await sut.forceRefresh()

        XCTAssertEqual(sut.conversations.count, 1,
                       "a failed refresh must not empty the in-memory list")
        XCTAssertTrue(sut.loadFailed)
        let stillCached = await CacheCoordinator.shared.conversations.load(for: "list")
        XCTAssertEqual(stillCached.snapshot()?.count, 1,
                       "a failed refresh must not wipe the on-disk cache either")
    }

    /// Same guarantee, driven through the user-facing `.refreshable` entry
    /// point. A failed offline pull must leave every cache untouched — not
    /// just skip re-invalidating the ones `pullToRefresh` also wipes.
    func test_pullToRefresh_whenSyncFails_preservesExistingCacheAndSkipsAncillaryInvalidation() async throws {
        let conversation = makeConversation(id: "000000000000000000000001")
        try await CacheCoordinator.shared.conversations.save([conversation], for: "list")
        let syncEngine = MockConversationSyncEngine()
        syncEngine.fullSyncResult = false
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)
        await sut.loadConversations()

        await sut.pullToRefresh()

        XCTAssertEqual(sut.conversations.count, 1,
                       "a failed pull-to-refresh must not empty the in-memory list")
        XCTAssertTrue(sut.loadFailed)
        let stillCached = await CacheCoordinator.shared.conversations.load(for: "list")
        XCTAssertEqual(stillCached.snapshot()?.count, 1,
                       "a failed pull-to-refresh must not wipe the conversations cache")
    }

    /// Regression guard: the ancillary cross-surface invalidation that runs
    /// AFTER a successful `forceRefresh()` must not clobber the
    /// conversations store `forceRefresh()` just fetch-then-replaced —
    /// only the OTHER caches (messages, stories, preferences, ...) get
    /// wiped for lazy rehydration.
    func test_pullToRefresh_whenSyncSucceeds_leavesConversationsCacheIntact() async throws {
        let conversation = makeConversation(id: "000000000000000000000001")
        try await CacheCoordinator.shared.conversations.save([conversation], for: "list")
        let syncEngine = MockConversationSyncEngine()
        syncEngine.fullSyncResult = true
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)
        await sut.loadConversations()

        await sut.pullToRefresh()

        XCTAssertFalse(sut.loadFailed, "a successful pull-to-refresh must not report a failure")
        let stillCached = await CacheCoordinator.shared.conversations.load(for: "list")
        XCTAssertEqual(stillCached.snapshot()?.count, 1,
                       "the post-success ancillary invalidation must not wipe the conversations store it just fetch-then-replaced")
    }

    // MARK: - handleForegroundReturn (P2 — inverted guard)

    /// `isCacheValid` means "we last fetched within the last 30s" — the
    /// USEFUL case for a foreground-return stories refresh is precisely
    /// when it's FALSE (a long background stint just ended). The guard
    /// used to read `isCacheValid` (proceed only while still fresh),
    /// short-circuiting the one scenario this method exists for.
    func test_handleForegroundReturn_afterLongBackground_refreshesStaleStories() async throws {
        await CacheCoordinator.shared.stories.invalidateAll()
        let storyService = MockStoryService()
        let (sut, _, _, _, _, _, _) = makeSUT(storyService: storyService)
        // No `loadConversations()`/`forceRefresh()` call: `lastFetchedAt`
        // stays nil, i.e. `isCacheValid == false` — simulates returning
        // from a long background stint.

        sut.handleForegroundReturn()
        try await Task.sleep(nanoseconds: 150_000_000)

        XCTAssertGreaterThan(storyService.listCallCount, 0,
                             "after a long background stint the stale stories cache must be refreshed")
    }

    func test_handleForegroundReturn_withinCacheValidWindow_skipsStoriesRefresh() async throws {
        let storyService = MockStoryService()
        let (sut, _, _, _, _, _, _) = makeSUT(storyService: storyService)
        await sut.loadConversations() // stamps `lastFetchedAt = Date()` — cache still valid
        try await Task.sleep(nanoseconds: 150_000_000) // let loadConversations' own prefetch settle

        // Empty the stories cache again so, if the OUTER `isCacheValid`
        // guard didn't short-circuit, the INNER freshness check inside
        // the Task would have no reason to skip either — isolates what
        // this test actually exercises.
        await CacheCoordinator.shared.stories.invalidateAll()
        storyService.reset()

        sut.handleForegroundReturn()
        try await Task.sleep(nanoseconds: 150_000_000)

        XCTAssertEqual(storyService.listCallCount, 0,
                       "within the 30s cache-valid window, a foreground return must not force a stories refresh even with an empty stories cache")
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

    func test_loadMore_withoutCursor_pagesFromLocalTail() async {
        // Full sync partiel (ou curseur jamais persisté) : des conversations
        // sont affichées mais `nextCursor` est nil. loadMore doit paginer
        // depuis la queue locale réelle — la conversation au lastMessageAt
        // le plus ancien, même sémantique que le curseur gateway `before` —
        // au lieu de refetcher la page 1 (dont le zero-progress guard
        // forcerait `.exhausted` et tuerait l'infinite scroll).
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        let conversationService = MockConversationService()
        conversationService.listPageResult = .success(
            ConversationPage(items: [makeConversation(id: "older")], nextCursor: "older", hasMore: true)
        )
        let (sut, _, _, _, _, _, _) = makeSUT(conversationService: conversationService)
        sut.conversations = [
            makeConversation(id: "newest", lastMessageAt: Date()),
            makeConversation(id: "tail", lastMessageAt: Date(timeIntervalSinceNow: -3_600)),
        ]

        await sut.loadMore()

        XCTAssertEqual(conversationService.lastListPageCursor, "tail",
                       "Without a persisted cursor, loadMore must page from the oldest loaded conversation instead of refetching page 1")
    }

    // MARK: - ThemedConversationRow timestamp color

    func test_themedRow_timestampColor_withUnread_isErrorRed() {
        let color = ThemedConversationRow.timestampColor(unreadCount: 3, accent: .blue)
        XCTAssertEqual(color, MeeshyColors.error)
    }

    func test_themedRow_timestampColor_noUnread_isAccent() {
        let color = ThemedConversationRow.timestampColor(unreadCount: 0, accent: .blue)
        XCTAssertEqual(color, Color.blue)
    }

    // MARK: - Push notification bump

    func test_pushNotification_messageForKnownConversation_bumpsToTop() {
        let subject = PassthroughSubject<String, Never>()
        let (sut, _, _, _, _, _, _) = makeSUT(messageNotificationPublisher: subject.eraseToAnyPublisher())
        sut.conversations = [makeConversation(id: "a"), makeConversation(id: "b")]
        subject.send("b")
        let exp = expectation(description: "bump applied on main")
        DispatchQueue.main.async { exp.fulfill() }
        wait(for: [exp], timeout: 1)
        XCTAssertEqual(sut.conversations.first?.id, "b")
    }

    // MARK: - Foreground reactivation

    func test_handleForegroundReactivation_resortsConversations() {
        let (sut, _, _, _, _, _, _) = makeSUT()
        let recent = makeConversation(id: "recent", lastMessageAt: Date(timeIntervalSince1970: 9999))
        let old = makeConversation(id: "old", lastMessageAt: Date(timeIntervalSince1970: 1))
        sut.conversations = [old, recent]
        sut.handleForegroundReactivation()
        XCTAssertEqual(sut.conversations.first?.id, "recent")
    }

    func test_handleForegroundReactivation_triggersDeltaSync() {
        let syncEngine = MockConversationSyncEngine()
        let exp = expectation(description: "delta sync ran")
        exp.assertForOverFulfill = false
        syncEngine.onSyncSinceLastCheckpoint = { exp.fulfill() }
        let (sut, _, _, _, _, _, _) = makeSUT(syncEngine: syncEngine)
        sut.handleForegroundReactivation()
        wait(for: [exp], timeout: 2)
        XCTAssertGreaterThan(syncEngine.syncSinceLastCheckpointCallCount, 0)
    }

    // MARK: - conversationsAreInOrder comparator

    func test_conversationsAreInOrder_pinnedBeforeUnpinned() {
        let pinned = makeConversation(id: "p", isPinned: true, lastMessageAt: Date(timeIntervalSince1970: 1))
        let normal = makeConversation(id: "n", isPinned: false, lastMessageAt: Date(timeIntervalSince1970: 999))
        XCTAssertTrue(ConversationListViewModel.conversationsAreInOrder(pinned, normal, draftSummaries: [:]))
        XCTAssertFalse(ConversationListViewModel.conversationsAreInOrder(normal, pinned, draftSummaries: [:]))
    }

    func test_conversationsAreInOrder_draftBeforeNonDraft_amongUnpinned() {
        let withDraft = makeConversation(id: "d", isPinned: false, lastMessageAt: Date(timeIntervalSince1970: 1))
        let noDraft = makeConversation(id: "x", isPinned: false, lastMessageAt: Date(timeIntervalSince1970: 999))
        let drafts = ["d": DraftSummary(previewText: "wip", updatedAt: Date())]
        XCTAssertTrue(ConversationListViewModel.conversationsAreInOrder(withDraft, noDraft, draftSummaries: drafts))
        XCTAssertFalse(ConversationListViewModel.conversationsAreInOrder(noDraft, withDraft, draftSummaries: drafts))
    }

    func test_conversationsAreInOrder_draftsOrderedByUpdatedAtDescending() {
        let older = makeConversation(id: "o", isPinned: false)
        let newer = makeConversation(id: "n", isPinned: false)
        let drafts = [
            "o": DraftSummary(previewText: "a", updatedAt: Date(timeIntervalSince1970: 100)),
            "n": DraftSummary(previewText: "b", updatedAt: Date(timeIntervalSince1970: 200))
        ]
        XCTAssertTrue(ConversationListViewModel.conversationsAreInOrder(newer, older, draftSummaries: drafts))
    }

    func test_conversationsAreInOrder_pinnedBeatsDraft() {
        let pinnedNoDraft = makeConversation(id: "p", isPinned: true, lastMessageAt: Date(timeIntervalSince1970: 1))
        let unpinnedWithDraft = makeConversation(id: "d", isPinned: false, lastMessageAt: Date(timeIntervalSince1970: 999))
        let drafts = ["d": DraftSummary(previewText: "wip", updatedAt: Date())]
        XCTAssertTrue(ConversationListViewModel.conversationsAreInOrder(pinnedNoDraft, unpinnedWithDraft, draftSummaries: drafts))
    }

    func test_conversationsAreInOrder_twoPinned_orderedByLastMessageAt() {
        let pinnedOld = makeConversation(id: "po", isPinned: true, lastMessageAt: Date(timeIntervalSince1970: 1))
        let pinnedRecent = makeConversation(id: "pr", isPinned: true, lastMessageAt: Date(timeIntervalSince1970: 999))
        XCTAssertTrue(ConversationListViewModel.conversationsAreInOrder(pinnedRecent, pinnedOld, draftSummaries: [:]))
    }

    // MARK: - Draft summaries integration

    func test_reloadDraftSummaries_populatesFromDraftStore() {
        let store = DraftStore(userDefaults: UserDefaults(suiteName: "VMDraft-\(UUID().uuidString)")!)
        store.clearAll()
        store.save(MessageDraft(text: "hello"), for: "conv1")
        let (sut, _, _, _, _, _, _) = makeSUT(draftStore: store)
        sut.reloadDraftSummaries()
        XCTAssertEqual(sut.draftSummaries["conv1"]?.previewText, "hello")
    }

    func test_setConversations_draftConversationSortsAboveNonPinned() {
        let store = DraftStore(userDefaults: UserDefaults(suiteName: "VMDraft-\(UUID().uuidString)")!)
        store.clearAll()
        store.save(MessageDraft(text: "wip"), for: "old")
        let (sut, _, _, _, _, _, _) = makeSUT(draftStore: store)
        sut.reloadDraftSummaries()
        let old = makeConversation(id: "old", lastMessageAt: Date(timeIntervalSince1970: 1))
        let recent = makeConversation(id: "recent", lastMessageAt: Date(timeIntervalSince1970: 9999))
        sut.setConversations([old, recent])
        XCTAssertEqual(sut.conversations.first?.id, "old")
    }

    // MARK: - ThemedConversationRow draft badge

    @MainActor
    func test_themedRow_equatable_differsByDraftSummary() {
        let conv = makeConversation(id: "c1")
        let plain = ThemedConversationRow(conversation: conv)
        let withDraft = ThemedConversationRow(
            conversation: conv,
            draftSummary: DraftSummary(previewText: "hi", updatedAt: Date(timeIntervalSince1970: 1))
        )
        XCTAssertNotEqual(plain, withDraft)
    }

    @MainActor
    func test_themedRow_equatable_sameDraftSummary_equal() {
        let conv = makeConversation(id: "c1")
        let draft = DraftSummary(previewText: "hi", updatedAt: Date(timeIntervalSince1970: 1))
        let a = ThemedConversationRow(conversation: conv, draftSummary: draft)
        let b = ThemedConversationRow(conversation: conv, draftSummary: draft)
        XCTAssertEqual(a, b)
    }

    @MainActor
    func test_themedRow_notEqual_whenPendingSyncDiffers() {
        let synced = makeConversation(id: "c1")
        var pending = makeConversation(id: "c1")
        pending.userState.pendingMutationCount = 1  // hasPendingSync = true
        let rowSynced = ThemedConversationRow(conversation: synced)
        let rowPending = ThemedConversationRow(conversation: pending)
        XCTAssertNotEqual(rowSynced, rowPending,
                          "row must re-render (Equatable differs) when a mutation is draining via the outbox")
    }

    // MARK: - ConversationStore observation (Strategy B foundation, 1b-i)

    func test_storeApply_reflectsUserStateIntoConversations() async throws {
        let store = Self.makeTestStore()
        let (sut, _, _, _, _, _, _) = makeSUT(store: store)
        sut.setConversations([makeConversation(id: "000000000000000000000001", isPinned: false)])
        // Deterministic: wait for the fire-and-forget hydration before driving
        // a mutation (apply throws on an unhydrated conversation).
        await sut.storeHydrationTask?.value

        let exp = expectation(description: "pin reflects into list")
        exp.assertForOverFulfill = false  // store emits twice (optimistic commit + ACK version swap)
        var token: AnyCancellable?
        token = sut.$conversations.sink { convs in
            if convs.first(where: { $0.id == "000000000000000000000001" })?.userState.isPinned == true {
                exp.fulfill()
            }
        }
        try await store.apply(.setPinned(true), for: "000000000000000000000001")
        await fulfillment(of: [exp], timeout: 2.0)
        token?.cancel()

        XCTAssertTrue(sut.conversations.first?.userState.isPinned ?? false,
                      "A mutation applied to the store must reflect into the list via listPublisher")
    }

    // MARK: - UserCategoryStore observation (increment 4)

    func test_loadCategories_seedsCategoryStore_andReflectsIntoUserCategories() async {
        let writer = ConvListTestCategoryWriter()
        let cats = [makeCat(id: "c1", name: "Work", order: 0), makeCat(id: "c2", name: "Family", order: 1)]
        writer.listed = cats
        let catStore = UserCategoryStore(service: writer)
        let prefs = MockPreferenceService()
        prefs.getCategoriesResult = .success(cats)
        let (sut, _, _, _, _, _, _) = makeSUT(preferenceService: prefs, categoryStore: catStore)

        await sut.loadCategories()
        await drainMainQueue()

        XCTAssertEqual(sut.userCategories.map { $0.id }, ["c1", "c2"],
                       "userCategories must mirror the category store, sorted by order")
        let stored = await catStore.categories()
        XCTAssertEqual(stored.count, 2, "loadCategories seeds the store as SoT")
    }

    func test_persistCategoryExpansion_routesThroughCategoryStore() async {
        let writer = ConvListTestCategoryWriter()
        let cat = makeCat(id: "c1", name: "Work", order: 0, isExpanded: true)
        writer.listed = [cat]
        let catStore = UserCategoryStore(service: writer)
        await catStore.hydrateFromSnapshot([cat])  // setExpanded requires the category to be hydrated
        let (sut, _, _, _, _, _, _) = makeSUT(categoryStore: catStore)

        sut.persistCategoryExpansion(id: "c1", isExpanded: false)
        await waitUntil { writer.updateCalls.contains { $0.id == "c1" && $0.isExpanded == false } }

        XCTAssertTrue(writer.updateCalls.contains { $0.id == "c1" && $0.isExpanded == false },
                      "expand/collapse must persist via the category store, not a direct PATCH")
        await drainMainQueue()
        XCTAssertEqual(sut.userCategories.first(where: { $0.id == "c1" })?.isExpanded, false,
                       "the store publisher reflects the new isExpanded into userCategories")
    }

    func test_categoryStoreApplyRemote_reflectsIntoUserCategories() async {
        let catStore = UserCategoryStore(service: ConvListTestCategoryWriter())
        let (sut, _, _, _, _, _, _) = makeSUT(categoryStore: catStore)

        await catStore.applyRemote(.created(makeCat(id: "c9", name: "Cross-device", order: 0)))
        await drainMainQueue()

        XCTAssertTrue(sut.userCategories.contains { $0.id == "c9" && $0.name == "Cross-device" },
                      "a cross-device category event (via the socket bridge) must reflect into the list")
    }

    // MARK: - Typing indicator (own-typing filter)

    func test_typingStarted_otherUser_showsOnRow() async {
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: "me", username: "me", displayName: "Me"))
        let socket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: socket, authManager: auth)

        socket.typingStarted.send(TypingEvent(userId: "other", username: "bob", displayName: "Bob", conversationId: "c1"))
        await drainMainQueue()

        XCTAssertEqual(sut.typingUsernames["c1"], "Bob",
                       "another user's typing must surface on the conversation row")
    }

    func test_typingStarted_ownEcho_isIgnored() async {
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: "me", username: "me", displayName: "Me"))
        let socket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: socket, authManager: auth)

        // The gateway echoes typing to the author too — on multi-device this would
        // otherwise surface "<You> écrit…" on your own row.
        socket.typingStarted.send(TypingEvent(userId: "me", username: "me", displayName: "Me", conversationId: "c1"))
        await drainMainQueue()

        XCTAssertNil(sut.typingUsernames["c1"],
                     "your own typing (multi-device echo) must not show on your conversation row")
    }

    /// The group multi-typer bug: A and B both type, A stops. The row must keep
    /// showing that someone is typing (B), not blank out — the old single-name
    /// model cleared the whole conversation entry on any `typing:stop`.
    func test_typingStopped_oneOfTwoGroupTypers_keepsTheOther() async {
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: "me", username: "me", displayName: "Me"))
        let socket = MockMessageSocket()
        let (sut, _, _, _, _, _, _) = makeSUT(messageSocket: socket, authManager: auth)

        socket.typingStarted.send(TypingEvent(userId: "ua", username: "alice", displayName: "Alice", conversationId: "g1"))
        socket.typingStarted.send(TypingEvent(userId: "ub", username: "bob", displayName: "Bob", conversationId: "g1"))
        await drainMainQueue()
        XCTAssertNotNil(sut.typingUsernames["g1"], "two members typing must surface on the row")

        socket.typingStopped.send(TypingEvent(userId: "ua", username: "alice", displayName: "Alice", conversationId: "g1"))
        await drainMainQueue()
        XCTAssertEqual(sut.typingUsernames["g1"], "Bob",
                       "one member stopping must NOT clear the row while another is still typing")

        socket.typingStopped.send(TypingEvent(userId: "ub", username: "bob", displayName: "Bob", conversationId: "g1"))
        await drainMainQueue()
        XCTAssertNil(sut.typingUsernames["g1"], "the row clears once the last typer stops")
    }

    func test_typingDisplayName_pickIsDeterministicAndNilWhenEmpty() {
        XCTAssertNil(ConversationListViewModel.typingDisplayName(for: nil))
        XCTAssertNil(ConversationListViewModel.typingDisplayName(for: [:]))
        XCTAssertEqual(ConversationListViewModel.typingDisplayName(for: ["u1": "Alice"]), "Alice")
        XCTAssertEqual(ConversationListViewModel.typingDisplayName(for: ["u1": "Bob", "u2": "Alice"]), "Alice",
                       "several typers → deterministic (sorted) single-name pick for the single-name row API")
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
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let container = try decoder.singleValueContainer()
        let str = try container.decode(String.self)
        if let date = parser.date(from: str) { return date }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date")
    }
    return try! decoder.decode(ConversationUpdatedEvent.self, from: data)
}

// MARK: - ConversationStore seam mocks (app-side, mirror the SDK test doubles)

final class ConvListTestPreferenceWriter: ConversationPreferenceWriting, @unchecked Sendable {
    var stubbedResponse = APIConversationPreferences(version: 1)
    var errorToThrow: Error?
    func updateConversationPreferences(
        conversationId: String,
        request: UpdateConversationPreferencesRequest
    ) async throws -> APIConversationPreferences {
        if let e = errorToThrow { throw e }
        return stubbedResponse
    }
    func reorderConversations(_ updates: [(convId: String, orderInCategory: Int)]) async throws {
        if let e = errorToThrow { throw e }
    }
}

final class ConvListTestLifecycleWriter: ConversationLifecycleWriting, @unchecked Sendable {
    var errorToThrow: Error?
    func markRead(conversationId: String) async throws { if let e = errorToThrow { throw e } }
    func markUnread(conversationId: String) async throws { if let e = errorToThrow { throw e } }
    func deleteForMe(conversationId: String) async throws { if let e = errorToThrow { throw e } }
    func leave(conversationId: String) async throws { if let e = errorToThrow { throw e } }
}

final class ConvListTestCategoryWriter: UserCategoryWriting, @unchecked Sendable {
    var listed: [ConversationCategory] = []
    var errorToThrow: Error?
    private(set) var updateCalls: [(id: String, isExpanded: Bool?)] = []
    private(set) var reorderCalls: [[(id: String, order: Int)]] = []

    func listCategories() async throws -> [ConversationCategory] {
        if let e = errorToThrow { throw e }
        return listed
    }
    func createCategory(name: String, color: String?, icon: String?) async throws -> ConversationCategory {
        if let e = errorToThrow { throw e }
        return ConversationCategory(id: "new-\(name)", name: name, color: color, icon: icon, order: 0, isExpanded: true)
    }
    func updateCategory(id: String, name: String?, color: String?, icon: String?, isExpanded: Bool?) async throws -> ConversationCategory {
        updateCalls.append((id, isExpanded))
        if let e = errorToThrow { throw e }
        return ConversationCategory(id: id, name: name ?? "Cat", color: color, icon: icon, order: 0, isExpanded: isExpanded ?? true)
    }
    func deleteCategory(id: String) async throws { if let e = errorToThrow { throw e } }
    func reorderCategories(_ updates: [(id: String, order: Int)]) async throws {
        reorderCalls.append(updates)
        if let e = errorToThrow { throw e }
    }
}

// MARK: - RelativeTimeFormatter.shortString (conversation list / feed timestamps)

@MainActor
final class RelativeTimeFormatterShortTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_750_000_000)

    private func label(secondsAgo: Int) -> String {
        RelativeTimeFormatter.shortString(for: now.addingTimeInterval(TimeInterval(-secondsAgo)), now: now)
    }

    func test_label_underThirtySeconds_containsNoDigits() {
        XCTAssertNil(label(secondsAgo: 0).rangeOfCharacter(from: .decimalDigits))
        XCTAssertNil(label(secondsAgo: 29).rangeOfCharacter(from: .decimalDigits))
    }

    func test_label_seconds_betweenThirtyAndSixty() {
        XCTAssertTrue(label(secondsAgo: 45).contains("45"))
    }

    func test_label_minutes_flooredFromSeconds() {
        XCTAssertTrue(label(secondsAgo: 60).contains("1"))
        XCTAssertTrue(label(secondsAgo: 330).contains("5"))
        XCTAssertTrue(label(secondsAgo: 3_599).contains("59"))
    }

    func test_label_hours_flooredFromSeconds() {
        XCTAssertTrue(label(secondsAgo: 3_600).contains("1"))
        XCTAssertTrue(label(secondsAgo: 7_250).contains("2"))
        XCTAssertTrue(label(secondsAgo: 86_399).contains("23"))
    }

    func test_label_days_flooredFromSeconds() {
        XCTAssertTrue(label(secondsAgo: 86_400).contains("1"))
        XCTAssertTrue(label(secondsAgo: 86_400 * 3 + 60).contains("3"))
        XCTAssertTrue(label(secondsAgo: 604_799).contains("6"))
    }

    func test_label_weeks_flooredFromSeconds() {
        // The ladder caps weeks at the 30-day boundary (`RelativeTime.classify`:
        // `days < 30 → weeks`, then months), so the week bucket spans 1–4 weeks.
        // 7 days → 1 week ; 26 days → floors to 3 weeks (26/7). Beyond 29 days the
        // label rolls into months and is covered by the months test below.
        XCTAssertTrue(label(secondsAgo: 604_800).contains("1"))
        XCTAssertTrue(label(secondsAgo: 86_400 * 26).contains("3"))
    }

    func test_label_futureDate_treatedAsNow() {
        XCTAssertNil(label(secondsAgo: -30).rangeOfCharacter(from: .decimalDigits))
    }
}
