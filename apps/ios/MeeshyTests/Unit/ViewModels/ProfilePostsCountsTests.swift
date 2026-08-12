import XCTest
import MeeshySDK
@testable import Meeshy

/// `ProfilePostsCounts` — calcul pur des compteurs du bandeau de stats en tête
/// de l'onglet Postes d'un profil (phase 1, dérivée des postes chargés).
@MainActor
final class ProfilePostsCountsTests: XCTestCase {

    private func post(_ id: String, _ type: String) -> FeedPost {
        FeedPost(id: id, author: "alice", authorId: "a1", type: type, content: "c")
    }

    func test_compute_countsEachTypeSeparately() {
        let posts = [
            post("1", "POST"),
            post("2", "REEL"),
            post("3", "STORY"),
            post("4", "POST"),
            post("5", "REEL")
        ]

        let counts = ProfilePostsCounts.compute(from: posts, hasMore: false)

        XCTAssertEqual(counts.posts, 2)
        XCTAssertEqual(counts.reels, 2)
        XCTAssertEqual(counts.stories, 1)
    }

    func test_compute_emptyPosts_allZero() {
        let counts = ProfilePostsCounts.compute(from: [], hasMore: false)
        XCTAssertEqual(counts, ProfilePostsCounts(posts: 0, reels: 0, stories: 0, isApproximate: false))
    }

    func test_compute_hasMore_marksApproximate() {
        XCTAssertTrue(ProfilePostsCounts.compute(from: [post("1", "POST")], hasMore: true).isApproximate)
        XCTAssertFalse(ProfilePostsCounts.compute(from: [post("1", "POST")], hasMore: false).isApproximate)
    }

    func test_displayValue_appendsPlusOnlyWhenApproximateAndPositive() {
        XCTAssertEqual(ProfilePostsCounts.displayValue(5, isApproximate: true), "5+")
        XCTAssertEqual(ProfilePostsCounts.displayValue(5, isApproximate: false), "5")
        XCTAssertEqual(ProfilePostsCounts.displayValue(0, isApproximate: true), "0")
        XCTAssertEqual(ProfilePostsCounts.displayValue(0, isApproximate: false), "0")
    }

    // MARK: - Phase 2 : totaux backend (merging)

    func test_merging_backendTotals_replaceDerivedAndDropApproximate() {
        // Le compteur de stories DÉRIVÉ vaut structurellement 0 : le listing
        // (GET /posts/user/:id) exclut le type STORY. Seuls les totaux backend
        // rendent la tuile Stories signifiante.
        let derived = ProfilePostsCounts(posts: 5, reels: 2, stories: 0, isApproximate: true)
        let stats = UserStats(postsCount: 21, reelsCount: 8, storiesCount: 13)

        let merged = ProfilePostsCounts.merging(derived: derived, stats: stats)

        XCTAssertEqual(merged, ProfilePostsCounts(posts: 21, reels: 8, stories: 13, isApproximate: false))
    }

    func test_merging_withoutBackendCounts_keepsDerived() {
        let derived = ProfilePostsCounts(posts: 5, reels: 2, stories: 0, isApproximate: true)

        XCTAssertEqual(ProfilePostsCounts.merging(derived: derived, stats: nil), derived,
                       "sans stats, les valeurs dérivées restent affichées")
        XCTAssertEqual(ProfilePostsCounts.merging(derived: derived, stats: UserStats()), derived,
                       "un vieux gateway sans compteurs de contenu ne doit pas écraser le dérivé")
    }

    // MARK: - Filtre des tuiles

    func test_filterToggled_selectingActiveTileReturnsToAll() {
        XCTAssertEqual(ProfilePostsFilter.all.toggled(with: .posts), .posts)
        XCTAssertEqual(ProfilePostsFilter.posts.toggled(with: .posts), .all,
                       "re-taper la tuile active désactive le filtre")
        XCTAssertEqual(ProfilePostsFilter.posts.toggled(with: .reels), .reels,
                       "taper l'autre tuile bascule directement de filtre")
    }

    func test_viewModel_filter_restrictsVisiblePostsByType() async {
        await CacheCoordinator.shared.feed.invalidate(for: "user:u-filter")
        await CacheCoordinator.shared.feed.saveCursor(nextCursor: nil, hasMore: true, for: "user:u-filter")
        let mock = MockPostService()
        mock.getUserPostsResultsQueue = [.success(JSONStub.decode("""
        {"success":true,"data":[
          {"id":"p1","type":"POST","content":"a","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"a1","username":"alice"}},
          {"id":"r1","type":"REEL","content":"b","createdAt":"2026-01-15T11:00:00.000Z","author":{"id":"a1","username":"alice"}},
          {"id":"p2","type":"POST","content":"c","createdAt":"2026-01-15T10:00:00.000Z","author":{"id":"a1","username":"alice"}}
        ],"pagination":{"hasMore":false,"limit":20}}
        """) as PaginatedAPIResponse<[APIPost]>)]
        let vm = ProfileUserPostsViewModel(
            userId: "u-filter",
            postService: mock,
            userService: MockUserService(),
            languageProvider: MockLanguageProvider(preferredLanguages: [])
        )
        await vm.loadInitial()
        XCTAssertEqual(vm.filteredPosts.count, 3)

        vm.filter = .reels
        XCTAssertEqual(vm.filteredPosts.map(\.id), ["r1"], "tuile Réels → réels uniquement")

        vm.filter = .posts
        XCTAssertEqual(vm.filteredPosts.map(\.id), ["p1", "p2"], "tuile Postes → postes uniquement")

        vm.filter = .all
        XCTAssertEqual(vm.filteredPosts.count, 3)
    }
}
