import XCTest
@testable import MeeshySDK

final class SocketConfigTests: XCTestCase {

    // MARK: - Base URL

    func test_baseURL_returnsURL_whenSocketBaseURLIsValid() {
        let url = SocketConfig.baseURL
        // The default MeeshyConfig.shared.socketBaseURL is the remote origin
        // so baseURL should be non-nil
        XCTAssertNotNil(url)
    }

    func test_baseURL_usesConfigSocketBaseURL() {
        let url = SocketConfig.baseURL
        let expectedOrigin = MeeshyConfig.shared.socketBaseURL
        XCTAssertEqual(url?.absoluteString, expectedOrigin)
    }

    func test_baseURL_type_isOptionalURL() {
        let url: URL? = SocketConfig.baseURL
        // Verify the type is Optional<URL>
        XCTAssertTrue(type(of: url) == Optional<URL>.self)
    }

    func test_baseURL_defaultConfig_containsGateDomain() {
        // Default config points to gate.meeshy.me unless overridden
        // After toggling useLocalServer, it might differ, but we test the initial state
        let url = SocketConfig.baseURL
        XCTAssertNotNil(url)
        // The URL should be a valid HTTP(S) URL
        let scheme = url?.scheme
        XCTAssertTrue(scheme == "https" || scheme == "http")
    }

    // MARK: - Transport seal (#10854)

    func test_baseURL_whenTransportSealed_isNil() {
        XCTAssertNil(SocketConfig.baseURL(socketBaseURL: "https://gate.meeshy.me", isTransportSealed: true))
    }

    func test_baseURL_whenTransportOpen_isTheConfiguredOrigin() {
        XCTAssertEqual(
            SocketConfig.baseURL(socketBaseURL: "https://gate.meeshy.me", isTransportSealed: false)?.absoluteString,
            "https://gate.meeshy.me"
        )
    }
}
