import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationOptionsViewModelTests: XCTestCase {

    // MARK: - Factory

    private struct SUT {
        let vm: ConversationOptionsViewModel
        let prefs: MockPreferenceService
        let store: ConversationStore
    }

    private func makeSUT(
        conversation: MeeshyConversation? = nil,
        store: ConversationStore? = nil,
        prefs: MockPreferenceService? = nil
    ) -> SUT {
        let conv = conversation ?? makeConversation()
        let p = prefs ?? MockPreferenceService()
        let s = store ?? makeOptionsStore()
        let vm = ConversationOptionsViewModel(conversation: conv, store: s, preferenceService: p)
        return SUT(vm: vm, prefs: p, store: s)
    }

    /// Isolated store with mock writers (reuses the seam mocks declared in
    /// ConversationListViewModelTests — same test target).
    private func makeOptionsStore(prefError: Error? = nil, lifecycleError: Error? = nil) -> ConversationStore {
        let writer = ConvListTestPreferenceWriter()
        writer.errorToThrow = prefError
        let lifecycle = ConvListTestLifecycleWriter()
        lifecycle.errorToThrow = lifecycleError
        let outboxPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("options-vm-outbox-\(UUID().uuidString).db").path
        return ConversationStore(
            preferenceService: writer,
            conversationService: lifecycle,
            outbox: ConversationStateOutbox(dbPath: outboxPath)
        )
    }

    private func makeConversation(
        id: String = "conv-1",
        isPinned: Bool = false,
        isMuted: Bool = false,
        isArchived: Bool = false,
        mentionsOnly: Bool = false,
        tags: [String] = [],
        categoryId: String? = nil,
        reaction: String? = nil,
        customName: String? = nil,
        version: Int = 0
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: id, identifier: id, type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: ConversationUserState(
                isPinned: isPinned,
                isMuted: isMuted,
                mentionsOnly: mentionsOnly,
                isArchived: isArchived,
                customName: customName,
                reaction: reaction,
                tags: tags,
                sectionId: categoryId,
                version: version
            )
        )
    }

    private func makeCategory(id: String, name: String, order: Int = 0) -> ConversationCategory {
        ConversationCategory(id: id, name: name, color: "#6366F1", icon: nil, order: order, isExpanded: true)
    }

    // MARK: - Load

    func test_load_mirrorsStoreUserStateAndLoadsCategoriesTags() async {
        let conv = makeConversation(id: "conv-1", isPinned: true, tags: ["urgent"],
                                    categoryId: "cat1", reaction: "🔥", customName: "Mum")
        let p = MockPreferenceService()
        p.getCategoriesResult = .success([makeCategory(id: "cat1", name: "Family")])
        p.getMyConversationTagsResult = .success(["urgent", "work"])
        let s = makeSUT(conversation: conv, prefs: p)

        await s.vm.load()

        XCTAssertEqual(s.vm.prefs.isPinned, true)
        XCTAssertEqual(s.vm.prefs.tags, ["urgent"])
        XCTAssertEqual(s.vm.prefs.customName, "Mum")
        XCTAssertEqual(s.vm.prefs.categoryId, "cat1")
        XCTAssertEqual(s.vm.prefs.reaction, "🔥")
        XCTAssertEqual(s.vm.categories.count, 1)
        XCTAssertEqual(s.vm.categories.first?.name, "Family")
        XCTAssertEqual(s.vm.allTags, ["urgent", "work"])
        XCTAssertEqual(s.vm.loadState, .loaded)
    }

    /// Guards against re-introducing a local `LoadState` enum that shadows
    /// `MeeshySDK.LoadState` (loses `.cachedStale`/`.cachedFresh`/`.offline`).
    /// This only compiles if `loadState` is truly typed as the SDK enum.
    func test_loadState_isSDKLoadStateType_notLocalShadow() {
        let s = makeSUT()
        let value: MeeshySDK.LoadState = s.vm.loadState
        XCTAssertEqual(value, .idle)
    }

    func test_load_metadataFailure_setsErrorStateWhenNoCacheShown() async {
        let p = MockPreferenceService()
        p.getCategoriesResult = .failure(NSError(domain: "x", code: 1))
        let s = makeSUT(prefs: p)

        await s.vm.load()

        if case .error = s.vm.loadState {
            // expected
        } else {
            XCTFail("expected loadState .error, got \(s.vm.loadState)")
        }
        XCTAssertNotNil(s.vm.errorMessage)
    }

    // MARK: - Setters: optimistic + persists via store

    func test_setPinned_optimisticAndPersistsViaStore() async {
        let conv = makeConversation(id: "conv-1", isPinned: false)
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        await s.vm.setPinned(true).value

        XCTAssertEqual(s.vm.prefs.isPinned, true)
        let stored = await s.store.conversation(id: "conv-1")
        XCTAssertEqual(stored?.userState.isPinned, true)
    }

    func test_setPinned_rollsBackOnPermanentFailure() async {
        let conv = makeConversation(id: "conv-1", isPinned: false)
        let s = makeSUT(conversation: conv,
                        store: makeOptionsStore(prefError: MeeshyError.server(statusCode: 422, message: "bad")))
        await s.store.hydrateMetadata([conv])

        await s.vm.setPinned(true).value

        XCTAssertEqual(s.vm.prefs.isPinned, false, "4xx must roll back the optimistic pin")
        XCTAssertNotNil(s.vm.errorMessage)
    }

    func test_setMuted_persistsViaStore() async {
        let conv = makeConversation(id: "conv-1", isMuted: false)
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        await s.vm.setMuted(true).value

        XCTAssertEqual(s.vm.prefs.isMuted, true)
        let stored = await s.store.conversation(id: "conv-1")
        XCTAssertEqual(stored?.userState.isMuted, true)
    }

    func test_setMentionsOnly_persistsViaStore() async {
        let conv = makeConversation(id: "conv-1")
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        await s.vm.setMentionsOnly(true).value

        XCTAssertEqual(s.vm.prefs.mentionsOnly, true)
        let stored = await s.store.conversation(id: "conv-1")
        XCTAssertEqual(stored?.userState.mentionsOnly, true)
    }

    func test_setReaction_persistsViaStore() async {
        let conv = makeConversation(id: "conv-1")
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        await s.vm.setReaction("🔥").value

        XCTAssertEqual(s.vm.prefs.reaction, "🔥")
        let stored = await s.store.conversation(id: "conv-1")
        XCTAssertEqual(stored?.userState.reaction, "🔥")
    }

    func test_setCategory_persistsViaStore() async {
        let conv = makeConversation(id: "conv-1")
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        await s.vm.setCategory("cat1").value

        XCTAssertEqual(s.vm.prefs.categoryId, "cat1")
        let stored = await s.store.conversation(id: "conv-1")
        XCTAssertEqual(stored?.userState.sectionId, "cat1")
    }

    // MARK: - Tags

    func test_addTag_appendsAndPersists() async {
        let conv = makeConversation(id: "conv-1")
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        await s.vm.addTag("urgent").value

        XCTAssertEqual(s.vm.prefs.tags, ["urgent"])
        XCTAssertTrue(s.vm.allTags.contains("urgent"))
        let stored = await s.store.conversation(id: "conv-1")
        XCTAssertEqual(stored?.userState.tags, ["urgent"])
    }

    func test_addTag_dedupes_noStoreMutation() async {
        let conv = makeConversation(id: "conv-1", tags: ["urgent"])
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        await s.vm.addTag("urgent").value

        XCTAssertEqual(s.vm.prefs.tags, ["urgent"])
        let stored = await s.store.conversation(id: "conv-1")
        XCTAssertEqual(stored?.userState.version, 0, "Dedupe must not apply a mutation")
    }

    func test_addTag_trimsWhitespace() async {
        let conv = makeConversation(id: "conv-1")
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        await s.vm.addTag("  important  ").value

        XCTAssertEqual(s.vm.prefs.tags, ["important"])
    }

    func test_removeTag_persists() async {
        let conv = makeConversation(id: "conv-1", tags: ["urgent", "work"])
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        await s.vm.removeTag("urgent").value

        XCTAssertEqual(s.vm.prefs.tags, ["work"])
        let stored = await s.store.conversation(id: "conv-1")
        XCTAssertEqual(stored?.userState.tags, ["work"])
    }

    func test_setTags_dedupesTrimsAndPersistsOnce() async {
        let conv = makeConversation(id: "conv-1")
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        await s.vm.setTags(["urgent", " family ", "Urgent", "family", ""]).value

        XCTAssertEqual(s.vm.prefs.tags, ["urgent", "family", "Urgent"])
        let stored = await s.store.conversation(id: "conv-1")
        XCTAssertEqual(stored?.userState.tags, ["urgent", "family", "Urgent"])
        XCTAssertEqual(stored?.userState.version, 1, "A single setTags applies exactly one mutation")
    }

    func test_setTags_rollsBackOnPermanentFailure() async {
        let conv = makeConversation(id: "conv-1", tags: ["work"])
        let s = makeSUT(conversation: conv,
                        store: makeOptionsStore(prefError: MeeshyError.server(statusCode: 422, message: "bad")))
        await s.store.hydrateMetadata([conv])

        await s.vm.setTags(["work", "urgent"]).value

        XCTAssertEqual(s.vm.prefs.tags, ["work"], "4xx must roll back tags")
        XCTAssertNotNil(s.vm.errorMessage)
    }

    // MARK: - Category creation

    func test_createCategoryAndSelect_addsAndAssigns() async {
        let conv = makeConversation(id: "conv-1")
        let p = MockPreferenceService()
        let created = ConversationCategory(id: "new1", name: "Family", color: nil, icon: nil, order: 0, isExpanded: true)
        p.createCategoryResult = .success(created)
        let s = makeSUT(conversation: conv, prefs: p)
        await s.store.hydrateMetadata([conv])

        let result = await s.vm.createCategoryAndSelect(name: "Family")

        XCTAssertEqual(result?.id, "new1")
        XCTAssertTrue(s.vm.categories.contains(where: { $0.id == "new1" }))
        XCTAssertEqual(s.vm.prefs.categoryId, "new1")
        XCTAssertEqual(p.createCategoryCallCount, 1)
        let stored = await s.store.conversation(id: "conv-1")
        XCTAssertEqual(stored?.userState.sectionId, "new1")
    }

    func test_createCategoryAndSelect_emptyName_returnsNil() async {
        let s = makeSUT()
        let result = await s.vm.createCategoryAndSelect(name: "   ")
        XCTAssertNil(result)
        XCTAssertEqual(s.prefs.createCategoryCallCount, 0)
    }

    func test_createCategoryAndSelect_failure_setsError() async {
        let p = MockPreferenceService()
        p.createCategoryResult = .failure(NSError(domain: "x", code: 0))
        let s = makeSUT(prefs: p)
        let result = await s.vm.createCategoryAndSelect(name: "Family")
        XCTAssertNil(result)
        XCTAssertNotNil(s.vm.errorMessage)
    }

    // MARK: - Archive

    func test_toggleArchive_flipsAndPersists() async {
        let conv = makeConversation(id: "conv-1", isArchived: false)
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        XCTAssertEqual(s.vm.prefs.isArchived, false)
        await s.vm.toggleArchive().value
        XCTAssertEqual(s.vm.prefs.isArchived, true)
        await s.vm.toggleArchive().value
        XCTAssertEqual(s.vm.prefs.isArchived, false)
    }

    // MARK: - Deletion / Leave

    func test_deleteForMe_setsDidDelete() async {
        let conv = makeConversation(id: "conv-1")
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        await s.vm.deleteForMe()

        XCTAssertTrue(s.vm.didDelete)
        let stored = await s.store.conversation(id: "conv-1")
        XCTAssertNotNil(stored?.userState.deletedForUserAt)
    }

    func test_deleteForMe_permanentFailureSurfacesError() async {
        let conv = makeConversation(id: "conv-1")
        let s = makeSUT(conversation: conv,
                        store: makeOptionsStore(lifecycleError: MeeshyError.server(statusCode: 422, message: "bad")))
        await s.store.hydrateMetadata([conv])

        await s.vm.deleteForMe()

        XCTAssertFalse(s.vm.didDelete)
        XCTAssertNotNil(s.vm.errorMessage)
    }

    func test_leave_setsDidLeave() async {
        let conv = makeConversation(id: "conv-1")
        let s = makeSUT(conversation: conv)
        await s.store.hydrateMetadata([conv])

        await s.vm.leave()

        XCTAssertTrue(s.vm.didLeave)
    }

    // MARK: - Synchronous UI feedback (optimistic visible before the store Task)

    func test_setPinned_appliesSynchronouslyForUIFeedback() {
        let conv = makeConversation(id: "conv-1", isPinned: false)
        let s = makeSUT(conversation: conv)
        XCTAssertEqual(s.vm.prefs.isPinned, false)
        _ = s.vm.setPinned(true)
        XCTAssertEqual(s.vm.prefs.isPinned, true)
    }

    func test_setReaction_appliesSynchronouslyForUIFeedback() {
        let s = makeSUT()
        XCTAssertNil(s.vm.prefs.reaction)
        _ = s.vm.setReaction("🔥")
        XCTAssertEqual(s.vm.prefs.reaction, "🔥")
    }

    func test_setCategory_appliesSynchronouslyForUIFeedback() {
        let s = makeSUT()
        XCTAssertNil(s.vm.prefs.categoryId)
        _ = s.vm.setCategory("cat1")
        XCTAssertEqual(s.vm.prefs.categoryId, "cat1")
    }

    func test_toggleArchive_appliesSynchronouslyForUIFeedback() {
        let s = makeSUT()
        _ = s.vm.toggleArchive()
        XCTAssertEqual(s.vm.prefs.isArchived, true)
    }
}
