import XCTest
@testable import MeeshySDK

final class APIErrorTests: XCTestCase {

    // MARK: - APIError

    func testInvalidURLDescription() {
        let error = APIError.invalidURL
        XCTAssertEqual(error.errorDescription, "Invalid URL")
    }

    func testNoDataDescription() {
        let error = APIError.noData
        XCTAssertEqual(error.errorDescription, "No data received")
    }

    func testDecodingErrorDescription() {
        let underlying = NSError(domain: "test", code: 0, userInfo: [NSLocalizedDescriptionKey: "bad format"])
        let error = APIError.decodingError(underlying)

        let description = error.errorDescription ?? ""
        XCTAssertTrue(description.hasPrefix("Decoding error:"))
    }

    func testServerErrorWithMessageDescription() {
        let error = APIError.serverError(500, "Internal")
        XCTAssertEqual(error.errorDescription, "Server error 500: Internal")
    }

    func testServerErrorWithNilMessageDescription() {
        let error = APIError.serverError(404, nil)
        XCTAssertEqual(error.errorDescription, "Server error 404: Unknown")
    }

    func testNetworkErrorDescription() {
        let underlying = NSError(domain: "test", code: -1, userInfo: [NSLocalizedDescriptionKey: "offline"])
        let error = APIError.networkError(underlying)

        let description = error.errorDescription ?? ""
        XCTAssertTrue(description.hasPrefix("Network error:"))
    }

    func testUnauthorizedDescription() {
        let error = APIError.unauthorized
        XCTAssertEqual(error.errorDescription, "Authentication required")
    }

    // MARK: - NetworkError

    func testNoConnectionDescription() {
        XCTAssertEqual(NetworkError.noConnection.errorDescription, "Pas de connexion internet")
    }

    func testTimeoutDescription() {
        XCTAssertEqual(NetworkError.timeout.errorDescription, "La requete a expire")
    }

    func testServerUnreachableDescription() {
        XCTAssertEqual(NetworkError.serverUnreachable.errorDescription, "Serveur inaccessible")
    }

    // MARK: - AuthError

    func testInvalidCredentialsDescription() {
        XCTAssertEqual(AuthError.invalidCredentials.errorDescription, "Identifiants invalides")
    }

    func testSessionExpiredDescription() {
        XCTAssertEqual(AuthError.sessionExpired.errorDescription, "Session expiree, veuillez vous reconnecter")
    }

    func testAccountLockedDescription() {
        XCTAssertEqual(AuthError.accountLocked.errorDescription, "Compte verrouille")
    }

    func testRegistrationFailedDescriptionContainsReason() {
        let error = AuthError.registrationFailed("email taken")

        let description = error.errorDescription ?? ""
        XCTAssertTrue(description.contains("email taken"))
    }

    // MARK: - MessageError

    func testSendFailedDescription() {
        XCTAssertEqual(MessageError.sendFailed.errorDescription, "Echec de l'envoi du message")
    }

    func testDeleteFailedDescription() {
        XCTAssertEqual(MessageError.deleteFailed.errorDescription, "Echec de la suppression du message")
    }

    func testEditFailedDescription() {
        XCTAssertEqual(MessageError.editFailed.errorDescription, "Echec de la modification du message")
    }

    func testTooLongDescriptionContainsMaxLength() {
        let error = MessageError.tooLong(maxLength: 5000)

        let description = error.errorDescription ?? ""
        XCTAssertTrue(description.contains("5000"))
    }

    // MARK: - MediaError

    func testUploadFailedDescription() {
        XCTAssertEqual(MediaError.uploadFailed.errorDescription, "Echec de l'envoi du fichier")
    }

    func testUnsupportedFormatDescription() {
        XCTAssertEqual(MediaError.unsupportedFormat.errorDescription, "Format de fichier non supporte")
    }

    func testCompressionFailedDescription() {
        XCTAssertEqual(MediaError.compressionFailed.errorDescription, "Echec de la compression")
    }

    func testFileTooLargeDescriptionContainsMaxMB() {
        let error = MediaError.fileTooLarge(maxMB: 25)

        let description = error.errorDescription ?? ""
        XCTAssertTrue(description.contains("25"))
    }

    // MARK: - MeeshyError errorDescription delegation

    func testNetworkErrorDelegatesToNetworkError() {
        let error = MeeshyError.network(.noConnection)
        XCTAssertEqual(error.errorDescription, "Pas de connexion internet")
    }

    func testAuthErrorDelegatesToAuthError() {
        let error = MeeshyError.auth(.sessionExpired)
        XCTAssertEqual(error.errorDescription, "Session expiree, veuillez vous reconnecter")
    }

    func testServerErrorUsesMessage() {
        let error = MeeshyError.server(statusCode: 500, message: "Internal")
        XCTAssertEqual(error.errorDescription, "Internal")
    }

    func testUnknownErrorDelegatesToUnderlyingError() {
        let underlying = NSError(domain: "test", code: 42, userInfo: [NSLocalizedDescriptionKey: "something broke"])
        let error = MeeshyError.unknown(underlying)
        XCTAssertEqual(error.errorDescription, "something broke")
    }

    // MARK: - MeeshyError iconName

    func testNetworkIconName() {
        XCTAssertEqual(MeeshyError.network(.noConnection).iconName, "wifi.slash")
    }

    func testAuthIconName() {
        XCTAssertEqual(MeeshyError.auth(.invalidCredentials).iconName, "lock.fill")
    }

    func testServerIconName() {
        XCTAssertEqual(MeeshyError.server(statusCode: 500, message: "").iconName, "server.rack")
    }

    func testMessageIconName() {
        XCTAssertEqual(MeeshyError.message(.sendFailed).iconName, "bubble.left.and.exclamationmark.bubble.right")
    }

    func testMediaIconName() {
        XCTAssertEqual(MeeshyError.media(.uploadFailed).iconName, "photo.badge.exclamationmark")
    }

    func testUnknownIconName() {
        let error = MeeshyError.unknown(NSError(domain: "", code: 0))
        XCTAssertEqual(error.iconName, "exclamationmark.triangle.fill")
    }

    // MARK: - MeeshyError.from(_:) factory

    func testFromMeeshyErrorPassesThrough() {
        let original = MeeshyError.network(.timeout)
        let converted = MeeshyError.from(original)

        guard case .network(.timeout) = converted else {
            XCTFail("Expected .network(.timeout), got \(converted)")
            return
        }
    }

    func testFromAPIErrorUnauthorizedConvertsToAuthSessionExpired() {
        let converted = MeeshyError.from(APIError.unauthorized)

        guard case .auth(.sessionExpired) = converted else {
            XCTFail("Expected .auth(.sessionExpired), got \(converted)")
            return
        }
    }

    func testFromAPIErrorInvalidURLConvertsToServer() {
        let converted = MeeshyError.from(APIError.invalidURL)

        guard case .server(let statusCode, _) = converted else {
            XCTFail("Expected .server, got \(converted)")
            return
        }
        XCTAssertEqual(statusCode, 0)
    }

    func testFromAPIErrorNoDataConvertsToServer() {
        let converted = MeeshyError.from(APIError.noData)

        guard case .server(let statusCode, _) = converted else {
            XCTFail("Expected .server, got \(converted)")
            return
        }
        XCTAssertEqual(statusCode, 0)
    }

    func testFromAPIErrorDecodingConvertsToServer() {
        let underlying = NSError(domain: "decode", code: 0)
        let converted = MeeshyError.from(APIError.decodingError(underlying))

        guard case .server(let statusCode, _) = converted else {
            XCTFail("Expected .server, got \(converted)")
            return
        }
        XCTAssertEqual(statusCode, 0)
    }

    func testFromAPIErrorServerError401ConvertsToAuthSessionExpired() {
        let converted = MeeshyError.from(APIError.serverError(401, "Unauthorized"))

        guard case .auth(.sessionExpired) = converted else {
            XCTFail("Expected .auth(.sessionExpired), got \(converted)")
            return
        }
    }

    func testFromAPIErrorServerError403ConvertsToAuthAccountLocked() {
        let converted = MeeshyError.from(APIError.serverError(403, "Forbidden"))

        guard case .auth(.accountLocked) = converted else {
            XCTFail("Expected .auth(.accountLocked), got \(converted)")
            return
        }
    }

    func testFromAPIErrorServerError500ConvertsToServer() {
        let converted = MeeshyError.from(APIError.serverError(500, "Internal"))

        guard case .server(let statusCode, let message) = converted else {
            XCTFail("Expected .server, got \(converted)")
            return
        }
        XCTAssertEqual(statusCode, 500)
        XCTAssertEqual(message, "Internal")
    }

    func testFromAPIErrorNetworkWithURLErrorConvertsToNetwork() {
        let urlError = URLError(.notConnectedToInternet)
        let converted = MeeshyError.from(APIError.networkError(urlError))

        guard case .network(.noConnection) = converted else {
            XCTFail("Expected .network(.noConnection), got \(converted)")
            return
        }
    }

    func testFromURLErrorNotConnectedConvertsToNetworkNoConnection() {
        let converted = MeeshyError.from(URLError(.notConnectedToInternet))

        guard case .network(.noConnection) = converted else {
            XCTFail("Expected .network(.noConnection), got \(converted)")
            return
        }
    }

    func testFromURLErrorTimedOutConvertsToNetworkTimeout() {
        let converted = MeeshyError.from(URLError(.timedOut))

        guard case .network(.timeout) = converted else {
            XCTFail("Expected .network(.timeout), got \(converted)")
            return
        }
    }

    func testFromURLErrorCannotConnectToHostConvertsToServerUnreachable() {
        let converted = MeeshyError.from(URLError(.cannotConnectToHost))

        guard case .network(.serverUnreachable) = converted else {
            XCTFail("Expected .network(.serverUnreachable), got \(converted)")
            return
        }
    }

    func testFromDecodingErrorConvertsToServer() {
        let context = DecodingError.Context(codingPath: [], debugDescription: "test")
        let decodingError = DecodingError.dataCorrupted(context)
        let converted = MeeshyError.from(decodingError)

        guard case .server(let statusCode, _) = converted else {
            XCTFail("Expected .server, got \(converted)")
            return
        }
        XCTAssertEqual(statusCode, 0)
    }

    func testFromRandomNSErrorConvertsToUnknown() {
        let nsError = NSError(domain: "com.test", code: 999, userInfo: [NSLocalizedDescriptionKey: "random failure"])
        let converted = MeeshyError.from(nsError)

        guard case .unknown = converted else {
            XCTFail("Expected .unknown, got \(converted)")
            return
        }
    }
}
