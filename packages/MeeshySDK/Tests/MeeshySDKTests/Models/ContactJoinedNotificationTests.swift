import XCTest
@testable import MeeshySDK

/// « X a rejoint Meeshy » (#8105) : un type connu du client — sans quoi il
/// décodait en `.system` et suivait la préférence « système » —, rangé avec
/// les contacts, et porteur de deux gestes sur la rangée : Se connecter, Écrire.
final class ContactJoinedNotificationTests: XCTestCase {

    private func decode(_ json: String) throws -> APINotification {
        try JSONDecoder().decode(APINotification.self, from: Data(json.utf8))
    }

    private func contactJoinedJSON(actorId: String? = "u9") -> String {
        let actor = actorId.map { #","actor":{"id":"\#($0)","username":"awa","displayName":"Maman","avatar":null}"# } ?? ""
        return #"""
        {"id":"n1","userId":"me","type":"contact_joined","priority":"normal",
         "title":"Maman a rejoint Meeshy","content":"Dites-lui bonjour !",
         "state":{"isRead":false,"readAt":null,"createdAt":"2026-09-26T08:00:00.000Z"},
         "metadata":{"action":"view_profile","joinerIds":["u9"],"joinerCount":1}\#(actor)}
        """#
    }

    func test_rawValue_isTheServerType() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "contact_joined"), .contactJoined)
    }

    func test_decoding_keepsTheTypeAndTheArrivingActor() throws {
        let notification = try decode(contactJoinedJSON())

        XCTAssertEqual(notification.notificationType, .contactJoined)
        XCTAssertEqual(notification.senderId, "u9")
        XCTAssertEqual(notification.senderName, "Maman")
    }

    func test_preference_followsTheContactsToggle_notSystem() {
        var prefs = UserNotificationPreferences.defaults
        prefs.systemEnabled = true
        prefs.contactRequestEnabled = false
        XCTAssertFalse(prefs.isTypeEnabled(.contactJoined))

        prefs.contactRequestEnabled = true
        prefs.systemEnabled = false
        XCTAssertTrue(prefs.isTypeEnabled(.contactJoined))
    }

    func test_presentation_isAPersonInTheContactsFamily() {
        XCTAssertEqual(MeeshyNotificationType.contactJoined.systemIcon, "person.crop.circle.badge.plus")
        XCTAssertEqual(MeeshyNotificationType.contactJoined.accentHex, MeeshyNotificationType.friendRequest.accentHex)
    }

    func test_quickActions_connectAndWrite_towardsTheArrivingActor() throws {
        let notification = try decode(contactJoinedJSON())

        XCTAssertEqual(notification.quickActions, [.connect(userId: "u9"), .write(userId: "u9")])
    }

    func test_quickActions_withoutActor_areAbsent() throws {
        let notification = try decode(contactJoinedJSON(actorId: nil))

        XCTAssertEqual(notification.quickActions, [])
    }

    func test_quickActions_otherTypes_areAbsent() throws {
        let json = contactJoinedJSON().replacingOccurrences(of: "contact_joined", with: "friend_accepted")

        XCTAssertEqual(try decode(json).quickActions, [])
    }
}
