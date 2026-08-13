import XCTest
@testable import Meeshy
import MeeshySDK

/// Coût de rendu du listing posts/réels d'un profil.
///
/// La liste est injectée DANS le `ScrollView` de `UserProfileSheet` : son
/// `LazyVStack` est imbriqué dans un autre conteneur paresseux et perd sa
/// paresse — tout ce qu'elle place, elle le CONSTRUIT. La fenêtre de rendu est
/// le seul garde-fou contre un pic de travail synchrone ; ces tests protègent
/// sa progression mesurée.
@MainActor
final class ProfileUserPostsRenderWindowTests: XCTestCase {

    private static let userId = "profile-user-window"
    private static let cacheKey = "user:profile-user-window"

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.feed.invalidate(for: Self.cacheKey)
        await CacheCoordinator.shared.feed.saveCursor(nextCursor: nil, hasMore: true, for: Self.cacheKey)
    }

    private func makeSUT() -> (sut: ProfileUserPostsViewModel, mock: MockPostService) {
        let mock = MockPostService()
        let sut = ProfileUserPostsViewModel(
            userId: Self.userId,
            postService: mock,
            userService: MockUserService(),
            languageProvider: MockLanguageProvider(preferredLanguages: []),
            socialSocket: MockSocialSocket(),
            currentUserIdProvider: { "me-1" }
        )
        return (sut, mock)
    }

    /// 12 postes + 8 réels, alternés, une seule page (`hasMore: false`).
    private static func mixedPage() -> PaginatedAPIResponse<[APIPost]> {
        let items = (0..<20).map { index -> String in
            let isReel = index % 5 == 0
            return """
            {"id":"\(isReel ? "r" : "p")\(index)","type":"\(isReel ? "REEL" : "POST")","content":"c\(index)",
            "createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"a1","username":"alice"}}
            """
        }.joined(separator: ",")
        return JSONStub.decode("""
        {"success":true,"data":[\(items)],"pagination":{"hasMore":false,"limit":20}}
        """)
    }

    private func loaded() async -> ProfileUserPostsViewModel {
        let (sut, mock) = makeSUT()
        mock.getUserPostsResultsQueue = [.success(Self.mixedPage())]
        await sut.loadInitial()
        return sut
    }

    // MARK: - Coalescence des déclencheurs

    /// Les trois dernières cartes de la fenêtre apparaissent au MÊME frame et
    /// déclenchent chacune le prefetch. Sans coalescence, la fenêtre bondissait
    /// de 3 × `renderStep` — trois fois le travail de construction visé.
    func test_loadMoreIfNeeded_threeTriggersInOneFrame_advanceTheWindowOnce() async {
        let sut = await loaded()
        let initial = ProfileUserPostsViewModel.initialRenderWindow
        XCTAssertEqual(sut.visiblePosts.count, initial)

        for offset in 1...3 {
            sut.loadMoreIfNeeded(currentPost: sut.visiblePosts[sut.visiblePosts.count - offset])
        }
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.visiblePosts.count, initial + ProfileUserPostsViewModel.renderStep,
                       "un seul cran de fenêtre par salve de déclencheurs")
    }

    // MARK: - Changement de filtre

    /// Passer de « tout » (fenêtre étendue) à « Réels » sans remettre la fenêtre
    /// à zéro faisait construire d'un coup tous les réels connus.
    func test_filterChange_resetsTheRenderWindow() async {
        let sut = await loaded()

        sut.loadMoreIfNeeded(currentPost: sut.visiblePosts[sut.visiblePosts.count - 1])
        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertGreaterThan(sut.renderWindow, ProfileUserPostsViewModel.initialRenderWindow)

        sut.filter = .reels

        XCTAssertEqual(sut.renderWindow, ProfileUserPostsViewModel.initialRenderWindow)
    }

    func test_filterChange_toTheSameValue_leavesTheWindowAlone() async {
        let sut = await loaded()

        sut.loadMoreIfNeeded(currentPost: sut.visiblePosts[sut.visiblePosts.count - 1])
        try? await Task.sleep(nanoseconds: 100_000_000)
        let grown = sut.renderWindow

        sut.filter = .all

        XCTAssertEqual(sut.renderWindow, grown)
    }

    // MARK: - Vues dérivées

    func test_filter_narrowsBothTheFilteredListAndTheRenderedWindow() async {
        let sut = await loaded()

        sut.filter = .reels

        XCTAssertEqual(sut.filteredPosts.count, 4, "20 items, 1 réel tous les 5")
        XCTAssertEqual(sut.visiblePosts.map(\.id), sut.filteredPosts.map(\.id),
                       "4 réels < fenêtre initiale → tous rendus")
        XCTAssertEqual(sut.reels.count, 4, "la graine du viewer immersif reste la liste des réels")
    }

    func test_filterRoundTrip_restoresTheFullListFromTheTop() async {
        let sut = await loaded()
        let head = sut.posts[0].id

        sut.filter = .posts
        XCTAssertEqual(sut.filteredPosts.count, 16, "20 items moins les 4 réels")

        sut.filter = .all

        XCTAssertEqual(sut.filteredPosts.count, 20)
        XCTAssertEqual(sut.visiblePosts.first?.id, head,
                       "la fenêtre repart du haut de la liste après un aller-retour de filtre")
    }

    // MARK: - Garde de source : groupement des impressions

    /// Le flush d'impressions doit être un modificateur de la LISTE. Posé sur le
    /// `ForEach`, SwiftUI l'applique à CHAQUE carte générée : toute carte
    /// quittant l'écran annulait le minuteur de groupement et postait un lot
    /// d'un seul id — une requête réseau par carte défilée.
    func test_impressionFlush_isAttachedToTheList_notToEachCard() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // …/Unit/ViewModels
            .deletingLastPathComponent()   // …/Unit
            .deletingLastPathComponent()   // …/MeeshyTests
            .deletingLastPathComponent()   // …/apps/ios
            .deletingLastPathComponent()   // …/apps
            .deletingLastPathComponent()   // racine
        let code = AppSourceGuard.stripComments(try String(
            contentsOf: root.appendingPathComponent("apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsList.swift"),
            encoding: .utf8))

        guard let flush = code.range(of: "flushImpressions()"),
              let listTask = code.range(of: ".task { await viewModel.loadInitial() }") else {
            return XCTFail("câblage du listing introuvable — le test doit être mis à jour avec la vue")
        }
        XCTAssertTrue(flush.lowerBound > listTask.lowerBound,
                      "le flush doit suivre .task au niveau du conteneur, pas vivre dans le ForEach")
    }
}
