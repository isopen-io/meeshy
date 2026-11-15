import XCTest
@testable import MeeshySDK

final class SessionServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: SessionService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = SessionService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeSession(id: String = "s1", isCurrent: Bool = false) -> UserSession {
        UserSession(id: id, deviceName: "iPhone 16", ipAddress: "1.2.3.4", lastActive: nil, createdAt: Date(), isCurrent: isCurrent)
    }

    // MARK: - listSessions

    func test_listSessions_callsCorrectEndpoint() async throws {
        let sessions = [makeSession()]
        let listData = SessionsListData(sessions: sessions, totalCount: 1)
        let response = APIResponse<SessionsListData>(success: true, data: listData, error: nil)
        mock.stub("/auth/sessions", result: response)

        _ = try await service.listSessions()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/sessions")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_listSessions_returnsSessionList() async throws {
        let sessions = [
            makeSession(id: "s1", isCurrent: true),
            makeSession(id: "s2", isCurrent: false)
        ]
        let listData = SessionsListData(sessions: sessions, totalCount: 2)
        let response = APIResponse<SessionsListData>(success: true, data: listData, error: nil)
        mock.stub("/auth/sessions", result: response)

        let result = try await service.listSessions().sessions

        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result[0].id, "s1")
        XCTAssertTrue(result[0].isCurrent)
        XCTAssertEqual(result[1].id, "s2")
        XCTAssertFalse(result[1].isCurrent)
    }

    func test_listSessions_emptyList() async throws {
        let listData = SessionsListData(sessions: [], totalCount: 0)
        let response = APIResponse<SessionsListData>(success: true, data: listData, error: nil)
        mock.stub("/auth/sessions", result: response)

        let result = try await service.listSessions()

        XCTAssertTrue(result.sessions.isEmpty)
        XCTAssertNil(result.geolocation, "un serveur antérieur à #9609 ne sert aucune attribution")
    }

    // MARK: - Ce que la liste sert depuis #9609 / #9610

    /// La liste porte l'attribution que la licence CC-BY de DB-IP exige.
    func test_listSessions_rendLAttributionDuLieu() async throws {
        let listData = SessionsListData(sessions: [makeSession()], totalCount: 1, geolocation: .dbIP)
        mock.stub("/auth/sessions", result: APIResponse<SessionsListData>(success: true, data: listData, error: nil))

        let result = try await service.listSessions()

        XCTAssertEqual(result.geolocation?.text, "IP Geolocation by DB-IP")
        XCTAssertEqual(result.geolocation?.url, "https://db-ip.com")
        XCTAssertEqual(result.geolocation?.approximate, true)
    }

    /// Tous les champs servis se décodent ; une session d'un serveur ancien,
    /// qui n'en porte aucun, se décode aussi (rétrocompatibilité, #9223).
    func test_userSession_decodeTousLesChampsServis() throws {
        let json = Data("""
        {
          "sessions": [
            {
              "id": "s1", "deviceName": "iPhone 15 Pro", "ipAddress": "203.0.113.4",
              "createdAt": "2026-10-01T08:00:00.000Z", "lastActivityAt": "2026-10-08T09:30:00.000Z",
              "isCurrentSession": true, "deviceType": "mobile", "deviceVendor": "Apple",
              "deviceModel": "iPhone16,1", "osName": "iOS", "osVersion": "18.2",
              "browserName": null, "browserVersion": null, "isMobile": true,
              "appVersion": "1.2.0", "appBuild": "1874", "platform": "ios",
              "loginMethod": "magic_link", "country": "FR", "city": "Lyon",
              "location": "Lyon, France", "timezone": "Europe/Paris", "isTrusted": false
            },
            { "id": "s2", "createdAt": "2026-09-01T08:00:00.000Z", "isCurrentSession": false }
          ],
          "totalCount": 2,
          "geolocation": { "provider": "DB-IP", "text": "IP Geolocation by DB-IP", "url": "https://db-ip.com", "license": "CC-BY-4.0", "approximate": true }
        }
        """.utf8)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = formatter.date(from: raw) else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: raw))
            }
            return date
        }

        let data = try decoder.decode(SessionsListData.self, from: json)

        let full = try XCTUnwrap(data.sessions.first)
        XCTAssertEqual(full.appVersion, "1.2.0")
        XCTAssertEqual(full.appBuild, "1874")
        XCTAssertEqual(full.platform, "ios")
        XCTAssertEqual(full.deviceModel, "iPhone16,1")
        XCTAssertEqual(full.osName, "iOS")
        XCTAssertEqual(full.loginMethod, "magic_link")
        XCTAssertEqual(full.country, "FR")
        XCTAssertEqual(full.city, "Lyon")
        XCTAssertEqual(full.timezone, "Europe/Paris")
        XCTAssertEqual(full.isMobile, true)
        XCTAssertNotNil(full.lastActive)

        let ancienne = data.sessions[1]
        XCTAssertNil(ancienne.deviceName)
        XCTAssertNil(ancienne.appVersion)
        XCTAssertNil(ancienne.lastActive)
        XCTAssertEqual(data.geolocation, .dbIP)
    }

    /// La liste se garde dans le cache (chiffré) : l'aller-retour ne perd rien.
    func test_userSession_allerRetourDuCache_nePerdRien() throws {
        let session = UserSession(
            id: "s1", deviceName: "iPhone 15 Pro", ipAddress: "203.0.113.4", lastActive: Date(timeIntervalSince1970: 1_800_000_000),
            createdAt: Date(timeIntervalSince1970: 1_790_000_000), isCurrent: true, osName: "iOS", osVersion: "18.2",
            appVersion: "1.2.0", appBuild: "1874", platform: "ios", loginMethod: "password", country: "FR", city: "Lyon",
            timezone: "Europe/Paris"
        )

        let copie = try JSONDecoder().decode(UserSession.self, from: JSONEncoder().encode(session))

        XCTAssertEqual(copie, session)
    }

    // MARK: - revokeSession

    func test_revokeSession_callsCorrectEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["revoked": true], error: nil)
        mock.stub("/auth/sessions/s1", result: response)

        try await service.revokeSession(sessionId: "s1")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/sessions/s1")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - revokeAllOtherSessions

    func test_revokeAllOtherSessions_callsCorrectEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["revoked": true], error: nil)
        mock.stub("/auth/sessions", result: response)

        try await service.revokeAllOtherSessions()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/sessions")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - Error handling

    func test_listSessions_networkError_propagates() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.listSessions()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {} else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func test_revokeSession_serverError_propagates() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 403, message: "Forbidden")

        do {
            try await service.revokeSession(sessionId: "s1")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 403)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }
}
