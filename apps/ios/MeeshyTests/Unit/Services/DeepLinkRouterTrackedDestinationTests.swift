import XCTest
@testable import Meeshy
import MeeshySDK

/// B1 — `DeepLinkRouter.trackedDestination` maps a resolved `/l/<token>` to a
/// `DeepLink`. Pure function: conversation → join (token = linkId), post/reel/
/// status → postDetail, story → storyDetail, profile → userProfile; unknown /
/// expired / missing id → join fallback (backward compatible).
@MainActor
final class DeepLinkRouterTrackedDestinationTests: XCTestCase {

    private func resolved(kind: String? = nil, type: String? = nil,
                          targetId: String? = nil, isActive: Bool? = true) -> ResolvedTrackedLink {
        ResolvedTrackedLink(kind: kind, targetType: type, targetId: targetId,
                            originalUrl: nil, sharerId: nil, isActive: isActive, expiresAt: nil)
    }

    func test_conversation_routesToJoinLink_withToken() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(kind: "conversation", type: "CONVERSATION", targetId: "conv1"), token: "mshy_x")
        XCTAssertEqual(d, .joinLink(identifier: "mshy_x"))
    }

    func test_reel_routesToPostDetail() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(kind: "tracking", type: "REEL", targetId: "p1"), token: "tok")
        XCTAssertEqual(d, .postDetail(postId: "p1"))
    }

    func test_post_and_status_routeToPostDetail() {
        XCTAssertEqual(
            DeepLinkRouter.trackedDestination(for: resolved(type: "POST", targetId: "p1"), token: "tok"),
            .postDetail(postId: "p1"))
        XCTAssertEqual(
            DeepLinkRouter.trackedDestination(for: resolved(type: "STATUS", targetId: "p2"), token: "tok"),
            .postDetail(postId: "p2"))
    }

    func test_story_routesToStoryDetail() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(type: "STORY", targetId: "s1"), token: "tok")
        XCTAssertEqual(d, .storyDetail(postId: "s1"))
    }

    func test_profile_routesToUserProfile() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(type: "PROFILE", targetId: "u1"), token: "tok")
        XCTAssertEqual(d, .userProfile(username: "u1"))
    }

    func test_expiredLink_fallsBackToJoinLink_withToken() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(type: "REEL", targetId: "p1", isActive: false), token: "tok")
        XCTAssertEqual(d, .joinLink(identifier: "tok"))
    }

    func test_nilResolution_fallsBackToJoinLink_withToken() {
        XCTAssertEqual(DeepLinkRouter.trackedDestination(for: nil, token: "tok"),
                       .joinLink(identifier: "tok"))
    }

    func test_missingTargetId_fallsBackToJoinLink_withToken() {
        let d = DeepLinkRouter.trackedDestination(
            for: resolved(type: "POST", targetId: nil), token: "tok")
        XCTAssertEqual(d, .joinLink(identifier: "tok"))
    }
}
