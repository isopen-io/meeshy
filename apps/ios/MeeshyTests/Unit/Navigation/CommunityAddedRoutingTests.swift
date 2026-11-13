import XCTest
@testable import Meeshy
import MeeshySDK

/// « Ajouté à la communauté Y » (#18052) : toucher la notification ouvre la
/// COMMUNAUTÉ — depuis le push, la bannière in-app et la liste, sur iPhone comme
/// sur iPad. Gardes de SOURCE, même convention que
/// `ContactRecentlyActiveRoutingTests` : les aiguillages vivent dans des vues
/// SwiftUI lourdes. Le contexte qui porte `communityId` depuis les trois sources
/// est construit, lui, en vrai.
final class CommunityAddedRoutingTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func communityBranch(in source: String) -> String? {
        guard let start = source.range(of: "case .communityInvite, .communityJoined") else { return nil }
        let rest = source[start.upperBound...]
        guard let end = rest.range(of: "\n        case .") else { return nil }
        return String(rest[..<end.lowerBound])
    }

    func test_navigateFromNotification_communityInvite_opensTheCommunityDetail_onIPhone() throws {
        let branch = try XCTUnwrap(communityBranch(in: source("Meeshy/Features/Main/Views/RootNotificationNavigator.swift")))
        XCTAssertTrue(branch.contains("router.push(.communityDetail(communityId))"))
        XCTAssertTrue(branch.contains("ctx.communityId"))
    }

    func test_navigateFromNotification_communityInvite_opensTheCommunityDetail_onIPad() throws {
        let branch = try XCTUnwrap(communityBranch(in: source("Meeshy/Features/Main/Views/iPadRootView+Navigation.swift")))
        XCTAssertTrue(branch.contains("rightPanelRoute = .communityDetail(communityId)"))
        XCTAssertTrue(branch.contains("ctx.communityId"))
    }

    @MainActor
    func test_navContext_carriesTheCommunity_fromThePush() {
        let payload = NotificationPayload(userInfo: ["type": "community_invite", "communityId": "c1"])
        XCTAssertEqual(RootView.NotificationNavContext(from: payload).communityId, "c1")
    }
}
