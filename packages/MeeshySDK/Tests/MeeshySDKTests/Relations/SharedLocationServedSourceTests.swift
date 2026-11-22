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
        notify: Bool = false,
        expectedStartedAt: String? = nil
    ) throws -> SharedLocationStartRequest {
        let fix = try #require(SharedLocationFix(latitude: 48.85, longitude: 2.35))
        return try #require(SharedLocationStartRequest(
            recipients: [SharedLocationRecipient(userId: alice, precision: .city, expiresInSeconds: 600)], duration: .oneHour,
            fix: fix, notifyRecipients: notify, source: source, replacesChosenPoint: replacesChosenPoint,
            expectedStartedAt: expectedStartedAt))
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

    // MARK: - Le partage que la réponse nomme (#20249)

    private let shown = "2026-01-01T00:00:05.000Z"

    @Test func uneRéponse_nommeLePartageMontré() throws {
        let asked = try request(source: .device, replacesChosenPoint: true, expectedStartedAt: shown)
        #expect(asked.wire["expectedStartedAt"] as? String == shown)
        #expect(asked.carriesExpectedStart)
    }

    @Test func unDémarrageOrdinaire_neNommeAucunPartage() throws {
        let plain = try request(source: .device, replacesChosenPoint: false, expectedStartedAt: shown)
        #expect(plain.wire["expectedStartedAt"] == nil)
        #expect(!plain.carriesExpectedStart)
        #expect(try request(source: .manual, replacesChosenPoint: true, expectedStartedAt: shown).wire["expectedStartedAt"] == nil)
    }

    @Test func lesReplis_gardentLePartageNommé() throws {
        let asked = try request(source: .device, replacesChosenPoint: true, notify: true, expectedStartedAt: shown)
        #expect(asked.legacyFallbacks.count == 2)
        #expect(asked.legacyFallbacks.allSatisfy { $0.expectedStartedAt == shown })
        #expect(asked.withMotion(.walking).expectedStartedAt == shown)
    }

    @Test func leRefusDUnPartageRemplacéAilleurs_aSaPropreRaison() {
        #expect(SharedLocationSendOutcome.ofRefusal("SHARED_LOCATION_STARTED_ELSEWHERE") == .startedElsewhere)
    }

    @Test func laRelecture_ditSiLaPasserelleAccepteLaClé() throws {
        #expect(try snapshot(#"{"recipients":[],"acceptsExpectedStart":true}"#).acceptsExpectedStart)
        #expect(!(try snapshot(#"{"recipients":[]}"#).acceptsExpectedStart))
        #expect(!(try snapshot(#"{"recipients":[],"acceptsExpectedStart":"true"}"#).acceptsExpectedStart))
    }

    @Test func seulUnInstantDeLaFormeServie_seNomme() {
        #expect(SharedLocationWireInstant.isWire(shown))
        #expect(SharedLocationWireInstant.isWire("2026-01-01T00:00:05Z"))
        #expect(!SharedLocationWireInstant.isWire("S1"))
        #expect(!SharedLocationWireInstant.isWire("2026-01-01 00:00:05"))
        #expect(!SharedLocationWireInstant.isWire("2026-13-45T00:00:05.000Z"))
        #expect(!SharedLocationWireInstant.isWire(nil))
    }
}
