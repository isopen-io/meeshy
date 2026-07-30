import XCTest
@testable import MeeshySDK

final class StoryLocationObjectTests: XCTestCase {

    func test_storySlide_roundTripsLocationObjects() throws {
        let object = StoryLocationObject(
            id: "loc-1",
            place: SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel"),
            x: 0.5, y: 0.8, scale: 1.0, rotation: 0, zIndex: 3,
            anchor: CGPoint(x: 0.5, y: 0.5))
        let slide = StorySlide.stub(locationObjects: [object])

        let restored = try JSONDecoder().decode(
            StorySlide.self, from: try JSONEncoder().encode(slide))
        XCTAssertEqual(restored.locationObjects.first?.place.name, "Tour Eiffel",
                       "Une clef absente de CodingKeys ou d'encode perd l'objet en silence.")
        XCTAssertEqual(restored.locationObjects.first?.zIndex, 3)
    }

    func test_legacySlideWithoutLocationObjectsStillDecodes() throws {
        let json = Data(#"{"id":"s1","textObjects":[]}"#.utf8)
        let slide = try JSONDecoder().decode(StorySlide.self, from: json)
        XCTAssertTrue(slide.locationObjects.isEmpty,
                      "Les stories deja sur disque doivent continuer a se decoder.")
    }
}

private extension StorySlide {
    static func stub(locationObjects: [StoryLocationObject]) -> StorySlide {
        StorySlide(id: "stub", locationObjects: locationObjects)
    }
}
