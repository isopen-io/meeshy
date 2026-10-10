import XCTest
@testable import MeeshyUI
import MeeshySDK

/// **La carte d'un commentaire de post lit ses textes comme le fil** (#9686,
/// recette 2026-10-08) — le post de recette « Recette #9093 » partait sur la
/// carte avec sa notation de liens brute, là où le fil affiche les libellés.
@MainActor
final class PostCommentCardReadingTests: XCTestCase {

    private static let written = "puis [notre page](https://meeshy.me/about) et enfin [[https://meeshy.me/brut]]"
    private static let viewer = MessageCardSubject.Viewer(id: "me", displayName: "Moi")

    private static func subject(post: FeedPost, target: FeedComment) -> MessageCardSubject? {
        let source = PostCommentCardSource.reading(post: post, target: target, thread: [], viewer: viewer)
        return PostCommentCardComposition.subject(of: source, mode: .postAndComment, showsPost: true,
                                                  title: "Fil", foldedLabel: { "+\($0)" })
    }

    func test_reading_thePostHead_showsTheLinkLabels_neverTheirNotation() throws {
        let post = FeedPost(id: "p", author: "Demo", authorId: "demo", content: Self.written)
        let comment = FeedComment(id: "c", author: "Bob", authorId: "bob", content: "Recette 9311")
        let quoted = try XCTUnwrap(Self.subject(post: post, target: comment)?.quoted)
        XCTAssertEqual(quoted.text, "puis notre page et enfin https://meeshy.me/brut")
        XCTAssertEqual(quoted.text, MessageTextRenderer.plainText(Self.written))
    }

    func test_reading_aCommentWithALabelledLink_readsItsLabel() throws {
        let post = FeedPost(id: "p", author: "Demo", authorId: "demo", content: "Bonjour")
        let comment = FeedComment(id: "c", author: "Bob", authorId: "bob", content: "Voir [la doc](https://x.fr) et **ça**")
        XCTAssertEqual(Self.subject(post: post, target: comment)?.reply.text, "Voir la doc et ça")
    }
}
