import Foundation
import Testing
@testable import MeeshySDK

/// ÉMETTRE MA POSITION À DES PERSONNES (#16983) — ce que l'émetteur iOS écrit et lit du contrat
/// `packages/shared/types/shared-location.ts` : la charge de `location:share-start` et de `location:share-update`,
/// l'accusé qui rend le terme, ses refus codés, et la cadence des mises à jour sous le débit servi.
struct SharedLocationSendingTests {

    private let alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private let bob = "bbbbbbbbbbbbbbbbbbbbbbbb"

    // MARK: - La position envoyée

    @Test func unRelevéDansLeGlobe_partAvecSaPrécisionBornée() {
        let fix = SharedLocationFix(latitude: 48.85, longitude: 2.35, accuracy: 250_000)
        #expect(fix?.wire["latitude"] == 48.85)
        #expect(fix?.wire["longitude"] == 2.35)
        #expect(fix?.wire["accuracy"] == SharedLocationContract.maxRadiusMeters)
    }

    @Test func unRelevéHorsDuGlobe_neSeConstruitPas() {
        #expect(SharedLocationFix(latitude: 91, longitude: 0) == nil)
        #expect(SharedLocationFix(latitude: 0, longitude: -181) == nil)
        #expect(SharedLocationFix(latitude: .nan, longitude: 0) == nil)
    }

    @Test func unePrécisionInconnueOuNégative_nePartPas() {
        #expect(SharedLocationFix(latitude: 1, longitude: 1, accuracy: -5)?.wire["accuracy"] == nil)
        #expect(SharedLocationFix(latitude: 1, longitude: 1, accuracy: nil)?.wire["accuracy"] == nil)
    }

    // MARK: - La charge de `location:share-start`

    @Test func leDémarrage_porteDestinatairesPrécisionsDuréeEtPosition() throws {
        let fix = try #require(SharedLocationFix(latitude: 10, longitude: 20, accuracy: 15))
        let payload = try #require(SharedLocationStartRequest(
            recipients: [SharedLocationRecipient(userId: alice, precision: .exact), SharedLocationRecipient(userId: bob, precision: .city)],
            duration: .eightHours,
            fix: fix
        ))
        let wire = payload.wire
        #expect(wire["durationMinutes"] as? Int == 480)
        let recipients = try #require(wire["recipients"] as? [[String: String]])
        #expect(recipients == [["userId": alice, "precision": "exact"], ["userId": bob, "precision": "city"]])
        let position = try #require(wire["position"] as? [String: Double])
        #expect(position == ["latitude": 10, "longitude": 20, "accuracy": 15])
    }

    @Test func unDestinataireEnDouble_neGardeQueSaDernièrePrécision() throws {
        let fix = try #require(SharedLocationFix(latitude: 0, longitude: 0))
        let payload = try #require(SharedLocationStartRequest(
            recipients: [SharedLocationRecipient(userId: alice, precision: .exact), SharedLocationRecipient(userId: alice.uppercased(), precision: .neighborhood)],
            duration: .oneHour,
            fix: fix
        ))
        #expect(payload.recipients == [SharedLocationRecipient(userId: alice, precision: .neighborhood)])
    }

    @Test func sansDestinataireValide_rienNePart() throws {
        let fix = try #require(SharedLocationFix(latitude: 0, longitude: 0))
        #expect(SharedLocationStartRequest(recipients: [], duration: .oneHour, fix: fix) == nil)
        #expect(SharedLocationStartRequest(recipients: [SharedLocationRecipient(userId: "pas-un-id", precision: .city)], duration: .oneHour, fix: fix) == nil)
    }

    @Test func auDelàDuPlafond_rienNePart() throws {
        let fix = try #require(SharedLocationFix(latitude: 0, longitude: 0))
        let many = (0...SharedLocationStartRequest.maxRecipients).map {
            SharedLocationRecipient(userId: String(format: "%024x", $0 + 1), precision: .city)
        }
        #expect(SharedLocationStartRequest(recipients: many, duration: .oneHour, fix: fix) == nil)
    }

    @Test func lesDeuxDurées_sontCellesDuContrat() {
        #expect(SharedLocationShareDuration.allCases.map(\.rawValue) == [60, 480])
    }

    // MARK: - L'accusé

    private func verdict(_ raw: Any?) -> SharedLocationStartVerdict {
        SharedLocationStartVerdict.read(SocketAck<SharedLocationStartedWire>.parse(raw, payloadAt: .data))
    }

    @Test func unAccuséAccepté_rendLeTermeServi() {
        #expect(verdict(["success": true, "data": ["expiresAt": "2026-11-14T10:00:00.000Z"]])
            == .started(expiresAt: Date(timeIntervalSince1970: 1_794_650_400)))
    }

    @Test func unAccuséSansTermeLisible_estUnÉchec() {
        #expect(verdict(["success": true, "data": ["expiresAt": "demain"]]) == .refused(.failed))
        #expect(verdict(["success": true]) == .refused(.failed))
    }

    @Test func lesRefusCodés_disentLeurRaison() {
        #expect(verdict(["success": false, "error": "x", "code": "SHARED_LOCATION_RATE_LIMITED"]) == .refused(.rateLimited))
        #expect(verdict(["success": false, "error": "x", "code": "SHARED_LOCATION_UNAVAILABLE"]) == .refused(.unavailable))
        #expect(verdict(["success": false, "error": "x", "code": "SHARED_LOCATION_INVALID"]) == .refused(.invalid))
        #expect(verdict(["success": false, "error": "x", "code": "SHARED_LOCATION_NOT_SHARING"]) == .refused(.notSharing))
        #expect(verdict(["success": false, "error": "x", "code": "INCONNU"]) == .refused(.failed))
    }

    @Test func unAccuséQuiNeVientPas_ditHorsLigne() {
        #expect(verdict(nil) == .refused(.offline))
    }

    // MARK: - La cadence des mises à jour

    private func fix(_ lat: Double, _ lon: Double) -> SharedLocationFix {
        SharedLocationFix(latitude: lat, longitude: lon)!
    }

    @Test func lePremierRelevé_partToujours() {
        let now = Date(timeIntervalSince1970: 1000)
        #expect(SharedLocationUpdateGate.shouldSend(fix(0, 0), now: now, last: nil))
    }

    @Test func unRelevéImmobile_attendLeBattement() {
        let start = Date(timeIntervalSince1970: 1000)
        let last = SharedLocationUpdateGate.Sent(fix: fix(48.85, 2.35), at: start)
        #expect(!SharedLocationUpdateGate.shouldSend(fix(48.85, 2.35), now: start.addingTimeInterval(30), last: last))
        #expect(SharedLocationUpdateGate.shouldSend(fix(48.85, 2.35), now: start.addingTimeInterval(SharedLocationUpdateGate.heartbeat), last: last))
    }

    @Test func unDéplacementNet_partAprèsLIntervalleMinimal() {
        let start = Date(timeIntervalSince1970: 1000)
        let last = SharedLocationUpdateGate.Sent(fix: fix(48.85, 2.35), at: start)
        let moved = fix(48.8510, 2.35)
        #expect(!SharedLocationUpdateGate.shouldSend(moved, now: start.addingTimeInterval(2), last: last))
        #expect(SharedLocationUpdateGate.shouldSend(moved, now: start.addingTimeInterval(SharedLocationUpdateGate.minimumInterval), last: last))
    }

    @Test func laCadenceRésteSousLeDébitServi() {
        #expect(60 / SharedLocationUpdateGate.minimumInterval < 120)
    }
}
