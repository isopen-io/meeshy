import Foundation
import Testing
@testable import MeeshySDK

/// Le contrat de la vérification d'inactivité (#18738), lu comme la passerelle le sert
/// (`packages/shared/types/inactivity-check.ts`).
struct InactivityCheckContractDecodingTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    private func encoded<T: Encodable>(_ value: T) throws -> String {
        String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
    }

    private let position = #"{"latitude":48.85,"longitude":2.35,"accuracy":12,"recordedAt":"2026-11-18T07:55:00.000Z"}"#
    private let battery = #"{"level":9,"measuredAt":"2026-11-18T07:50:00.000Z"}"#

    private var stateJSON: String {
        #"{"userId":"u1","inactiveSince":"2026-11-18T08:00:00.000Z","alertedAt":"2026-11-18T20:30:00.000Z","lastPosition":\#(position),"lastBattery":\#(battery)}"#
    }

    @Test func state_decodesEveryServedField() throws {
        let state = try decode(InactivityAlertState.self, stateJSON)
        #expect(state.userId == "u1")
        #expect(state.inactiveSince == WireDate.date(from: "2026-11-18T08:00:00.000Z"))
        #expect(state.alertedAt == WireDate.date(from: "2026-11-18T20:30:00.000Z"))
        #expect(state.lastPosition?.latitude == 48.85)
        #expect(state.lastPosition?.accuracy == 12)
        #expect(state.lastBattery?.level == 9)
    }

    @Test func state_withoutPositionNorBattery_isStillRead() throws {
        let state = try decode(InactivityAlertState.self,
                               #"{"userId":"u1","inactiveSince":"2026-11-18T08:00:00Z","alertedAt":"2026-11-18T20:30:00Z","extra":true}"#)
        #expect(state.lastPosition == nil)
        #expect(state.lastBattery == nil)
    }

    @Test func state_anUnreadablePositionOrBattery_fallsSilent_theStateStays() throws {
        let json = #"{"userId":"u1","inactiveSince":"2026-11-18T08:00:00Z","alertedAt":"2026-11-18T20:30:00Z","lastPosition":{"latitude":120,"longitude":2,"recordedAt":"2026-11-18T07:55:00Z"},"lastBattery":{"level":140,"measuredAt":"2026-11-18T07:50:00Z"}}"#
        let state = try decode(InactivityAlertState.self, json)
        #expect(state.userId == "u1")
        #expect(state.lastPosition == nil)
        #expect(state.lastBattery == nil)
    }

    @Test func state_unreadableInstant_isRefused() {
        let json = #"{"userId":"u1","inactiveSince":"ce matin","alertedAt":"2026-11-18T20:30:00Z"}"#
        #expect(throws: DecodingError.self) { try decode(InactivityAlertState.self, json) }
    }

    @Test func state_roundTripsThroughTheCache() throws {
        let state = try decode(InactivityAlertState.self, stateJSON)
        let back = try JSONDecoder().decode(InactivityAlertState.self, from: JSONEncoder().encode(state))
        #expect(back == state)
    }

    @Test func state_expiresAfterTheContractTtl_countedFromTheAlert() throws {
        let state = try decode(InactivityAlertState.self, stateJSON)
        let ttl = InactivityCheckContract.stateTtl
        #expect(!state.isExpired(at: state.alertedAt.addingTimeInterval(ttl - 1)))
        #expect(state.isExpired(at: state.alertedAt.addingTimeInterval(ttl + 1)))
    }

    @Test func alert_carriesTheAnnouncementOnlyWhenServed_andIgnoresAnUnknownKind() throws {
        let announced = try decode(InactivityAlertRaised.self, """
        {"userId":"u1","state":\(stateJSON),"announcement":{"kind":"alert","inactiveSince":"2026-11-18T08:00:00Z","at":"2026-11-18T20:30:00Z"}}
        """)
        #expect(announced.announcement?.kind == .alert)

        let unknown = try decode(InactivityAlertRaised.self, """
        {"userId":"u1","state":\(stateJSON),"announcement":{"kind":"vanished","inactiveSince":"2026-11-18T08:00:00Z","at":"2026-11-18T20:30:00Z"}}
        """)
        #expect(unknown.announcement == nil)
        #expect(unknown.state.userId == "u1")
    }

    @Test func alert_refusesTheStateOfAnotherPerson() {
        #expect(throws: DecodingError.self) {
            try decode(InactivityAlertRaised.self, #"{"userId":"u2","state":\#(stateJSON)}"#)
        }
    }

    @Test func cleared_decodes_withOrWithoutItsAnnouncement() throws {
        #expect(try decode(InactivityAlertCleared.self, #"{"userId":"u1"}"#).announcement == nil)
        let responded = try decode(InactivityAlertCleared.self,
                                   #"{"userId":"u1","announcement":{"kind":"responded","inactiveSince":"2026-11-18T08:00:00Z","at":"2026-11-18T21:00:00Z"}}"#)
        #expect(responded.announcement?.kind == .responded)
    }

    @Test func snapshot_dropsAnUnreadableItem() throws {
        let snapshot = try decode(InactivitySnapshot.self, #"{"items":[\#(stateJSON),{"userId":""}]}"#)
        #expect(snapshot.items.map(\.userId) == ["u1"])
    }

    @Test func settings_nullIsOff_anUnknownDelayIsTheDefault_andAbsentIsTheDefault() throws {
        #expect(try decode(InactivityCheckSettings.self, #"{"delayHours":null}"#).delay == .off)
        #expect(try decode(InactivityCheckSettings.self, #"{"delayHours":6}"#).delay == .sixHours)
        #expect(try decode(InactivityCheckSettings.self, #"{"delayHours":24}"#).delay == .twentyFourHours)
        #expect(try decode(InactivityCheckSettings.self, #"{"delayHours":48}"#).delay == .twelveHours)
        #expect(try decode(InactivityCheckSettings.self, "{}").delay == .twelveHours)
    }

    @Test func settings_theBodyAlwaysCarriesTheKey_nullToTurnOff() throws {
        #expect(try encoded(InactivityCheckSettings(delay: .off)) == #"{"delayHours":null}"#)
        #expect(try encoded(InactivityCheckSettings(delay: .twentyFourHours)) == #"{"delayHours":24}"#)
    }

    @Test func personSettings_decode_andTheUpdateIsStrict() throws {
        #expect(try decode(InactivityPersonSettings.self, #"{"userId":"u1","shared":true}"#).isShared)
        #expect(try encoded(InactivityPersonSettingsUpdate(isShared: false)) == #"{"shared":false}"#)
    }
}
