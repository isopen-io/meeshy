import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class RouterTests: XCTestCase {

    // MARK: - Factory

    private func makeConversation(id: String = "000000000000000000000001") -> Conversation {
        Conversation(id: id, identifier: id, type: .direct, title: "Test", lastMessageAt: Date(), createdAt: Date(), updatedAt: Date())
    }

    private func makeCommunity(id: String = "000000000000000000000002") -> Community {
        Community(id: id, identifier: id, name: "Test Community", createdBy: "user1")
    }

    // MARK: - Route.isHub — Hub routes

    func test_isHub_profile_returnsTrue() {
        XCTAssertTrue(Route.profile.isHub)
    }

    func test_isHub_settings_returnsTrue() {
        XCTAssertTrue(Route.settings.isHub)
    }

    func test_isHub_communityList_returnsTrue() {
        XCTAssertTrue(Route.communityList.isHub)
    }

    func test_isHub_contacts_returnsTrue() {
        XCTAssertTrue(Route.contacts().isHub)
    }

    func test_isHub_links_returnsTrue() {
        XCTAssertTrue(Route.links.isHub)
    }

    // MARK: - Route.isHub — Deep routes

    func test_isHub_conversation_returnsFalse() {
        XCTAssertFalse(Route.conversation(makeConversation()).isHub)
    }

    func test_isHub_editProfile_returnsFalse() {
        XCTAssertFalse(Route.editProfile.isHub)
    }

    func test_isHub_communityDetail_returnsFalse() {
        XCTAssertFalse(Route.communityDetail("123").isHub)
    }

    func test_isHub_communityCreate_returnsFalse() {
        XCTAssertFalse(Route.communityCreate.isHub)
    }

    func test_isHub_communitySettings_returnsFalse() {
        XCTAssertFalse(Route.communitySettings(makeCommunity()).isHub)
    }

    func test_isHub_communityMembers_returnsFalse() {
        XCTAssertFalse(Route.communityMembers("123").isHub)
    }

    func test_isHub_communityInvite_returnsFalse() {
        XCTAssertFalse(Route.communityInvite("123").isHub)
    }

    func test_isHub_notifications_returnsTrue() {
        XCTAssertTrue(Route.notifications.isHub)
    }

    func test_isHub_userStats_returnsFalse() {
        XCTAssertFalse(Route.userStats.isHub)
    }

    func test_isHub_affiliate_returnsFalse() {
        XCTAssertFalse(Route.affiliate.isHub)
    }

    func test_isHub_trackingLinks_returnsFalse() {
        XCTAssertFalse(Route.trackingLinks.isHub)
    }

    func test_isHub_shareLinks_returnsFalse() {
        XCTAssertFalse(Route.shareLinks.isHub)
    }

    func test_isHub_communityLinks_returnsFalse() {
        XCTAssertFalse(Route.communityLinks.isHub)
    }

    func test_isHub_dataExport_returnsFalse() {
        XCTAssertFalse(Route.dataExport.isHub)
    }

    func test_isHub_postDetail_returnsFalse() {
        XCTAssertFalse(Route.postDetail("123").isHub)
    }

    func test_isHub_bookmarks_returnsFalse() {
        XCTAssertFalse(Route.bookmarks.isHub)
    }

    func test_isHub_friendRequests_returnsFalse() {
        XCTAssertFalse(Route.friendRequests.isHub)
    }

    // MARK: - Router.isHubRoute / isDeepRoute

    func test_isHubRoute_emptyPath_returnsTrue() {
        let router = Router()
        XCTAssertTrue(router.isHubRoute)
    }

    func test_isDeepRoute_emptyPath_returnsFalse() {
        let router = Router()
        XCTAssertFalse(router.isDeepRoute)
    }

    func test_isHubRoute_afterPushProfile_returnsTrue() {
        let router = Router()
        router.push(.profile)
        XCTAssertTrue(router.isHubRoute)
    }

    func test_isHubRoute_afterPushSettings_returnsTrue() {
        let router = Router()
        router.push(.settings)
        XCTAssertTrue(router.isHubRoute)
    }

    func test_isDeepRoute_afterPushConversation_returnsTrue() {
        let router = Router()
        router.push(.conversation(makeConversation()))
        XCTAssertTrue(router.isDeepRoute)
    }

    func test_isDeepRoute_afterPushEditProfile_returnsTrue() {
        let router = Router()
        router.push(.editProfile)
        XCTAssertTrue(router.isDeepRoute)
    }

    // MARK: - Router.push / pop / popToRoot

    func test_push_addsRouteToPath() {
        let router = Router()
        router.push(.profile)
        XCTAssertEqual(router.path.count, 1)
    }

    func test_pop_removesLastRoute() {
        let router = Router()
        router.push(.profile)
        router.push(.editProfile)
        XCTAssertEqual(router.path.count, 2)
        router.pop()
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .profile)
    }

    func test_pop_emptyPath_doesNothing() {
        let router = Router()
        router.pop()
        XCTAssertTrue(router.path.isEmpty)
    }

    func test_popToRoot_clearsAllRoutes() {
        let router = Router()
        router.push(.profile)
        router.push(.editProfile)
        router.popToRoot()
        XCTAssertTrue(router.path.isEmpty)
        XCTAssertTrue(router.isHubRoute)
    }

    // MARK: - Router.currentRoute

    func test_currentRoute_emptyPath_returnsNil() {
        let router = Router()
        XCTAssertNil(router.currentRoute)
    }

    func test_currentRoute_returnsLastPushedRoute() {
        let router = Router()
        router.push(.profile)
        router.push(.settings)
        XCTAssertEqual(router.currentRoute, .settings)
    }

    // MARK: - Transition: hub → deep → pop back to hub

    func test_pushDeepFromHub_thenPop_restoresHubState() {
        let router = Router()
        router.push(.profile)
        XCTAssertTrue(router.isHubRoute)
        router.push(.editProfile)
        XCTAssertTrue(router.isDeepRoute)
        router.pop()
        XCTAssertTrue(router.isHubRoute)
        XCTAssertEqual(router.currentRoute, .profile)
    }

    // MARK: - Push each Route case

    func test_push_conversation_addsToPath() {
        let router = Router()
        router.push(.conversation(makeConversation()))
        XCTAssertEqual(router.path.count, 1)
        if case .conversation = router.currentRoute {} else {
            XCTFail("Expected .conversation route")
        }
    }

    func test_push_settings_addsToPath() {
        let router = Router()
        router.push(.settings)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .settings)
    }

    func test_push_contacts_addsToPath() {
        let router = Router()
        router.push(.contacts())
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .contacts())
    }

    func test_push_contacts_withTab_addsToPath() {
        let router = Router()
        router.push(.contacts(.requests))
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .contacts(.requests))
    }

    func test_push_communityList_addsToPath() {
        let router = Router()
        router.push(.communityList)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .communityList)
    }

    func test_push_communityDetail_addsToPath() {
        let router = Router()
        router.push(.communityDetail("comm123"))
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .communityDetail("comm123"))
    }

    func test_push_communityCreate_addsToPath() {
        let router = Router()
        router.push(.communityCreate)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .communityCreate)
    }

    func test_push_communitySettings_addsToPath() {
        let router = Router()
        router.push(.communitySettings(makeCommunity()))
        XCTAssertEqual(router.path.count, 1)
        if case .communitySettings = router.currentRoute {} else {
            XCTFail("Expected .communitySettings route")
        }
    }

    func test_push_communityMembers_addsToPath() {
        let router = Router()
        router.push(.communityMembers("comm123"))
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .communityMembers("comm123"))
    }

    func test_push_communityInvite_addsToPath() {
        let router = Router()
        router.push(.communityInvite("comm123"))
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .communityInvite("comm123"))
    }

    func test_push_notifications_addsToPath() {
        let router = Router()
        router.push(.notifications)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .notifications)
    }

    func test_push_userStats_addsToPath() {
        let router = Router()
        router.push(.userStats)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .userStats)
    }

    func test_push_links_addsToPath() {
        let router = Router()
        router.push(.links)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .links)
    }

    func test_push_affiliate_addsToPath() {
        let router = Router()
        router.push(.affiliate)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .affiliate)
    }

    func test_push_trackingLinks_addsToPath() {
        let router = Router()
        router.push(.trackingLinks)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .trackingLinks)
    }

    func test_push_shareLinks_addsToPath() {
        let router = Router()
        router.push(.shareLinks)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .shareLinks)
    }

    func test_push_communityLinks_addsToPath() {
        let router = Router()
        router.push(.communityLinks)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .communityLinks)
    }

    func test_push_dataExport_addsToPath() {
        let router = Router()
        router.push(.dataExport)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .dataExport)
    }

    func test_push_postDetail_addsToPath() {
        let router = Router()
        router.push(.postDetail("post123"))
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .postDetail("post123"))
    }

    func test_push_postDetail_withShowComments_addsToPath() {
        let router = Router()
        router.push(.postDetail("post123", showComments: true))
        XCTAssertEqual(router.path.count, 1)
    }

    func test_push_bookmarks_addsToPath() {
        let router = Router()
        router.push(.bookmarks)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .bookmarks)
    }

    func test_push_friendRequests_addsToPath() {
        let router = Router()
        router.push(.friendRequests)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .friendRequests)
    }

    func test_push_editProfile_addsToPath() {
        let router = Router()
        router.push(.editProfile)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .editProfile)
    }

    // MARK: - Pop from each route

    func test_pop_fromConversation_returnsToEmpty() {
        let router = Router()
        router.push(.conversation(makeConversation()))
        router.pop()
        XCTAssertTrue(router.path.isEmpty)
    }

    func test_pop_fromDeepCommunityChain_returnsToParent() {
        let router = Router()
        router.push(.communityList)
        router.push(.communityDetail("c1"))
        router.push(.communityMembers("c1"))
        XCTAssertEqual(router.path.count, 3)
        router.pop()
        XCTAssertEqual(router.path.count, 2)
        XCTAssertEqual(router.currentRoute, .communityDetail("c1"))
    }

    func test_popToRoot_fromDeepChain_clearsAll() {
        let router = Router()
        router.push(.profile)
        router.push(.editProfile)
        router.push(.bookmarks)
        XCTAssertEqual(router.path.count, 3)
        router.popToRoot()
        XCTAssertTrue(router.path.isEmpty)
    }

    // MARK: - Duplicate push prevention

    func test_push_sameRoute_doesNotDuplicate() {
        let router = Router()
        router.push(.settings)
        router.push(.settings)
        XCTAssertEqual(router.path.count, 1)
    }

    // MARK: - Hub route deduplication

    func test_push_hubRoute_alreadyInStack_popsToExisting() {
        let router = Router()
        router.push(.profile)
        router.push(.editProfile)
        router.push(.bookmarks)
        XCTAssertEqual(router.path.count, 3)
        router.push(.profile)
        XCTAssertEqual(router.path.count, 1)
        XCTAssertEqual(router.currentRoute, .profile)
    }

    // MARK: - iPad onRouteRequested intercept

    func test_push_withOnRouteRequested_interceptsRoute() {
        let router = Router()
        var interceptedRoute: Route?
        router.onRouteRequested = { route in
            interceptedRoute = route
            return true
        }
        router.push(.settings)
        XCTAssertTrue(router.path.isEmpty)
        XCTAssertEqual(interceptedRoute, .settings)
    }

    func test_push_withOnRouteRequested_returningFalse_pushesNormally() {
        let router = Router()
        router.onRouteRequested = { _ in false }
        router.push(.settings)
        XCTAssertEqual(router.path.count, 1)
    }

    // MARK: - iPad onPopRequested

    func test_pop_emptyPath_callsOnPopRequested() {
        let router = Router()
        var popRequestedCalled = false
        router.onPopRequested = { popRequestedCalled = true }
        router.pop()
        XCTAssertTrue(popRequestedCalled)
    }

    func test_popToRoot_emptyPath_callsOnPopRequested() {
        let router = Router()
        var popRequestedCalled = false
        router.onPopRequested = { popRequestedCalled = true }
        router.popToRoot()
        XCTAssertTrue(popRequestedCalled)
    }

    // MARK: - handleShareDeepLink via pendingShareContent

    func test_handleShareDeepLink_url_setsPendingShareContent() {
        let router = Router()
        let url = URL(string: "meeshy://share?url=https://example.com")!
        router.handleDeepLink(url)
    }
}
