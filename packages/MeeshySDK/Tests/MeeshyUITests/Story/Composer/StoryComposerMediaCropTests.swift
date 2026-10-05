import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Recadrer une image l'écrit sur l'objet, et le fond affiché suit** (#9136)
/// — la borne voyage sur `StoryMediaObject.crop` ; le bitmap montré se
/// recoupe depuis le FICHIER, jamais depuis le bitmap déjà recadré.
@MainActor
final class StoryComposerMediaCropTests: XCTestCase {

    private func image(width: Int, height: Int) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    private func composerWithImage(width: Int, height: Int) throws -> (StoryComposerViewModel, String) {
        let vm = StoryComposerViewModel()
        let id = UUID().uuidString
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(id).png")
        let source = image(width: width, height: height)
        try XCTUnwrap(source.pngData()).write(to: url)
        let posee = try XCTUnwrap(vm.insertForegroundImage(source, fileURL: url,
                                                           intoSlideId: vm.currentSlide.id, objectId: id))
        return (vm, posee.id)
    }

    func test_cropped_squareOfLandscape_hasTheKeptPixels() {
        let rendu = MediaCropBitmap.cropped(image(width: 400, height: 300),
                                            to: MediaCropRect(x: 0.125, y: 0, width: 0.75, height: 1))
        XCTAssertEqual(rendu.size.width * rendu.scale, 300, accuracy: 1)
        XCTAssertEqual(rendu.size.height * rendu.scale, 300, accuracy: 1)
    }

    func test_setMediaCrop_writesTheBoundOnTheObject() throws {
        let (vm, id) = try composerWithImage(width: 400, height: 300)
        let carre = MediaCropRect(x: 0.125, y: 0, width: 0.75, height: 1)
        vm.setMediaCrop(id: id, crop: carre)
        XCTAssertEqual(vm.currentEffects.mediaObjects?.first { $0.id == id }?.crop, carre)
    }

    func test_setMediaCrop_full_removesTheBound() throws {
        let (vm, id) = try composerWithImage(width: 400, height: 300)
        vm.setMediaCrop(id: id, crop: MediaCropRect(x: 0.125, y: 0, width: 0.75, height: 1))
        vm.setMediaCrop(id: id, crop: .full)
        XCTAssertNil(vm.currentEffects.mediaObjects?.first { $0.id == id }?.crop)
    }

    func test_refreshMediaCropPreview_showsTheCroppedFile_andRecropsFromTheSource() throws {
        let (vm, id) = try composerWithImage(width: 400, height: 300)
        vm.setMediaCrop(id: id, crop: MediaCropRect(x: 0.125, y: 0, width: 0.75, height: 1))
        vm.refreshMediaCropPreview(id: id)
        vm.setMediaCrop(id: id, crop: MediaCropRect(x: 0, y: 0, width: 1, height: 0.5))
        vm.refreshMediaCropPreview(id: id)
        let montre = try XCTUnwrap(vm.loadedImages[id])
        XCTAssertEqual(montre.size.width * montre.scale, 400, accuracy: 1)
        XCTAssertEqual(montre.size.height * montre.scale, 150, accuracy: 1)
    }

    func test_undo_afterACrop_showsTheWholeImageAgain() throws {
        let (vm, id) = try composerWithImage(width: 400, height: 300)
        vm.seedHistory()
        vm.setMediaCrop(id: id, crop: MediaCropRect(x: 0.125, y: 0, width: 0.75, height: 1))
        vm.pushHistorySnapshot()
        XCTAssertTrue(vm.undoGlobal())
        let montre = try XCTUnwrap(vm.loadedImages[id])
        XCTAssertEqual(montre.size.width / montre.size.height, 4.0 / 3.0, accuracy: 0.01)
    }
}
