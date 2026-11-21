import Foundation
import Testing
@testable import MeeshySDK

/// Le contrat d'« en appel » (#18753), lu comme la passerelle le sert (`packages/shared/types/phone-call.ts`).
struct PhoneCallContractDecodingTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    private func encoded<T: Encodable>(_ value: T) throws -> String {
        String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
    }

    private let stateJSON = #"{"userId":"u1","since":"2026-11-19T14:00:00.000Z","expiresAt":"2026-11-19T17:00:00.000Z"}"#

    @Test func state_decodesEveryServedField_andToleratesAnUnknownOne() throws {
        let state = try decode(PhoneCallState.self,
                               #"{"userId":"u1","since":"2026-11-19T14:00:00.000Z","expiresAt":"2026-11-19T17:00:00.000Z","extra":1}"#)
        #expect(state.userId == "u1")
        #expect(state.since == WireDate.date(from: "2026-11-19T14:00:00.000Z"))
        #expect(state.expiresAt == WireDate.date(from: "2026-11-19T17:00:00.000Z"))
    }

    @Test func state_unreadableInstantOrEmptyUser_isRefused() {
        #expect(throws: DecodingError.self) {
            try decode(PhoneCallState.self, #"{"userId":"u1","since":"tout à l'heure","expiresAt":"2026-11-19T17:00:00Z"}"#)
        }
        #expect(throws: DecodingError.self) {
            try decode(PhoneCallState.self, #"{"userId":"  ","since":"2026-11-19T14:00:00Z","expiresAt":"2026-11-19T17:00:00Z"}"#)
        }
    }

    @Test func state_isNoLongerShown_onceItsExpiryHasPassed() throws {
        let state = try decode(PhoneCallState.self, stateJSON)
        #expect(!state.isExpired(at: state.expiresAt.addingTimeInterval(-1)))
        #expect(state.isExpired(at: state.expiresAt.addingTimeInterval(1)))
    }

    @Test func state_roundTripsThroughTheCache_withOnlyItsThreeFields() throws {
        let state = try decode(PhoneCallState.self, stateJSON)
        let json = try encoded(state)
        let keys = try #require(try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any]).keys.sorted()
        #expect(keys == ["expiresAt", "since", "userId"])
        #expect(try decode(PhoneCallState.self, json) == state)
    }

    @Test func started_readsTheStateAndTheAnnouncement() throws {
        let event = try decode(PhoneCallStarted.self,
                               #"{"userId":"u1","state":\#(stateJSON),"announcement":{"kind":"started","at":"2026-11-19T14:02:13.000Z"}}"#)
        #expect(event.userId == "u1")
        #expect(event.state.userId == "u1")
        #expect(event.announcement?.kind == .started)
        #expect(event.announcement?.at == WireDate.date(from: "2026-11-19T14:02:13.000Z"))
    }

    @Test func started_withoutAnnouncement_isASilentUpdate() throws {
        let event = try decode(PhoneCallStarted.self, #"{"userId":"u1","state":\#(stateJSON)}"#)
        #expect(event.announcement == nil)
    }

    @Test func started_anUnknownAnnouncement_isIgnored_theStateStays() throws {
        let event = try decode(PhoneCallStarted.self,
                               #"{"userId":"u1","state":\#(stateJSON),"announcement":{"kind":"transferred","at":"2026-11-19T14:02:13Z"}}"#)
        #expect(event.announcement == nil)
        #expect(event.state.userId == "u1")
    }

    @Test func started_aStateOfSomeoneElse_isRefused() {
        #expect(throws: DecodingError.self) {
            try decode(PhoneCallStarted.self, #"{"userId":"u2","state":\#(stateJSON)}"#)
        }
    }

    @Test func ended_readsTheUserAndTheAnnouncement() throws {
        let event = try decode(PhoneCallEnded.self, #"{"userId":"u1","announcement":{"kind":"ended","at":"2026-11-19T14:30:00Z"}}"#)
        #expect(event.userId == "u1")
        #expect(event.announcement?.kind == .ended)
        let silent = try decode(PhoneCallEnded.self, #"{"userId":"u1"}"#)
        #expect(silent.announcement == nil)
    }

    @Test func snapshot_dropsAnUnreadableItem() throws {
        let snapshot = try decode(PhoneCallSnapshot.self, #"{"items":[\#(stateJSON),{"userId":"u2","since":"jamais"}]}"#)
        #expect(snapshot.items.map(\.userId) == ["u1"])
    }

    @Test func report_carriesOneBoolean_andNothingElse() throws {
        #expect(try encoded(PhoneCallReport(active: true)) == #"{"active":true}"#)
    }

    @Test func emitterSettings_readAndWriteSharingEnabled() throws {
        #expect(try decode(PhoneCallEmitterSettings.self, #"{"sharingEnabled":false}"#).sharingEnabled == false)
        #expect(try encoded(PhoneCallEmitterSettings(sharingEnabled: true)) == #"{"sharingEnabled":true}"#)
    }

    @Test func personSettings_readTheSharedChoice_andTheUpdateWritesOnlyShared() throws {
        let served = try decode(PhoneCallPersonSettings.self, #"{"userId":"u1","shared":true}"#)
        #expect(served == PhoneCallPersonSettings(userId: "u1", isShared: true))
        #expect(try encoded(PhoneCallPersonSettingsUpdate(isShared: false)) == #"{"shared":false}"#)
    }

    @Test func contract_mirrorsTheServerConfig() {
        #expect(PhoneCallContract.reportTtl == 180 * 60)
        #expect(PhoneCallContract.servedSinceStep == 5 * 60)
    }
}
