import XCTest
@testable import MeeshySDK

final class StoryLocationObjectTests: XCTestCase {

    /// Round-trip DISCRIMINANT : chaque champ porte une valeur DIFFÉRENTE du
    /// repli du décodeur (`?? 0.5 / ?? 0.8 / ?? 1.0 / ?? 0` et l'ancre
    /// centrale). Avec les valeurs par défaut, retirer `encode(x)` — ou tout
    /// le conteneur `anchor` — laissait le test vert alors que la pastille
    /// revenait recentrée en bas de slide après un undo/redo.
    func test_storySlide_roundTripsLocationObjects() throws {
        let object = StoryLocationObject(
            id: "loc-1",
            place: SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel"),
            x: 0.2, y: 0.35, scale: 1.4, rotation: 22, zIndex: 3,
            anchor: CGPoint(x: 0.25, y: 0.75))
        let slide = StorySlide.stub(locationObjects: [object])

        let restored = try JSONDecoder().decode(
            StorySlide.self, from: try JSONEncoder().encode(slide))
        let badge = try XCTUnwrap(restored.locationObjects.first,
                                 "Une clef absente de CodingKeys ou d'encode perd l'objet en silence.")
        XCTAssertEqual(badge.id, "loc-1")
        XCTAssertEqual(badge.place.name, "Tour Eiffel")
        XCTAssertEqual(badge.place.latitude, 48.8566, accuracy: 0.00001)
        XCTAssertEqual(badge.place.longitude, 2.3522, accuracy: 0.00001)
        XCTAssertEqual(badge.x, 0.2, accuracy: 0.00001, "x non encodé → pastille recentrée horizontalement")
        XCTAssertEqual(badge.y, 0.35, accuracy: 0.00001, "y non encodé → pastille renvoyée en bas de slide")
        XCTAssertEqual(badge.scale, 1.4, accuracy: 0.00001)
        XCTAssertEqual(badge.rotation, 22, accuracy: 0.00001)
        XCTAssertEqual(badge.zIndex, 3)
        XCTAssertEqual(Double(badge.anchor.x), 0.25, accuracy: 0.00001)
        XCTAssertEqual(Double(badge.anchor.y), 0.75, accuracy: 0.00001)
    }

    func test_legacySlideWithoutLocationObjectsStillDecodes() throws {
        let json = Data(#"{"id":"s1","textObjects":[]}"#.utf8)
        let slide = try JSONDecoder().decode(StorySlide.self, from: json)
        XCTAssertTrue(slide.locationObjects.isEmpty,
                      "Les stories deja sur disque doivent continuer a se decoder.")
    }

    // MARK: - L'unité persistée ET réseau est `StoryEffects`

    /// `StoryDraftStore` ne persiste que `effects_json` et
    /// `PostService.createStory(content:storyEffects:)` n'envoie que les
    /// effets : une pastille portée par le seul `StorySlide` ne survivait ni
    /// à une relance de l'app ni à la publication.
    func test_storyEffects_roundTripsLocationObjects() throws {
        var effects = StoryEffects()
        effects.locationObjects = [
            StoryLocationObject(id: "loc-1",
                                place: SharedPlace(latitude: 48.8566, longitude: 2.3522,
                                                   name: "Tour Eiffel"),
                                x: 0.2, y: 0.35)
        ]

        let restored = try JSONDecoder().decode(
            StoryEffects.self, from: try JSONEncoder().encode(effects))

        let badge = try XCTUnwrap(restored.locationObjects.first,
                                  "effects_json (brouillon) et le body de createStory ne portent QUE les effets.")
        XCTAssertEqual(badge.place.name, "Tour Eiffel")
        XCTAssertEqual(badge.x, 0.2, accuracy: 0.00001)
        XCTAssertEqual(badge.y, 0.35, accuracy: 0.00001)
    }

    func test_legacyEffectsWithoutLocationObjectsStillDecode() throws {
        let json = Data(#"{"textObjects":[]}"#.utf8)
        let effects = try JSONDecoder().decode(StoryEffects.self, from: json)
        XCTAssertTrue(effects.locationObjects.isEmpty)
    }

    /// Les cinq sites qui reconstruisent un slide (édition, repost,
    /// `StoryItem.asSlide`, chargement de brouillon, cover receveur) le font
    /// depuis `storyEffects` SEUL. Le badge doit survivre à cette
    /// reconstruction, sinon il est perdu à chaque ré-ouverture.
    func test_aSlideRebuiltFromItsEffectsAloneKeepsTheBadge() {
        var slide = StorySlide(id: "s1")
        slide.locationObjects = [
            StoryLocationObject(id: "loc-1",
                                place: SharedPlace(latitude: 48.8566, longitude: 2.3522,
                                                   name: "Tour Eiffel"))
        ]

        let rebuilt = StorySlide(id: "s1", content: slide.content, effects: slide.effects)

        XCTAssertEqual(rebuilt.locationObjects.first?.place.name, "Tour Eiffel",
                       "Reconstruire un slide depuis ses effets ne doit pas perdre la pastille.")
    }
}

private extension StorySlide {
    static func stub(locationObjects: [StoryLocationObject]) -> StorySlide {
        var slide = StorySlide(id: "stub")
        slide.locationObjects = locationObjects
        return slide
    }
}
