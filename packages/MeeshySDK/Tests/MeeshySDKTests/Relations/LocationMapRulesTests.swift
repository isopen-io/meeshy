import Foundation
import Testing
@testable import MeeshySDK

/// LA CARTE DES POSITIONS PARTAGÉES, SES RÈGLES (#18872) — planches Carte-Personne, Carte-Proches, Carte-Partage et
/// Carte-Sang. Des règles pures sur ce que la passerelle a servi : rien ne devient plus fin, rien n'est inventé.
struct LocationMapRulesTests {

    private let now = Date(timeIntervalSince1970: 1_763_301_600)

    private func entry(minutesLeft: Double, circle: RelationLevel? = nil) -> SharedLocationEntry {
        SharedLocationEntry(latitude: 38.71, longitude: -9.13, precision: .neighborhood, radiusMeters: 1_200,
                            updatedAt: now, deadline: now.addingTimeInterval(minutesLeft * 60), circle: circle)
    }

    // MARK: - Distance et marche

    @Test("2,4 km se disent « 30 min à pied », une courte distance jamais moins d'une minute")
    func walking_minutes() {
        #expect(LocationMapRules.walkingMinutes(meters: 2_400) == 30)
        #expect(LocationMapRules.walkingMinutes(meters: 10) == 1)
        #expect(LocationMapRules.walkingMinutes(meters: 24_000) == nil)
        #expect(LocationMapRules.walkingMinutes(meters: .nan) == nil)
    }

    @Test("la distance au sol entre deux points de Lisbonne")
    func distance_haversine() {
        let meters = LocationMapRules.distanceMeters(fromLatitude: 38.7139, fromLongitude: -9.1334,
                                                     toLatitude: 38.7110, toLongitude: -9.1600)
        #expect(meters > 2_200 && meters < 2_500)
    }

    @Test("le rayon annoncé au partage est celui que la passerelle sert, jamais plus fin")
    func visibleRadius_matchesTheServedBlur() {
        #expect(LocationMapRules.visibleRadiusMeters(for: .city) == 12_000)
        #expect(LocationMapRules.visibleRadiusMeters(for: .neighborhood) == 1_200)
        #expect(LocationMapRules.visibleRadiusMeters(for: .exact) == SharedLocationContract.exactMinRadiusMeters)
    }

    // MARK: - Temps restant

    @Test("encore 42 min d'un partage d'une heure : la jauge est aux 42/60")
    func window_oneHour() {
        let window = SharedLocationWindow(deadline: now.addingTimeInterval(42 * 60), now: now)
        #expect(window.total == 3_600)
        #expect(window.remainingMinutes == 42)
        #expect(abs(window.fraction - 0.7) < 0.000_1)
        #expect(!window.isOver)
    }

    @Test("plus d'une heure restante : le partage a été ouvert pour 8 h ; une échéance passée est finie")
    func window_eightHours_andOver() {
        let long = SharedLocationWindow(deadline: now.addingTimeInterval(7 * 3_600 + 300), now: now)
        #expect(long.total == 8 * 3_600)
        let over = SharedLocationWindow(deadline: now.addingTimeInterval(-5), now: now)
        #expect(over.isOver)
        #expect(over.fraction == 0)
    }

    @Test("mise à jour il y a 20 s : en direct ; il y a 5 min : plus en direct")
    func freshness() {
        #expect(SharedLocationFreshness(updatedAt: now.addingTimeInterval(-20), now: now) == .live(secondsAgo: 20))
        #expect(SharedLocationFreshness(updatedAt: now.addingTimeInterval(-300), now: now) == .stale(minutesAgo: 5))
    }

    // MARK: - Mes proches

    @Test("« Du plus près » : distance croissante, les distances inconnues à la fin")
    func nearby_arranged() {
        let people = [
            NearbyPlacement(id: "leo", circle: .close, distanceMeters: 2_400),
            NearbyPlacement(id: "x", circle: nil, distanceMeters: nil),
            NearbyPlacement(id: "mina", circle: .blood, distanceMeters: 300),
            NearbyPlacement(id: "tomas", circle: .friend, distanceMeters: 24_000),
        ]
        #expect(NearbyRules.arranged(people, filter: .all).map(\.id) == ["mina", "leo", "tomas", "x"])
        #expect(NearbyRules.arranged(people, filter: .blood).map(\.id) == ["mina"])
        let counts = NearbyRules.counts(people)
        #expect(counts[.all] == 4)
        #expect(counts[.friend] == 1)
        #expect(counts[.close] == 1)
    }

    @Test("le tri : « Fin la plus proche » met d'abord le partage qui s'achève, « Par cercle » le Sang avant le Proche et l'Ami")
    func nearby_sorts() {
        let people = [
            NearbyPlacement(id: "leo", circle: .close, distanceMeters: 2_400, remaining: 42 * 60),
            NearbyPlacement(id: "x", circle: nil, distanceMeters: 10, remaining: nil),
            NearbyPlacement(id: "mina", circle: .blood, distanceMeters: 300, remaining: 7 * 3_600),
            NearbyPlacement(id: "tomas", circle: .friend, distanceMeters: 24_000, remaining: 5 * 60),
        ]
        let ending = NearbyRules.arranged(people, filter: .all, sort: .endingSoon).map(\.id)
        #expect(ending == ["tomas", "leo", "mina", "x"])
        let byCircle = NearbyRules.arranged(people, filter: .all, sort: .byCircle).map(\.id)
        #expect(byCircle == ["mina", "leo", "tomas", "x"])
        let nearest = NearbyRules.arranged(people, filter: .all, sort: .nearest).map(\.id)
        #expect(nearest == ["x", "mina", "leo", "tomas"])
    }

    @Test("mon épingle dit si ma position part : non partagée, partagée, ou partagée avec la personne regardée")
    func ownPin_saysWhetherMyPositionIsShared() {
        #expect(LocationMapOwnShare.resolve(recipientIds: [], focusedUserId: nil) == .notShared)
        #expect(LocationMapOwnShare.resolve(recipientIds: ["leo"], focusedUserId: nil) == .shared)
        #expect(LocationMapOwnShare.resolve(recipientIds: ["leo"], focusedUserId: "leo") == .sharedWithThem)
        #expect(LocationMapOwnShare.resolve(recipientIds: ["mina"], focusedUserId: "leo") == .notShared)
    }

    @Test("un partage qui s'arrête passe « pas sur la carte » ; il en sort s'il repart, et s'oublie après 8 h")
    func endings_followTheServedMap() {
        let before = ["yuki": entry(minutesLeft: 10, circle: .friend), "leo": entry(minutesLeft: 42)]
        let after = ["leo": entry(minutesLeft: 41)]
        let ended = SharedLocationEndings().advancing(from: before, to: after, now: now)
        #expect(ended.ordered.map { $0.id } == ["yuki"])
        #expect(ended.circles["yuki"] == .friend)

        let back = ended.advancing(from: after, to: ["leo": entry(minutesLeft: 40), "yuki": entry(minutesLeft: 60)],
                                   now: now.addingTimeInterval(60))
        #expect(back.ordered.isEmpty)

        let forgotten = ended.advancing(from: after, to: after, now: now.addingTimeInterval(9 * 3_600))
        #expect(forgotten.ordered.isEmpty)
    }

    // MARK: - Le cercle servi avec une position

    @Test("le cercle servi se lit ; hors des trois cercles d'une position, il est absent")
    func circle_isReadOnlyAmongTheThreeCircles() throws {
        func decode(_ circle: String?) -> SharedLocationChanged? {
            var object: [String: Any] = [
                "userId": "u1", "latitude": 38.71, "longitude": -9.13, "precision": "neighborhood", "radiusMeters": 1200,
                "updatedAt": "2026-11-16T10:00:00.000Z", "expiresAt": "2026-11-16T11:00:00.000Z",
            ]
            object["circle"] = circle
            guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
            return try? JSONDecoder().decode(SharedLocationChanged.self, from: data)
        }
        #expect(decode("BLOOD")?.circle == .blood)
        #expect(decode("ACQUAINTANCE")?.circle == nil)
        #expect(decode(nil)?.circle == nil)
        #expect(decode("??") != nil)
    }
}
