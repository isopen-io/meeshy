import XCTest
@testable import Meeshy

/// Source-guard: pull-to-refresh on the Feed screen must also reload stories,
/// mirroring `ConversationListView`'s pattern. Without this, a dropped or
/// delayed real-time `story:created`/`story:deleted` socket event leaves the
/// Feed's story tray stale even after the user explicitly pulls to refresh
/// (bug report 2026-07-14).
@MainActor
final class FeedViewStoryPullToRefreshGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_feedPullToRefresh_alsoReloadsStories() throws {
        let feedSource = try source("Meeshy/Features/Main/Views/FeedView.swift")

        guard let onRefreshRange = feedSource.range(of: "onRefresh: {") else {
            XCTFail("FeedView doit exposer le closure onRefresh de MeeshyRefreshableScroll.")
            return
        }
        let end = feedSource.index(onRefreshRange.lowerBound, offsetBy: 300, limitedBy: feedSource.endIndex) ?? feedSource.endIndex
        let block = String(feedSource[onRefreshRange.lowerBound ..< end])
        XCTAssertTrue(
            block.contains("storyViewModel.loadStories(forceNetwork: true)"),
            "Le pull-to-refresh du Feed doit aussi recharger les stories " +
            "(storyViewModel.loadStories(forceNetwork: true)) — sinon la tray " +
            "reste périmée après un refresh manuel qui a raté un push socket " +
            "temps réel (parité avec ConversationListView.swift)."
        )
    }
}
