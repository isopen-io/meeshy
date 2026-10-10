import XCTest
@testable import MeeshySDK

/// Les deux lectures d'intégration du jeu (#9481) — chacune à SON adresse, en GET.
final class GameIntegrationServiceTests: XCTestCase {

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

    func test_fetchSettings_readsTheServedState_withAGet() async throws {
        let served = GameSettingsResponse(
            gameHidden: true, friendsLeagueOptOut: true,
            visibility: GameVisibility(showcase: .me, rank: .me, treasury: .me, atlas: .me))
        mock.stub("/me/game/privacy", result: APIResponse<GameSettingsResponse>(success: true, data: served, error: nil))

        let result = try await service.fetchSettings()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/game/privacy")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result, served)
    }

    func test_fetchUserGame_namesTheMemberInTheAddress_withAGet() async throws {
        let served = UserGameProfileResponse(
            visible: true,
            standing: GameStanding(level: 12, tier: .lueur, prestige: 0, flame: .flamme, rank: .echo, division: .iii),
            treasury: GameShownTreasury(tier: .bourse))
        mock.stub("/users/u42/game", result: APIResponse<UserGameProfileResponse>(success: true, data: served, error: nil))

        let result = try await service.fetchUserGame(userId: "u42")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/u42/game")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result, served)
    }
}
