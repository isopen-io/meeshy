import Combine
import Foundation
import Testing
@testable import MeeshySDK

/// LE MOUVEMENT VOYAGE AVEC LA POSITION (#19887) — `packages/shared/types/shared-location.ts` : `motion` est ADDITIF dans
/// la position envoyée, servi au seul lecteur à la précision exacte. Il part avec le relevé quand l'appareil le connaît,
/// se lit sans jamais faire tomber une position, et se tait quand la position a plus de cinq minutes.
struct SharedLocationMotionTests {

    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    private func decode(_ object: [String: Any]) -> SharedLocationChanged? {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return try? JSONDecoder().decode(SharedLocationChanged.self, from: data)
    }

    private func wire(motion: Any? = nil) -> [String: Any] {
        var wire: [String: Any] = [
            "userId": "u1", "latitude": 48.85, "longitude": 2.35, "precision": "exact", "radiusMeters": 12,
            "updatedAt": "2026-11-13T10:00:00.000Z", "expiresAt": "2026-11-13T11:00:00.000Z",
        ]
        if let motion { wire["motion"] = motion }
        return wire
    }

    @Test("les cinq mouvements du contrat, et eux seuls")
    func motions_matchTheContract() {
        #expect(SharedLocationMotion.allCases.map(\.rawValue) == ["stationary", "walking", "running", "cycling", "automotive"])
    }

    @Test("un relevé qui connaît son mouvement le porte dans sa position ; sans mouvement, aucune clé ne part")
    func fix_carriesItsMotionOnTheWire() throws {
        let walking = try #require(SharedLocationFix(latitude: 48.85, longitude: 2.35, accuracy: 10, motion: .walking))
        #expect(walking.wire["motion"] as? String == "walking")
        #expect(walking.wire["latitude"] as? Double == 48.85)
        let still = try #require(SharedLocationFix(latitude: 48.85, longitude: 2.35, accuracy: 10))
        #expect(still.wire["motion"] == nil)
        #expect(walking.withMotion(nil) == still.withMotion(nil))
        #expect(walking.withMotion(nil).wire["motion"] == nil)
    }

    @Test("le démarrage porte le mouvement dans sa position, et se renvoie sans lui")
    func startRequest_carriesAndDropsTheMotion() throws {
        let fix = try #require(SharedLocationFix(latitude: 1, longitude: 2, motion: .cycling))
        let request = try #require(SharedLocationStartRequest(
            recipients: [SharedLocationRecipient(userId: "aaaaaaaaaaaaaaaaaaaaaaaa", precision: .exact)],
            duration: .oneHour, fix: fix))
        let position = try #require(request.wire["position"] as? [String: Any])
        #expect(position["motion"] as? String == "cycling")
        let plain = request.withMotion(nil)
        let plainPosition = try #require(plain.wire["position"] as? [String: Any])
        #expect(plainPosition["motion"] == nil)
        #expect(plain.recipients == request.recipients)
        #expect(request.carriesMotion)
        #expect(!plain.carriesMotion)
    }

    @Test("une liste seule n'a pas de position, donc aucun mouvement")
    func listOnly_neverCarriesMotion() throws {
        let request = try #require(SharedLocationStartRequest(
            listOnly: [SharedLocationRecipient(userId: "aaaaaaaaaaaaaaaaaaaaaaaa", precision: .exact)], duration: .oneHour))
        #expect(!request.withMotion(.running).carriesMotion)
        #expect(request.withMotion(.running).wire["position"] == nil)
    }

    @Test("le mouvement servi se lit ; inconnu, d'un autre type ou absent, il est nil et la position reste")
    func received_motionIsTolerant() throws {
        #expect(try #require(decode(wire(motion: "running"))).motion == .running)
        #expect(try #require(decode(wire())).motion == nil)
        for odd: Any in ["flying", "", 7, NSNull()] {
            #expect(try #require(decode(wire(motion: odd))).motion == nil)
        }
    }

    @Test("le mouvement ne s'affiche que sur une position de moins de cinq minutes")
    func shown_onlyWhileFresh() {
        #expect(SharedLocationMotion.shown(.walking, updatedAt: t0, now: t0.addingTimeInterval(299)) == .walking)
        #expect(SharedLocationMotion.shown(.walking, updatedAt: t0, now: t0.addingTimeInterval(300)) == nil)
        #expect(SharedLocationMotion.shown(.automotive, updatedAt: t0, now: t0.addingTimeInterval(-30)) == .automotive)
        #expect(SharedLocationMotion.shown(nil, updatedAt: t0, now: t0) == nil)
    }

    @Test("le magasin des positions garde le mouvement servi")
    @MainActor
    func live_keepsTheServedMotion() {
        let live = SharedLocationsLive(
            viewerId: { "me" }, snapshot: { _ in [] },
            changedEvents: .init(Empty()), endedEvents: .init(Empty()), connected: .init(Empty()),
            now: { self.t0 })
        live.receive(SharedLocationChanged(
            userId: "alice", latitude: 1, longitude: 2, precision: .exact, radiusMeters: 10,
            updatedAt: t0, expiresAt: t0.addingTimeInterval(3600), motion: .cycling))
        #expect(live.byUser["alice"]?.motion == .cycling)
    }
}
