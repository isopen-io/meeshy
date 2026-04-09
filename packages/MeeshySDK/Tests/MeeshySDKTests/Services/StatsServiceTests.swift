import XCTest
@testable import MeeshySDK

final class StatsServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: StatsService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = StatsService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - fetchStats

    func test_fetchStats_callsCorrectEndpoint() async throws {
        let stats = UserStats(totalMessages: 100, totalConversations: 5, totalTranslations: 50)
        let response = APIResponse<UserStats>(success: true, data: stats, error: nil)
        mock.stub("/users/me/stats", result: response)

        _ = try await service.fetchStats()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/stats")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_fetchStats_returnsParsedStats() async throws {
        let achievement = Achievement(id: "a1", name: "First Message", description: "Send your first message", icon: "bubble.left", color: "blue", isUnlocked: true, progress: 1.0, threshold: 1, current: 1)
        let stats = UserStats(
            totalMessages: 250, totalConversations: 10,
            totalTranslations: 80, friendRequestsReceived: 15,
            languagesUsed: 3, memberDays: 42,
            languages: ["fr", "en", "es"], achievements: [achievement]
        )
        let response = APIResponse<UserStats>(success: true, data: stats, error: nil)
        mock.stub("/users/me/stats", result: response)

        let result = try await service.fetchStats()

        XCTAssertEqual(result.totalMessages, 250)
        XCTAssertEqual(result.totalConversations, 10)
        XCTAssertEqual(result.totalTranslations, 80)
        XCTAssertEqual(result.languagesUsed, 3)
        XCTAssertEqual(result.languages, ["fr", "en", "es"])
        XCTAssertEqual(result.achievements.count, 1)
        XCTAssertEqual(result.achievements[0].name, "First Message")
    }

    // MARK: - fetchTimeline

    func test_fetchTimeline_callsCorrectEndpoint() async throws {
        let points = [TimelinePoint(date: "2026-04-01", messages: 10)]
        let response = APIResponse<[TimelinePoint]>(success: true, data: points, error: nil)
        mock.stub("/users/me/stats/timeline", result: response)

        _ = try await service.fetchTimeline()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/stats/timeline")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_fetchTimeline_returnsParsedPoints() async throws {
        let points = [
            TimelinePoint(date: "2026-04-01", messages: 10),
            TimelinePoint(date: "2026-04-02", messages: 25),
            TimelinePoint(date: "2026-04-03", messages: 5)
        ]
        let response = APIResponse<[TimelinePoint]>(success: true, data: points, error: nil)
        mock.stub("/users/me/stats/timeline", result: response)

        let result = try await service.fetchTimeline(days: 3)

        XCTAssertEqual(result.count, 3)
        XCTAssertEqual(result[0].date, "2026-04-01")
        XCTAssertEqual(result[0].messages, 10)
        XCTAssertEqual(result[2].messages, 5)
    }

    // MARK: - fetchAchievements

    func test_fetchAchievements_callsCorrectEndpoint() async throws {
        let response = APIResponse<[Achievement]>(success: true, data: [], error: nil)
        mock.stub("/users/me/stats/achievements", result: response)

        _ = try await service.fetchAchievements()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/stats/achievements")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_fetchAchievements_returnsParsedAchievements() async throws {
        let achievements = [
            Achievement(id: "a1", name: "Polyglot", description: "Use 5 languages", icon: "globe", color: "green", isUnlocked: true, progress: 1.0, threshold: 5, current: 5),
            Achievement(id: "a2", name: "Socializer", description: "Join 10 groups", icon: "person.3", color: "blue", isUnlocked: false, progress: 0.3, threshold: 10, current: 3)
        ]
        let response = APIResponse<[Achievement]>(success: true, data: achievements, error: nil)
        mock.stub("/users/me/stats/achievements", result: response)

        let result = try await service.fetchAchievements()

        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result[0].name, "Polyglot")
        XCTAssertTrue(result[0].isUnlocked)
        XCTAssertEqual(result[1].name, "Socializer")
        XCTAssertFalse(result[1].isUnlocked)
        XCTAssertEqual(result[1].progress, 0.3, accuracy: 0.001)
    }

    // MARK: - Error handling

    func test_fetchStats_networkError_propagates() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.fetchStats()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {} else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func test_fetchTimeline_serverError_propagates() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 500, message: "Internal Server Error")

        do {
            _ = try await service.fetchTimeline()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 500)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }
}
