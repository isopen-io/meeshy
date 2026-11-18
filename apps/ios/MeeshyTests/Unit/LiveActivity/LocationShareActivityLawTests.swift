import XCTest
import MeeshySDK
@testable import Meeshy

/// **La position qu'une personne me partage vit dans l'îlot et sur l'écran verrouillé** (planche `Hors-App`, vues 1
/// et 2, #19524) : une activité à la fois, pour une personne nommée, jusqu'à l'échéance, sans jamais rien de plus fin
/// que la précision servie.
@MainActor
final class LocationShareActivityLawTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_000_000)

    private func entry(
        minutes: Double = 40,
        precision: SharedLocationPrecision = .neighborhood,
        latitude: Double = 38.711,
        longitude: Double = -9.13
    ) -> SharedLocationEntry {
        SharedLocationEntry(
            latitude: latitude,
            longitude: longitude,
            precision: precision,
            radiusMeters: 500,
            updatedAt: now,
            deadline: now.addingTimeInterval(minutes * 60),
            circle: .close
        )
    }

    private func person(_ id: String, _ name: String, username: String? = nil) -> CirclePerson {
        CirclePerson(id: id, name: name, username: username, avatarURL: nil)
    }

    private func step(
        _ shown: LocationShareActivityLaw.Shown?,
        shares: [String: SharedLocationEntry],
        people: [String: CirclePerson],
        places: [String: LocationShareActivityLaw.Place] = [:],
        at instant: Date? = nil
    ) -> LocationShareActivityLaw.Step {
        LocationShareActivityLaw.step(shown: shown, shares: shares, people: people, places: places, now: instant ?? now)
    }

    func test_nothingShared_opensNothing() {
        let result = step(nil, shares: [:], people: [:])
        XCTAssertNil(result.shown)
        XCTAssertEqual(result.action, .none)
    }

    func test_aNamedPersonSharing_opensHerCountdown_atTheServedPrecision() throws {
        let result = step(nil, shares: ["leo": entry()], people: ["leo": person("leo", "Léo Marchetti", username: "leo.m")])

        guard case .start(let shown) = result.action else { return XCTFail("l'activité doit s'ouvrir") }
        XCTAssertEqual(shown.identity.userId, "leo")
        XCTAssertEqual(shown.identity.name, "Léo Marchetti")
        XCTAssertEqual(shown.identity.initials, "LM")
        XCTAssertEqual(shown.identity.username, "leo.m")
        XCTAssertFalse(shown.identity.accentHex.isEmpty)
        XCTAssertEqual(shown.snapshot.deadline, now.addingTimeInterval(40 * 60))
        XCTAssertEqual(shown.snapshot.precision, LocationShareActivityLaw.precisionWord(.neighborhood))
        XCTAssertNil(shown.snapshot.place, "aucun lieu inventé avant que l'appareil ne l'ait nommé")
        XCTAssertEqual(result.shown, shown)
    }

    func test_anUnnamedSharer_waits_neverOpensAsSomeone() {
        let result = step(nil, shares: ["leo": entry()], people: [:])
        XCTAssertNil(result.shown)
        XCTAssertEqual(result.action, .none)
    }

    func test_aShareAlreadyDue_opensNothing() {
        let result = step(nil, shares: ["leo": entry(minutes: 1)], people: ["leo": person("leo", "Léo")],
                          at: now.addingTimeInterval(120))
        XCTAssertNil(result.shown)
        XCTAssertEqual(result.action, .none)
    }

    func test_theShownPersonStays_whileHerShareLives_evenIfAnotherLastsLonger() {
        let people = ["leo": person("leo", "Léo"), "mina": person("mina", "Mina")]
        let first = step(nil, shares: ["leo": entry(minutes: 20)], people: people)

        let second = step(first.shown, shares: ["leo": entry(minutes: 20), "mina": entry(minutes: 90)], people: people)

        XCTAssertEqual(second.shown?.identity.userId, "leo", "l'îlot ne saute pas d'une personne à l'autre")
        XCTAssertEqual(second.action, .none)
    }

    func test_whenTheShownShareEnds_theNextPersonReplacesIt() {
        let people = ["leo": person("leo", "Léo"), "mina": person("mina", "Mina")]
        let first = step(nil, shares: ["leo": entry(minutes: 20), "mina": entry(minutes: 90)], people: people)
        XCTAssertEqual(first.shown?.identity.userId, "mina", "la plus longue échéance ouvre")

        let second = step(first.shown, shares: ["leo": entry(minutes: 20)], people: people)

        guard case .replace(let shown) = second.action else { return XCTFail("une autre personne, une autre activité") }
        XCTAssertEqual(shown.identity.userId, "leo")
    }

    func test_whenEveryShareEnds_theActivityCloses() {
        let people = ["leo": person("leo", "Léo")]
        let first = step(nil, shares: ["leo": entry()], people: people)

        let second = step(first.shown, shares: [:], people: people)

        XCTAssertNil(second.shown)
        XCTAssertEqual(second.action, .end)
    }

    func test_aLaterDeadline_updatesTheCountdown() {
        let people = ["leo": person("leo", "Léo")]
        let first = step(nil, shares: ["leo": entry(minutes: 20)], people: people)

        let second = step(first.shown, shares: ["leo": entry(minutes: 60)], people: people)

        guard case .update(let shown) = second.action else { return XCTFail("l'échéance a changé") }
        XCTAssertEqual(shown.snapshot.deadline, now.addingTimeInterval(60 * 60))
    }

    func test_aNamedPlace_showsOnlyForTheCoordinateItWasNamedFor() {
        let people = ["leo": person("leo", "Léo")]
        let shares = ["leo": entry(latitude: 38.711, longitude: -9.13)]
        let first = step(nil, shares: shares, people: people)
        let named = ["leo": LocationShareActivityLaw.Place(latitude: 38.711, longitude: -9.13, name: "Alfama", city: "Lisbonne")]

        let second = step(first.shown, shares: shares, people: people, places: named)
        guard case .update(let shown) = second.action else { return XCTFail("le lieu nommé s'ajoute") }
        XCTAssertEqual(shown.snapshot.place, "Alfama")
        XCTAssertEqual(shown.snapshot.city, "Lisbonne")

        let moved = ["leo": entry(latitude: 38.72, longitude: -9.14)]
        let third = step(second.shown, shares: moved, people: people, places: named)
        guard case .update(let after) = third.action else { return XCTFail("le lieu d'avant ne suit pas la personne") }
        XCTAssertNil(after.snapshot.place, "un lieu nommé pour une autre maille ne s'affiche pas")
    }

    func test_placeName_neverGoesFinerThanTheServedPrecision() {
        let city = LocationShareActivityLaw.Place.named(subLocality: "Alfama", locality: "Lisbonne", precision: .city)
        XCTAssertEqual(city.name, "Lisbonne", "à la ville près, le quartier ne se nomme pas")
        XCTAssertNil(city.city)

        let neighborhood = LocationShareActivityLaw.Place.named(subLocality: "Alfama", locality: "Lisbonne", precision: .neighborhood)
        XCTAssertEqual(neighborhood.name, "Alfama")
        XCTAssertEqual(neighborhood.city, "Lisbonne")

        let sameName = LocationShareActivityLaw.Place.named(subLocality: "Lisbonne", locality: "Lisbonne", precision: .exact)
        XCTAssertEqual(sameName.name, "Lisbonne")
        XCTAssertNil(sameName.city, "la ville ne se répète pas")

        let unknown = LocationShareActivityLaw.Place.named(subLocality: nil, locality: nil, precision: .neighborhood)
        XCTAssertNil(unknown.name)
    }

    func test_eachPrecision_hasItsOwnWord() {
        let words = Set(SharedLocationPrecision.allCases.map { LocationShareActivityLaw.precisionWord($0) })
        XCTAssertEqual(words.count, SharedLocationPrecision.allCases.count)
        XCTAssertFalse(words.contains(""))
    }
}
