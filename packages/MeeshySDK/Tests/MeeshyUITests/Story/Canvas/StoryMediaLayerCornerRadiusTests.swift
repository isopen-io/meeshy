import XCTest
import UIKit
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// Régression : un média foreground (image ou vidéo) doit être rendu avec des
/// coins arrondis. `StoryMediaLayer.configure` pose un `cornerRadius`
/// proportionnel au petit côté rendu + `masksToBounds` pour clipper le
/// contenu — y compris le sublayer `AVPlayerLayer` du chemin vidéo.
///
/// Le cadre foreground (`StoryCanvasUIView.applyForegroundFrames`) pose son
/// `border` sur ce même layer : il hérite donc automatiquement de cet
/// arrondi, bordure et image partageant exactement le même rayon.
@MainActor
final class StoryMediaLayerCornerRadiusTests: XCTestCase {

    private func makeGeometry() -> CanvasGeometry {
        CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
    }

    private func makeMedia(kind: StoryMediaKind) -> StoryMediaObject {
        StoryMediaObject(id: "media-\(UUID().uuidString.prefix(8))",
                         postMediaId: "post-\(UUID().uuidString.prefix(6))",
                         mediaURL: "https://cdn.example.test/asset",
                         kind: kind,
                         aspectRatio: 1.0)
    }

    func test_configureImage_appliesRoundedCornersProportionalToShortSide() {
        let layer = StoryMediaLayer()
        layer.configure(with: makeMedia(kind: .image), geometry: makeGeometry(), mode: .edit)

        XCTAssertTrue(layer.masksToBounds,
                      "le média doit clipper son contenu au rectangle arrondi")
        let expected = min(layer.bounds.width, layer.bounds.height)
            * StoryMediaLayer.cornerRadiusFraction
        XCTAssertEqual(layer.cornerRadius, expected, accuracy: 0.01)
        XCTAssertGreaterThan(layer.cornerRadius, 0,
                             "les coins de l'image doivent être arrondis")
    }

    func test_configureVideo_isAlsoRounded() {
        let layer = StoryMediaLayer()
        layer.configure(with: makeMedia(kind: .video), geometry: makeGeometry(), mode: .edit)

        XCTAssertTrue(layer.masksToBounds,
                      "la vidéo doit clipper son AVPlayerLayer au rectangle arrondi")
        XCTAssertGreaterThan(layer.cornerRadius, 0,
                             "les coins de la vidéo doivent être arrondis")
    }
}
