import XCTest
import MeeshySDK
@testable import Meeshy

/// `ConversationListView.emptyBranch` / `.shouldAutoLoadPreview` (audit
/// 2026-07-20): both are `nonisolated static func`s, individually opted out
/// of `ConversationListView`'s (and `ConversationRowMetrics`'s) inferred
/// `@MainActor` isolation, so they're callable from anywhere — but the test
/// CLASS itself is still marked `@MainActor` (matching every other test in
/// this suite, e.g. `PresenceManagerTests`) since
/// `ConversationRowMetrics.autoPreviewLoadRowLimit` is a plain `static let`
/// on a type that carries the module's default MainActor inference.
@MainActor
final class ConversationListViewEmptyBranchTests: XCTestCase {

    func test_emptyBranch_coldStartIdle_returnsSkeleton_notCreateFirstConversation() {
        // The bug: `.idle` (before `loadConversations()`'s first `await` even
        // flips `loadState`) used to fall through to the "créez-en une" CTA
        // for one frame instead of the skeleton.
        let branch = ConversationListView.emptyBranch(loadState: .idle, loadFailed: false, searchTextIsEmpty: true)
        XCTAssertEqual(branch, .skeleton)
    }

    func test_emptyBranch_loading_returnsSkeleton() {
        let branch = ConversationListView.emptyBranch(loadState: .loading, loadFailed: false, searchTextIsEmpty: true)
        XCTAssertEqual(branch, .skeleton)
    }

    func test_emptyBranch_activeSearchWithNoResults_returnsSearchNoResults_evenWhileLoading() {
        // An ACTIVE search with zero matches must NEVER show the "you have no
        // conversations, create one" CTA — that's specifically what the audit
        // flagged as misleading. Takes priority over every other state.
        let branch = ConversationListView.emptyBranch(loadState: .loading, loadFailed: false, searchTextIsEmpty: false)
        XCTAssertEqual(branch, .searchNoResults)
    }

    func test_emptyBranch_activeSearchWithNoResults_returnsSearchNoResults_evenOnSyncFailure() {
        let branch = ConversationListView.emptyBranch(loadState: .error("boom"), loadFailed: true, searchTextIsEmpty: false)
        XCTAssertEqual(branch, .searchNoResults)
    }

    func test_emptyBranch_loadedAndSyncFailed_returnsSyncError() {
        let branch = ConversationListView.emptyBranch(loadState: .loaded, loadFailed: true, searchTextIsEmpty: true)
        XCTAssertEqual(branch, .syncError)
    }

    func test_emptyBranch_loadedNoFailure_returnsCreateFirstConversation() {
        let branch = ConversationListView.emptyBranch(loadState: .loaded, loadFailed: false, searchTextIsEmpty: true)
        XCTAssertEqual(branch, .createFirstConversation)
    }

    func test_emptyBranch_offlineNoFailure_returnsCreateFirstConversation() {
        // `.offline` with a genuinely empty (not just stale) cache: no sync
        // failure signal was raised for THIS load, so it's a real empty state.
        let branch = ConversationListView.emptyBranch(loadState: .offline, loadFailed: false, searchTextIsEmpty: true)
        XCTAssertEqual(branch, .createFirstConversation)
    }

    // MARK: - shouldAutoLoadPreview(conversationId:orderedConversationIds:limit:)

    func test_shouldAutoLoadPreview_withinLimit_returnsTrue() {
        let ids = ["a", "b", "c"]
        XCTAssertTrue(ConversationListView.shouldAutoLoadPreview(conversationId: "a", orderedConversationIds: ids, limit: 2))
        XCTAssertTrue(ConversationListView.shouldAutoLoadPreview(conversationId: "b", orderedConversationIds: ids, limit: 2))
    }

    func test_shouldAutoLoadPreview_pastLimit_returnsFalse() {
        let ids = ["a", "b", "c"]
        XCTAssertFalse(ConversationListView.shouldAutoLoadPreview(conversationId: "c", orderedConversationIds: ids, limit: 2))
    }

    func test_shouldAutoLoadPreview_unknownConversationId_returnsFalse() {
        XCTAssertFalse(ConversationListView.shouldAutoLoadPreview(conversationId: "missing", orderedConversationIds: ["a", "b"], limit: 20))
    }

    func test_shouldAutoLoadPreview_zeroLimit_returnsFalse() {
        XCTAssertFalse(ConversationListView.shouldAutoLoadPreview(conversationId: "a", orderedConversationIds: ["a"], limit: 0))
    }

    func test_conversationRowMetrics_autoPreviewLoadRowLimit_matchesViewModelTopPrefetchCount() {
        // Keeps the row-level gate aligned with
        // `ConversationListViewModel.prefetchTopConversationMessages`'s own
        // top-20 batch prefetch — rows within this prefix should almost
        // always find their preview already cache-warm.
        XCTAssertEqual(ConversationRowMetrics.autoPreviewLoadRowLimit, 20)
    }
}
