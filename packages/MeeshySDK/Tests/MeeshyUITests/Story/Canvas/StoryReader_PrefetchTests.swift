import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryReader_PrefetchTests: XCTestCase {

    // MARK: - Fixtures

    private func makeItem(_ id: String) -> StoryItem {
        StoryItem(
            id: id,
            content: "slide-\(id)",
            media: [],
            storyEffects: StoryEffects(),
            createdAt: Date(),
            expiresAt: nil,
            isViewed: false
        )
    }

    private func makeItems(_ count: Int) -> [StoryItem] {
        (0..<count).map { makeItem("s\($0)") }
    }

    // MARK: - test_prefetch_currentSlide_loadsAdjacents

    /// When the prefetcher is updated to point at slide N in the middle of a
    /// group, it MUST instantiate exactly three canvas views: `[N-1, N, N+1]`.
    /// This is the load-bearing guarantee that the first frame of the next
    /// slide is already rendered when the user swipes.
    func test_prefetch_currentSlide_loadsAdjacents() {
        let items = makeItems(5)
        let prefetcher = StoryReaderPrefetcher()
        prefetcher.updateWindow(items: items,
                                currentIndex: 2,
                                context: .empty,
                                preferredLanguages: ["fr"])
        XCTAssertNotNil(prefetcher.view(for: "s1"), "N-1 must be prefetched")
        XCTAssertNotNil(prefetcher.view(for: "s2"), "N must be prefetched")
        XCTAssertNotNil(prefetcher.view(for: "s3"), "N+1 must be prefetched")
        XCTAssertEqual(prefetcher.bootstrapped.count, 3)
    }

    // MARK: - test_prefetch_navigationN_to_N+1_noBootstrap

    /// Advancing the window from N→N+1 must reuse the canvas view that was
    /// already bootstrapped at N+1; the helper must return the same object
    /// reference, NOT spin up a fresh `StoryCanvasUIView` (which is the
    /// expensive cold path we are trying to eliminate).
    func test_prefetch_navigationN_to_N_plus_1_noBootstrap() {
        let items = makeItems(5)
        let prefetcher = StoryReaderPrefetcher()
        prefetcher.updateWindow(items: items,
                                currentIndex: 2,
                                context: .empty,
                                preferredLanguages: ["fr"])
        let preBootstrappedNext = prefetcher.view(for: "s3")
        XCTAssertNotNil(preBootstrappedNext)

        prefetcher.updateWindow(items: items,
                                currentIndex: 3,
                                context: .empty,
                                preferredLanguages: ["fr"])

        let afterAdvance = prefetcher.view(for: "s3")
        XCTAssertNotNil(afterAdvance)
        XCTAssertTrue(afterAdvance === preBootstrappedNext,
                      "Advancing must REUSE the pre-bootstrapped view, not re-instantiate")
    }

    // MARK: - test_prefetch_N-1_disposedAtN+1

    /// After scrolling forward by two slides, the old `N-1` view must be
    /// evicted from the cache. This keeps the sliding window strictly to
    /// three views and prevents an unbounded memory footprint over the
    /// life of a long story group.
    func test_prefetch_N_minus_1_disposedAtN_plus_1() {
        let items = makeItems(6)
        let prefetcher = StoryReaderPrefetcher()
        prefetcher.updateWindow(items: items,
                                currentIndex: 2,
                                context: .empty,
                                preferredLanguages: ["fr"])
        XCTAssertNotNil(prefetcher.view(for: "s1"))

        // Advance two slides forward — s1 falls out of the [N-1, N, N+1] window.
        prefetcher.updateWindow(items: items,
                                currentIndex: 4,
                                context: .empty,
                                preferredLanguages: ["fr"])

        XCTAssertNil(prefetcher.view(for: "s1"), "s1 must be evicted (outside window)")
        XCTAssertNil(prefetcher.view(for: "s2"), "s2 must be evicted (outside window)")
        XCTAssertNotNil(prefetcher.view(for: "s3"))
        XCTAssertNotNil(prefetcher.view(for: "s4"))
        XCTAssertNotNil(prefetcher.view(for: "s5"))
        XCTAssertEqual(prefetcher.bootstrapped.count, 3, "window stays bounded at 3 views")
    }

    // MARK: - test_prefetch_firstSlide_onlyPrefetchesNext

    /// At the start of a group the prefetcher can only look forward — there
    /// is no `N-1`. The window must contain exactly `[N, N+1]`.
    func test_prefetch_firstSlide_onlyPrefetchesNext() {
        let items = makeItems(4)
        let prefetcher = StoryReaderPrefetcher()
        prefetcher.updateWindow(items: items,
                                currentIndex: 0,
                                context: .empty,
                                preferredLanguages: ["fr"])
        XCTAssertNotNil(prefetcher.view(for: "s0"))
        XCTAssertNotNil(prefetcher.view(for: "s1"))
        XCTAssertNil(prefetcher.view(for: "s2"), "s2 (N+2) must NOT be prefetched")
        XCTAssertEqual(prefetcher.bootstrapped.count, 2)
    }

    // MARK: - test_prefetch_lastSlide_onlyPrefetchesPrev

    /// At the end of a group the prefetcher can only look backward — there
    /// is no `N+1`. The window must contain exactly `[N-1, N]`.
    func test_prefetch_lastSlide_onlyPrefetchesPrev() {
        let items = makeItems(4)
        let prefetcher = StoryReaderPrefetcher()
        prefetcher.updateWindow(items: items,
                                currentIndex: 3,
                                context: .empty,
                                preferredLanguages: ["fr"])
        XCTAssertNotNil(prefetcher.view(for: "s2"))
        XCTAssertNotNil(prefetcher.view(for: "s3"))
        XCTAssertNil(prefetcher.view(for: "s1"), "s1 (N-2) must NOT be prefetched")
        XCTAssertEqual(prefetcher.bootstrapped.count, 2)
    }

    // MARK: - Edge cases

    /// A single-slide group has no neighbors; the window must contain
    /// exactly one view (no off-by-one IndexOutOfRange crash).
    func test_prefetch_singleSlide_windowOfOne() {
        let items = makeItems(1)
        let prefetcher = StoryReaderPrefetcher()
        prefetcher.updateWindow(items: items,
                                currentIndex: 0,
                                context: .empty,
                                preferredLanguages: ["fr"])
        XCTAssertEqual(prefetcher.bootstrapped.count, 1)
        XCTAssertNotNil(prefetcher.view(for: "s0"))
    }

    /// Updating with an empty `items` array must evict everything cleanly
    /// (no crash, no stale views retained).
    func test_prefetch_emptyItems_evictsAll() {
        let items = makeItems(3)
        let prefetcher = StoryReaderPrefetcher()
        prefetcher.updateWindow(items: items,
                                currentIndex: 1,
                                context: .empty,
                                preferredLanguages: ["fr"])
        XCTAssertEqual(prefetcher.bootstrapped.count, 3)

        prefetcher.updateWindow(items: [],
                                currentIndex: 0,
                                context: .empty,
                                preferredLanguages: ["fr"])
        XCTAssertTrue(prefetcher.bootstrapped.isEmpty)
    }

    /// `detach()` must release all views and the host view from their
    /// parent. After detach the prefetcher behaves as freshly initialized.
    func test_detach_releasesAllViews() {
        let items = makeItems(3)
        let prefetcher = StoryReaderPrefetcher()
        let parent = UIView(frame: CGRect(x: 0, y: 0, width: 412, height: 732))
        prefetcher.attach(to: parent)
        prefetcher.updateWindow(items: items,
                                currentIndex: 1,
                                context: .empty,
                                preferredLanguages: ["fr"])
        XCTAssertEqual(prefetcher.bootstrapped.count, 3)
        XCTAssertTrue(prefetcher.hostView.superview === parent)

        prefetcher.detach()
        XCTAssertTrue(prefetcher.bootstrapped.isEmpty)
        XCTAssertNil(prefetcher.hostView.superview)
    }

    /// Window math sanity: the helper that picks indices must never return
    /// out-of-range values. This pins behaviour at the boundary so the
    /// public `updateWindow` API stays safe.
    func test_windowIndices_clampsAtBoundaries() {
        let prefetcher = StoryReaderPrefetcher()
        XCTAssertEqual(prefetcher.windowIndices(around: 0, count: 5), [0, 1])
        XCTAssertEqual(prefetcher.windowIndices(around: 4, count: 5), [3, 4])
        XCTAssertEqual(prefetcher.windowIndices(around: 2, count: 5), [1, 2, 3])
        XCTAssertEqual(prefetcher.windowIndices(around: 0, count: 1), [0])
        XCTAssertEqual(prefetcher.windowIndices(around: 0, count: 0), [])
    }
}
