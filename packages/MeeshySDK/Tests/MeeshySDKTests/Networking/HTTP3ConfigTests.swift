import XCTest
@testable import MeeshySDK

/// Tests for SOTA P11 — HTTP/3 optimistic mode and URLSession exposure on `APIClient`.
///
/// Note: `assumesHTTP3Capable` is a property on `URLRequest` (iOS 14.5+), not on
/// `URLSessionConfiguration`. Per-request flag application is tested via build-time
/// code review; these tests assert the architectural contract: `urlSession` is
/// accessible and uses a non-ephemeral configuration with the expected timeouts.
@MainActor
final class HTTP3ConfigTests: XCTestCase {

    /// `APIClient.urlSession` must be accessible (public) for test introspection
    /// and for the upload pipeline that may need custom delegate hooks.
    func test_apiClient_urlSession_isAccessible() {
        let client = APIClient.shared
        // If urlSession were private, this line would not compile.
        let session = client.urlSession
        XCTAssertNotNil(session)
    }

    /// The configuration must remain default-style (not ephemeral) so that
    /// cookies and the URL cache continue to work for the rest of the API surface.
    func test_apiClient_urlSessionConfiguration_isPersistent() {
        let client = APIClient.shared
        XCTAssertNotNil(
            client.urlSession.configuration.urlCache,
            "APIClient.urlSession must keep a URLCache (not ephemeral configuration)"
        )
    }

    /// Request timeout must match the expected value.
    func test_apiClient_urlSessionConfiguration_hasExpectedTimeout() {
        let client = APIClient.shared
        XCTAssertEqual(
            client.urlSession.configuration.timeoutIntervalForRequest,
            60,
            accuracy: 0.1,
            "Request timeout must be 60 seconds"
        )
    }

    /// #10927 — Traefik n'écoute pas l'UDP 443 : une requête qui SUPPOSE
    /// HTTP/3 tente QUIC d'abord, attend son échec, puis retombe en TCP.
    /// Mesuré +150 ms par connexion neuve (0,42–0,53 s contre 0,30–0,37 s).
    /// La découverte Alt-Svc reste celle du système : si le serveur annonce
    /// un jour HTTP/3, URLSession le prend de lui-même.
    func test_requestWithHeaders_doesNotAssumeHTTP3() async throws {
        HTTP3CaptureProtocol.reset()
        let _: SimpleAPIResponse = try await makeCapturingClient().requestWithHeaders(
            AuthEndpoint.login, method: "POST", body: Data("{}".utf8))

        XCTAssertEqual(HTTP3CaptureProtocol.assumesHTTP3, [false])
    }

    func test_requestPinned_doesNotAssumeHTTP3() async throws {
        HTTP3CaptureProtocol.reset()
        let _: SimpleAPIResponse = try await makeCapturingClient().requestPinned(
            AuthEndpoint.logout, method: "POST", body: nil, headers: [:], bearerToken: "tok-pinned")

        XCTAssertEqual(HTTP3CaptureProtocol.assumesHTTP3, [false])
    }

    private func makeCapturingClient() -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [HTTP3CaptureProtocol.self]
        return APIClient(urlSession: URLSession(configuration: config))
    }
}

private final class HTTP3CaptureProtocol: URLProtocol {
    nonisolated(unsafe) static var assumesHTTP3: [Bool] = []

    static func reset() { assumesHTTP3 = [] }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }

    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override nonisolated func startLoading() {
        Self.assumesHTTP3.append(request.assumesHTTP3Capable)
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.meeshy.test")!,
            statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"success":true}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}
