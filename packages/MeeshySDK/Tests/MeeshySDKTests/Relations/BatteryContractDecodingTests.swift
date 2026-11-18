import Foundation
import Testing
@testable import MeeshySDK

/// Le contrat de la batterie des proches (#14147), lu comme la passerelle le sert
/// (`packages/shared/types/battery.ts`).
struct BatteryContractDecodingTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    private let stateJSON = """
    {"userId":"u1","phase":"critical","level":4,"charging":false,"lowPower":true,
     "estimatedMinutes":18,"measuredAt":"2026-11-15T10:00:00.000Z","deviceLabel":"iPhone"}
    """

    @Test func readerState_decodesEveryServedField() throws {
        let state = try decode(BatteryReaderState.self, stateJSON)
        #expect(state.userId == "u1")
        #expect(state.phase == .critical)
        #expect(state.level == 4)
        #expect(state.charging == false)
        #expect(state.lowPower)
        #expect(state.estimatedMinutes == 18)
        #expect(state.deviceLabel == "iPhone")
    }

    @Test func readerState_refusesAPhaseThatIsNeverServed() {
        let json = stateJSON.replacingOccurrences(of: "\"critical\"", with: "\"normal\"")
        #expect(throws: DecodingError.self) { try decode(BatteryReaderState.self, json) }
    }

    @Test func readerState_roundTripsThroughTheCache() throws {
        let state = try decode(BatteryReaderState.self, stateJSON)
        let back = try JSONDecoder().decode(BatteryReaderState.self, from: JSONEncoder().encode(state))
        #expect(back == state)
    }

    @Test func readerState_expiresAfterTheContractTtl() throws {
        let state = try decode(BatteryReaderState.self, stateJSON)
        #expect(!state.isExpired(at: state.measuredAt.addingTimeInterval(BatteryContract.stateTtl - 1)))
        #expect(state.isExpired(at: state.measuredAt.addingTimeInterval(BatteryContract.stateTtl + 1)))
    }

    @Test func changed_carriesTheAnnouncementOnlyWhenServed() throws {
        let withAnnouncement = try decode(BatteryChanged.self, """
        {"userId":"u1","state":\(stateJSON),
         "announcement":{"kind":"critical-drop","level":4,"at":"2026-11-15T10:00:00.000Z"}}
        """)
        #expect(withAnnouncement.announcement?.kind == .criticalDrop)
        #expect(withAnnouncement.announcement?.level == 4)

        let bare = try decode(BatteryChanged.self, #"{"userId":"u1","state":\#(stateJSON)}"#)
        #expect(bare.announcement == nil)
    }

    @Test func changed_refusesTheStateOfAnotherPerson() {
        #expect(throws: DecodingError.self) {
            try decode(BatteryChanged.self, #"{"userId":"u2","state":\#(stateJSON)}"#)
        }
    }

    @Test func cleared_andPullRequested_decode() throws {
        let cleared = try decode(BatteryCleared.self, #"{"userId":"u1"}"#)
        #expect(cleared.userId == "u1")
        #expect(cleared.announcement == nil)

        let pull = try decode(BatteryPullRequested.self, #"{"requestedAt":"2026-11-15T10:00:00.000Z"}"#)
        #expect(pull.requestedAt == WireDate.date(from: "2026-11-15T10:00:00.000Z"))
    }

    @Test func pullRequested_withoutRequester_staysAnonymous() throws {
        let pull = try decode(BatteryPullRequested.self, #"{"requestedAt":"2026-11-15T10:00:00.000Z"}"#)
        #expect(pull.requestedBy == nil)
        #expect(pull.expiresAt == nil)
    }

    @Test func pullRequested_namesItsRequester_whenTheGatewayServesHim() throws {
        let json = #"{"requestedAt":"2026-11-15T10:00:00.000Z","expiresAt":"2026-11-15T10:15:00.000Z","requestedBy":{"id":"mina","displayName":"Mina","avatar":"https://a/m.jpg","circle":"BLOOD"}}"#
        let pull = try decode(BatteryPullRequested.self, json)
        #expect(pull.requestedBy == BatteryPullRequester(id: "mina", displayName: "Mina", avatar: "https://a/m.jpg", circle: .blood))
        #expect(pull.expiresAt == WireDate.date(from: "2026-11-15T10:15:00.000Z"))
    }

    @Test func pullRequested_unreadableRequester_readsAsBefore() throws {
        let noName = try decode(BatteryPullRequested.self, #"{"requestedBy":{"id":"mina","displayName":"  "}}"#)
        #expect(noName.requestedBy == nil)
        let oddCircle = try decode(BatteryPullRequested.self, #"{"requestedBy":{"id":"mina","displayName":"Mina","circle":"ATOM"}}"#)
        #expect(oddCircle.requestedBy?.circle == nil)
        #expect(oddCircle.requestedBy?.displayName == "Mina")
    }

    @Test func pullPush_readsTheRequester_asObjectOrJSONString() {
        let object: [AnyHashable: Any] = ["type": "battery_pull", "requestedBy": ["id": "mina", "displayName": "Mina"]]
        #expect(BatteryPullRequested(pushUserInfo: object).requestedBy?.id == "mina")
        let text: [AnyHashable: Any] = ["type": "battery_pull", "requestedBy": #"{"id":"mina","displayName":"Mina","circle":"CLOSE"}"#]
        #expect(BatteryPullRequested(pushUserInfo: text).requestedBy?.circle == .close)
        let bare: [AnyHashable: Any] = ["type": "battery_pull"]
        #expect(BatteryPullRequested(pushUserInfo: bare).requestedBy == nil)
    }

    @Test func personSettings_decode_andTheUpdateNamesOnlyWhatChanges() throws {
        let settings = try decode(BatteryPersonSettings.self, #"{"userId":"u1","shared":true,"receive":"pill"}"#)
        #expect(settings.receive == .pill)
        #expect(settings.isShared)
        #expect(BatteryPersonSettingsUpdate() == nil)

        let sharing = try #require(BatteryPersonSettingsUpdate(isShared: false))
        #expect(String(decoding: try JSONEncoder().encode(sharing), as: UTF8.self) == #"{"shared":false}"#)

        let update = try #require(BatteryPersonSettingsUpdate(receive: .critical))
        let body = String(decoding: try JSONEncoder().encode(update), as: UTF8.self)
        #expect(body == #"{"receive":"critical"}"#)
    }

    @Test func report_wirePayload_namesTheContractFields() {
        let report = BatteryReport(level: 25, charging: false, lowPower: true,
                                   measuredAt: Date(timeIntervalSince1970: 0), deviceLabel: "iPhone")
        let payload = report.wirePayload
        #expect(payload["level"] as? Int == 25)
        #expect(payload["charging"] as? Bool == false)
        #expect(payload["lowPower"] as? Bool == true)
        #expect(payload["measuredAt"] as? String == WireDate.string(from: Date(timeIntervalSince1970: 0)))
        #expect(payload["deviceLabel"] as? String == "iPhone")
    }
}
