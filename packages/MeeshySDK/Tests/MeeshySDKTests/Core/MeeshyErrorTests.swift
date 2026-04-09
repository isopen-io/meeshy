import XCTest
@testable import MeeshySDK

final class MeeshyErrorTests: XCTestCase {

    // MARK: - NetworkError

    func test_networkError_noConnection_hasDescription() {
        let error = NetworkError.noConnection
        XCTAssertNotNil(error.errorDescription)
        XCTAssertEqual(error.errorDescription, "Pas de connexion internet")
    }

    func test_networkError_timeout_hasDescription() {
        let error = NetworkError.timeout
        XCTAssertNotNil(error.errorDescription)
        XCTAssertEqual(error.errorDescription, "La requete a expire")
    }

    func test_networkError_serverUnreachable_hasDescription() {
        let error = NetworkError.serverUnreachable
        XCTAssertNotNil(error.errorDescription)
        XCTAssertEqual(error.errorDescription, "Serveur inaccessible")
    }

    // MARK: - AuthError

    func test_authError_invalidCredentials_hasDescription() {
        let error = AuthError.invalidCredentials
        XCTAssertNotNil(error.errorDescription)
        XCTAssertEqual(error.errorDescription, "Identifiants invalides")
    }

    func test_authError_sessionExpired_hasDescription() {
        let error = AuthError.sessionExpired
        XCTAssertNotNil(error.errorDescription)
    }

    func test_authError_accountLocked_hasDescription() {
        let error = AuthError.accountLocked
        XCTAssertNotNil(error.errorDescription)
        XCTAssertEqual(error.errorDescription, "Compte verrouille")
    }

    func test_authError_registrationFailed_includesReason() {
        let error = AuthError.registrationFailed("email taken")
        XCTAssertNotNil(error.errorDescription)
        XCTAssertTrue(error.errorDescription!.contains("email taken"))
    }

    // MARK: - MessageError

    func test_messageError_sendFailed_hasDescription() {
        let error = MessageError.sendFailed
        XCTAssertNotNil(error.errorDescription)
    }

    func test_messageError_deleteFailed_hasDescription() {
        let error = MessageError.deleteFailed
        XCTAssertNotNil(error.errorDescription)
    }

    func test_messageError_editFailed_hasDescription() {
        let error = MessageError.editFailed
        XCTAssertNotNil(error.errorDescription)
    }

    func test_messageError_tooLong_includesMaxLength() {
        let error = MessageError.tooLong(maxLength: 5000)
        XCTAssertNotNil(error.errorDescription)
        XCTAssertTrue(error.errorDescription!.contains("5000"))
    }

    // MARK: - MediaError

    func test_mediaError_uploadFailed_hasDescription() {
        let error = MediaError.uploadFailed
        XCTAssertNotNil(error.errorDescription)
    }

    func test_mediaError_fileTooLarge_includesMaxMB() {
        let error = MediaError.fileTooLarge(maxMB: 50)
        XCTAssertNotNil(error.errorDescription)
        XCTAssertTrue(error.errorDescription!.contains("50"))
    }

    func test_mediaError_unsupportedFormat_hasDescription() {
        let error = MediaError.unsupportedFormat
        XCTAssertNotNil(error.errorDescription)
    }

    func test_mediaError_compressionFailed_hasDescription() {
        let error = MediaError.compressionFailed
        XCTAssertNotNil(error.errorDescription)
    }

    // MARK: - MeeshyError wrapping

    func test_meeshyError_network_delegatesDescription() {
        let inner = NetworkError.timeout
        let error = MeeshyError.network(inner)
        XCTAssertEqual(error.errorDescription, inner.errorDescription)
    }

    func test_meeshyError_auth_delegatesDescription() {
        let inner = AuthError.sessionExpired
        let error = MeeshyError.auth(inner)
        XCTAssertEqual(error.errorDescription, inner.errorDescription)
    }

    func test_meeshyError_message_delegatesDescription() {
        let inner = MessageError.sendFailed
        let error = MeeshyError.message(inner)
        XCTAssertEqual(error.errorDescription, inner.errorDescription)
    }

    func test_meeshyError_media_delegatesDescription() {
        let inner = MediaError.uploadFailed
        let error = MeeshyError.media(inner)
        XCTAssertEqual(error.errorDescription, inner.errorDescription)
    }

    func test_meeshyError_server_returnsMessage() {
        let error = MeeshyError.server(statusCode: 500, message: "Internal error")
        XCTAssertEqual(error.errorDescription, "Internal error")
    }

    func test_meeshyError_unknown_returnsLocalizedDescription() {
        struct TestError: Error, LocalizedError {
            var errorDescription: String? { "test error desc" }
        }
        let error = MeeshyError.unknown(TestError())
        XCTAssertEqual(error.errorDescription, "test error desc")
    }

    // MARK: - Icon Names

    func test_meeshyError_network_iconName() {
        XCTAssertEqual(MeeshyError.network(.noConnection).iconName, "wifi.slash")
    }

    func test_meeshyError_auth_iconName() {
        XCTAssertEqual(MeeshyError.auth(.sessionExpired).iconName, "lock.fill")
    }

    func test_meeshyError_message_iconName() {
        XCTAssertEqual(MeeshyError.message(.sendFailed).iconName, "bubble.left.and.exclamationmark.bubble.right")
    }

    func test_meeshyError_media_iconName() {
        XCTAssertEqual(MeeshyError.media(.uploadFailed).iconName, "photo.badge.exclamationmark")
    }

    func test_meeshyError_server_iconName() {
        XCTAssertEqual(MeeshyError.server(statusCode: 500, message: "err").iconName, "server.rack")
    }

    func test_meeshyError_unknown_iconName() {
        let error = MeeshyError.unknown(NSError(domain: "", code: 0))
        XCTAssertEqual(error.iconName, "exclamationmark.triangle.fill")
    }

    // MARK: - MeeshyError.from() Factory

    func test_from_meeshyError_returnsItself() {
        let original = MeeshyError.network(.timeout)
        let result = MeeshyError.from(original)
        XCTAssertEqual(result.errorDescription, original.errorDescription)
    }

    func test_from_urlError_notConnected_mapsToNoConnection() {
        let urlError = URLError(.notConnectedToInternet)
        let result = MeeshyError.from(urlError)
        if case .network(.noConnection) = result {
            // Success
        } else {
            XCTFail("Expected .network(.noConnection), got \(result)")
        }
    }

    func test_from_urlError_timedOut_mapsToTimeout() {
        let urlError = URLError(.timedOut)
        let result = MeeshyError.from(urlError)
        if case .network(.timeout) = result {
            // Success
        } else {
            XCTFail("Expected .network(.timeout), got \(result)")
        }
    }

    func test_from_urlError_cannotConnectToHost_mapsToServerUnreachable() {
        let urlError = URLError(.cannotConnectToHost)
        let result = MeeshyError.from(urlError)
        if case .network(.serverUnreachable) = result {
            // Success
        } else {
            XCTFail("Expected .network(.serverUnreachable), got \(result)")
        }
    }

    func test_from_decodingError_mapsToServer() {
        let decodingError = DecodingError.dataCorrupted(
            DecodingError.Context(codingPath: [], debugDescription: "corrupted")
        )
        let result = MeeshyError.from(decodingError)
        if case .server(let code, _) = result {
            XCTAssertEqual(code, 0)
        } else {
            XCTFail("Expected .server, got \(result)")
        }
    }

    func test_from_genericError_mapsToUnknown() {
        struct SomeError: Error {}
        let result = MeeshyError.from(SomeError())
        if case .unknown = result {
            // Success
        } else {
            XCTFail("Expected .unknown, got \(result)")
        }
    }
}
