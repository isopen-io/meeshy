import XCTest
@testable import MeeshySDK

/// « Ajouté à la communauté Y » (#18052) : la notification nomme la communauté,
/// et cet identifiant voyage par les TROIS chemins de toucher — la liste
/// (`APINotification`), la bannière in-app (`SocketNotificationEvent`) et le push
/// (`NotificationPayload`) — jusqu'à l'aiguillage qui ouvre son détail.
final class CommunityAddedNotificationTests: XCTestCase {

    private let communityId = "507f1f77bcf86cd799439aaa"

    func test_listEntry_decodesTheCommunityFromTheContext() throws {
        let notification = try JSONDecoder().decode(APINotification.self, from: Data(#"""
        {"id":"n1","userId":"me","type":"community_invite","priority":"normal",
         "content":"Ajouté à la communauté Jardins & Potagers",
         "state":{"isRead":false,"readAt":null,"createdAt":"2026-11-13T08:00:00.000Z"},
         "context":{"communityId":"507f1f77bcf86cd799439aaa","communityName":"Jardins & Potagers"},
         "metadata":{"action":"view_community"},
         "actor":{"id":"a1","username":"paul","displayName":"Paul","avatar":null}}
        """#.utf8))

        XCTAssertEqual(notification.notificationType, .communityInvite)
        XCTAssertEqual(notification.context?.communityId, communityId)
        XCTAssertEqual(notification.context?.communityName, "Jardins & Potagers")
    }

    func test_inAppBanner_exposesTheCommunity() throws {
        let event = try JSONDecoder().decode(SocketNotificationEvent.self, from: Data("""
        {
            "id": "n2", "userId": "me", "type": "community_invite",
            "content": "Ajouté à la communauté Jardins & Potagers",
            "context": { "communityId": "507f1f77bcf86cd799439aaa", "communityName": "Jardins & Potagers" },
            "actor": { "id": "a1", "username": "paul", "displayName": "Paul" }
        }
        """.utf8))

        XCTAssertEqual(event.communityId, communityId)
        XCTAssertNil(event.conversationId)
    }

    func test_pushPayload_readsTheCommunity_andTreatsEmptyAsAbsent() {
        XCTAssertEqual(NotificationPayload(userInfo: ["type": "community_invite", "communityId": communityId]).communityId, communityId)
        XCTAssertNil(NotificationPayload(userInfo: ["type": "community_invite", "communityId": ""]).communityId)
        XCTAssertNil(NotificationPayload(userInfo: ["type": "new_message"]).communityId)
    }
}
