import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// **« Rendre privé » : la modération retire une publication de la vue des
/// autres, comme depuis la console web** (#11535).
///
/// Pour le modérateur qui agit, une publication rendue privée QUITTE son écran
/// (seul l'auteur la voit encore) : même retrait optimiste et même retour
/// arrière que le retrait, mais l'appel part vers la porte d'administration
/// avec l'auteur et le motif — jamais vers la suppression.
@MainActor
final class PublicationMakePrivateTests: XCTestCase {

    private static func post(id: String, type: String = "POST", authorId: String = "author-1") -> FeedPost {
        FeedPost(id: id, author: "alice", authorId: authorId, type: type, content: "contenu")
    }

    private static let withdrawal = PublicationWithdrawal.makePrivate(authorId: "author-1", reason: "Hors charte")

    // MARK: - Fil

    func test_feed_makePrivate_removesOptimisticallyAndSendsAuthorAndReason() async {
        let service = MockPostService()
        let sut = FeedViewModel(api: MockAPIClientForApp(), socialSocket: MockSocialSocket(), postService: service, offlineQueue: MockOfflineQueue())
        sut.posts = [Self.post(id: "p1"), Self.post(id: "p2")]

        await sut.withdrawPost("p1", Self.withdrawal)

        XCTAssertEqual(sut.posts.map(\.id), ["p2"])
        XCTAssertEqual(service.makePrivateCallCount, 1)
        XCTAssertEqual(service.lastMakePrivatePostId, "p1")
        XCTAssertEqual(service.lastMakePrivateAuthorId, "author-1")
        XCTAssertEqual(service.lastMakePrivateReason, "Hors charte")
        XCTAssertEqual(service.deleteCallCount, 0, "Rendre privé ne supprime pas")
    }

    func test_feed_makePrivate_whenRefused_restoresThePost() async {
        let service = MockPostService()
        service.makePrivateResult = .failure(PublicationModerationError.notApplied(outcome: "outranked"))
        let sut = FeedViewModel(api: MockAPIClientForApp(), socialSocket: MockSocialSocket(), postService: service, offlineQueue: MockOfflineQueue())
        sut.posts = [Self.post(id: "p1"), Self.post(id: "p2")]

        await sut.withdrawPost("p1", Self.withdrawal)

        XCTAssertEqual(sut.posts.map(\.id), ["p1", "p2"])
    }

    // MARK: - Réels

    func test_reels_makePrivate_removesOptimistically_andRestoresWhenRefused() async {
        let service = MockPostService()
        let sut = ReelsViewModel(service: service, cache: MockReelFeedCache(), postDeletedEvents: PassthroughSubject<String, Never>().eraseToAnyPublisher())
        sut.seed(posts: [Self.post(id: "r1", type: "REEL"), Self.post(id: "r2", type: "REEL")], startId: "r1")

        await sut.withdrawPost("r1", Self.withdrawal)
        XCTAssertEqual(sut.reels.map(\.id), ["r2"])
        XCTAssertEqual(service.lastMakePrivatePostId, "r1")

        service.makePrivateResult = .failure(APIError.serverError(403, "forbidden"))
        await sut.withdrawPost("r2", Self.withdrawal)
        XCTAssertEqual(sut.reels.map(\.id), ["r2"])
    }

    // MARK: - Détail

    func test_postDetail_makePrivate_reportsTheOutcome() async {
        let service = MockPostService()
        let sut = PostDetailViewModel(postService: service, languageProvider: MockLanguageProvider(preferredLanguages: []), offlineQueue: MockOfflineQueue(), socialSocket: MockSocialSocket())

        let applied = await sut.withdrawPost("p1", Self.withdrawal)
        service.makePrivateResult = .failure(APIError.serverError(403, "forbidden"))
        let refused = await sut.withdrawPost("p1", Self.withdrawal)

        XCTAssertTrue(applied)
        XCTAssertFalse(refused)
        XCTAssertEqual(service.makePrivateCallCount, 2)
    }

    // MARK: - Story

    func test_story_makePrivate_purgesTheStory_andKeepsItWhenRefused() async {
        let service = MockPostService()
        let sut = StoryViewModel(storyService: MockStoryService(), postService: service, socialSocket: MockSocialSocket(), api: MockAPIClientForApp())
        let keep = StoryItem(id: "keep", content: "a", media: [], storyEffects: nil, createdAt: Date(), expiresAt: Date().addingTimeInterval(72000), isViewed: false)
        let gone = StoryItem(id: "gone", content: "b", media: [], storyEffects: nil, createdAt: Date(), expiresAt: Date().addingTimeInterval(72000), isViewed: false)
        sut.storyGroups = [StoryGroup(id: "author-1", username: "alice", avatarColor: "FF2E63", stories: [keep, gone])]

        let applied = await StoryPrivatization.run(storyId: "gone", authorId: "author-1", reason: "Hors charte", viewModel: sut)
        XCTAssertTrue(applied)
        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["keep"])
        XCTAssertEqual(service.lastMakePrivateAuthorId, "author-1")

        service.makePrivateResult = .failure(APIError.serverError(403, "forbidden"))
        let refused = await StoryPrivatization.run(storyId: "keep", authorId: "author-1", reason: "Hors charte", viewModel: sut)
        XCTAssertFalse(refused)
        XCTAssertEqual(sut.storyGroups.first?.stories.map(\.id), ["keep"])
    }

    func test_storyMenu_offersMakePrivate_toTheModeration_only() {
        let theirs = StoryOptionsMenuPlan.resolve(hasStory: true, isOwnStory: false, hasAudioTranscript: false, canCompose: false, canRemove: true)
        let ordinary = StoryOptionsMenuPlan.resolve(hasStory: true, isOwnStory: false, hasAudioTranscript: false, canCompose: false, canRemove: false)
        let mine = StoryOptionsMenuPlan.resolve(hasStory: true, isOwnStory: true, hasAudioTranscript: false, canCompose: false, canRemove: false)

        XCTAssertTrue(theirs.sections.contains([.report, .makePrivate, .remove]))
        XCTAssertFalse(ordinary.entries.contains(.makePrivate))
        XCTAssertFalse(mine.entries.contains(.makePrivate))
    }

    // MARK: - Offre, feuille, retours

    func test_offer_mirrorsTheRemovalRoles() {
        let theirs = Self.post(id: "p1", authorId: "someone")
        for role in ["MODERATOR", "ADMIN", "BIGBOSS"] {
            XCTAssertNotNil(ContentRemovalOffer.publication(for: theirs, viewerId: "mod", viewerRole: role) { _, _ in }, role)
        }
        XCTAssertNil(ContentRemovalOffer.publication(for: theirs, viewerId: "mod", viewerRole: "USER") { _, _ in })
        XCTAssertNil(ContentRemovalOffer.publication(for: Self.post(id: "p2", authorId: "mod"), viewerId: "mod", viewerRole: "ADMIN") { _, _ in })
    }

    func test_sheet_namesTheGesture() {
        XCTAssertEqual(ContentModerationGesture.makePrivate.titleKey(for: .post), "moderation.private.title.post")
        XCTAssertEqual(ContentModerationGesture.makePrivate.titleKey(for: .reel), "moderation.private.title.reel")
        XCTAssertEqual(ContentModerationGesture.makePrivate.titleKey(for: .story), "moderation.private.title.story")
        XCTAssertEqual(ContentModerationGesture.remove.titleKey(for: .story), "moderation.removal.title.story")
    }

    func test_feedback_saysWhatHappened() {
        let deleted = "Publication supprimée"
        XCTAssertEqual(PublicationWithdrawal.delete(reason: nil).successText(deleted: deleted), deleted)
        XCTAssertNotEqual(Self.withdrawal.successText(deleted: deleted), PublicationWithdrawal.delete(reason: "x").successText(deleted: deleted))
        XCTAssertNotEqual(Self.withdrawal.failureText(deleteError: "Erreur"), "Erreur")
    }
}
