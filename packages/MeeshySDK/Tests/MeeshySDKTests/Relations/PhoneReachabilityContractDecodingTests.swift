import Foundation
import Testing
@testable import MeeshySDK

/// Le contrat du téléphone injoignable (#18737), lu comme la passerelle le sert
/// (`packages/shared/types/phone-reachability.ts`).
struct PhoneReachabilityContractDecodingTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    private let stateJSON = #"{"userId":"u1","unreachableSince":"2026-11-15T10:00:00.000Z","cause":"battery"}"#

    @Test func state_decodesEveryServedField() throws {
        let state = try decode(PhoneReachabilityState.self, stateJSON)
        #expect(state.userId == "u1")
        #expect(state.unreachableSince == WireDate.date(from: "2026-11-15T10:00:00.000Z"))
        #expect(state.cause == .battery)
    }

    @Test func state_unknownCause_readsUnknown_andAnExtraFieldIsTolerated() throws {
        let json = #"{"userId":"u1","unreachableSince":"2026-11-15T10:00:00.000Z","cause":"satellite","extra":1}"#
        let state = try decode(PhoneReachabilityState.self, json)
        #expect(state.cause == .unknown)
    }

    @Test func state_unreadableInstant_isRefused() {
        let json = #"{"userId":"u1","unreachableSince":"hier","cause":"network"}"#
        #expect(throws: DecodingError.self) { try decode(PhoneReachabilityState.self, json) }
    }

    @Test func state_roundTripsThroughTheCache() throws {
        let state = try decode(PhoneReachabilityState.self, stateJSON)
        let back = try JSONDecoder().decode(PhoneReachabilityState.self, from: JSONEncoder().encode(state))
        #expect(back == state)
    }

    @Test func state_expiresAfterTheContractTtl() throws {
        let state = try decode(PhoneReachabilityState.self, stateJSON)
        let ttl = PhoneReachabilityContract.stateTtl
        #expect(!state.isExpired(at: state.unreachableSince.addingTimeInterval(ttl - 1)))
        #expect(state.isExpired(at: state.unreachableSince.addingTimeInterval(ttl + 1)))
    }

    @Test func changed_carriesTheAnnouncementOnlyWhenServed() throws {
        let withAnnouncement = try decode(PhoneReachabilityChanged.self, """
        {"userId":"u1","state":\(stateJSON),"announcement":{"kind":"unreachable","at":"2026-11-15T10:20:00.000Z"}}
        """)
        #expect(withAnnouncement.announcement?.kind == .unreachable)

        let bare = try decode(PhoneReachabilityChanged.self, #"{"userId":"u1","state":\#(stateJSON)}"#)
        #expect(bare.announcement == nil)
    }

    @Test func changed_unknownAnnouncementKind_isIgnored_butTheStateIsKept() throws {
        let event = try decode(PhoneReachabilityChanged.self, """
        {"userId":"u1","state":\(stateJSON),"announcement":{"kind":"teleported","at":"2026-11-15T10:20:00.000Z"}}
        """)
        #expect(event.announcement == nil)
        #expect(event.state.userId == "u1")
    }

    @Test func changed_refusesTheStateOfAnotherPerson() {
        #expect(throws: DecodingError.self) {
            try decode(PhoneReachabilityChanged.self, #"{"userId":"u2","state":\#(stateJSON)}"#)
        }
    }

    @Test func cleared_decodes_withOrWithoutItsAnnouncement() throws {
        let bare = try decode(PhoneReachabilityCleared.self, #"{"userId":"u1"}"#)
        #expect(bare.userId == "u1")
        #expect(bare.announcement == nil)

        let announced = try decode(PhoneReachabilityCleared.self,
                                   #"{"userId":"u1","announcement":{"kind":"reachable","at":"2026-11-15T11:00:00.000Z"}}"#)
        #expect(announced.announcement?.kind == .reachable)
    }

    @Test func snapshot_dropsAnUnreadableItem() throws {
        let snapshot = try decode(PhoneReachabilitySnapshot.self, #"{"items":[\#(stateJSON),{"userId":""}]}"#)
        #expect(snapshot.items.map(\.userId) == ["u1"])
    }

    @Test func personSettings_decode_andTheUpdateIsStrict() throws {
        let settings = try decode(PhoneReachabilityPersonSettings.self, #"{"userId":"u1","shared":true}"#)
        #expect(settings.isShared)
        let body = String(decoding: try JSONEncoder().encode(PhoneReachabilityPersonSettingsUpdate(isShared: false)), as: UTF8.self)
        #expect(body == #"{"shared":false}"#)
    }
}
