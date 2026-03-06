import XCTest
@testable import MeeshySDK

final class MeeshyConfigTests: XCTestCase {

    private let defaultAPIURL = "https://gate.meeshy.me/api/v1"

    override func tearDown() {
        super.tearDown()
        MeeshyConfig.shared.configure(apiURL: defaultAPIURL, bundleId: "me.meeshy.app")
    }

    // MARK: - Default Values

    func testDefaultApiBaseURL() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: defaultAPIURL)
        XCTAssertEqual(config.apiBaseURL, "https://gate.meeshy.me/api/v1")
    }

    func testDefaultAppBundleId() {
        let config = MeeshyConfig.shared
        XCTAssertEqual(config.appBundleId, "me.meeshy.app")
    }

    // MARK: - configure()

    func testConfigureSetsApiBaseURL() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://custom.api.com/api/v2")
        XCTAssertEqual(config.apiBaseURL, "https://custom.api.com/api/v2")
    }

    func testConfigureSetsBundleId() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: defaultAPIURL, bundleId: "com.custom.bundle")
        XCTAssertEqual(config.appBundleId, "com.custom.bundle")
    }

    func testConfigureWithNilBundleIdPreservesExisting() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: defaultAPIURL, bundleId: "com.test.app")
        config.configure(apiURL: defaultAPIURL)
        XCTAssertEqual(config.appBundleId, "com.test.app")
    }

    // MARK: - serverOrigin Computed Property

    func testServerOriginExtractsSchemeAndHost() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.meeshy.me/api/v1")
        XCTAssertEqual(config.serverOrigin, "https://gate.meeshy.me")
    }

    func testServerOriginPreservesPort() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "http://localhost:3000/api/v1")
        XCTAssertEqual(config.serverOrigin, "http://localhost:3000")
    }

    func testServerOriginWithDeepPath() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://api.example.com/v2/deep/path")
        XCTAssertEqual(config.serverOrigin, "https://api.example.com")
    }

    // MARK: - socketBaseURL Computed Property

    func testSocketBaseURLMatchesServerOrigin() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.meeshy.me/api/v1")
        XCTAssertEqual(config.socketBaseURL, config.serverOrigin)
    }

    // MARK: - resolveMediaURL()

    func testResolveMediaURLResolvesRelativePath() {
        MeeshyConfig.shared.configure(apiURL: defaultAPIURL)
        let url = MeeshyConfig.resolveMediaURL("/api/v1/attachments/file/abc123")
        XCTAssertEqual(url?.absoluteString, "https://gate.meeshy.me/api/v1/attachments/file/abc123")
    }

    func testResolveMediaURLResolvesRelativePathWithoutLeadingSlash() {
        MeeshyConfig.shared.configure(apiURL: defaultAPIURL)
        let url = MeeshyConfig.resolveMediaURL("api/v1/attachments/file/abc123")
        XCTAssertEqual(url?.absoluteString, "https://gate.meeshy.me/api/v1/attachments/file/abc123")
    }

    func testResolveMediaURLReturnsAbsoluteHTTPSAsIs() {
        let url = MeeshyConfig.resolveMediaURL("https://cdn.example.com/image.png")
        XCTAssertEqual(url?.absoluteString, "https://cdn.example.com/image.png")
    }

    func testResolveMediaURLRejectsPlainHTTPForRemote() {
        let url = MeeshyConfig.resolveMediaURL("http://cdn.example.com/image.png")
        XCTAssertNil(url)
    }

    // MARK: - SSRF Protection

    func testResolveMediaURLRejectsLoopback127() {
        let url = MeeshyConfig.resolveMediaURL("https://127.0.0.1/secret")
        XCTAssertNil(url)
    }

    func testResolveMediaURLRejects10Network() {
        let url = MeeshyConfig.resolveMediaURL("https://10.0.0.1/secret")
        XCTAssertNil(url)
    }

    func testResolveMediaURLRejects192168Network() {
        let url = MeeshyConfig.resolveMediaURL("https://192.168.1.1/secret")
        XCTAssertNil(url)
    }

    func testResolveMediaURLRejects172PrivateRange() {
        for second in [16, 20, 31] {
            let url = MeeshyConfig.resolveMediaURL("https://172.\(second).0.1/secret")
            XCTAssertNil(url, "Should reject 172.\(second).x.x")
        }
    }

    func testResolveMediaURLRejectsLinkLocal169254() {
        let url = MeeshyConfig.resolveMediaURL("https://169.254.1.1/secret")
        XCTAssertNil(url)
    }

    func testResolveMediaURLAllows172OutsidePrivateRange() {
        let url = MeeshyConfig.resolveMediaURL("https://172.32.0.1/page")
        XCTAssertNotNil(url)
    }

    // MARK: - Localhost in Dev

    func testResolveMediaURLAllowsLocalhostHTTPWhenConfiguredLocally() {
        MeeshyConfig.shared.setUseLocalGateway(true)
        let url = MeeshyConfig.resolveMediaURL("http://localhost:3000/api/v1/attachments/file/abc")
        XCTAssertNotNil(url)
        XCTAssertEqual(url?.host, "localhost")
    }

    func testResolveMediaURLAllowsLocalhostHTTPAlways() {
        let url = MeeshyConfig.resolveMediaURL("http://localhost/resource")
        XCTAssertNotNil(url)
    }

    // MARK: - Nil/Empty Input

    func testResolveMediaURLResolvesEmptyStringToServerRoot() {
        MeeshyConfig.shared.configure(apiURL: defaultAPIURL)
        let url = MeeshyConfig.resolveMediaURL("")
        XCTAssertEqual(url?.absoluteString, "https://gate.meeshy.me/")
    }

    // MARK: - setUseLocalGateway

    func testSetUseLocalGatewayTrueSwitchesToLocalhost() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: defaultAPIURL)
        config.setUseLocalGateway(true)
        XCTAssertTrue(config.apiBaseURL.hasPrefix("http://localhost:3000"))
        XCTAssertTrue(config.apiBaseURL.hasSuffix("/api/v1"))
    }

    func testSetUseLocalGatewayFalseRestoresRemoteURL() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: defaultAPIURL)
        config.setUseLocalGateway(true)
        config.setUseLocalGateway(false)
        XCTAssertEqual(config.apiBaseURL, "https://gate.meeshy.me/api/v1")
    }

    func testSetUseLocalGatewayPreservesAPIPath() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.meeshy.me/api/v2")
        config.setUseLocalGateway(true)
        XCTAssertEqual(config.apiBaseURL, "http://localhost:3000/api/v2")
    }

    // MARK: - Version Constant

    func testVersionConstant() {
        XCTAssertEqual(MeeshySDK.version, "1.0.0")
    }
}
