import XCTest
@testable import MeeshySDK

/// « Lina est tout près » (#20540) : quand un Sang s'approche, la passerelle pousse `blood_proximity` aux deux. Le type
/// est connu du client — sans quoi il décodait en `.system` et son toucher menait à la liste —, rangé avec les cercles,
/// suivi par sa préférence `bloodProximityEnabled` (absente = reçue, jamais renvoyée tant qu'elle n'est pas apprise), et
/// l'autre Sang voyage par les trois chemins de toucher : la liste, la bannière in-app et le push.
final class BloodProximityNotificationTests: XCTestCase {

    private func decode(_ json: String) throws -> APINotification {
        try JSONDecoder().decode(APINotification.self, from: Data(json.utf8))
    }

    private func decodePrefs(_ json: String) throws -> UserNotificationPreferences {
        try JSONDecoder().decode(UserNotificationPreferences.self, from: Data(json.utf8))
    }

    private func encodedObject(_ prefs: UserNotificationPreferences) throws -> [String: Any] {
        let data = try JSONEncoder().encode(prefs)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func proximityJSON(title: String? = "Lina est tout près") -> String {
        let titleField = title.map { #""title":"\#($0)","# } ?? ""
        return #"""
        {"id":"n1","userId":"me","type":"blood_proximity","priority":"normal",\#(titleField)
         "content":"À 500 m — touche pour vous voir tous les deux sur la carte",
         "state":{"isRead":false,"readAt":null,"createdAt":"2026-11-24T08:00:00.000Z"},
         "metadata":{"action":"view_profile","userId":"lina42","distanceMeters":500},
         "actor":{"id":"lina42","username":"lina","displayName":"Lina","avatar":null}}
        """#
    }

    // MARK: - Type

    func test_rawValue_isTheServerType() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "blood_proximity"), .bloodProximity)
    }

    func test_decoding_keepsTheTypeTheOtherBloodAndThePalier() throws {
        let notification = try decode(proximityJSON())

        XCTAssertEqual(notification.notificationType, .bloodProximity)
        XCTAssertEqual(notification.metadata?.userId, "lina42")
        XCTAssertEqual(notification.metadata?.distanceMeters, 500)
        XCTAssertEqual(notification.metadata?.action, "view_profile")
        XCTAssertEqual(notification.senderId, "lina42")
    }

    func test_presentation_isALocationInTheCirclesFamily() {
        XCTAssertEqual(MeeshyNotificationType.bloodProximity.systemIcon, "location.circle.fill")
        XCTAssertEqual(MeeshyNotificationType.bloodProximity.accentHex, MeeshyNotificationType.contactRecentlyActive.accentHex)
    }

    func test_formattedTitle_showsWhatTheGatewayServed_neverRecomposed() throws {
        XCTAssertEqual(try decode(proximityJSON()).formattedTitle, "Lina est tout près")
        XCTAssertEqual(try decode(proximityJSON(title: nil)).formattedTitle, "Lina est tout près")
    }

    // MARK: - Préférence

    func test_isTypeEnabled_followsBloodProximity_notContactActivity() {
        var prefs = UserNotificationPreferences.defaults
        prefs.contactActivityEnabled = false
        XCTAssertTrue(prefs.isTypeEnabled(.bloodProximity))

        prefs.contactActivityEnabled = true
        prefs.receivesBloodProximity = false
        XCTAssertFalse(prefs.isTypeEnabled(.bloodProximity))
        XCTAssertFalse(prefs.allowsInAppBanner(type: .bloodProximity))
    }

    func test_receivesBloodProximity_absentFromPayload_isTrue_andIsNotSentBack() throws {
        XCTAssertTrue(try decodePrefs("{}").receivesBloodProximity)
        XCTAssertNil(try encodedObject(.defaults)["bloodProximityEnabled"])
    }

    func test_receivesBloodProximity_servedFalse_roundTrips() throws {
        let prefs = try decodePrefs(#"{"bloodProximityEnabled":false}"#)
        XCTAssertFalse(prefs.receivesBloodProximity)
        XCTAssertEqual(try encodedObject(prefs)["bloodProximityEnabled"] as? Bool, false)
    }

    // MARK: - Chemins de toucher : l'autre Sang voyage jusqu'au routeur

    func test_pushPayload_carriesTheOtherBlood_andNoDistance() {
        let payload = NotificationPayload(userInfo: [
            "type": "blood_proximity",
            "userId": "lina42",
            "senderId": "lina42",
            "senderDisplayName": "Lina",
            "notificationId": "n1",
        ])

        XCTAssertEqual(MeeshyNotificationType(rawValue: payload.type ?? ""), .bloodProximity)
        XCTAssertEqual(payload.userId, "lina42")
        XCTAssertEqual(payload.senderDisplayName, "Lina")
    }

    func test_pushPayload_emptyUserId_isAbsent() {
        XCTAssertNil(NotificationPayload(userInfo: ["type": "blood_proximity", "userId": ""]).userId)
    }

    func test_socketEvent_carriesTheOtherBloodInItsDurableMetadata() throws {
        let event = try JSONDecoder().decode(SocketNotificationEvent.self, from: Data("""
        {
            "id": "n2", "userId": "me", "type": "blood_proximity",
            "title": "Lina est tout près",
            "content": "À 500 m — touche pour vous voir tous les deux sur la carte",
            "metadata": { "action": "view_profile", "userId": "lina42", "distanceMeters": 500 },
            "actor": { "id": "lina42", "username": "lina", "displayName": "Lina" }
        }
        """.utf8))

        XCTAssertEqual(event.notificationType, .bloodProximity)
        XCTAssertEqual(event.apiMetadata?.userId, "lina42")
        XCTAssertEqual(event.apiMetadata?.distanceMeters, 500)
        XCTAssertEqual(event.bannerPresentation().body, "À 500 m — touche pour vous voir tous les deux sur la carte")
    }
}
