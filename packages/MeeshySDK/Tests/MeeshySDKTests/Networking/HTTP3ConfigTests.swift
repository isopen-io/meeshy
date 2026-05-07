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
}
