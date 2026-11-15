import XCTest
import MeeshySDK
@testable import Meeshy

/// #16322 — **le plein écran d'un post est UNE suite, d'où qu'on l'ouvre.**
///
/// Recette porteur du 2026-11-05 : le média d'un commentaire ouvrait une
/// galerie des seuls commentaires (sans les médias du post en tête, et sans
/// pellicule depuis le détail), et la pellicule du post ne montrait pas les
/// médias des commentaires que l'écran avait pourtant chargés. Toucher un
/// média de commentaire ouvre désormais la MÊME suite que le post — médias du
/// post d'abord, puis ceux des commentaires dans l'ordre du fil — posée sur la
/// pièce touchée.
@MainActor
final class PostFullscreenSeriesTests: XCTestCase {

    // MARK: - Fabriques

    private func media(_ id: String) -> FeedMedia {
        FeedMedia(id: id, type: .image, url: "https://cdn.meeshy.me/\(id)",
                  width: 1_080, height: 1_350)
    }

    private func post(media: [FeedMedia], embedded: [FeedComment] = []) -> FeedPost {
        var post = FeedPost(id: "p1", author: "alice", authorId: "a1",
                            content: "", timestamp: Date(timeIntervalSince1970: 1_000))
        post.media = media
        post.comments = embedded
        return post
    }

    private func comment(_ id: String, media: [FeedMedia] = [], parentId: String? = nil) -> FeedComment {
        FeedComment(id: id, author: "bob", authorId: "u-bob", content: "texte de \(id)",
                    timestamp: Date(timeIntervalSince1970: 2_000),
                    parentId: parentId, media: media)
    }

    // MARK: - La route d'un média de commentaire

    func test_route_commentMediaUnderAKnownPost_opensThePostSeries() {
        let porteur = post(media: [media("m1")])

        XCTAssertEqual(CommentMediaFullscreenRoute.resolve(post: porteur), .postSeries(postId: "p1"))
    }

    func test_route_commentMediaWithoutPost_keepsTheCommentsGallery() {
        XCTAssertEqual(CommentMediaFullscreenRoute.resolve(post: nil), .commentsOnly)
    }

    // MARK: - Le contexte déclaré par l'hôte porte le post et son fil

    func test_context_declaredWithAPost_servesThePostAndTheThreadInOrder() {
        let racine = comment("c1", media: [media("m3")])
        let reponse = comment("c2", media: [media("m4")], parentId: "c1")
        let context = CommentMediaGalleryContext(topLevel: [racine, comment("c3")],
                                                 replies: ["c1": [reponse]],
                                                 post: post(media: [media("m1")]))

        XCTAssertEqual(context.post?.id, "p1")
        XCTAssertEqual(context.thread().map(\.id), ["c1", "c2", "c3"])
    }

    // MARK: - Les commentaires servis à la suite

    func test_initialComments_threadFirst_thenEmbeddedOnesItDoesNotCarry() {
        let porteur = post(media: [], embedded: [comment("c9"), comment("c1")])
        let fil = [comment("c1"), comment("c2")]

        XCTAssertEqual(SocialMediaGalleryContent.initialComments(post: porteur, thread: fil).map(\.id),
                       ["c1", "c2", "c9"])
    }

    func test_initialComments_withoutThread_keepsTheEmbeddedComments() {
        let porteur = post(media: [], embedded: [comment("c1")])

        XCTAssertEqual(SocialMediaGalleryContent.initialComments(post: porteur, thread: []).map(\.id), ["c1"])
    }

    // MARK: - La suite, ouverte sur un média de commentaire

    func test_series_openedOnACommentMedia_putsThePostFirstAndLandsOnTheTouchedMedia() {
        let porteur = post(media: [media("m1"), media("m2")])
        let fil = SocialMediaGalleryContent.initialComments(
            post: porteur,
            thread: [comment("c1", media: [media("m3")]), comment("c2", media: [media("m4")])]
        )
        let lot = PostGalleryLot.compose(post: porteur, comments: fil, preferredLanguages: [])

        XCTAssertEqual(lot.attachments.map(\.id), ["m1", "m2", "m3", "m4"])
        XCTAssertEqual(PostGalleryLot.entryId(in: lot, startMediaId: "m4", startSceneIndex: 0), "m4")
    }
}
