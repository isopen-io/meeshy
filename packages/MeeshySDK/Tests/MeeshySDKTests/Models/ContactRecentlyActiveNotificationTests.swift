import XCTest
@testable import MeeshySDK

/// « X était sur Meeshy récemment » (#8285) : un type connu du client — sans
/// quoi il décodait en `.system`, suivait la préférence « système » et son
/// toucher ne menait nulle part —, rangé avec les contacts, gouverné par SA
/// préférence de réception, et sans gestes rapides : le toucher ouvre le profil.
final class ContactRecentlyActiveNotificationTests: XCTestCase {

    private func decode(_ json: String) throws -> APINotification {
        try JSONDecoder().decode(APINotification.self, from: Data(json.utf8))
    }

    private func recentlyActiveJSON(title: String? = "Marie était sur Meeshy récemment") -> String {
        let titleField = title.map { #""title":"\#($0)","# } ?? ""
        return #"""
        {"id":"n1","userId":"me","type":"contact_recently_active","priority":"normal",\#(titleField)
         "content":"C'est le moment de lui écrire 👋",
         "state":{"isRead":false,"readAt":null,"createdAt":"2026-09-27T08:00:00.000Z"},
         "metadata":{"action":"view_profile","userId":"x42"},
         "actor":{"id":"x42","username":"marie","displayName":"Marie","avatar":null}}
        """#
    }

    // MARK: - Type

    func test_rawValue_isTheServerType() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "contact_recently_active"), .contactRecentlyActive)
    }

    func test_decoding_keepsTheTypeAndTheReturningActor() throws {
        let notification = try decode(recentlyActiveJSON())

        XCTAssertEqual(notification.notificationType, .contactRecentlyActive)
        XCTAssertEqual(notification.senderId, "x42")
        XCTAssertEqual(notification.senderName, "Marie")
    }

    // MARK: - Présentation

    func test_presentation_isAPersonWithAClockInTheContactsFamily() {
        XCTAssertEqual(MeeshyNotificationType.contactRecentlyActive.systemIcon, "person.crop.circle.badge.clock")
        XCTAssertEqual(MeeshyNotificationType.contactRecentlyActive.accentHex, "4ECDC4")
    }

    func test_formattedTitle_withServerTitle_showsWhatTheGatewayServed() throws {
        XCTAssertEqual(try decode(recentlyActiveJSON()).formattedTitle, "Marie était sur Meeshy récemment")
    }

    func test_formattedTitle_withoutServerTitle_fallsBackToTheActorSentence() throws {
        XCTAssertEqual(try decode(recentlyActiveJSON(title: nil)).formattedTitle, "Marie était sur Meeshy récemment")
    }

    func test_quickActions_areAbsent_theTapOpensTheProfile() throws {
        XCTAssertEqual(try decode(recentlyActiveJSON()).quickActions, [])
    }

    // MARK: - Préférence de réception

    func test_preference_followsContactActivity_notContactRequests() {
        var prefs = UserNotificationPreferences.defaults
        prefs.contactRequestEnabled = false
        prefs.contactActivityEnabled = true
        XCTAssertTrue(prefs.isTypeEnabled(.contactRecentlyActive))

        prefs.contactRequestEnabled = true
        prefs.contactActivityEnabled = false
        XCTAssertFalse(prefs.isTypeEnabled(.contactRecentlyActive))
    }

    func test_allowsNotification_contactActivityOff_filtersTheAlert() {
        var prefs = UserNotificationPreferences.defaults
        prefs.contactActivityEnabled = false

        XCTAssertFalse(prefs.allowsNotification(type: .contactRecentlyActive))
        XCTAssertFalse(prefs.allowsInAppBanner(type: .contactRecentlyActive))
    }

    func test_contactActivityEnabled_absentFromPayload_decodesTrue_andRoundTrips() throws {
        XCTAssertTrue(UserNotificationPreferences.defaults.contactActivityEnabled)
        let empty = try JSONDecoder().decode(UserNotificationPreferences.self, from: Data("{}".utf8))
        XCTAssertTrue(empty.contactActivityEnabled)

        var prefs = UserNotificationPreferences.defaults
        prefs.contactActivityEnabled = false
        let data = try JSONEncoder().encode(prefs)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["contactActivityEnabled"] as? Bool, false)
        XCTAssertFalse(try JSONDecoder().decode(UserNotificationPreferences.self, from: data).contactActivityEnabled)
    }

    // MARK: - Réglage de confidentialité (émetteur)

    func test_notifyContactsOnReturn_absentFromPayload_decodesTrue_andRoundTrips() throws {
        XCTAssertTrue(PrivacyPreferences.defaults.notifyContactsOnReturn)
        let empty = try JSONDecoder().decode(PrivacyPreferences.self, from: Data("{}".utf8))
        XCTAssertTrue(empty.notifyContactsOnReturn)

        var prefs = PrivacyPreferences.defaults
        prefs.notifyContactsOnReturn = false
        let data = try JSONEncoder().encode(prefs)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["notifyContactsOnReturn"] as? Bool, false)
        XCTAssertFalse(try JSONDecoder().decode(PrivacyPreferences.self, from: data).notifyContactsOnReturn)
    }

    // MARK: - Chemins de toucher : l'acteur voyage jusqu'au routeur

    func test_pushPayload_carriesTheReturningActorAsSender() {
        let payload = NotificationPayload(userInfo: [
            "type": "contact_recently_active",
            "senderId": "x42",
            "senderUsername": "marie",
            "senderDisplayName": "Marie",
        ])

        XCTAssertEqual(MeeshyNotificationType(rawValue: payload.type ?? ""), .contactRecentlyActive)
        XCTAssertEqual(payload.senderId, "x42")
        XCTAssertEqual(payload.senderUsername, "marie")
    }

    func test_inAppBanner_keepsTheInvitationToWrite_asBody() throws {
        let event = try JSONDecoder().decode(SocketNotificationEvent.self, from: Data("""
        {
            "id": "n2", "userId": "me", "type": "contact_recently_active",
            "title": "Marie",
            "subtitle": "était sur Meeshy récemment",
            "content": "C'est le moment de lui écrire 👋",
            "actor": { "id": "x42", "username": "marie", "displayName": "Marie" }
        }
        """.utf8))

        let banner = event.bannerPresentation()
        XCTAssertEqual(event.senderId, "x42")
        XCTAssertEqual(banner.headline, "Marie était sur Meeshy récemment")
        XCTAssertEqual(banner.body, "C'est le moment de lui écrire 👋")
    }

    func test_inAppBanner_serverTitleAlreadyCarriesTheAction_isNotSaidTwice() throws {
        let event = try JSONDecoder().decode(SocketNotificationEvent.self, from: Data("""
        {
            "id": "n3", "userId": "me", "type": "contact_recently_active",
            "title": "Marie était sur Meeshy récemment",
            "subtitle": "était sur Meeshy récemment",
            "content": "C'est le moment de lui écrire 👋",
            "actor": { "id": "x42", "username": "marie", "displayName": "Marie" }
        }
        """.utf8))

        XCTAssertEqual(event.bannerPresentation().headline, "Marie était sur Meeshy récemment")
    }
}
