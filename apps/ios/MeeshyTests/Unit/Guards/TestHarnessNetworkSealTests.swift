import XCTest
import MeeshySDK
@testable import Meeshy

/// #10854 — l'hôte de test ne parle à AUCUN serveur, quel que soit
/// l'environnement choisi dans l'app.
final class TestHarnessNetworkSealTests: XCTestCase {

    func test_shouldSeal_underXCTestWithoutOptIn_isTrue() {
        XCTAssertTrue(TestHarnessNetworkSeal.shouldSeal(environment: ["XCTestConfigurationFilePath": "/tmp/x"]))
    }

    func test_shouldSeal_outsideXCTest_isFalse() {
        XCTAssertFalse(TestHarnessNetworkSeal.shouldSeal(environment: ["HOME": "/Users/x"]))
    }

    func test_shouldSeal_withLiveNetworkOptIn_isFalse() {
        XCTAssertFalse(TestHarnessNetworkSeal.shouldSeal(environment: [
            "XCTestConfigurationFilePath": "/tmp/x",
            TestHarnessNetworkSeal.liveNetworkOptInKey: "1",
        ]))
    }

    func test_thisProcess_isSealed() throws {
        try skipUnlessSealed()
        XCTAssertTrue(TestHarnessNetworkSeal.isInstalled)
    }

    func test_sharedSession_requestToProduction_isRefused() async throws {
        try skipUnlessSealed()
        try await assertRefused(session: .shared, url: "https://gate.meeshy.me/api/v1/reactions", method: "POST")
    }

    func test_defaultConfigurationSession_requestToStaging_isRefused() async throws {
        try skipUnlessSealed()
        let session = URLSession(configuration: .default)
        try await assertRefused(session: session, url: "https://gate.staging.meeshy.me/api/v1/conversations", method: "POST")
    }

    func test_ephemeralConfigurationSession_requestToStatic_isRefused() async throws {
        try skipUnlessSealed()
        let session = URLSession(configuration: .ephemeral)
        try await assertRefused(session: session, url: "https://static.meeshy.me/u/i/x.png", method: "GET")
    }

    func test_apiClientSession_requestToConfiguredServer_isRefused() async throws {
        try skipUnlessSealed()
        let url = "\(MeeshyConfig.shared.apiBaseURL)/conversations"
        try await assertRefused(session: APIClient.shared.urlSession, url: url, method: "POST")
    }

    func test_socketTransport_isSealed_soNoSocketOpens() throws {
        try skipUnlessSealed()
        XCTAssertTrue(SocketConfig.isTransportSealed)
        XCTAssertNil(SocketConfig.baseURL)
    }

    func test_testOwnURLProtocol_keepsPrecedenceOverTheSeal() async throws {
        try skipUnlessSealed()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [EchoProtocol.self] + (configuration.protocolClasses ?? [])
        let (data, _) = try await URLSession(configuration: configuration)
            .data(from: XCTUnwrap(URL(string: "https://gate.meeshy.me/echo")))
        XCTAssertEqual(String(decoding: data, as: UTF8.self), "echo")
    }

    // MARK: - Helpers

    private func skipUnlessSealed() throws {
        try XCTSkipUnless(
            TestHarnessNetworkSeal.shouldSeal(environment: ProcessInfo.processInfo.environment),
            "Phase réseau réel (MEESHY_TEST_LIVE_NETWORK=1) : le sceau est volontairement levé."
        )
    }

    private func assertRefused(session: URLSession, url: String, method: String,
                               file: StaticString = #filePath, line: UInt = #line) async throws {
        var request = URLRequest(url: try XCTUnwrap(URL(string: url)))
        request.httpMethod = method
        let before = NetworkTransportSeal.refusedCount
        do {
            _ = try await session.data(for: request)
            XCTFail("\(method) \(url) est parti sur le réseau", file: file, line: line)
        } catch let error as URLError {
            XCTAssertEqual(error.code, .notConnectedToInternet, file: file, line: line)
        }
        XCTAssertGreaterThan(NetworkTransportSeal.refusedCount, before, file: file, line: line)
    }
}

private final class EchoProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("echo".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
