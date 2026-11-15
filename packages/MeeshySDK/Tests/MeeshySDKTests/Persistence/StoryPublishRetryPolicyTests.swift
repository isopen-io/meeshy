import XCTest
import Combine
@testable import MeeshySDK

/// Un refus DÉFINITIF de la passerelle n'est pas une panne réseau (#7907).
///
/// Mesuré en recette : un 403 `EMAIL_NOT_VERIFIED` sur l'upload d'une story
/// finissait dans « Stories en attente — publication au retour en ligne »,
/// appareil EN LIGNE, et chaque réessai échouait de la même façon. Ces témoins
/// tiennent la frontière : ce que rejouer ne changera pas s'arrête, le reste
/// se réessaie.
final class StoryPublishRetryPolicyTests: XCTestCase {

    private static func forbidden(code: String) -> MeeshyError {
        let body = Data(#"{"success":false,"error":"Vérifie ton adresse","code":"\#(code)"}"#.utf8)
        return .forbidden(reason: "Vérifie ton adresse", body: body)
    }

    // MARK: - Définitif

    func test_isPermanent_emailNotVerifiedForbidden_isPermanent() {
        XCTAssertTrue(StoryPublishRetryPolicy.isPermanent(Self.forbidden(code: "EMAIL_NOT_VERIFIED")))
    }

    func test_isPermanent_clientErrorStatus_isPermanent() {
        XCTAssertTrue(StoryPublishRetryPolicy.isPermanent(MeeshyError.server(statusCode: 400, message: "bad")))
        XCTAssertTrue(StoryPublishRetryPolicy.isPermanent(APIError.serverError(422, "invalid")))
        XCTAssertTrue(StoryPublishRetryPolicy.isPermanent(MeeshyError.rejected(APIRejection(statusCode: 409, message: "dup"))))
    }

    func test_isPermanent_unrecoverableMarker_isPermanent() {
        XCTAssertTrue(StoryPublishRetryPolicy.isPermanent(StoryPublishUnrecoverableError("gone")))
    }

    // MARK: - Réessayable

    func test_isPermanent_networkServerOrThrottle_isRetryable() {
        XCTAssertFalse(StoryPublishRetryPolicy.isPermanent(MeeshyError.network(.noConnection)))
        XCTAssertFalse(StoryPublishRetryPolicy.isPermanent(URLError(.timedOut)))
        XCTAssertFalse(StoryPublishRetryPolicy.isPermanent(MeeshyError.server(statusCode: 503, message: "down")))
        XCTAssertFalse(StoryPublishRetryPolicy.isPermanent(APIError.serverError(429, "slow down")))
        XCTAssertFalse(StoryPublishRetryPolicy.isPermanent(APIError.serverError(408, "timeout")))
    }

    func test_isPermanent_expiredSession_isRetryable() {
        XCTAssertFalse(StoryPublishRetryPolicy.isPermanent(MeeshyError.auth(.sessionExpired)))
        XCTAssertFalse(StoryPublishRetryPolicy.isPermanent(APIError.unauthorized))
    }

    // MARK: - Le code du refus

    func test_rejectionCode_readsTheMachineCodeOfAForbiddenBody() {
        XCTAssertEqual(StoryPublishRetryPolicy.rejectionCode(Self.forbidden(code: "EMAIL_NOT_VERIFIED")), "EMAIL_NOT_VERIFIED")
    }

    func test_rejectionCode_retryableError_isNil() {
        XCTAssertNil(StoryPublishRetryPolicy.rejectionCode(URLError(.notConnectedToInternet)))
    }
}

/// La file sait CLASSER un refus rendu par le chemin en ligne : l'item quitte
/// les publications en attente pour l'historique d'échecs, médias gardés.
final class StoryPublishQueuePermanentFailureTests: XCTestCase {

    private var queue: StoryPublishQueue!

    override func setUp() async throws {
        try await super.setUp()
        queue = StoryPublishQueue.shared
        await queue._testResetPublishHandler()
        await queue.clearAll()
        await queue._testSetFailedItems([])
    }

    override func tearDown() async throws {
        await queue._testResetPublishHandler()
        await queue.clearAll()
        await queue._testSetFailedItems([])
        try await super.tearDown()
    }

    func test_failPermanently_movesTheItemOutOfPendingIntoFailedWithItsReason() async {
        let item = StoryPublishQueueItem(visibility: "PUBLIC", slidesPayload: Data("[]".utf8), tempStoryId: "pending_x")
        await queue.enqueue(item)
        _ = await queue.markInFlight(item.id)

        let failed = expectation(description: "publishFailed fires")
        var received: StoryPublishFailure?
        var cancellables = Set<AnyCancellable>()
        queue.publishFailed.publisher
            .sink { payload in
                received = payload
                failed.fulfill()
            }
            .store(in: &cancellables)

        await queue.failPermanently(item.id, message: "Vérifie ton adresse")

        await fulfillment(of: [failed], timeout: 2.0)
        let pending = await queue.count
        let history = await queue.failedPendingItems
        let stillClaimed = await queue.isInFlight(item.id)
        XCTAssertEqual(pending, 0)
        XCTAssertEqual(history.map(\.id), [item.id])
        XCTAssertEqual(history.first?.lastError, "Vérifie ton adresse")
        XCTAssertFalse(stillClaimed)
        XCTAssertEqual(received?.reason, .unrecoverable(message: "Vérifie ton adresse"))
        XCTAssertEqual(received?.queueId, item.id)
    }

    func test_failPermanently_unknownItem_isANoOp() async {
        await queue.failPermanently("gone", message: "x")

        let history = await queue.failedPendingItems
        XCTAssertTrue(history.isEmpty)
    }
}
