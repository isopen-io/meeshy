import XCTest
@testable import MeeshySDK

/// « Rendre privé » depuis iOS parle à la MÊME porte que la console web (#11535) :
/// `POST /admin/users/:authorId/publications/moderation`, action `make-private`.
final class PostServiceModerationTests: XCTestCase {

    private let path = "/admin/users/author1/publications/moderation"

    private func makeSUT() -> (PostService, MockAPIClient) {
        let api = MockAPIClient()
        return (PostService(api: api), api)
    }

    private func receipt(_ outcome: String) -> APIResponse<PublicationModerationReceipt> {
        APIResponse(
            success: true,
            data: PublicationModerationReceipt(
                action: "make-private",
                results: [PublicationModerationReceipt.Result(postId: "post1", outcome: outcome)]
            ),
            error: nil
        )
    }

    func test_makePrivate_postsTheConsoleGestureForTheAuthorWithTheReason() async throws {
        let (sut, api) = makeSUT()
        api.stub(path, result: receipt("updated"))

        try await sut.makePrivate(postId: "post1", authorId: "author1", reason: "Contenu hors charte")

        XCTAssertEqual(api.lastRequest?.endpoint, path)
        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["action"] as? String, "make-private")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["postIds"] as? [String], ["post1"])
        XCTAssertEqual(api.lastRequest?.bodyJSON?["reason"] as? String, "Contenu hors charte")
    }

    func test_makePrivate_alreadyPrivate_succeeds() async throws {
        let (sut, api) = makeSUT()
        api.stub(path, result: receipt("unchanged"))

        try await sut.makePrivate(postId: "post1", authorId: "author1", reason: "Motif")
    }

    func test_makePrivate_outrankedByTheAuthor_throwsNotApplied() async {
        let (sut, api) = makeSUT()
        api.stub(path, result: receipt("outranked"))

        do {
            try await sut.makePrivate(postId: "post1", authorId: "author1", reason: "Motif")
            XCTFail("Un geste que la passerelle n'a pas appliqué ne se lit pas comme un succès")
        } catch let error as PublicationModerationError {
            XCTAssertEqual(error, .notApplied(outcome: "outranked"))
        } catch {
            XCTFail("Erreur inattendue : \(error)")
        }
    }

    func test_makePrivate_postMissingFromTheReceipt_throwsNotApplied() async {
        let (sut, api) = makeSUT()
        api.stub(path, result: APIResponse(success: true, data: PublicationModerationReceipt(action: "make-private", results: []), error: nil))

        do {
            try await sut.makePrivate(postId: "post1", authorId: "author1", reason: "Motif")
            XCTFail("Une publication absente du reçu n'a pas changé")
        } catch let error as PublicationModerationError {
            XCTAssertEqual(error, .notApplied(outcome: nil))
        } catch {
            XCTFail("Erreur inattendue : \(error)")
        }
    }
}
