import XCTest
@testable import MeeshySDK

/// Les cinq écritures du Jeu Meeshy (#9378) — chacune à SON adresse, avec son
/// `requestId` d'idempotence, et un refus d'état qui dit POURQUOI.
final class GameServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: GameService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = GameService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    private func mission(id: String = "m9") -> GameBlock.Mission {
        GameBlock.Mission(id: id, templateKey: "send-voice", difficulty: .easy, signal: .axis(.audioMessage),
                          prism: false, target: 3, progress: 0, reward: 39, glory: 0, completedAt: nil)
    }

    func test_claimChest_postsTheRequestIdToTheChestAddress() async throws {
        let reply = ChestClaimResponse(status: "claimed", reward: DailyChest(points: 112, fragment: true, freeze: false), score: 12_292)
        mock.stub("/me/game/chest/claim", result: APIResponse<ChestClaimResponse>(success: true, data: reply, error: nil))

        let result = try await service.claimChest(requestId: "chest-req-0001")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/game/chest/claim")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["requestId"] as? String, "chest-req-0001")
        XCTAssertEqual(result, reply)
        XCTAssertFalse(result.alreadyDone)
    }

    func test_rerollMission_namesTheMissionInTheAddress() async throws {
        let reply = MissionRerollResponse(mission: mission(), balance: 8)
        mock.stub("/me/game/missions/m9/reroll", result: APIResponse<MissionRerollResponse>(success: true, data: reply, error: nil))

        let result = try await service.rerollMission(missionId: "m9", requestId: "reroll-req-001")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/game/missions/m9/reroll")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["requestId"] as? String, "reroll-req-001")
        XCTAssertEqual(result.balance, 8)
        XCTAssertEqual(result.mission.templateKey, "send-voice")
    }

    func test_buyFlameFreeze_readsTheNewReserve() async throws {
        let reply = FlameFreezeResponse(status: "already-bought", freezes: 2, balance: 7)
        mock.stub("/me/game/flame/freezes", result: APIResponse<FlameFreezeResponse>(success: true, data: reply, error: nil))

        let result = try await service.buyFlameFreeze(requestId: "freeze-req-001")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/game/flame/freezes")
        XCTAssertEqual(result.freezes, 2)
        XCTAssertTrue(result.alreadyDone, "un rejeu rend le résultat de la première écriture, il ne la refait pas")
    }

    func test_relightFlame_readsTheRestoredStreak() async throws {
        let reply = FlameRelightResponse(status: "relit", streak: 12, balance: 6)
        mock.stub("/me/game/flame/relight", result: APIResponse<FlameRelightResponse>(success: true, data: reply, error: nil))

        let result = try await service.relightFlame(requestId: "relight-req-01")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/game/flame/relight")
        XCTAssertEqual(result.streak, 12)
    }

    func test_markGuideSeen_sendsTheKeysAndReadsTheSeenList() async throws {
        let reply = GuideSeenResponse(guideSeen: ["onboarding.welcome", "first-level"])
        mock.stub("/me/game/guide/seen", result: APIResponse<GuideSeenResponse>(success: true, data: reply, error: nil))

        let result = try await service.markGuideSeen(keys: ["first-level"], requestId: "seen-req-00001")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/game/guide/seen")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["keys"] as? [String], ["first-level"])
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["requestId"] as? String, "seen-req-00001")
        XCTAssertEqual(result.guideSeen, ["onboarding.welcome", "first-level"])
    }

    // MARK: - Les refus d'état

    func test_refusal_readsTheGameCodeOfAStructuredRejection() {
        let rejection = APIRejection(statusCode: 409, code: "FREEZE_AT_MAXIMUM", message: "Deux gels au plus")
        XCTAssertEqual(GameService.refusal(of: MeeshyError.rejected(rejection)), .freezeAtMaximum)
    }

    func test_refusal_isNilForAnythingThatIsNotAGameRefusal() {
        XCTAssertNil(GameService.refusal(of: MeeshyError.server(statusCode: 500, message: "boom")))
        XCTAssertNil(GameService.refusal(of: MeeshyError.rejected(APIRejection(statusCode: 409, code: "CODE_DU_FUTUR", message: "?"))))
        XCTAssertNil(GameService.refusal(of: MeeshyError.rejected(APIRejection(statusCode: 409, message: "sans code"))))
        XCTAssertNil(GameService.refusal(of: URLError(.notConnectedToInternet)))
    }

    func test_aRefusedWrite_propagatesTheRejection() async {
        mock.stubError("/me/game/chest/claim", error: MeeshyError.rejected(
            APIRejection(statusCode: 409, code: "CHEST_NOT_READY", message: "Finis tes missions")))

        do {
            _ = try await service.claimChest(requestId: "chest-req-0002")
            XCTFail("le refus doit se propager")
        } catch {
            XCTAssertEqual(GameService.refusal(of: error), .chestNotReady)
        }
    }
}
