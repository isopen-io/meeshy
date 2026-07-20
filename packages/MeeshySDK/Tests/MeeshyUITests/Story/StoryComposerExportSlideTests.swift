import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// L'export MP4 depuis la timeline part d'une slide de travail construite par
/// `exportableCurrentSlide()` : vidéos re-pointées vers les fichiers locaux de
/// session (le `mediaURL` du modèle peut être distant ou absent en composer)
/// et fond image composer (hors modèle, `slideImages`) injecté en media object
/// éphémère. Rien de tout cela ne doit fuiter dans la slide persistée.
@MainActor
final class StoryComposerExportSlideTests: XCTestCase {

    func test_exportableCurrentSlide_patchesVideoMediaURLFromSession() {
        let vm = StoryComposerViewModel()
        var effects = vm.currentEffects
        effects.mediaObjects = [StoryMediaObject(id: "vid-1", postMediaId: "pm-1",
                                                 mediaType: "video", aspectRatio: 1.0)]
        vm.currentEffects = effects
        let sessionURL = URL(fileURLWithPath: "/tmp/session-clip.mp4")
        vm.loadedVideoURLs["vid-1"] = sessionURL

        let slide = vm.exportableCurrentSlide()

        XCTAssertEqual(slide.effects.mediaObjects?.first?.mediaURL,
                       sessionURL.absoluteString,
                       "La vidéo doit pointer le fichier local de session pour l'export")
    }

    func test_exportableCurrentSlide_injectsComposerBackgroundImage() throws {
        let vm = StoryComposerViewModel()
        vm.setImage(Self.makeImage(), for: vm.currentSlide.id)

        let slide = vm.exportableCurrentSlide()

        let bg = try XCTUnwrap(slide.effects.mediaObjects?.first(where: { $0.isBackground }),
                               "Le fond image composer doit devenir un media object exportable")
        XCTAssertEqual(bg.kind, .image)
        let urlString = try XCTUnwrap(bg.mediaURL)
        let url = try XCTUnwrap(URL(string: urlString))
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path),
                      "Le JPEG temporaire du fond doit exister sur disque")
        XCTAssertFalse(vm.currentSlide.effects.mediaObjects?.contains(where: { $0.isBackground }) ?? false,
                       "La slide persistée du composer ne doit PAS être polluée par l'objet d'export")
    }

    func test_exportableCurrentSlide_existingBackground_isNotDuplicated() {
        let vm = StoryComposerViewModel()
        var effects = vm.currentEffects
        effects.mediaObjects = [StoryMediaObject(id: "bg-real", postMediaId: "pm-bg",
                                                 mediaType: "video", aspectRatio: 1.0,
                                                 isBackground: true)]
        vm.currentEffects = effects
        vm.setImage(Self.makeImage(), for: vm.currentSlide.id)

        let slide = vm.exportableCurrentSlide()

        XCTAssertEqual(slide.effects.mediaObjects?.filter(\.isBackground).count, 1,
                       "Un background réel existe déjà — pas d'injection concurrente")
    }

    private static func makeImage() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
            UIColor.systemIndigo.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
    }
}
