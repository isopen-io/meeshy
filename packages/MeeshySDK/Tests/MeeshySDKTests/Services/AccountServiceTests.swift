import XCTest
@testable import MeeshySDK

final class AccountServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: AccountService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = AccountService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - deleteAccount

    func test_deleteAccount_callsCorrectEndpoint() async throws {
        let response = APIResponse<DeleteAccountResponse>(
            success: true,
            data: DeleteAccountResponse(message: "Account deleted"),
            error: nil
        )
        mock.stub("/me/delete-account", result: response)

        try await service.deleteAccount(confirmationPhrase: "DELETE MY ACCOUNT")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/delete-account")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    func test_deleteAccount_withDifferentPhrase_callsSameEndpoint() async throws {
        let response = APIResponse<DeleteAccountResponse>(
            success: true,
            data: DeleteAccountResponse(message: "Account deleted"),
            error: nil
        )
        mock.stub("/me/delete-account", result: response)

        try await service.deleteAccount(confirmationPhrase: "supprimer mon compte")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/delete-account")
    }

    func test_deleteAccount_propagatesNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            try await service.deleteAccount(confirmationPhrase: "DELETE")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // expected
            } else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func test_deleteAccount_propagatesServerError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 403, message: "Forbidden")

        do {
            try await service.deleteAccount(confirmationPhrase: "DELETE")
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
