import XCTest
import CryptoKit
@testable import Meeshy

final class E2ESessionManagerTests: XCTestCase {

    // The SessionManager is an actor with tight coupling to E2EAPI, E2EEService, and KeychainManager.
    // We test the error types, peer tracking via UserDefaults, and the session error descriptions.

    // MARK: - SessionError

    func test_sessionError_invalidBase64Payload_hasDescription() {
        let error = SessionManager.SessionError.invalidBase64Payload
        XCTAssertEqual(error.errorDescription, "Invalid base64 payload from backend")
    }

    func test_sessionError_missingSession_hasDescription() {
        let error = SessionManager.SessionError.missingSession
        XCTAssertEqual(error.errorDescription, "Session not initialized and senderIdentityPublic missing")
    }

    func test_sessionError_invalidBase64Payload_isLocalizedError() {
        let error: any LocalizedError = SessionManager.SessionError.invalidBase64Payload
        XCTAssertNotNil(error.errorDescription)
    }

    func test_sessionError_missingSession_isLocalizedError() {
        let error: any LocalizedError = SessionManager.SessionError.missingSession
        XCTAssertNotNil(error.errorDescription)
    }

    // MARK: - SessionError Equatable

    func test_sessionErrors_areDifferent() {
        let error1 = SessionManager.SessionError.invalidBase64Payload
        let error2 = SessionManager.SessionError.missingSession
        XCTAssertNotEqual(error1.errorDescription, error2.errorDescription)
    }

    // MARK: - Shared Instance

    func test_shared_returnsSameInstance() async {
        let a = SessionManager.shared
        let b = SessionManager.shared
        XCTAssertTrue(a === b)
    }
}
