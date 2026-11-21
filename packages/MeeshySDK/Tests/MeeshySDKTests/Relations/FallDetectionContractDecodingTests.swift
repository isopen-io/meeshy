import XCTest
@testable import MeeshySDK

/// Le contrat de la chute détectée (#18748), lu tel que la passerelle l'émet (`fallRelay.ts`, `routes/me/health-fall.ts`,
/// `routes/relations/fall.ts`) : tolérant en descente, strict en montée.
final class FallDetectionContractDecodingTests: XCTestCase {

    private let state = #"{"userId":"u1","detectedAt":"2026-11-19T16:42:00.000Z","expiresAt":"2026-11-19T22:42:00.000Z"}"#

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    func test_detected_readsTheStatePositionBatteryAndAnnouncement() throws {
        let event = try decode(FallDetected.self, #"""
        {"userId":"u1","state":{"userId":"u1","detectedAt":"2026-11-19T16:42:00.000Z","expiresAt":"2026-11-19T22:42:00.000Z",
        "lastPosition":{"latitude":48.85,"longitude":2.35,"accuracy":20,"recordedAt":"2026-11-19T16:40:00.000Z"},
        "lastBattery":{"level":41,"measuredAt":"2026-11-19T16:30:00.000Z"}},"announcement":{"kind":"detected","at":"2026-11-19T16:42:00.000Z"}}
        """#)
        XCTAssertEqual(event.state.lastBattery?.level, 41)
        XCTAssertEqual(event.state.lastPosition?.latitude, 48.85)
        XCTAssertEqual(event.announcedAt, WireDate.date(from: "2026-11-19T16:42:00.000Z"))
    }

    func test_detected_anUnreadablePositionOrUnknownAnnouncementIsSilent() throws {
        let event = try decode(FallDetected.self, #"""
        {"userId":"u1","state":{"userId":"u1","detectedAt":"2026-11-19T16:42:00.000Z","expiresAt":"2026-11-19T22:42:00.000Z",
        "lastPosition":{"latitude":200,"longitude":2}},"announcement":{"kind":"tumbled","at":"2026-11-19T16:42:00.000Z"}}
        """#)
        XCTAssertNil(event.state.lastPosition)
        XCTAssertNil(event.announcedAt)
    }

    func test_detected_aStateOfAnotherPersonIsRefused() {
        XCTAssertThrowsError(try decode(FallDetected.self, #"{"userId":"u2","state":\#(state)}"#))
    }

    func test_cleared_readsTheReason_andAnUnknownReasonIsWithdrawn() throws {
        XCTAssertEqual(try decode(FallCleared.self, #"{"userId":"u1","reason":"responded"}"#).reason, .responded)
        XCTAssertEqual(try decode(FallCleared.self, #"{"userId":"u1","reason":"teleported"}"#).reason, .withdrawn)
        XCTAssertEqual(try decode(FallCleared.self, #"{"userId":"u1"}"#).reason, .withdrawn)
        XCTAssertThrowsError(try decode(FallCleared.self, #"{"reason":"responded"}"#))
    }

    func test_snapshot_dropsAnUnreadableItem() throws {
        let snapshot = try decode(FallSnapshot.self, #"{"items":[\#(state),{"userId":"x","detectedAt":"jamais"}]}"#)
        XCTAssertEqual(snapshot.items.map(\.userId), ["u1"])
    }

    func test_report_isStrict_anInstantAndNothingElse() throws {
        let body = try JSONEncoder().encode(FallReport(detectedAt: Date(timeIntervalSince1970: 1_800_000_000)))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(object.keys.sorted(), ["detectedAt"])
    }

    func test_consentUpdate_givesTheReadVersion_orWithdraws() throws {
        let given = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(FallConsentUpdate.consent(version: "2026-11-19"))) as? [String: Any])
        XCTAssertEqual(given["consented"] as? Bool, true)
        XCTAssertEqual(given["version"] as? String, "2026-11-19")
        let withdrawn = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(FallConsentUpdate.withdraw)) as? [String: Any])
        XCTAssertEqual(withdrawn.keys.sorted(), ["consented"])
        XCTAssertEqual(withdrawn["consented"] as? Bool, false)
    }

    func test_consentSettings_isConsentedOnlyOnTheTextInForce() throws {
        let current = try decode(FallConsentSettings.self, #"{"consentedAt":"2026-11-19T10:00:00.000Z","consentVersion":"2026-11-19","currentVersion":"2026-11-19"}"#)
        XCTAssertTrue(current.isConsented)
        let stale = try decode(FallConsentSettings.self, #"{"consentedAt":"2026-11-01T10:00:00.000Z","consentVersion":"2026-11-01","currentVersion":"2026-11-19"}"#)
        XCTAssertFalse(stale.isConsented)
        let none = try decode(FallConsentSettings.self, #"{"consentedAt":null,"consentVersion":null,"currentVersion":"2026-11-19"}"#)
        XCTAssertFalse(none.isConsented)
    }

    func test_pushTypesAndCategory_areGeneric() {
        XCTAssertEqual(FallDetectionContract.safetyAlertPushType, "safety_alert")
        XCTAssertEqual(FallDetectionContract.safetyAlertClearedPushType, "safety_alert_cleared")
        XCTAssertEqual(FallDetectionContract.safetyAlertCategory, "MEESHY_SAFETY_ALERT")
    }
}
