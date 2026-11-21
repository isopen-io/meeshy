import Foundation
import Testing
@testable import MeeshySDK

/// LA SOURCE DU PARTAGE, côté client (#20087) : la relecture de mon partage dit si son point est CHOISI à la main ou
/// relevé par un appareil, et une position réelle ne remplace un point choisi que si l'utilisateur l'a demandé — la
/// charge le DIT (`source: 'device'`), sinon la passerelle la refuse (`SHARED_LOCATION_FIXED_POINT`).
struct SharedLocationServedSourceTests {

    private let alice = "aaaaaaaaaaaaaaaaaaaaaaaa"

    private func snapshot(_ json: String) throws -> SharedLocationOwnSnapshot {
        try JSONDecoder().decode(SharedLocationOwnSnapshot.self, from: Data(json.utf8))
    }

    private func request(
        source: SharedLocationPositionSource,
        replacesChosenPoint: Bool,
        notify: Bool = false
    ) throws -> SharedLocationStartRequest {
        let fix = try #require(SharedLocationFix(latitude: 48.85, longitude: 2.35))
        return try #require(SharedLocationStartRequest(
            recipients: [SharedLocationRecipient(userId: alice, precision: .city)], duration: .oneHour, fix: fix,
            notifyRecipients: notify, source: source, replacesChosenPoint: replacesChosenPoint))
    }

    // MARK: - Le cliché de mon partage

    @Test func unPointChoisiServi_seLitManuel() throws {
        #expect(try snapshot(#"{"recipients":[],"source":"manual"}"#).source == .manual)
    }

    @Test func unRelevéServi_seLitAppareil() throws {
        #expect(try snapshot(#"{"recipients":[],"source":"device"}"#).source == .device)
    }

    @Test func unePasserelleQuiNeDitRien_neDitAucuneSource() throws {
        #expect(try snapshot(#"{"recipients":[]}"#).source == nil)
        #expect(try snapshot(#"{"recipients":[],"source":null}"#).source == nil)
    }

    @Test func uneSourceInconnue_seLitCommeUnPointChoisi() throws {
        #expect(try snapshot(#"{"recipients":[],"source":"beacon"}"#).source == .manual)
        #expect(try snapshot(#"{"recipients":[],"source":5}"#).source == .manual)
    }

    @Test func leRefusDUnPointChoisi_aSaPropreRaison() {
        #expect(SharedLocationSendOutcome.ofRefusal("SHARED_LOCATION_FIXED_POINT") == .fixedPoint)
    }

    // MARK: - La charge

    @Test func unRelevéOrdinaire_neDitToujoursPasSaSource() throws {
        #expect(try request(source: .device, replacesChosenPoint: false).wire["source"] == nil)
    }

    @Test func unRelevéQuiRemplaceUnPointChoisi_ditAppareil() throws {
        #expect(try request(source: .device, replacesChosenPoint: true).wire["source"] as? String == "device")
    }

    @Test func unPointChoisi_resteManuel_mêmeDemandéCommeRemplacement() throws {
        let asked = try request(source: .manual, replacesChosenPoint: true)
        #expect(!asked.replacesChosenPoint)
        #expect(asked.wire["source"] as? String == "manual")
    }

    @Test func lesReplis_gardentLeRemplacement() throws {
        let asked = try request(source: .device, replacesChosenPoint: true, notify: true)
        #expect(asked.legacyFallbacks.map(\.replacesChosenPoint) == [true])
        #expect(asked.withMotion(.walking).replacesChosenPoint)
    }
}
