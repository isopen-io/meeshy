import XCTest
import AVFoundation
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #14180 — **un FOND vidéo pas encore jouable attend sa première image comme
/// une vidéo posée** (#13864) : sur la scène du composer, l'affiche — l'image
/// où la lecture commencera — couvre le player, et le voile reste tant que le
/// player n'a rien peint. La lecture garde son chemin.
@MainActor
final class StoryBackgroundVideoPosterTests: XCTestCase {

    private static let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))
    private static let thumbHash = "3OcRJYB4d3h/iIeHeEh3eIhw+j3A"

    private func videoBackground(_ url: URL, thumbHash: String? = nil) -> StoryBackgroundLayer.Kind {
        .video(postMediaId: url.absoluteString, looping: true, mute: true, thumbHash: thumbHash)
    }

    private func configured(_ kind: StoryBackgroundLayer.Kind, onScene: Bool) -> StoryBackgroundLayer {
        let layer = StoryBackgroundLayer()
        layer.videoWaitVeil.isEnabled = onScene
        layer.configure(kind: kind, transform: BackgroundTransform(), geometry: Self.geometry,
                        resolver: nil, imageCache: nil)
        return layer
    }

    private func redThenBlue() async throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("fond-\(UUID().uuidString).mp4")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        try await PosterFixture.write(to: url, segments: [(seconds: 1, bgra: (0, 0, 255, 255)),
                                                          (seconds: 2, bgra: (255, 0, 0, 255))])
        return url
    }

    private func emptyFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("fond-vide-\(UUID().uuidString).mp4")
        try Data().write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    func test_aLocalVideoBackgroundOnTheScene_paintsThePosterOfItsFirstImage() async throws {
        let layer = configured(videoBackground(try await redThenBlue()), onScene: true)

        await layer.videoWaitVeil.posterTask?.value

        XCTAssertEqual(try PosterFixture.dominant(layer.videoWaitVeil.posterImage), .red,
                       "le fond montre l'image où sa lecture commence")
        if layer.avPlayerLayer?.isReadyForDisplay != true {
            let voile = try XCTUnwrap(layer.videoWaitVeil.layer, "l'affiche couvre le player")
            XCTAssertTrue((voile.contents as CFTypeRef?) === layer.videoWaitVeil.posterImage,
                          "le voile d'attente porte l'affiche, plus le ThumbHash")
        }
        layer.releaseBackgroundPlayer()
    }

    func test_aVideoBackgroundThePlayerCannotPaintYet_keepsItsPlaceholderOverThePlayer() throws {
        let layer = configured(videoBackground(try emptyFile(), thumbHash: Self.thumbHash), onScene: true)

        let voile = try XCTUnwrap(layer.videoWaitVeil.layer,
                                  "un fond local que le player n'a pas encore peint a un voile d'attente")
        XCTAssertEqual(voile.opacity, 1, "le voile ne s'efface pas avant la première image du player")
        XCTAssertTrue(voile.superlayer === layer.avPlayerLayer,
                      "le voile est un calque du player : il en suit le cadre et la transformation")

        layer.releaseBackgroundPlayer()
        XCTAssertNil(layer.videoWaitVeil.layer, "le voile part avec son player")
    }

    func test_theReader_keepsItsContentReadyGate_withoutAnyPoster() throws {
        let layer = configured(videoBackground(try emptyFile(), thumbHash: Self.thumbHash), onScene: false)

        XCTAssertNil(layer.videoWaitVeil.posterTask, "la lecture ne décode aucune affiche")
        XCTAssertNil(layer.videoWaitVeil.layer)
        layer.releaseBackgroundPlayer()
    }
}
