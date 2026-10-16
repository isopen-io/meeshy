import XCTest
@testable import MeeshySDK

final class SocketConfigTests: XCTestCase {

    // MARK: - Base URL
    //
    // Le bundle de test est scellé (#10854) : `SocketConfig.baseURL` y est nil.
    // L'origine configurée se lit par la fonction pure, transport ouvert.

    private var openBaseURL: URL? {
        SocketConfig.baseURL(socketBaseURL: MeeshyConfig.shared.socketBaseURL, isTransportSealed: false)
    }

    func test_baseURL_returnsURL_whenSocketBaseURLIsValid() {
        XCTAssertNotNil(openBaseURL)
    }

    func test_baseURL_usesConfigSocketBaseURL() {
        XCTAssertEqual(openBaseURL?.absoluteString, MeeshyConfig.shared.socketBaseURL)
    }

    func test_baseURL_type_isOptionalURL() {
        let url: URL? = SocketConfig.baseURL
        XCTAssertTrue(type(of: url) == Optional<URL>.self)
    }

    func test_baseURL_defaultConfig_containsGateDomain() {
        let scheme = openBaseURL?.scheme
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

    func test_baseURL_withLoopbackOrigin_isThatOrigin_evenSealed() {
        let origin = URL(string: "http://127.0.0.1:9")
        SocketConfig.$loopbackOrigin.withValue(origin) {
            XCTAssertEqual(SocketConfig.baseURL, origin)
        }
    }

    func test_baseURL_withANonLoopbackOrigin_ignoresIt() {
        SocketConfig.$loopbackOrigin.withValue(URL(string: "https://gate.meeshy.me")) {
            XCTAssertEqual(
                SocketConfig.baseURL,
                SocketConfig.baseURL(socketBaseURL: MeeshyConfig.shared.socketBaseURL,
                                     isTransportSealed: SocketConfig.isTransportSealed)
            )
        }
    }
}
