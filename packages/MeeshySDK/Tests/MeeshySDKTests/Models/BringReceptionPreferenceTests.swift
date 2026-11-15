import XCTest
@testable import MeeshySDK

/// « Recevoir des Bring » (#16609) : l'interrupteur GLOBAL que la passerelle sert
/// sous `notification.bringEnabled` (#14441). Le client ne dit au serveur que ce
/// qu'il a appris de lui ou que l'utilisateur a choisi : une préférence relue d'un
/// cache antérieur au champ n'écrase jamais, à la synchronisation suivante, un
/// refus posé depuis une autre plateforme.
final class BringReceptionPreferenceTests: XCTestCase {

    private func decode(_ json: String) throws -> UserNotificationPreferences {
        try JSONDecoder().decode(UserNotificationPreferences.self, from: Data(json.utf8))
    }

    private func encodedObject(_ prefs: UserNotificationPreferences) throws -> [String: Any] {
        let data = try JSONEncoder().encode(prefs)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func test_receivesBrings_absentFromPayload_isTrue() throws {
        XCTAssertTrue(try decode("{}").receivesBrings)
        XCTAssertTrue(UserNotificationPreferences.defaults.receivesBrings)
    }

    func test_receivesBrings_servedFalse_isFalse() throws {
        XCTAssertFalse(try decode(#"{"bringEnabled":false}"#).receivesBrings)
    }

    func test_encode_neverLearnedNorChosen_omitsTheField() throws {
        let object = try encodedObject(try decode(#"{"pushEnabled":true}"#))
        XCTAssertNil(object["bringEnabled"])
        XCTAssertNil(try encodedObject(.defaults)["bringEnabled"])
    }

    func test_encode_servedValue_isSentBackUnchanged() throws {
        let object = try encodedObject(try decode(#"{"bringEnabled":false}"#))
        XCTAssertEqual(object["bringEnabled"] as? Bool, false)
    }

    func test_turningOff_writesFalse_andRoundTrips() throws {
        var prefs = UserNotificationPreferences.defaults
        prefs.receivesBrings = false
        XCTAssertEqual(try encodedObject(prefs)["bringEnabled"] as? Bool, false)
        let data = try JSONEncoder().encode(prefs)
        XCTAssertFalse(try JSONDecoder().decode(UserNotificationPreferences.self, from: data).receivesBrings)
    }

    func test_turningBackOn_writesTrue() throws {
        var prefs = try decode(#"{"bringEnabled":false}"#)
        prefs.receivesBrings = true
        XCTAssertEqual(try encodedObject(prefs)["bringEnabled"] as? Bool, true)
    }
}
