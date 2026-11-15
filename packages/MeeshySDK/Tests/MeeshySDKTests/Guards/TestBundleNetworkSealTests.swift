import XCTest
@testable import MeeshySDK
import MeeshyTestSupport

/// #10854 — un bundle de test du package ne parle à AUCUN serveur : le sceau
/// est posé au chargement du bundle, avant la première classe de test.
final class TestBundleNetworkSealTests: XCTestCase {

    func test_shouldSeal_withoutOptIn_isTrue() {
        XCTAssertTrue(TestBundleNetworkSeal.shouldSeal(environment: ["HOME": "/Users/x"]))
    }

    func test_shouldSeal_withLiveNetworkOptIn_isFalse() {
        XCTAssertFalse(TestBundleNetworkSeal.shouldSeal(environment: [TestBundleNetworkSeal.liveNetworkOptInKey: "1"]))
    }

    func test_thisBundle_isSealedFromItsLoad() throws {
        try skipUnlessSealed()
        XCTAssertTrue(NetworkTransportSeal.isInstalled)
    }

    func test_sharedSession_requestToProduction_isRefused() async throws {
        try skipUnlessSealed()
        try await assertRefused(session: .shared, url: "https://gate.meeshy.me/api/v1/reactions", method: "POST")
    }

    func test_defaultConfigurationSession_requestToProduction_isRefused() async throws {
        try skipUnlessSealed()
        let session = URLSession(configuration: .default)
        try await assertRefused(session: session, url: "https://gate.meeshy.me/api/v1/conversations", method: "POST")
    }

    func test_ephemeralConfigurationSession_requestToStaging_isRefused() async throws {
        try skipUnlessSealed()
        let session = URLSession(configuration: .ephemeral)
        try await assertRefused(session: session, url: "https://gate.staging.meeshy.me/api/v1/auth/me", method: "GET")
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

        MessageSocketManager.shared.disconnect()
        MessageSocketManager.shared.connectAnonymous(sessionToken: "anon_sealed")
        XCTAssertNil(MessageSocketManager.shared.socket, "aucune socket ne s'arme vers \(MeeshyConfig.shared.socketBaseURL)")
    }

    func test_testOwnURLProtocol_keepsPrecedenceOverTheSeal() async throws {
        try skipUnlessSealed()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [EchoProtocol.self] + (configuration.protocolClasses ?? [])
        let before = NetworkTransportSeal.refusedCount
        let (data, _) = try await URLSession(configuration: configuration)
            .data(from: XCTUnwrap(URL(string: "https://gate.meeshy.me/echo")))
        XCTAssertEqual(String(decoding: data, as: UTF8.self), "echo")
        XCTAssertEqual(NetworkTransportSeal.refusedCount, before)
    }

    func test_everyTestTargetOfThePackage_dependsOnTheSeal() throws {
        let manifest = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("Package.swift"),
            encoding: .utf8
        )
        let testTargets = manifest.components(separatedBy: ".testTarget(").dropFirst()
        XCTAssertFalse(testTargets.isEmpty)
        for declaration in testTargets {
            let body = declaration.components(separatedBy: "swiftSettings:").first ?? declaration
            let name = body.components(separatedBy: "\"").dropFirst().first ?? "?"
            XCTAssertTrue(body.contains("\"MeeshyTestSupport\""),
                          "la cible de test \(name) ne dépend pas de MeeshyTestSupport : elle joindrait le réseau")
        }
    }

    // MARK: - Helpers

    private func skipUnlessSealed() throws {
        try XCTSkipUnless(
            TestBundleNetworkSeal.shouldSeal(environment: ProcessInfo.processInfo.environment),
            "MEESHY_TEST_LIVE_NETWORK=1 : le sceau est volontairement levé."
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
        guard let url = request.url,
              let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("echo".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
