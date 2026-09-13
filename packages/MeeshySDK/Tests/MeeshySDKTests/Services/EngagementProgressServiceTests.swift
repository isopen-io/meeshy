import XCTest
@testable import MeeshySDK

/// Ma progression se lit à UNE adresse (#5698, #5670) — et la charge se décode
/// FAIL-CLOSED : une nature de palier inconnue refuse la charge entière plutôt
/// que de peindre un niveau depuis une forme à moitié comprise.
final class EngagementProgressServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: EngagementProgressService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = EngagementProgressService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    func test_fetchProgress_readsTheSingleAddress() async throws {
        let payload = APIEngagementProgress(
            counters: [.init(axisKey: "content.post", count: 3)],
            milestones: [.init(milestoneType: .badge, milestoneKey: "content.post:1", reachedAt: "2026-09-01T00:00:00.000Z")],
            streak: .init(currentStreakDays: 1, longestStreakDays: 4),
            level: .init(engagementScore: 9)
        )
        mock.stub("/me/engagement", result: APIResponse<APIEngagementProgress>(success: true, data: payload, error: nil))

        let mine = try await service.fetchProgress()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/engagement")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(mine, payload)
    }

    func test_decode_exactGatewayShape() throws {
        let json = """
        {"counters":[{"axisKey":"content.text_message","count":12}],
         "milestones":[{"milestoneType":"badge","milestoneKey":"content.text_message:10","reachedAt":"2026-09-04T08:00:00.000Z"}],
         "streak":{"currentStreakDays":1,"longestStreakDays":1},
         "level":{"engagementScore":36}}
        """
        let decoded = try JSONDecoder().decode(APIEngagementProgress.self, from: Data(json.utf8))

        XCTAssertEqual(decoded.counters.first?.count, 12)
        XCTAssertEqual(decoded.milestones.first?.milestoneType, .badge)
        XCTAssertEqual(decoded.level.engagementScore, 36)
        XCTAssertEqual(decoded.id, "current")
    }

    func test_decode_unknownMilestoneType_refusesTheWholePayload() {
        let json = """
        {"counters":[],"milestones":[{"milestoneType":"trophy","milestoneKey":"x","reachedAt":"y"}],
         "streak":{"currentStreakDays":0,"longestStreakDays":0},"level":{"engagementScore":0}}
        """
        XCTAssertThrowsError(try JSONDecoder().decode(APIEngagementProgress.self, from: Data(json.utf8)))
    }

    func test_decode_unknownAxisKey_isKeptAsAString_neverAFailure() throws {
        let json = """
        {"counters":[{"axisKey":"content.future","count":1}],"milestones":[],
         "streak":{"currentStreakDays":0,"longestStreakDays":0},"level":{"engagementScore":0}}
        """
        let decoded = try JSONDecoder().decode(APIEngagementProgress.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.counters.first?.axisKey, "content.future")
    }
}
