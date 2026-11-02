import XCTest
@testable import MeeshySDK
@testable import Meeshy

/// How a failed story reaction recovers: a transport failure joins the durable
/// queue, a server refusal rolls back. The rollback itself, the swipe-away
/// guard and the queued row are exercised against the real ledger in
/// `StoryReactionLedgerTests` (#13135).
final class StoryViewerReactionRollbackTests: XCTestCase {

    // MARK: - Recovery decision (pure)

    /// Une coupure réseau n'est pas un refus : la réaction doit rejoindre la
    /// file, comme le commentaire de story. `MeeshyError.network` est la forme
    /// que `APIClient` donne à tout `URLError` de transport.
    func test_reactionRecovery_forNetworkFailure_queuesForReplay() {
        XCTAssertEqual(StoryReactionRecovery.decide(for: MeeshyError.network(.noConnection)), .queueForReplay)
        XCTAssertEqual(StoryReactionRecovery.decide(for: MeeshyError.network(.timeout)), .queueForReplay)
        XCTAssertEqual(StoryReactionRecovery.decide(for: URLError(.notConnectedToInternet)), .queueForReplay,
                       "Un URLError brut est normalisé en `.network` par `MeeshyError.from` — même verdict")
    }

    /// Le refus du serveur — le 409 `REACTION_LIMIT_REACHED` que cite
    /// `sendReaction`, un 403, un 404 — rembobine TOUJOURS : le rejouer depuis
    /// la file rendrait le même refus, avec un emoji fantôme entre-temps.
    func test_reactionRecovery_forServerRefusal_rollsBack() {
        XCTAssertEqual(StoryReactionRecovery.decide(for: MeeshyError.server(statusCode: 409, message: "REACTION_LIMIT_REACHED")), .rollback)
        XCTAssertEqual(StoryReactionRecovery.decide(for: MeeshyError.forbidden(reason: nil, body: nil)), .rollback)
        XCTAssertEqual(StoryReactionRecovery.decide(for: MeeshyError.server(statusCode: 404, message: "Post not found")), .rollback)
        XCTAssertEqual(StoryReactionRecovery.decide(for: NSError(domain: "test", code: -1)), .rollback,
                       "Une erreur locale inconnue n'est pas une panne de transport")
    }
}
