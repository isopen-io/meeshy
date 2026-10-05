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

    // MARK: - Entrées du moteur (#8599)

    /// La scène du composer tient en mémoire ce que la slide ne porte pas : le
    /// bitmap d'un sticker collé, la retouche d'une image, le fichier d'un son
    /// pas encore téléversé. Sans eux le moteur peignait 🖼️, l'original, et
    /// bakait un MP4 muet.
    func test_exportInputs_carriesInMemoryBitmapsOfTheSlideObjectsOnly() {
        let vm = StoryComposerViewModel()
        var effects = vm.currentEffects
        effects.mediaObjects = [StoryMediaObject(id: "img-1", postMediaId: "",
                                                 mediaType: "image", aspectRatio: 1.0)]
        effects.stickerObjects = [StorySticker(id: "stk-1", emoji: "🖼️")]
        vm.currentEffects = effects
        let retouchee = Self.makeImage()
        let collee = Self.makeImage()
        vm.registerLoadedImage(retouchee, for: "img-1")
        vm.registerLoadedImage(collee, for: "stk-1")
        vm.registerLoadedImage(Self.makeImage(), for: "autre-slide")

        let inputs = vm.exportInputs(for: vm.exportableCurrentSlide())

        XCTAssertTrue(inputs.images["img-1"] === retouchee, "La retouche du média doit partir au moteur")
        XCTAssertTrue(inputs.images["stk-1"] === collee, "Le bitmap du sticker collé doit partir au moteur")
        XCTAssertNil(inputs.images["autre-slide"], "Un bitmap étranger à la slide ne voyage pas")
    }

    func test_exportInputs_resolvesSessionAudioFiles() throws {
        let vm = StoryComposerViewModel()
        var effects = vm.currentEffects
        let son = StoryAudioPlayerObject(id: "aud-1", postMediaId: "")
        effects.audioPlayerObjects = [son]
        vm.currentEffects = effects
        let fichier = URL(fileURLWithPath: "/tmp/session-voice.m4a")
        vm.loadedAudioURLs["aud-1"] = fichier

        let inputs = vm.exportInputs(for: vm.exportableCurrentSlide())

        let resolver = try XCTUnwrap(inputs.audioResolver, "Un son de session doit armer le résolveur")
        XCTAssertEqual(resolver(son), fichier)
    }

    func test_exportInputs_pairsAdoptedStickerFilesByPostMediaId() {
        let vm = StoryComposerViewModel()
        var effects = vm.currentEffects
        effects.stickerObjects = [StorySticker(id: "stk-2", emoji: "🖼️", postMediaId: "pm-stk")]
        vm.currentEffects = effects
        let local = URL(fileURLWithPath: "/tmp/sticker-adopte.png")
        vm.adoptedLocalMedia["pm-stk"] = local

        let inputs = vm.exportInputs(for: vm.exportableCurrentSlide())

        XCTAssertEqual(inputs.stickerImageSources, ["pm-stk": local.absoluteString])
    }

    private static func makeImage() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
            UIColor.systemIndigo.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
    }
}
