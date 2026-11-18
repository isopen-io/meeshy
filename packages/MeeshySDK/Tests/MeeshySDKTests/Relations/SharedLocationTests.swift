import Foundation
import Testing
@testable import MeeshySDK

/// LES POSITIONS QU'ON ME PARTAGE, LECTURE SWIFT DU CONTRAT (#16983) — `packages/shared/types/shared-location.ts`. Ce qui
/// arrive est ce que la passerelle a servi À CE LECTEUR : rien de plus fin ne peut se poser, rien d'illisible ne passe.
struct SharedLocationTests {

    private func decode<T: Decodable>(_ type: T.Type, _ object: [String: Any]) -> T? {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func wire(
        userId: String = "u1", latitude: Double = 48.85, longitude: Double = 2.35,
        precision: String = "city", radius: Double = 8000,
        updatedAt: String = "2026-11-13T10:00:00.000Z", expiresAt: String = "2026-11-13T11:00:00.000Z"
    ) -> [String: Any] {
        [
            "userId": userId, "latitude": latitude, "longitude": longitude, "precision": precision,
            "radiusMeters": radius, "updatedAt": updatedAt, "expiresAt": expiresAt,
        ]
    }

    @Test("une position floutée à la ville se lit telle que servie, avec son rayon")
    func cityPosition_decodesAsServed() throws {
        let decoded = try #require(decode(SharedLocationChanged.self, wire()))
        #expect(decoded.userId == "u1")
        #expect(decoded.precision == .city)
        #expect(decoded.latitude == 48.85)
        #expect(decoded.radiusMeters == 8000)
        #expect(decoded.lifetime == 3600)
    }

    @Test("un champ en trop (la précision réelle de l'appareil) n'a nulle part où se poser")
    func extraAccuracy_isNotKept() throws {
        var payload = wire(precision: "exact", radius: 25)
        payload["accuracy"] = 3
        payload["exactLatitude"] = 48.853_41
        let decoded = try #require(decode(SharedLocationChanged.self, payload))
        let mirror = Mirror(reflecting: decoded).children.compactMap(\.label)
        #expect(Set(mirror) == ["userId", "latitude", "longitude", "precision", "radiusMeters", "updatedAt", "expiresAt", "circle"])
        #expect(decoded.radiusMeters == 25)
    }

    @Test("le cercle servi se lit tel quel (#17013) ; absent, inconnu ou sous Ami, le marqueur reste neutre")
    func circle_isReadOnlyWhenServedAndKnown() throws {
        var blood = wire()
        blood["circle"] = "BLOOD"
        #expect(try #require(decode(SharedLocationChanged.self, blood)).circle == .blood)
        #expect(try #require(decode(SharedLocationChanged.self, wire())).circle == nil)
        for odd: Any in ["ACQUAINTANCE", "PUBLIC", "ATOM", 7] {
            var payload = wire()
            payload["circle"] = odd
            #expect(try #require(decode(SharedLocationChanged.self, payload)).circle == nil)
        }
    }

    @Test("une coordonnée hors du globe, une précision inconnue ou un rayon négatif sont refusés")
    func illegible_isRefused() {
        #expect(decode(SharedLocationChanged.self, wire(latitude: 91)) == nil)
        #expect(decode(SharedLocationChanged.self, wire(longitude: -181)) == nil)
        #expect(decode(SharedLocationChanged.self, wire(precision: "street")) == nil)
        #expect(decode(SharedLocationChanged.self, wire(radius: -1)) == nil)
        #expect(decode(SharedLocationChanged.self, wire(userId: "  ")) == nil)
        #expect(decode(SharedLocationChanged.self, wire(updatedAt: "hier")) == nil)
    }

    @Test("le cercle d'une position exacte ne descend jamais sous 10 m")
    func exactRadius_hasAFloor() throws {
        let decoded = try #require(decode(SharedLocationChanged.self, wire(precision: "exact", radius: 2)))
        #expect(decoded.radiusMeters == SharedLocationContract.exactMinRadiusMeters)
    }

    @Test("une échéance absurde est bornée aux 8 h du contrat, une échéance passée vaut zéro")
    func lifetime_isBounded() throws {
        let far = try #require(decode(SharedLocationChanged.self, wire(expiresAt: "2026-11-20T10:00:00.000Z")))
        #expect(far.lifetime == SharedLocationContract.maxLifetime)
        let past = try #require(decode(SharedLocationChanged.self, wire(expiresAt: "2026-11-13T09:00:00.000Z")))
        #expect(past.lifetime == 0)
    }

    @Test("un élément illisible est écarté sans faire tomber le rattrapage")
    func snapshot_isLenient() throws {
        let snapshot = try #require(decode(SharedLocationSnapshot.self, ["items": [wire(userId: "a"), wire(latitude: 400), wire(userId: "b")]]))
        #expect(snapshot.items.map(\.userId) == ["a", "b"])
    }

    // MARK: - En pause par fantôme (#19562)

    @Test("un élément en pause par fantôme se lit comme un fantôme : qui et de quel cercle, rien d'autre")
    func ghost_decodesWhoAndCircleOnly() throws {
        let kwame: [String: Any] = ["userId": "kwame", "paused": "ghost", "circle": "BLOOD"]
        let mina: [String: Any] = ["userId": "mina", "ghost": true]
        let items: [[String: Any]] = [wire(userId: "a"), kwame, mina]
        let snapshot = try #require(decode(SharedLocationSnapshot.self, ["items": items]))
        #expect(snapshot.items.map(\.userId) == ["a"])
        #expect(snapshot.ghosts == [SharedLocationGhost(userId: "kwame", circle: .blood), SharedLocationGhost(userId: "mina")])
        let fields = Set(Mirror(reflecting: snapshot.ghosts[0]).children.compactMap(\.label))
        #expect(fields == ["userId", "circle"])
    }

    @Test("un fantôme servi AVEC des coordonnées ne devient jamais une position")
    func ghostWithCoordinates_isNeverAPosition() throws {
        var payload = wire(userId: "kwame")
        payload["paused"] = "ghost"
        #expect(decode(SharedLocationChanged.self, payload) == nil)
        let snapshot = try #require(decode(SharedLocationSnapshot.self, ["items": [payload]]))
        #expect(snapshot.items.isEmpty)
        #expect(snapshot.ghosts.map(\.userId) == ["kwame"])
    }

    @Test("sans champ de pause, personne n'est en fantôme ; un cercle hors des trois se lit comme absent")
    func noPauseField_noGhost() throws {
        let other: [String: Any] = ["userId": "b", "paused": "other"]
        let items: [[String: Any]] = [wire(userId: "a"), other]
        let snapshot = try #require(decode(SharedLocationSnapshot.self, ["items": items]))
        #expect(snapshot.ghosts.isEmpty)
        let outside: [String: Any] = ["userId": "c", "paused": "ghost", "circle": "PUBLIC"]
        let ghost = try #require(decode(SharedLocationGhost.self, outside))
        #expect(ghost.circle == nil)
    }

    @Test("une personne servie en position ET en fantôme est un fantôme")
    func pauseWins() {
        let snapshot = SharedLocationSnapshot(
            items: [SharedLocationChanged(userId: "k", latitude: 1, longitude: 1, precision: .city, radiusMeters: 8000,
                                          updatedAt: Date(), expiresAt: Date().addingTimeInterval(60))],
            ghosts: [SharedLocationGhost(userId: "k")]
        )
        #expect(snapshot.items.isEmpty)
        #expect(snapshot.ghosts.map(\.userId) == ["k"])
    }

    @Test("l'emprise part dans l'ordre que lit la passerelle, et une emprise inversée n'existe pas")
    func bounds_queryAndValidity() throws {
        let bounds = try #require(SharedLocationBounds(minLongitude: 2, minLatitude: 48, maxLongitude: 3, maxLatitude: 49))
        #expect(bounds.queryValue == "2.0,48.0,3.0,49.0")
        #expect(bounds.contains(latitude: 48.5, longitude: 2.5))
        #expect(bounds.contains(latitude: 49, longitude: 3))
        #expect(!bounds.contains(latitude: 50, longitude: 2.5))
        #expect(SharedLocationBounds(minLongitude: 3, minLatitude: 48, maxLongitude: 2, maxLatitude: 49) == nil)
        #expect(SharedLocationBounds(minLongitude: 0, minLatitude: -91, maxLongitude: 1, maxLatitude: 0) == nil)
    }
}
