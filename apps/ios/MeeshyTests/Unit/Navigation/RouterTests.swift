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
        XCTAssertTrue(Route.contacts.isHub)
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

    func test_isHub_notifications_returnsFalse() {
        XCTAssertFalse(Route.notifications.isHub)
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
}
