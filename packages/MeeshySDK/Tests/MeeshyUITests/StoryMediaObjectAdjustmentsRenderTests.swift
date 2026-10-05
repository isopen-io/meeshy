import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Les réglages d'une image posée se règlent sur ELLE, et le player les cuit**
/// (#9175). L'aperçu du composer, le lecteur et la vignette composite passent
/// par `StoryMediaLayer.filtered` : ce qu'on y voit est ce qui part.
final class StoryMediaObjectAdjustmentsRenderTests: XCTestCase {

    private func gris(_ niveau: CGFloat = 0.5) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8), format: format).image { ctx in
            UIColor(white: niveau, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
    }

    /// La luminance du pixel central, 0…255.
    private func luminance(_ image: UIImage?) throws -> Int {
        let cg = try XCTUnwrap(image?.cgImage)
        var pixel = [UInt8](repeating: 0, count: 4)
        let contexte = try XCTUnwrap(CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8,
                                               bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        contexte.draw(cg, in: CGRect(x: -CGFloat(cg.width) / 2, y: -CGFloat(cg.height) / 2,
                                     width: CGFloat(cg.width), height: CGFloat(cg.height)))
        return (Int(pixel[0]) + Int(pixel[1]) + Int(pixel[2])) / 3
    }

    // MARK: - Le modèle, par le ViewModel

    @MainActor
    func test_reglerUneImage_neTouchePasLaSlideNiSesVoisins() throws {
        let vm = StoryComposerViewModel()
        let objet = try XCTUnwrap(vm.addMediaObject(kind: .image))
        let voisin = try XCTUnwrap(vm.addMediaObject(kind: .image))
        vm.applyFilter(StoryFilter.bw.rawValue)

        vm.setMediaObjectAdjustment(id: objet.id, .exposure, to: 0.8)

        XCTAssertEqual(vm.mediaObjectAdjustments(id: objet.id)[.exposure], 0.8)
        XCTAssertEqual(vm.mediaObjectAdjustments(id: voisin.id), .neutral, "Le voisin ne reçoit rien.")
        XCTAssertEqual(vm.currentEffects.filter, "bw", "Le filtre de slide reste celui du fond.")
    }

    @MainActor
    func test_unReglageHorsBornes_estRameneAuCurseur() throws {
        let vm = StoryComposerViewModel()
        let objet = try XCTUnwrap(vm.addMediaObject(kind: .image))
        vm.setMediaObjectAdjustment(id: objet.id, .blur, to: 9)
        XCTAssertEqual(vm.mediaObjectAdjustments(id: objet.id)[.blur], AdjustmentKind.blur.range.upperBound)
    }

    @MainActor
    func test_revenirAuNeutre_effaceLesReglagesDeLObjet() throws {
        let vm = StoryComposerViewModel()
        let objet = try XCTUnwrap(vm.addMediaObject(kind: .image))
        vm.setMediaObjectAdjustment(id: objet.id, .contrast, to: 1.3)
        vm.setMediaObjectAdjustment(id: objet.id, .contrast, to: AdjustmentKind.contrast.neutralValue)
        XCTAssertNil(vm.currentEffects.mediaObjects?.first { $0.id == objet.id }?.adjustments,
                     "Une image remise à zéro ne porte rien au fil.")
    }

    @MainActor
    func test_toutRetirer_rendLImageNeutre() throws {
        let vm = StoryComposerViewModel()
        let objet = try XCTUnwrap(vm.addMediaObject(kind: .image))
        vm.setMediaObjectAdjustment(id: objet.id, .saturation, to: 0.2)
        vm.applyMediaObjectAdjustments(id: objet.id, .neutral)
        XCTAssertEqual(vm.mediaObjectAdjustments(id: objet.id), .neutral)
    }

    @MainActor
    func test_unIdInconnu_neFaitRien() {
        let vm = StoryComposerViewModel()
        vm.setMediaObjectAdjustment(id: "absent", .exposure, to: 1)
        XCTAssertEqual(vm.mediaObjectAdjustments(id: "absent"), .neutral)
    }

    // MARK: - Le rendu : le player CUIT le réglage

    @MainActor
    func test_sansReglage_lImagePasseTelleQuelle() {
        let image = gris()
        let media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        XCTAssertTrue(StoryMediaLayer.filtered(image, for: media) === image)
    }

    @MainActor
    func test_uneExpositionPositive_eclaircitLImagePeinte() throws {
        let image = gris()
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        media.adjustments = ImageAdjustments(exposure: 1.5)
        let avant = try luminance(image)
        let apres = try luminance(StoryMediaLayer.filtered(image, for: media))
        XCTAssertGreaterThan(apres, avant + 20, "Le réglage est CUIT dans le bitmap que le player peint.")
    }

    @MainActor
    func test_uneSaturationNulle_sAjouteAuFiltreDeLObjet() throws {
        let rouge = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { ctx in
            UIColor.red.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        media.filter = StoryFilter.warm.rawValue
        let filtreSeul = StoryMediaLayer.filtered(rouge, for: media)
        media.adjustments = ImageAdjustments(saturation: 0)
        let filtreEtReglage = StoryMediaLayer.filtered(rouge, for: media)
        XCTAssertFalse(filtreEtReglage === filtreSeul, "Les réglages s'enchaînent APRÈS le filtre, ils ne le remplacent pas.")
    }

    @MainActor
    func test_leMemeReglage_estServiDuCache() {
        let image = gris()
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        media.adjustments = ImageAdjustments(contrast: 1.3)
        XCTAssertTrue(StoryMediaLayer.filtered(image, for: media) === StoryMediaLayer.filtered(image, for: media),
                      "Un curseur qui revient sur une valeur vue ne refait aucun rendu.")
    }

    func test_laSignature_estDeterministeEtDistingueLesEtats() {
        let a = ImageAdjustments(exposure: 0.5, contrast: 1.2)
        let b = ImageAdjustments(contrast: 1.2, vignette: 0.5)
        XCTAssertEqual(StoryMediaAdjustmentsProcessor.signature(a), StoryMediaAdjustmentsProcessor.signature(a))
        XCTAssertNotEqual(StoryMediaAdjustmentsProcessor.signature(a), StoryMediaAdjustmentsProcessor.signature(b))
    }
}
