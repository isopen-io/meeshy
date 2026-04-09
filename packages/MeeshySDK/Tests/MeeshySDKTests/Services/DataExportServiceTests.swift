import XCTest
@testable import MeeshySDK

final class DataExportServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: DataExportService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = DataExportService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeExportData(format: String = "json", types: [String] = ["messages"]) -> DataExportData {
        DataExportData(
            exportDate: "2026-04-09T00:00:00Z", format: format,
            requestedTypes: types, profile: nil, messages: nil,
            messagesCount: nil, contacts: nil, contactsCount: nil, csv: nil
        )
    }

    // MARK: - requestExport

    func test_requestExport_callsCorrectEndpoint() async throws {
        let exportData = makeExportData()
        let response = APIResponse<DataExportData>(success: true, data: exportData, error: nil)
        mock.stub("/me/export", result: response)

        let result = try await service.requestExport(format: "json", types: ["messages"])

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/export")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.format, "json")
    }

    func test_requestExport_withMultipleTypes_callsEndpoint() async throws {
        let exportData = makeExportData(format: "csv", types: ["messages", "contacts", "profile"])
        let response = APIResponse<DataExportData>(success: true, data: exportData, error: nil)
        mock.stub("/me/export", result: response)

        let result = try await service.requestExport(format: "csv", types: ["messages", "contacts", "profile"])

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/export")
        XCTAssertEqual(result.format, "csv")
        XCTAssertEqual(result.requestedTypes, ["messages", "contacts", "profile"])
    }

    func test_requestExport_returnsExportDataWithProfile() async throws {
        let profile = ExportedProfile(
            id: "u1", username: "testuser", displayName: "Test User",
            firstName: nil, lastName: nil, email: "test@meeshy.me",
            phoneNumber: nil, bio: nil, avatar: nil, banner: nil,
            systemLanguage: "fr", regionalLanguage: nil,
            customDestinationLanguage: nil, timezone: nil,
            createdAt: nil, lastActiveAt: nil
        )
        let exportData = DataExportData(
            exportDate: "2026-04-09T00:00:00Z", format: "json",
            requestedTypes: ["profile"], profile: profile, messages: nil,
            messagesCount: nil, contacts: nil, contactsCount: nil, csv: nil
        )
        let response = APIResponse<DataExportData>(success: true, data: exportData, error: nil)
        mock.stub("/me/export", result: response)

        let result = try await service.requestExport(format: "json", types: ["profile"])

        XCTAssertNotNil(result.profile)
        XCTAssertEqual(result.profile?.username, "testuser")
        XCTAssertEqual(result.profile?.email, "test@meeshy.me")
    }

    func test_requestExport_propagatesNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.requestExport(format: "json", types: ["messages"])
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // expected
            } else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }

    func test_requestExport_propagatesServerError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 429, message: "Rate limited")

        do {
            _ = try await service.requestExport(format: "json", types: ["messages"])
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 429)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }

    func test_requestExport_propagatesAuthError() async {
        mock.errorToThrow = MeeshyError.auth(.sessionExpired)

        do {
            _ = try await service.requestExport(format: "json", types: ["messages"])
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.sessionExpired) = error {
                // expected
            } else {
                XCTFail("Expected auth sessionExpired, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }
}
