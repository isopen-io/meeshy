import CoreImage
import XCTest
import MeeshySDK
@testable import Meeshy

/// **L'ambiance se dose, se réchauffe et se contraste** (OPUS-2, #18020).
@MainActor
final class ComposerLookTuningTests: XCTestCase {

    // MARK: - Le réglage, borné

    func test_init_bornesLesValeurs() {
        let reglage = ComposerLookTuning(intensity: 3, warmth: -7, contrast: .nan)
        XCTAssertEqual(reglage.intensity, 1)
        XCTAssertEqual(reglage.warmth, -1)
        XCTAssertEqual(reglage.contrast, 0)
    }

    func test_pad_presDuCentre_retombeANeutre() {
        XCTAssertEqual(ComposerLookTuning(warmth: 0.03, contrast: -0.05), .neutral)
        XCTAssertFalse(ComposerLookTuning(warmth: 0.03, contrast: -0.05).adjusts)
        XCTAssertTrue(ComposerLookTuning(warmth: 0.3).adjusts)
    }

    func test_values_droiteRechauffe_hautContraste() {
        let taille = CGSize(width: 100, height: 100)
        let coin = ComposerLookTuningRule.values(at: CGPoint(x: 100, y: 0), in: taille)
        XCTAssertEqual(coin.warmth, 1)
        XCTAssertEqual(coin.contrast, 1)
        let centre = ComposerLookTuningRule.values(at: CGPoint(x: 50, y: 50), in: taille)
        XCTAssertEqual(centre.warmth, 0)
        XCTAssertEqual(centre.contrast, 0)
        let dehors = ComposerLookTuningRule.values(at: CGPoint(x: -40, y: 300), in: taille)
        XCTAssertEqual(dehors.warmth, -1, "le doigt sorti du pavé reste au bord")
        XCTAssertEqual(dehors.contrast, -1)
    }

    func test_point_estLInverseDeValues() {
        let taille = CGSize(width: 96, height: 96)
        let point = ComposerLookTuningRule.point(warmth: 0.5, contrast: -0.25, in: taille)
        let relu = ComposerLookTuningRule.values(at: point, in: taille)
        XCTAssertEqual(relu.warmth, 0.5, accuracy: 0.0001)
        XCTAssertEqual(relu.contrast, -0.25, accuracy: 0.0001)
    }

    func test_values_paveSansTaille_neutre() {
        let relu = ComposerLookTuningRule.values(at: CGPoint(x: 10, y: 10), in: .zero)
        XCTAssertEqual(relu.warmth, 0)
        XCTAssertEqual(relu.contrast, 0)
    }

    // MARK: - Le look qui le porte

    func test_isUntouched_lePaveSeulPeint() {
        XCTAssertFalse(ComposerPhotoLook(tuning: ComposerLookTuning(warmth: 0.4)).isUntouched)
        XCTAssertTrue(ComposerPhotoLook(tuning: ComposerLookTuning(intensity: 0.3)).isUntouched,
                      "une dose sans ambiance ne peint rien")
    }

    func test_choisirUneAutreAmbiance_repartPleine_etGardeLePave() {
        let depart = ComposerPhotoLook(filter: .golden, tuning: ComposerLookTuning(intensity: 0.4, warmth: 0.5))
        let autre = ComposerLookStripRule.look(of: .filter(.film), combinedWith: depart)
        XCTAssertEqual(autre.tuning, ComposerLookTuning(intensity: 1, warmth: 0.5))
        let meme = ComposerLookStripRule.look(of: .filter(.golden), combinedWith: depart)
        XCTAssertEqual(meme.tuning, depart.tuning)
    }

    func test_choisirUnCadreOuUnEffet_gardeLeReglage() {
        let depart = ComposerPhotoLook(filter: .golden, tuning: ComposerLookTuning(intensity: 0.4, contrast: 0.3))
        XCTAssertEqual(ComposerLookStripRule.look(of: .effect(.angel), combinedWith: depart).tuning, depart.tuning)
        XCTAssertEqual(ComposerLookStripRule.look(of: .frame(.none), combinedWith: depart).tuning, depart.tuning)
        XCTAssertEqual(depart.withoutFrame.tuning, depart.tuning)
        XCTAssertEqual(ComposerLookStripRule.look(of: .untouched, combinedWith: depart).tuning, .neutral)
    }

    // MARK: - Le brouillon le garde

    func test_mapping_reglage_faitLAllerRetour() {
        let regard = ComposerPhotoLook(filter: .velvet,
                                       tuning: ComposerLookTuning(intensity: 0.6, warmth: -0.4, contrast: 0.7))
        let reglage = ComposerMediaLookMapping.storyLook(regard)
        XCTAssertEqual(reglage.filterIntensity, 0.6)
        XCTAssertEqual(ComposerMediaLookMapping.photoLook(reglage), regard)
    }

    func test_mapping_reglageNeutre_neDeclareRien() {
        let reglage = ComposerMediaLookMapping.storyLook(ComposerPhotoLook(filter: .golden))
        XCTAssertNil(reglage.filterIntensity)
        XCTAssertNil(reglage.warmth)
        XCTAssertNil(reglage.contrast)
    }

    func test_mapping_paveSansAmbiance_peint() {
        let reglage = ComposerMediaLookMapping.storyLook(ComposerPhotoLook(tuning: ComposerLookTuning(warmth: 0.5)))
        XCTAssertFalse(reglage.isNeutral)
        XCTAssertTrue(ComposerMediaLookMapping.paints(reglage))
    }

    // MARK: - Le rendu

    private func gris(_ niveau: CGFloat = 0.5) -> CIImage {
        CIImage(color: CIColor(red: niveau, green: niveau, blue: niveau))
            .cropped(to: CGRect(x: 0, y: 0, width: 8, height: 8))
    }

    private func pixel(_ image: CIImage) -> (red: Int, green: Int, blue: Int) {
        var octets = [UInt8](repeating: 0, count: 4)
        CIContext().render(image, toBitmap: &octets, rowBytes: 4,
                           bounds: CGRect(x: image.extent.midX, y: image.extent.midY, width: 1, height: 1),
                           format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
        return (Int(octets[0]), Int(octets[1]), Int(octets[2]))
    }

    func test_graded_doseNulle_rendLaPrise() {
        let source = gris()
        let rendu = ComposerLiveLookRule.graded(source, filter: .golden, tuning: ComposerLookTuning(intensity: 0))
        XCTAssertTrue(pixel(rendu) == pixel(source))
    }

    func test_graded_demiDose_estEntreLaPriseEtLAmbiance() {
        let source = gris()
        let pleine = pixel(ComposerLiveLookRule.graded(source, filter: .golden))
        let demi = pixel(ComposerLiveLookRule.graded(source, filter: .golden, tuning: ComposerLookTuning(intensity: 0.5)))
        let nue = pixel(source)
        XCTAssertFalse(pleine == nue, "témoin : l'ambiance pleine change le gris")
        for (d, p, n) in [(demi.red, pleine.red, nue.red), (demi.green, pleine.green, nue.green),
                          (demi.blue, pleine.blue, nue.blue)] {
            XCTAssertGreaterThanOrEqual(d, min(p, n) - 1)
            XCTAssertLessThanOrEqual(d, max(p, n) + 1)
        }
    }

    func test_graded_chaleur_rechauffeMemeSansAmbiance() {
        let chaud = pixel(ComposerLiveLookRule.graded(gris(), filter: .natural, tuning: ComposerLookTuning(warmth: 1)))
        let frais = pixel(ComposerLiveLookRule.graded(gris(), filter: .natural, tuning: ComposerLookTuning(warmth: -1)))
        XCTAssertGreaterThan(chaud.red, chaud.blue)
        XCTAssertLessThan(frais.red, frais.blue)
    }

    func test_graded_contraste_assombritLesOmbres_eclaircitLesLumieres() {
        let ombre = gris(0.15)
        let lumiere = gris(0.85)
        let contraste = ComposerLookTuning(contrast: 1)
        XCTAssertLessThan(pixel(ComposerLiveLookRule.graded(ombre, filter: .natural, tuning: contraste)).green,
                          pixel(ombre).green)
        XCTAssertGreaterThan(pixel(ComposerLiveLookRule.graded(lumiere, filter: .natural, tuning: contraste)).green,
                             pixel(lumiere).green)
    }

    func test_graded_reglage_gardeLEtendue() {
        let source = gris()
        let rendu = ComposerLiveLookRule.graded(source, filter: .golden,
                                                tuning: ComposerLookTuning(intensity: 0.5, warmth: 0.5, contrast: 0.5))
        XCTAssertEqual(rendu.extent, source.extent)
    }

    // MARK: - Le bouton Camera Control

    func test_cameraControl_proposeLesHuitAmbiances_dansLOrdreDeLaBande() {
        XCTAssertEqual(CameraSystemControlsRule.ambiances, VideoFilterPreset.catalog)
        XCTAssertEqual(CameraSystemControlsRule.ambianceIndex(of: .golden), 1)
        XCTAssertEqual(CameraSystemControlsRule.ambiance(at: 1), .golden)
        XCTAssertNil(CameraSystemControlsRule.ambiance(at: 8))
        XCTAssertNil(CameraSystemControlsRule.ambiance(at: -1))
    }

    func test_cameraControl_choix_rejointLeLook_horsPrise() {
        let depart = ComposerPhotoLook(filter: .golden, frame: .montage(.classic(.film)),
                                       tuning: ComposerLookTuning(intensity: 0.4, warmth: 0.3))
        let choisi = ComposerCameraAmbiance.picked(.sky, look: depart, context: ComposerCaptureGestureContext())
        XCTAssertEqual(choisi?.filter, .sky)
        XCTAssertEqual(choisi?.frame, depart.frame, "le cadre reste")
        XCTAssertEqual(choisi?.tuning, ComposerLookTuning(intensity: 1, warmth: 0.3))
    }

    func test_cameraControl_pendantUnePrise_neChoisitRien() {
        XCTAssertNil(ComposerCameraAmbiance.picked(.sky, look: ComposerPhotoLook(),
                                                   context: ComposerCaptureGestureContext(stage: .recording)))
    }
}
