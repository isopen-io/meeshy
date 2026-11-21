import XCTest
@testable import MeeshySDK

/// Les visites de mon lien de profil (#19489) sur le fil de `GET /users/me/profile-link/stats` (#19206) : le jour et le
/// mois lus tels que servis ; un chiffre absent, négatif ou illisible vaut « rien », jamais zéro.
final class ProfileLinkVisitsServiceTests: XCTestCase {

    private func makeService() -> (ProfileLinkVisitsService, MockAPIClient) {
        let mock = MockAPIClient()
        return (ProfileLinkVisitsService(api: mock), mock)
    }

    func test_visits_readsTodayAndThisMonthFromMyOwnStats() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/me/profile-link/stats", json: """
        {"success":true,"data":{"today":57,"month":1719,"series":[{"day":"2026-11-18","visits":57}]}}
        """)

        let stats = try await service.visits()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/profile-link/stats")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(stats, ProfileLinkVisitStats(today: 57, month: 1719))
    }

    func test_visits_aMissingOrUnreadableFigureIsNothing_neverZero() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/me/profile-link/stats", json: """
        {"success":true,"data":{"today":"beaucoup"}}
        """)

        let stats = try await service.visits()

        XCTAssertNil(stats.today)
        XCTAssertNil(stats.month)
    }

    func test_visits_aNegativeFigureIsNotShown() {
        let stats = ProfileLinkVisitStats(today: -3, month: 0)

        XCTAssertNil(stats.today)
        XCTAssertEqual(stats.month, 0)
    }

    func test_visits_aServerWithoutTheRouteThrows_theScreenDoesWithoutIt() async {
        let (service, mock) = makeService()
        mock.stubError("/users/me/profile-link/stats", error: URLError(.badServerResponse))

        do {
            _ = try await service.visits()
            XCTFail("une passerelle sans la route ne rend aucun chiffre")
        } catch {
            XCTAssertTrue(error is URLError)
        }
    }
}
