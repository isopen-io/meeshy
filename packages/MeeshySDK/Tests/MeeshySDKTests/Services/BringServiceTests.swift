import XCTest
@testable import MeeshySDK

/// `BringService` (#13936) — les routes du Bring et le réglage par personne. La passerelle fait foi
/// (`services/gateway/src/routes/bring/`) ; le service range chaque refus par ce que l'écran en DIT.
final class BringServiceTests: XCTestCase {

    private func makeSUT() -> (service: BringService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (BringService(api: api), api)
    }

    private func sent(_ remaining: Int?) -> BringSent {
        BringSent(bringId: "b1", toUserId: "u1", sentAt: "2026-11-07T10:00:00.000Z",
                  expiresAt: "2026-11-07T10:02:00.000Z", perDay: 1, remainingToday: remaining)
    }

    func test_availability_getsTheBringOfThisPerson() async throws {
        let (service, api) = makeSUT()
        api.stub("/bring/u1", result: APIResponse<BringAvailability>(
            success: true, data: BringAvailability(userId: "u1", available: true, perDay: 3, remainingToday: 2), error: nil))

        let availability = try await service.availability(userId: "u1")

        XCTAssertEqual(api.lastRequest?.endpoint, "/bring/u1")
        XCTAssertEqual(api.lastRequest?.method, "GET")
        XCTAssertEqual(availability.remainingToday, 2)
        XCTAssertTrue(availability.available)
    }

    func test_availability_readsUnlimitedAsNil() throws {
        let json = #"{"userId":"u1","available":true,"perDay":null,"remainingToday":null,"resetsAt":"2026-11-08T00:00:00.000Z"}"#
        let decoded = try JSONDecoder().decode(BringAvailability.self, from: Data(json.utf8))
        XCTAssertNil(decoded.perDay)
        XCTAssertNil(decoded.remainingToday)
        XCTAssertFalse(decoded.isExhausted)
    }

    func test_send_postsAndReadsTheSentBring() async {
        let (service, api) = makeSUT()
        api.stub("/bring/u1", result: APIResponse<BringSent>(success: true, data: sent(0), error: nil))

        let outcome = await service.send(userId: "u1")

        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(outcome, .sent(sent(0)))
    }

    func test_send_forbiddenMakesTheButtonDisappearWithoutAReason() async {
        let (service, api) = makeSUT()
        api.stubError("/bring/u1", error: MeeshyError.forbidden(reason: "Bring indisponible", body: nil))

        let outcome = await service.send(userId: "u1")

        XCTAssertEqual(outcome, .gone)
    }

    func test_sendOutcome_readsQuotaOfflineAndFailure() {
        XCTAssertEqual(BringSendOutcome.from(MeeshyError.server(statusCode: 429, message: "Trop de requetes")), .quota)
        XCTAssertEqual(BringSendOutcome.from(MeeshyError.network(.noConnection)), .offline)
        XCTAssertEqual(BringSendOutcome.from(URLError(.notConnectedToInternet)), .offline)
        XCTAssertEqual(BringSendOutcome.from(MeeshyError.server(statusCode: 503, message: "x")), .failed)
    }

    func test_stop_deletesTheBring() async throws {
        let (service, api) = makeSUT()
        api.stub("/bring/b1", result: APIResponse<BringService.StopAck>(
            success: true, data: BringService.StopAck(bringId: "b1", stopped: true), error: nil))

        try await service.stop(bringId: "b1")

        XCTAssertEqual(api.lastRequest?.endpoint, "/bring/b1")
        XCTAssertEqual(api.lastRequest?.method, "DELETE")
    }

    func test_setBringBlocked_putsTheStrictBody() async throws {
        let (service, api) = makeSUT()
        api.stub("/relations/u1/settings", result: APIResponse<RelationPersonSettings>(
            success: true, data: RelationPersonSettings(userId: "u1", bringBlocked: true), error: nil))

        let served = try await service.setBringBlocked(userId: "u1", blocked: true)

        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(api.lastRequest?.bodyJSON?.keys.sorted(), ["bringBlocked"])
        XCTAssertEqual(api.lastRequest?.bodyJSON?["bringBlocked"] as? Bool, true)
        XCTAssertTrue(served.bringBlocked)
    }

    func test_personSettings_aMissingFieldIsTheDefault() throws {
        let decoded = try JSONDecoder().decode(RelationPersonSettings.self, from: Data(#"{"userId":"u1"}"#.utf8))
        XCTAssertFalse(decoded.bringBlocked)
    }

    // MARK: - Pushes

    func test_ringPush_isReadIntoTheSameShapeAsTheSocket() {
        let ring = BringRing(push: [
            "type": "bring", "bringId": "b1", "fromUserId": "u2",
            "sentAt": "2026-11-07T10:00:00.000Z", "expiresAt": "2026-11-07T10:02:00.000Z",
            "title": "Alice", "body": "x", "stopLabel": "Arrêter",
        ])
        XCTAssertEqual(ring?.bringId, "b1")
        XCTAssertEqual(ring?.fromUserId, "u2")
    }

    func test_anotherPush_isNotABring() {
        XCTAssertNil(BringRing(push: ["type": "message", "bringId": "b1"]))
        XCTAssertNil(BringStopped(push: ["type": "bring", "bringId": "b1"]))
        XCTAssertEqual(BringStopped(push: ["type": "bring_stopped", "bringId": "b1", "reason": "sender"])?.reason, .sender)
    }

    func test_deadline_isTheServedOneOrTheWindow() {
        let now = Date(timeIntervalSince1970: 1_000)
        let served = BringRing(bringId: "b", fromUserId: "u", toUserId: "me", sentAt: "", expiresAt: "2026-11-07T10:02:00.000Z")
        XCTAssertEqual(served.deadline(now: now), BringInstant.parse("2026-11-07T10:02:00Z"))
        let unreadable = BringRing(bringId: "b", fromUserId: "u", toUserId: "me", sentAt: "", expiresAt: "?")
        XCTAssertEqual(unreadable.deadline(now: now), now.addingTimeInterval(120))
    }
}
