import XCTest
@testable import MeeshySDK

/// **Le cadrage choisi par l'auteur doit SURVIVRE au fil** (double-tap fond).
///
/// `videoFitMode` est le seul champ du fond qui ne soit pas une coordonnée
/// géométrique : il ne vit pas sur `mediaObjects[bg]` mais sur
/// `effects.backgroundTransform`. La question que ce fichier pose n'est donc
/// pas « le transform se sérialise-t-il ? » mais « se sérialise-t-il quand le
/// fond est un MÉDIA », c'est-à-dire dans le cas nominal du composer.
final class BackgroundFitModeWireTests: XCTestCase {

    private func effects(background: String?) -> StoryEffects {
        var e = StoryEffects(background: background)
        e.mediaObjects = [
            StoryMediaObject(id: "bg-media", postMediaId: "pm-1",
                             mediaURL: "https://cdn/x.jpg", mediaType: "image",
                             aspectRatio: 1.5, isBackground: true)
        ]
        e.backgroundTransform = StoryBackgroundTransform(videoFitMode: "fit")
        return e
    }

    private func roundTrip(_ e: StoryEffects) throws -> StoryEffects {
        let data = try JSONEncoder().encode(e)
        let document = try JSONDecoder().decode(CanvasV3.self, from: data)
        return StoryEffects(rendering: document, sceneIndex: 0)
    }

    func test_fitMode_survitAuFil_avecFondColoreDeclare() throws {
        let servi = try roundTrip(effects(background: "1E1B4B"))
        XCTAssertEqual(servi.backgroundTransform?.videoFitMode, "fit")
    }

    func test_fitMode_survitAuFil_sansFondColore() throws {
        let servi = try roundTrip(effects(background: nil))
        XCTAssertEqual(servi.backgroundTransform?.videoFitMode, "fit")
    }
}
