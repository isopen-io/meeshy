import Foundation
import Testing
@testable import MeeshySDK

/// « JUSQU'À CE QUE J'ARRÊTE » (#19616, planche `Carte-Partage`) : un partage sans échéance, réservé au Sang. Ce que
/// l'émetteur iOS écrit (`untilStopped: true`) et lit (`expiresAt: null`, `acceptsUntilStopped`) du contrat demandé à
/// la passerelle (#19304, point 3). Sans capacité servie, rien ne change.
struct SharedLocationUntilStoppedTests {

    private let alice = "aaaaaaaaaaaaaaaaaaaaaaaa"

    private func request(untilStopped: Bool, notify: Bool = false, deadline: Int? = nil) throws -> SharedLocationStartRequest {
        let fix = try #require(SharedLocationFix(latitude: 48.85, longitude: 2.35))
        return try #require(SharedLocationStartRequest(
            recipients: [SharedLocationRecipient(userId: alice, precision: .neighborhood, expiresInSeconds: deadline)],
            duration: .eightHours, fix: fix, notifyRecipients: notify, untilStopped: untilStopped))
    }

    // MARK: - La charge

    @Test func unPartageSansFin_porteLaCléEtGardeLaDuréeDuSchéma() throws {
        let wire = try request(untilStopped: true).wire
        #expect(wire["untilStopped"] as? Bool == true)
        #expect(wire["durationMinutes"] as? Int == 480)
    }

    @Test func unPartageBorné_nePorteJamaisLaClé() throws {
        let wire = try request(untilStopped: false).wire
        #expect(wire["untilStopped"] == nil)
    }

    @Test func lesReplis_neDégradentJamaisUnPartageSansFinEnPartageBorné() throws {
        let asked = try request(untilStopped: true, notify: true, deadline: 600)
        let kept = asked.legacyFallbacks.map(\.untilStopped)
        #expect(kept == [true, true])
    }

    // MARK: - L'accusé

    private func verdict(_ raw: [String: Any]) -> SharedLocationStartVerdict {
        SharedLocationStartVerdict.read(SocketAck<SharedLocationStartedWire>.parse(raw, payloadAt: .data))
    }

    @Test func unAccuséSansÉchéance_estUnDémarrageSansFin() {
        let accepted = verdict(["success": true, "data": ["expiresAt": NSNull()]])
        #expect(accepted == .started(expiresAt: SharedLocationShareTerm.openEndedDeadline))
    }

    @Test func unAccuséSansLaClé_resteUnÉchec() {
        let empty: [String: Any] = [:]
        let accepted = verdict(["success": true, "data": empty])
        #expect(accepted == .refused(.failed))
    }

    // MARK: - Le cliché de mon partage

    @Test func unePersonneServieSansÉchéance_estLueSansFin() throws {
        let json = #"{"recipients":[{"userId":"aaaaaaaaaaaaaaaaaaaaaaaa","precision":"exact","expiresAt":null}],"acceptsUntilStopped":true}"#
        let served = try JSONDecoder().decode(SharedLocationOwnSnapshot.self, from: Data(json.utf8))
        let only = try #require(served.recipients.first)
        #expect(SharedLocationShareTerm.isOpenEnded(only.expiresAt))
        #expect(served.acceptsUntilStopped)
    }

    @Test func unePersonneSansLaClé_resteIllisible() throws {
        let json = #"{"recipients":[{"userId":"aaaaaaaaaaaaaaaaaaaaaaaa","precision":"exact"}]}"#
        let served = try JSONDecoder().decode(SharedLocationOwnSnapshot.self, from: Data(json.utf8))
        #expect(served.recipients.isEmpty)
    }

    @Test func unePasserelleQuiNeDitRien_nAcceptePasLePartageSansFin() throws {
        let served = try JSONDecoder().decode(SharedLocationOwnSnapshot.self, from: Data(#"{"recipients":[]}"#.utf8))
        #expect(!served.acceptsUntilStopped)
    }

    // MARK: - Le terme

    @Test func uneÉchéanceBornée_nEstJamaisSansFin() {
        let soon = Date(timeIntervalSince1970: 1_800_000_000)
        #expect(!SharedLocationShareTerm.isOpenEnded(soon))
        #expect(SharedLocationShareTerm.isOpenEnded(.distantFuture))
    }
}
