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
        let conv: MockConversationService
    }

    private func makeSUT() -> SUT {
        let p = MockPreferenceService()
        let c = MockConversationService()
        let vm = ConversationOptionsViewModel(
            conversationId: "conv-1",
            preferenceService: p,
            conversationService: c
        )
        return SUT(vm: vm, prefs: p, conv: c)
    }

    private func makeCategory(id: String, name: String, order: Int = 0) -> ConversationCategory {
        ConversationCategory(id: id, name: name, color: "#6366F1", icon: nil, order: order, isExpanded: true)
    }

    // MARK: - Load

    func test_load_populatesPrefsCategoriesAndTags() async {
        let s = makeSUT()
        s.prefs.getConversationPreferencesResult = .success(APIConversationPreferences(
            isPinned: true, isMuted: false, isArchived: false, deletedForUserAt: nil,
            tags: ["urgent"], categoryId: "cat1", reaction: "🔥",
            customName: "Mum", mentionsOnly: false))
        s.prefs.getCategoriesResult = .success([
            makeCategory(id: "cat1", name: "Family")
        ])
        s.prefs.getMyConversationTagsResult = .success(["urgent", "work"])

        await s.vm.load()

        XCTAssertEqual(s.vm.prefs.isPinned, true)
        XCTAssertEqual(s.vm.prefs.tags, ["urgent"])
        XCTAssertEqual(s.vm.prefs.customName, "Mum")
        XCTAssertEqual(s.vm.categories.count, 1)
        XCTAssertEqual(s.vm.categories.first?.name, "Family")
        XCTAssertEqual(s.vm.allTags, ["urgent", "work"])
        XCTAssertEqual(s.vm.loadState, .loaded)
    }

    func test_load_failure_setsErrorState() async {
        let s = makeSUT()
        s.prefs.getConversationPreferencesResult = .failure(NSError(domain: "x", code: 1))

        await s.vm.load()

        XCTAssertNotNil(s.vm.errorMessage)
        if case .error = s.vm.loadState {
            // expected
        } else {
            XCTFail("expected loadState .error, got \(s.vm.loadState)")
        }
    }

    // MARK: - Optimistic + persist

    func test_setPinned_optimistic_persists() async {
        let s = makeSUT()
        await s.vm.setPinned(true)
        XCTAssertEqual(s.vm.prefs.isPinned, true)
        XCTAssertEqual(s.prefs.updateConversationPreferencesCallCount, 1)
        XCTAssertEqual(s.prefs.lastUpdateConversationPreferencesRequest?.isPinned, true)
    }

    func test_setPinned_rollsBackOnFailure() async {
        let s = makeSUT()
        s.prefs.updateConversationPreferencesResult = .failure(NSError(domain: "x", code: 0))
        await s.vm.setPinned(true)
        XCTAssertEqual(s.vm.prefs.isPinned, false, "isPinned should roll back to false")
        XCTAssertNotNil(s.vm.errorMessage)
    }

    func test_setMuted_persists() async {
        let s = makeSUT()
        await s.vm.setMuted(true)
        XCTAssertEqual(s.vm.prefs.isMuted, true)
        XCTAssertEqual(s.prefs.lastUpdateConversationPreferencesRequest?.isMuted, true)
    }

    func test_setMentionsOnly_persists() async {
        let s = makeSUT()
        await s.vm.setMentionsOnly(true)
        XCTAssertEqual(s.vm.prefs.mentionsOnly, true)
    }

    func test_setReaction_persists() async {
        let s = makeSUT()
        await s.vm.setReaction("🔥")
        XCTAssertEqual(s.vm.prefs.reaction, "🔥")
        XCTAssertEqual(s.prefs.lastUpdateConversationPreferencesRequest?.reaction, "🔥")
    }

    func test_setCategory_persists() async {
        let s = makeSUT()
        await s.vm.setCategory("cat1")
        XCTAssertEqual(s.vm.prefs.categoryId, "cat1")
        XCTAssertEqual(s.prefs.lastUpdateConversationPreferencesRequest?.categoryId, "cat1")
    }

    // MARK: - Tags

    func test_addTag_appendsAndPersists() async {
        let s = makeSUT()
        await s.vm.addTag("urgent")
        XCTAssertEqual(s.vm.prefs.tags, ["urgent"])
        XCTAssertTrue(s.vm.allTags.contains("urgent"))
        XCTAssertEqual(s.prefs.lastUpdateConversationPreferencesRequest?.tags, ["urgent"])
    }

    func test_addTag_dedupes() async {
        let s = makeSUT()
        s.vm.prefs.tags = ["urgent"]
        await s.vm.addTag("urgent")
        XCTAssertEqual(s.vm.prefs.tags, ["urgent"])
        XCTAssertEqual(s.prefs.updateConversationPreferencesCallCount, 0)
    }

    func test_addTag_trimsWhitespace() async {
        let s = makeSUT()
        await s.vm.addTag("  important  ")
        XCTAssertEqual(s.vm.prefs.tags, ["important"])
    }

    func test_removeTag_persists() async {
        let s = makeSUT()
        s.vm.prefs.tags = ["urgent", "work"]
        await s.vm.removeTag("urgent")
        XCTAssertEqual(s.vm.prefs.tags, ["work"])
    }

    func test_setTags_dedupesAndTrimsAndPersistsInOneCall() async {
        let s = makeSUT()
        await s.vm.setTags(["urgent", " family ", "Urgent", "family", ""])
        XCTAssertEqual(s.vm.prefs.tags, ["urgent", "family", "Urgent"])
        // setTags fires a single PUT regardless of how many entries
        XCTAssertEqual(s.prefs.updateConversationPreferencesCallCount, 1)
        XCTAssertEqual(s.prefs.lastUpdateConversationPreferencesRequest?.tags,
                       ["urgent", "family", "Urgent"])
    }

    func test_setTags_rollsBackOnFailure() async {
        let s = makeSUT()
        s.vm.prefs.tags = ["work"]
        s.prefs.updateConversationPreferencesResult = .failure(NSError(domain: "x", code: 0))
        await s.vm.setTags(["work", "urgent"])
        XCTAssertEqual(s.vm.prefs.tags, ["work"])
        XCTAssertNotNil(s.vm.errorMessage)
    }

    // MARK: - Category creation

    func test_createCategoryAndSelect_addsAndAssigns() async {
        let s = makeSUT()
        let created = ConversationCategory(id: "new1", name: "Family", color: nil, icon: nil, order: 0, isExpanded: true)
        s.prefs.createCategoryResult = .success(created)

        let result = await s.vm.createCategoryAndSelect(name: "Family")

        XCTAssertEqual(result?.id, "new1")
        XCTAssertTrue(s.vm.categories.contains(where: { $0.id == "new1" }))
        XCTAssertEqual(s.vm.prefs.categoryId, "new1")
        XCTAssertEqual(s.prefs.createCategoryCallCount, 1)
        XCTAssertEqual(s.prefs.lastCreateCategoryName, "Family")
        XCTAssertEqual(s.prefs.lastUpdateConversationPreferencesRequest?.categoryId, "new1")
    }

    func test_createCategoryAndSelect_emptyName_returnsNil() async {
        let s = makeSUT()
        let result = await s.vm.createCategoryAndSelect(name: "   ")
        XCTAssertNil(result)
        XCTAssertEqual(s.prefs.createCategoryCallCount, 0)
    }

    func test_createCategoryAndSelect_failure_setsError() async {
        let s = makeSUT()
        s.prefs.createCategoryResult = .failure(NSError(domain: "x", code: 0))
        let result = await s.vm.createCategoryAndSelect(name: "Family")
        XCTAssertNil(result)
        XCTAssertNotNil(s.vm.errorMessage)
    }

    // MARK: - Archive

    func test_toggleArchive_flipsAndPersists() async {
        let s = makeSUT()
        XCTAssertEqual(s.vm.prefs.isArchived, false)
        await s.vm.toggleArchive()
        XCTAssertEqual(s.vm.prefs.isArchived, true)
        await s.vm.toggleArchive()
        XCTAssertEqual(s.vm.prefs.isArchived, false)
    }

    // MARK: - Deletion / Leave

    func test_deleteForMe_setsDidDelete() async {
        let s = makeSUT()
        await s.vm.deleteForMe()
        XCTAssertTrue(s.vm.didDelete)
        XCTAssertEqual(s.conv.deleteForMeCallCount, 1)
    }

    func test_deleteForMe_failureSurfacesError() async {
        let s = makeSUT()
        s.conv.deleteForMeResult = .failure(NSError(domain: "x", code: 0))
        await s.vm.deleteForMe()
        XCTAssertFalse(s.vm.didDelete)
        XCTAssertNotNil(s.vm.errorMessage)
    }

    func test_leave_setsDidLeave() async {
        let s = makeSUT()
        await s.vm.leave()
        XCTAssertTrue(s.vm.didLeave)
    }
}
