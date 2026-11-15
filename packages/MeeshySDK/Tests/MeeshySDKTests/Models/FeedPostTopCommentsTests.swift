import XCTest
@testable import MeeshySDK

/// **Les commentaires mis en avant sous un post appartiennent au MODÈLE**
/// (#7010).
///
/// Le classement — les plus aimés, trois au plus — vivait dans le `body` de
/// `FeedPostCard` : redérivé à chaque évaluation, et introuvable depuis toute
/// autre surface qui voudrait le même aperçu.
final class FeedPostTopCommentsTests: XCTestCase {

    private func makeComment(_ id: String, likes: Int) -> FeedComment {
        FeedComment(id: id, author: "A\(id)", content: "c\(id)", likes: likes)
    }

    private func makePost(comments: [FeedComment]) -> FeedPost {
        var post = FeedPost(author: "Auteur", content: "corps")
        post.comments = comments
        return post
    }

    func test_topComments_ranksByLikesDescending() {
        let post = makePost(comments: [
            makeComment("a", likes: 1),
            makeComment("b", likes: 9),
            makeComment("c", likes: 4)
        ])

        XCTAssertEqual(post.topComments.map(\.id), ["b", "c", "a"])
    }

    func test_topComments_keepsAtMostThree() {
        let post = makePost(comments: (1...7).map { makeComment("\($0)", likes: $0) })

        XCTAssertEqual(post.topComments.count, 3)
        XCTAssertEqual(post.topComments.map(\.id), ["7", "6", "5"])
    }

    func test_topComments_isEmptyWhenThePostHasNone() {
        XCTAssertTrue(makePost(comments: []).topComments.isEmpty)
    }

    /// **Le classement suit une insertion OPTIMISTE.** C'est la raison pour
    /// laquelle il n'est pas stocké : `comments` est `var` et `FeedViewModel` y
    /// insère le commentaire qu'on vient d'écrire avant toute confirmation
    /// serveur. Un champ dérivé figé afficherait l'aperçu d'AVANT, sans qu'aucun
    /// écran ne le dise.
    func test_topComments_followsAnOptimisticInsertion() {
        var post = makePost(comments: [makeComment("a", likes: 2)])
        XCTAssertEqual(post.topComments.map(\.id), ["a"])

        post.comments.insert(makeComment("neuf", likes: 0), at: 0)

        XCTAssertEqual(post.topComments.map(\.id), ["a", "neuf"])
    }
}
