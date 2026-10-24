import XCTest
import UIKit
@testable import MeeshyUI
import MeeshySDK

/// **#12590 — la retouche remplace la SOURCE d'un média posé, à sa place.**
@MainActor
final class StoryMediaSourceSwapTests: XCTestCase {

    /// Une scène avec un fond image, puis un média de premier plan. `background` choisit lequel des deux
    /// est ciblé (et réglé : position, échelle, rotation, z, volume, recadrage, rognage).
    private func viewModel(background: Bool = false) -> (StoryComposerViewModel, StoryMediaObject) {
        let vm = StoryComposerViewModel()
        let slideId = vm.slides[0].id
        let ids = [UUID().uuidString, UUID().uuidString]
        for id in ids {
            let pose = vm.insertForegroundImage(Self.image(width: 40, height: 30, color: .systemRed),
                                                fileURL: URL(fileURLWithPath: "/tmp/\(id).jpg"),
                                                intoSlideId: slideId, objectId: id)
            XCTAssertNotNil(pose, "la pose d'une image doit réussir")
        }
        let cible = background ? ids[0] : ids[1]
        var effects = vm.slides[0].effects
        let index = effects.mediaObjects?.firstIndex { $0.id == cible }
        guard let index else { preconditionFailure("la cible est posée") }
        effects.mediaObjects?[index].x = 0.3
        effects.mediaObjects?[index].y = 0.7
        effects.mediaObjects?[index].scale = 1.6
        effects.mediaObjects?[index].rotation = 12
        effects.mediaObjects?[index].zIndex = 4
        effects.mediaObjects?[index].volume = 0.4
        effects.mediaObjects?[index].crop = MediaCropRect(x: 0.1, y: 0.1, width: 0.5, height: 0.5)
        effects.mediaObjects?[index].sourceStart = 1
        effects.mediaObjects?[index].sourceEnd = 2
        effects.mediaObjects?[index].postMediaId = "server-id"
        vm.slides[0].effects = effects
        return (vm, effects.mediaObjects![index])
    }

    private static func image(width: CGFloat, height: CGFloat, color: UIColor) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: width, height: height)).image { context in
            color.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    func test_swap_keepsThePlaceOfAForegroundMedia() throws {
        let (vm, ancien) = viewModel()
        let neuve = Self.image(width: 60, height: 30, color: .systemBlue)
        let url = URL(fileURLWithPath: "/tmp/retouchee.jpg")

        let id = try XCTUnwrap(StoryMediaSourceSwap.swap(ancien.id, to: .image(neuve, fileURL: url), in: vm))

        let medias = try XCTUnwrap(vm.slides[0].effects.mediaObjects)
        XCTAssertEqual(medias.count, 2, "remplacé, jamais ajouté")
        let objet = try XCTUnwrap(medias.first { $0.id == id })
        XCTAssertEqual(medias.firstIndex { $0.id == id }, 1, "au même rang")
        XCTAssertEqual(objet.id, id)
        XCTAssertNotEqual(id, ancien.id)
        XCTAssertEqual([objet.x, objet.y, objet.scale, objet.rotation], [0.3, 0.7, 1.6, 12])
        XCTAssertEqual(objet.zIndex, 4)
        XCTAssertEqual(objet.volume, 0.4)
        XCTAssertEqual(objet.isBackground, ancien.isBackground)
        XCTAssertEqual(objet.mediaURL, url.absoluteString)
        XCTAssertEqual(objet.aspectRatio, 2, accuracy: 0.001)
    }

    func test_swap_keepsABackgroundAsTheBackground() throws {
        let (vm, ancien) = viewModel(background: true)
        XCTAssertTrue(ancien.isBackground)
        let id = try XCTUnwrap(StoryMediaSourceSwap.swap(
            ancien.id, to: .image(Self.image(width: 30, height: 40, color: .green), fileURL: URL(fileURLWithPath: "/tmp/a.jpg")), in: vm))
        let objet = try XCTUnwrap(vm.slides[0].effects.mediaObjects?.first { $0.id == id })
        XCTAssertTrue(objet.isBackground, "un fond reste le fond")
    }

    func test_swap_giveAFreshIdentity_andResetsWhatAimedAtTheOldGeometry() throws {
        let (vm, ancien) = viewModel()
        let id = try XCTUnwrap(StoryMediaSourceSwap.swap(
            ancien.id, to: .image(Self.image(width: 30, height: 40, color: .green), fileURL: URL(fileURLWithPath: "/tmp/b.jpg")), in: vm))
        let objet = try XCTUnwrap(vm.slides[0].effects.mediaObjects?.first { $0.id == id })
        XCTAssertEqual(objet.postMediaId, "", "le fichier neuf n'a pas encore de PostMedia")
        XCTAssertNil(objet.crop)
        XCTAssertNil(objet.sourceStart)
        XCTAssertNil(objet.sourceEnd)
    }

    func test_swap_movesTheBitmap_andBumpsTheCanvasVersion() throws {
        let (vm, ancien) = viewModel()
        let avant = vm.loadedImagesVersion
        let neuve = Self.image(width: 30, height: 40, color: .green)
        let id = try XCTUnwrap(StoryMediaSourceSwap.swap(ancien.id, to: .image(neuve, fileURL: URL(fileURLWithPath: "/tmp/c.jpg")), in: vm))
        XCTAssertNil(vm.loadedImages[ancien.id], "l'ancien bitmap quitte la scène")
        XCTAssertNotNil(vm.retiredImages[ancien.id], "il part en réserve d'annulation")
        XCTAssertTrue(vm.loadedImages[id] === neuve)
        XCTAssertGreaterThan(vm.loadedImagesVersion, avant, "le canvas se rafraîchit")
    }

    func test_swap_unknownObject_changesNothing() {
        let (vm, _) = viewModel()
        let avant = vm.slides[0].effects.mediaObjects?.map(\.id)
        XCTAssertNil(StoryMediaSourceSwap.swap(
            "inconnu", to: .image(Self.image(width: 3, height: 3, color: .red), fileURL: URL(fileURLWithPath: "/tmp/d.jpg")), in: vm))
        XCTAssertEqual(vm.slides[0].effects.mediaObjects?.map(\.id), avant)
    }

    func test_swap_aVideoSourceDoesNotReplaceAnImage() {
        let (vm, ancien) = viewModel()
        XCTAssertNil(StoryMediaSourceSwap.swap(
            ancien.id, to: .video(URL(fileURLWithPath: "/tmp/e.mov"), thumbnail: nil, aspectRatio: 1, duration: 3), in: vm))
        XCTAssertEqual(vm.slides[0].effects.mediaObjects?.first?.id, ancien.id)
    }

    func test_swap_undoGivesBackTheOriginalObjectAndItsBitmap() throws {
        let (vm, ancien) = viewModel()
        vm.pushHistorySnapshot()
        let id = try XCTUnwrap(StoryMediaSourceSwap.swap(
            ancien.id, to: .image(Self.image(width: 30, height: 40, color: .green), fileURL: URL(fileURLWithPath: "/tmp/f.jpg")), in: vm))
        vm.pushHistorySnapshot()

        XCTAssertTrue(vm.undoGlobal())

        let medias = try XCTUnwrap(vm.slides[0].effects.mediaObjects)
        XCTAssertTrue(medias.contains { $0.id == ancien.id }, "« Annuler » rend l'original")
        XCTAssertFalse(medias.contains { $0.id == id })
        XCTAssertNotNil(vm.loadedImages[ancien.id], "et son bitmap")
    }
}
