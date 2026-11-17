import XCTest
@testable import MeeshySDK

/// « Le téléphone de X est injoignable » (#18737) : un type connu du client, rangé avec les contacts, suivi par sa
/// propre préférence `deviceUnreachableEnabled` — absente = reçue, jamais renvoyée tant qu'elle n'a pas été apprise.
final class DeviceUnreachableNotificationTests: XCTestCase {

    private func decodePrefs(_ json: String) throws -> UserNotificationPreferences {
        try JSONDecoder().decode(UserNotificationPreferences.self, from: Data(json.utf8))
    }

    private func encodedObject(_ prefs: UserNotificationPreferences) throws -> [String: Any] {
        let data = try JSONEncoder().encode(prefs)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func test_rawValue_isTheServerType_andItsIconIsThePhoneSlashed() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "device_unreachable"), .deviceUnreachable)
        XCTAssertEqual(MeeshyNotificationType.deviceUnreachable.systemIcon, "iphone.slash")
        XCTAssertEqual(PhoneReachabilityContract.notificationType, MeeshyNotificationType.deviceUnreachable.rawValue)
    }

    func test_isTypeEnabled_followsDeviceUnreachable_notDeviceBattery() {
        var prefs = UserNotificationPreferences.defaults
        prefs.receivesDeviceBattery = false
        XCTAssertTrue(prefs.isTypeEnabled(.deviceUnreachable))

        prefs.receivesDeviceBattery = true
        prefs.receivesDeviceUnreachable = false
        XCTAssertFalse(prefs.isTypeEnabled(.deviceUnreachable))
    }

    func test_receivesDeviceUnreachable_absentFromPayload_isTrue_andIsNotSentBack() throws {
        XCTAssertTrue(try decodePrefs("{}").receivesDeviceUnreachable)
        XCTAssertNil(try encodedObject(.defaults)["deviceUnreachableEnabled"])
    }

    func test_receivesDeviceUnreachable_servedFalse_roundTrips() throws {
        let prefs = try decodePrefs(#"{"deviceUnreachableEnabled":false}"#)
        XCTAssertFalse(prefs.receivesDeviceUnreachable)
        XCTAssertEqual(try encodedObject(prefs)["deviceUnreachableEnabled"] as? Bool, false)
    }
}
