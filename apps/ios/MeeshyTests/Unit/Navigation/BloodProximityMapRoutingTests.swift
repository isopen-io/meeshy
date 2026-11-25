import XCTest
@testable import Meeshy
import MeeshySDK

/// « Lina est tout près » (#20540) : toucher la notification ouvre la CARTE de Lina, centrée sur les deux — depuis le
/// push (app fermée comprise), la bannière in-app et la liste, sur iPhone comme sur iPad. Jamais son profil, jamais la
/// liste des notifications.
@MainActor
final class BloodProximityMapRoutingTests: XCTestCase {

    private let lina = "0000000000000000000000b1"

    private func makeNavigator(_ router: Router) -> RootNotificationNavigator {
        RootNotificationNavigator(router: router,
                                  conversationOpener: RootConversationOpener(router: router, knownConversations: { [] }))
    }

    private func pushContext(_ userInfo: [AnyHashable: Any]) -> RootView.NotificationNavContext {
        RootView.NotificationNavContext(from: NotificationPayload(userInfo: userInfo))
    }

    private func proximityJSON() -> String {
        """
        {"id":"n1","userId":"me","type":"blood_proximity","title":"Lina est tout près",
         "content":"À 500 m — touche pour vous voir tous les deux sur la carte",
         "state":{"isRead":false,"readAt":null,"createdAt":"2026-11-24T08:00:00.000Z"},
         "metadata":{"action":"view_profile","userId":"\(lina)","distanceMeters":500},
         "actor":{"id":"\(lina)","username":"lina","displayName":"Lina","avatar":null}}
        """
    }

    private func awaitMap(_ router: Router, _ description: String) async {
        let reached = expectation(description: description)
        let watch = router.$presentedPersonMap.first { $0 != nil }.sink { _ in reached.fulfill() }
        await fulfillment(of: [reached], timeout: 2)
        watch.cancel()
    }

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Le push touché

    func test_pushTap_opensTheMapOfTheOtherBlood_notTheirProfile() {
        let router = Router(surfaces: PresentedSurfaceRegistry(), surfaceHandoff: .zero)

        makeNavigator(router).navigateFromNotification(pushContext([
            "type": "blood_proximity", "userId": lina, "senderId": lina, "senderDisplayName": "Lina", "notificationId": "n1",
        ]))

        XCTAssertEqual(router.presentedPersonMap, PersonMapTarget(userId: lina, displayName: "Lina"))
        XCTAssertNil(router.deepLinkProfileUser)
        XCTAssertTrue(router.path.isEmpty)
    }

    func test_pushTap_withoutUserId_fallsBackToTheSender() {
        let ctx = pushContext(["type": "blood_proximity", "senderId": lina, "senderUsername": "lina"])

        XCTAssertEqual(ctx.personMap, PersonMapTarget(userId: lina, displayName: "lina"))
    }

    func test_pushTap_underAReel_opensTheMapOnceTheReaderHasLeft() async {
        let registry = PresentedSurfaceRegistry()
        let router = Router(surfaces: registry, surfaceHandoff: .milliseconds(40))
        let reels = ReelsPresenter(surfaces: registry, stopPlayback: {})
        reels.presentFresh()

        makeNavigator(router).navigateFromNotification(pushContext(["type": "blood_proximity", "userId": lina, "senderId": lina]))

        XCTAssertNil(reels.launch, "le lecteur de réels descend d'abord")
        XCTAssertNil(router.presentedPersonMap, "la carte ne monte pas pendant que le lecteur descend")
        await awaitMap(router, "la carte monte une fois le lecteur parti")
        XCTAssertEqual(router.presentedPersonMap?.userId, lina)
    }

    // MARK: - La liste et la bannière in-app

    func test_listTap_opensTheSameMap() throws {
        let notification = try JSONDecoder().decode(APINotification.self, from: Data(proximityJSON().utf8))

        XCTAssertEqual(RootView.NotificationNavContext(from: notification).personMap,
                       PersonMapTarget(userId: lina, displayName: "Lina"))
    }

    func test_inAppBannerTap_opensTheSameMap() throws {
        let event = try JSONDecoder().decode(SocketNotificationEvent.self, from: Data(proximityJSON().utf8))

        XCTAssertEqual(RootView.NotificationNavContext(from: event).personMap,
                       PersonMapTarget(userId: lina, displayName: "Lina"))
    }

    func test_otherCircleNotifications_openNoMap() {
        XCTAssertNil(pushContext(["type": "contact_recently_active", "senderId": lina]).personMap)
        XCTAssertNil(PersonMapTarget.forNotification(type: .bloodProximity, subjectUserId: "", senderId: nil, displayName: nil))
    }

    // MARK: - Une autre surface demandée referme la carte

    func test_openingAConversation_closesTheMapFirst() {
        let router = Router(surfaces: PresentedSurfaceRegistry(), surfaceHandoff: .zero)
        router.presentPersonMap(PersonMapTarget(userId: lina, displayName: "Lina"))

        var opened = false
        router.clearPresentedSurfaces { _ in opened = true }

        XCTAssertTrue(opened)
        XCTAssertNil(router.presentedPersonMap)
    }

    // MARK: - iPad et les deux racines (gardes de source, même convention que `ContactRecentlyActiveRoutingTests`)

    func test_iPadNavigator_opensTheMapToo() throws {
        let iPad = try source("Meeshy/Features/Main/Views/iPadRootView+Navigation.swift")
        let branch = try XCTUnwrap(iPad.components(separatedBy: "case .bloodProximity:").dropFirst().first)

        XCTAssertTrue(branch.prefix(200).contains("router.presentPersonMap(personMap)"))
    }

    func test_bothRoots_mountTheMapCover() throws {
        for path in ["Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift",
                     "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift"] {
            XCTAssertTrue(try source(path).contains(".modifier(PersonMapCover(router: router))"), path)
        }
    }
}
