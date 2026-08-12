import XCTest
@testable import MeeshySDK

/// B1 — TrackedLinkService resolves a `/l/<token>` to its typed target via the
/// gateway, and records a click best-effort. Uses MockAPIClient (no network).
final class TrackedLinkServiceTests: XCTestCase {

    func test_resolve_decodesTypedTarget() async throws {
        let mock = MockAPIClient()
        let resolved = ResolvedTrackedLink(
            kind: "tracking", targetType: "REEL", targetId: "post1",
            originalUrl: "https://meeshy.me/reel/post1", sharerId: nil,
            isActive: true, expiresAt: nil
        )
        mock.stub("/tracking-links/tok/resolve",
                  result: APIResponse(success: true, data: resolved, error: nil))

        let service = TrackedLinkService(api: mock)
        let r = try await service.resolve(token: "tok")

        XCTAssertEqual(r.kind, "tracking")
        XCTAssertEqual(r.targetType, "REEL")
        XCTAssertEqual(r.targetId, "post1")
        XCTAssertEqual(r.isActive, true)
    }

    func test_resolve_conversationFallback_carriesConversationKind() async throws {
        let mock = MockAPIClient()
        let resolved = ResolvedTrackedLink(
            kind: "conversation", targetType: "CONVERSATION", targetId: "conv1",
            originalUrl: nil, sharerId: nil, isActive: true, expiresAt: nil
        )
        mock.stub("/tracking-links/mshy_x/resolve",
                  result: APIResponse(success: true, data: resolved, error: nil))

        let r = try await TrackedLinkService(api: mock).resolve(token: "mshy_x")
        XCTAssertEqual(r.kind, "conversation")
        XCTAssertEqual(r.targetType, "CONVERSATION")
        XCTAssertEqual(r.targetId, "conv1")
    }

    func test_recordClick_isBestEffort_andNeverThrows() async {
        // No stub → the mock fails; recordClick must swallow it (best-effort).
        let service = TrackedLinkService(api: MockAPIClient())
        await service.recordClick(token: "tok")  // must not crash / not throw
    }
}
