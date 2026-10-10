import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le bloom et le grain d'une image se règlent sur ELLE, et le player les
/// cuit** (#9498) — à la suite de ses réglages, par la MÊME chaîne
/// (`ImageAdjustmentStage`) que l'éditeur plein écran, si bien que le composer,
/// le lecteur, la vignette composite et l'export peignent le même effet.
final class StoryMediaObjectEffectsRenderTests: XCTestCase {

    private func uni(_ niveau: CGFloat, side: CGFloat = 16) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { ctx in
            UIColor(white: niveau, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))
        }
    }

    /// La luminance MOYENNE de l'image, 0…255 — un grain se juge sur la surface,
    /// pas sur un pixel que le hasard aurait laissé clair.
    private func luminanceMoyenne(_ image: UIImage?) throws -> Double {
        let cg = try XCTUnwrap(image?.cgImage)
        let largeur = cg.width, hauteur = cg.height
        var pixels = [UInt8](repeating: 0, count: largeur * hauteur * 4)
        let contexte = try XCTUnwrap(CGContext(data: &pixels, width: largeur, height: hauteur, bitsPerComponent: 8,
                                               bytesPerRow: largeur * 4, space: CGColorSpaceCreateDeviceRGB(),
                                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        contexte.draw(cg, in: CGRect(x: 0, y: 0, width: largeur, height: hauteur))
        let somme = stride(from: 0, to: pixels.count, by: 4).reduce(0) { total, i in
            total + Int(pixels[i]) + Int(pixels[i + 1]) + Int(pixels[i + 2])
        }
        return Double(somme) / Double(largeur * hauteur * 3)
    }

    private func posee(_ reglages: ImageAdjustments?) -> StoryMediaObject {
        var media = StoryMediaObject(id: "m-\(UUID().uuidString)", kind: .image, aspectRatio: 1)
        media.adjustments = reglages
        return media
    }

    // MARK: - Le rendu : le player CUIT l'effet

    /// Un carré clair au centre d'un fond noir : le halo se juge sur le NOIR
    /// qui le borde. Sur un aplat uniforme, flouter puis recombiner ne change
    /// rien — un tel témoin ne verrait pas le bloom (mesuré : 102 → 102).
    private func carreClairSurNoir(side: CGFloat = 64, carre: CGFloat = 16) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { ctx in
            UIColor.black.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))
            UIColor.white.setFill()
            ctx.fill(CGRect(x: (side - carre) / 2, y: (side - carre) / 2, width: carre, height: carre))
        }
    }

    /// La luminance moyenne d'une bande NOIRE à 3 px à gauche du carré clair.
    private func luminanceDuBord(_ image: UIImage?) throws -> Double {
        let cg = try XCTUnwrap(image?.cgImage)
        let largeur = cg.width, hauteur = cg.height
        var pixels = [UInt8](repeating: 0, count: largeur * hauteur * 4)
        let contexte = try XCTUnwrap(CGContext(data: &pixels, width: largeur, height: hauteur, bitsPerComponent: 8,
                                               bytesPerRow: largeur * 4, space: CGColorSpaceCreateDeviceRGB(),
                                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        contexte.draw(cg, in: CGRect(x: 0, y: 0, width: largeur, height: hauteur))
        let echelle = Double(largeur) / 64
        let x = Int(21 * echelle)
        let lignes = Int(26 * echelle)..<Int(38 * echelle)
        let somme = lignes.reduce(0) { total, y in
            let i = (y * largeur + x) * 4
            return total + Int(pixels[i]) + Int(pixels[i + 1]) + Int(pixels[i + 2])
        }
        return Double(somme) / Double(lignes.count * 3)
    }

    @MainActor
    func test_leBloom_eclaireLImagePeinte() throws {
        let image = carreClairSurNoir()
        let avant = try luminanceDuBord(image)
        let apres = try luminanceDuBord(StoryMediaLayer.filtered(image, for: posee(ImageAdjustments(bloom: 1))))
        XCTAssertLessThan(avant, 1, "le bord est noir avant le bloom")
        XCTAssertGreaterThan(apres, avant + 10, "Le bloom fait déborder la lumière du carré sur le noir qui le borde.")
    }

    @MainActor
    func test_leGrain_assombritLaSurfacePeinte() throws {
        let image = uni(1)
        let avant = try luminanceMoyenne(image)
        let apres = try luminanceMoyenne(StoryMediaLayer.filtered(image, for: posee(ImageAdjustments(grain: 1))))
        XCTAssertLessThan(apres, avant - 2, "Le grain pose un bruit noir sur la surface.")
    }

    @MainActor
    func test_leGrain_estLeMemeDUnRenduALAutre() throws {
        let image = uni(1)
        let a = try luminanceMoyenne(StoryMediaAdjustmentsProcessor.apply(ImageAdjustments(grain: 0.7), to: image,
                                                                         imageId: "grain-a"))
        let b = try luminanceMoyenne(StoryMediaAdjustmentsProcessor.apply(ImageAdjustments(grain: 0.7), to: image,
                                                                         imageId: "grain-b"))
        XCTAssertEqual(a, b, accuracy: 0.001, "Un grain qui changerait d'un rendu à l'autre ferait scintiller la scène.")
    }

    @MainActor
    func test_sansEffet_lImagePasseTelleQuelle() {
        let image = uni(0.5)
        XCTAssertTrue(StoryMediaLayer.filtered(image, for: posee(nil)) === image)
    }

    // MARK: - Une seule écriture : l'éditeur de l'avatar et la scène

    @MainActor
    func test_lePreReglageDeLEditeur_estLaMiCourseDuCurseurDeLaScene() throws {
        let source = uni(0.4)
        let editeur = ImageFilterEngine().render(source, state: ImageEditState(effect: .bloom))
        let scene = StoryMediaAdjustmentsProcessor.apply(ImageAdjustments(bloom: ImageFilterEngine.presetAmount),
                                                         to: source, imageId: "preset-bloom")
        XCTAssertEqual(try luminanceMoyenne(editeur), try luminanceMoyenne(scene), accuracy: 1)
    }

    // MARK: - Le fond, et la règle vidéo

    func test_leFondImage_peintSesEffets_leFondVideoAucun() {
        let charge = ImageAdjustments(bloom: 0.5, grain: 0.5)
        XCTAssertEqual(StoryBackgroundLook.painted(charge, for: .image), charge)
        XCTAssertNil(StoryBackgroundLook.painted(charge, for: .video),
                     "Le bloom et le grain ne coûtent rien à une vidéo : ils ne s'y peignent pas.")
    }

    func test_laSignature_distingueLesEffets() {
        XCTAssertNotEqual(StoryMediaAdjustmentsProcessor.signature(ImageAdjustments(bloom: 0.5)),
                          StoryMediaAdjustmentsProcessor.signature(ImageAdjustments(grain: 0.5)))
    }

    // MARK: - Le modèle, par le ViewModel

    @MainActor
    func test_poserUnEffet_surLeFond_neTouchePasSesReglages() throws {
        let vm = StoryComposerViewModel()
        let fond = try XCTUnwrap(vm.addMediaObject(kind: .image))
        XCTAssertTrue(vm.isBackground(id: fond.id), "La première image d'une slide vide en est le fond.")
        vm.setMediaObjectAdjustment(id: fond.id, .contrast, to: 1.3)
        vm.setMediaObjectAdjustment(id: fond.id, .bloom, to: 0.6)

        XCTAssertEqual(vm.mediaObjectAdjustments(id: fond.id), ImageAdjustments(contrast: 1.3, bloom: 0.6))
        vm.applyMediaObjectAdjustments(id: fond.id, vm.mediaObjectAdjustments(id: fond.id).resetting(.effect))
        XCTAssertEqual(vm.mediaObjectAdjustments(id: fond.id), ImageAdjustments(contrast: 1.3),
                       "Réinitialiser les effets laisse les réglages.")
    }

    @MainActor
    func test_poserUnEffet_surUneImagePosee() throws {
        let vm = StoryComposerViewModel()
        _ = try XCTUnwrap(vm.addMediaObject(kind: .image))
        let posee = try XCTUnwrap(vm.addMediaObject(kind: .image))
        XCTAssertFalse(vm.isBackground(id: posee.id), "La seconde image est posée.")
        vm.setMediaObjectAdjustment(id: posee.id, .grain, to: 3)
        XCTAssertEqual(vm.mediaObjectAdjustments(id: posee.id)[.grain], 1, "Un effet est borné à son curseur.")
    }

    @MainActor
    func test_uneVideoPosee_neRetientAucunEffet() throws {
        let vm = StoryComposerViewModel()
        _ = try XCTUnwrap(vm.addMediaObject(kind: .image))
        let video = try XCTUnwrap(vm.addMediaObject(kind: .video))
        vm.setMediaObjectAdjustment(id: video.id, .bloom, to: 0.8)
        XCTAssertEqual(vm.mediaObjectAdjustments(id: video.id), .neutral,
                       "Une vidéo ne porte que ce qu'elle peint.")
    }
}
