import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Une image POSÉE se recadre par une BORNE, jamais par son bitmap** (#9499).
///
/// Le recadrage d'un fond de retouche (#9136) se cuit dans la pièce rendue :
/// son bitmap est recoupé, parce que `StoryBackgroundLayer` ne lit pas `crop`.
/// Une image posée, elle, est peinte par `StoryMediaLayer`, qui coupe déjà par
/// `contentsRect` — recouper aussi le bitmap la recadrerait DEUX fois, et le
/// fichier publié (`loadedImages[id]`) partirait amputé sous une borne qui le
/// recouperait chez chaque lecteur. La planche `4c` le dit : « aucun ne
/// ré-encode ». Le cadre prend le rapport recadré, partout où l'objet se peint :
/// le calque, le geste en cours, la vignette composite, la mini-scène.
@MainActor
final class StoryPlacedImageCropTests: XCTestCase {

    /// Trois bandes verticales : rouge | vert | bleu.
    private func bandes(width: Int = 300, height: Int = 100) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let tiers = CGFloat(width) / 3
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { ctx in
            for (index, couleur) in [UIColor.red, .green, .blue].enumerated() {
                couleur.setFill()
                ctx.fill(CGRect(x: tiers * CGFloat(index), y: 0, width: tiers, height: CGFloat(height)))
            }
        }
    }

    private func pixel(_ image: UIImage, at point: CGPoint) throws -> (r: Int, g: Int, b: Int) {
        let cg = try XCTUnwrap(image.cgImage)
        var data = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let contexte = try XCTUnwrap(CGContext(data: &data, width: cg.width, height: cg.height, bitsPerComponent: 8,
                                               bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        contexte.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        let x = min(max(0, Int(point.x)), cg.width - 1)
        let y = min(max(0, Int(point.y)), cg.height - 1)
        let i = (y * cg.width + x) * 4
        return (Int(data[i]), Int(data[i + 1]), Int(data[i + 2]))
    }

    private let dernierTiers = MediaCropRect(x: 2.0 / 3.0, y: 0, width: 1.0 / 3.0, height: 1)

    private func composerAvecImagePosee() throws -> (StoryComposerViewModel, String) {
        let vm = StoryComposerViewModel()
        let id = UUID().uuidString
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(id).png")
        let source = bandes(width: 400, height: 300)
        try XCTUnwrap(source.pngData()).write(to: url)
        let posee = try XCTUnwrap(vm.insertForegroundImage(source, fileURL: url,
                                                           intoSlideId: vm.currentSlide.id, objectId: id))
        // La première image d'une slide vide y entre en FOND (`addMediaObject`) :
        // la rétrograder la POSE, ce que ce fichier éprouve.
        XCTAssertTrue(vm.isBackground(id: posee.id))
        vm.toggleBackground(id: posee.id)
        XCTAssertFalse(vm.isBackground(id: posee.id), "L'image est posée, plus le fond.")
        return (vm, posee.id)
    }

    // MARK: - Le composer : la borne, pas le bitmap

    func test_recadrerUneImagePosee_gardeLeBitmapEntier_leCalqueLeCoupe() throws {
        let (vm, id) = try composerAvecImagePosee()
        vm.setMediaCrop(id: id, crop: MediaCropRule.centered(ratio: .square, sourceRatio: 4.0 / 3.0))
        XCTAssertNotNil(vm.currentEffects.mediaObjects?.first { $0.id == id }?.crop, "La borne est écrite sur l'objet.")
        let montre = try XCTUnwrap(vm.loadedImages[id])
        XCTAssertEqual(montre.size.width / montre.size.height, 4.0 / 3.0, accuracy: 0.01,
                       "Le bitmap reste la source entière — le calque coupe par contentsRect, une fois.")
    }

    func test_unFondRecadre_redevenuPose_montreDeNouveauLaSourceEntiere() throws {
        let (vm, id) = try composerAvecImagePosee()
        vm.toggleBackground(id: id)
        vm.setMediaCrop(id: id, crop: MediaCropRule.centered(ratio: .square, sourceRatio: 4.0 / 3.0))
        let fond = try XCTUnwrap(vm.loadedImages[id])
        XCTAssertEqual(fond.size.width / fond.size.height, 1, accuracy: 0.01, "Un fond recadré se recoupe (#9136).")

        vm.toggleBackground(id: id)

        let pose = try XCTUnwrap(vm.loadedImages[id])
        XCTAssertEqual(pose.size.width / pose.size.height, 4.0 / 3.0, accuracy: 0.01,
                       "Posé, l'objet garde sa borne et le calque la coupe : un bitmap recoupé la doublerait.")
    }

    // MARK: - Le cadre prend le rapport recadré

    func test_leCadreDeBase_prendLeRapportRecadre() {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 4.0 / 3.0)
        media.crop = MediaCropRule.centered(ratio: .portrait34, sourceRatio: 4.0 / 3.0)
        let cadre = StoryMediaLayer.baseMediaDesignSize(for: media)
        XCTAssertEqual(cadre.width / cadre.height, 3.0 / 4.0, accuracy: 0.001)
        let calque = StoryMediaLayer.renderedPose(for: media, geometry: CanvasGeometry(
            renderSize: CGSize(width: CanvasGeometry.designWidth, height: CanvasGeometry.designWidth * 16 / 9))).size
        XCTAssertEqual(calque.width, cadre.width, accuracy: 0.01,
                       "Le geste et la vignette lisent le cadre du calque, jamais une copie.")
        XCTAssertEqual(calque.height, cadre.height, accuracy: 0.01)
    }

    func test_sansRecadrage_leCadreGardeLeRapportDuFichier() {
        let media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 4.0 / 3.0)
        let cadre = StoryMediaLayer.baseMediaDesignSize(for: media)
        XCTAssertEqual(cadre.width / cadre.height, 4.0 / 3.0, accuracy: 0.001)
    }

    // MARK: - La part gardée, pour ceux qui peignent sans calque

    func test_laPartGardee_estLeDernierTiers() throws {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 3)
        media.crop = dernierTiers
        let garde = MediaCropPresentation.keptPart(bandes(), of: media)
        XCTAssertEqual(garde.size.width * garde.scale, 100, accuracy: 1)
        XCTAssertEqual(garde.size.height * garde.scale, 100, accuracy: 1)
        let centre = try pixel(garde, at: CGPoint(x: 50, y: 50))
        XCTAssertGreaterThan(centre.b, 200)
        XCTAssertLessThan(centre.g, 60)
    }

    func test_sansRecadrage_laPartGardee_estLImageElleMeme() {
        let image = bandes()
        let media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 3)
        XCTAssertTrue(MediaCropPresentation.keptPart(image, of: media) === image)
    }

    // MARK: - La vignette composite : aperçu = lecteur = rendu (loi 6)

    func test_laVignette_peintLaPartGardee_dansLeCadreRecadre() throws {
        var media = StoryMediaObject(id: "posee", kind: .image, aspectRatio: 3)
        media.crop = dernierTiers
        let slide = StorySlide(effects: StoryEffects(background: "000000", mediaObjects: [media]))

        let composite = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: slide, bgImage: nil, loadedImages: ["posee": bandes()],
            size: CGSize(width: 100, height: 178), scale: 1))

        let centre = try pixel(composite, at: CGPoint(x: 50, y: 89))
        XCTAssertGreaterThan(centre.b, 200, "Le centre est la part gardée (bleu), pas le milieu de la source (vert).")
        XCTAssertLessThan(centre.g, 60)
        let horsDuCarre = try pixel(composite, at: CGPoint(x: 50, y: 89 - 30))
        XCTAssertLessThan(horsDuCarre.b, 60, "Un carré de 50 px : 30 px au-dessus du centre, on sort du cadre.")
    }
}
