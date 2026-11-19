import XCTest
@testable import MeeshySDK

/// « Tout va bien ? » et l'alerte d'inactivité (#18738) : deux types connus du client, signaux de sécurité qu'aucun
/// interrupteur par type ne coupe — le délai et le partage par personne les règlent.
final class InactivityNotificationTypesTests: XCTestCase {

    func test_rawValues_areTheServerTypes() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "wellness_check"), .wellnessCheck)
        XCTAssertEqual(MeeshyNotificationType(rawValue: "inactivity_alert"), .inactivityAlert)
        XCTAssertEqual(InactivityCheckContract.wellnessCheckNotificationType, MeeshyNotificationType.wellnessCheck.rawValue)
        XCTAssertEqual(InactivityCheckContract.alertNotificationType, MeeshyNotificationType.inactivityAlert.rawValue)
    }

    func test_noPerTypeToggle_turnsThemOff() {
        var prefs = UserNotificationPreferences.defaults
        prefs.systemEnabled = false
        prefs.contactRequestEnabled = false
        prefs.contactActivityEnabled = false
        prefs.receivesDeviceBattery = false
        prefs.receivesDeviceUnreachable = false

        XCTAssertTrue(prefs.isTypeEnabled(.wellnessCheck))
        XCTAssertTrue(prefs.isTypeEnabled(.inactivityAlert))
        XCTAssertTrue(prefs.allowsInAppBanner(type: .inactivityAlert))
    }

    func test_fallbackTitles_whenTheGatewayServedNone() throws {
        let json = #"""
        {"id":"n1","userId":"me","type":"inactivity_alert","priority":"high","content":"Aucune activité depuis 12 h",
         "state":{"isRead":false,"readAt":null,"createdAt":"2026-11-18T20:30:00.000Z"},
         "context":{},
         "metadata":{"action":"view_profile","userId":"u1","inactivityKind":"alert"},
         "actor":{"id":"u1","username":"jacques","displayName":"Jacques","avatar":null}}
        """#
        let alert = try JSONDecoder().decode(APINotification.self, from: Data(json.utf8))
        XCTAssertEqual(alert.notificationType, .inactivityAlert)
        XCTAssertTrue(alert.formattedTitle.contains("Jacques"))
    }
}
