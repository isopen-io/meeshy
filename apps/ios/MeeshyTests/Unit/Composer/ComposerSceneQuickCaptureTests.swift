import XCTest
import AVFoundation
import MeeshySDK
@testable import Meeshy

/// **La capture rapide sur une scène vide** (#8653, directive porteur
/// 2026-09-29).
///
/// > « Lorsque la scène est vide mettre en gris le fait de prendre une photo ou
/// > vidéo rapidement — par tap simple ça ouvre et prend la photo, longpress
/// > ouvre et lance la vidéo ! Il faut permettre de quitter à tout moment : le
/// > (X) qui apparaît quand c'est en plein écran doit toujours être là, même
/// > dans la scène. Enfin le flash doit activer vraiment le flash, et si la
/// > caméra est par devant, alors transformer le sol, sombre ou de n'importe
/// > quelle couleur, en BLANC brillant forte intensité ! »
final class ComposerSceneQuickCaptureTests: XCTestCase {

    private func slide(_ remplir: (inout StoryEffects) -> Void = { _ in }) -> StorySlide {
        var effets = StoryEffects()
        remplir(&effets)
        return StorySlide(id: "s1", effects: effets)
    }

    // MARK: - « Scène vide »

    func test_sceneIsBlank_slideSansMatiere_estVide_memeAvecUnFondDeCouleur() {
        XCTAssertTrue(ComposerSceneQuickCapture.sceneIsBlank(slide()))
        XCTAssertTrue(ComposerSceneQuickCapture.sceneIsBlank(slide { $0.background = "#FF0000" }),
                      "une couleur de fond ne pose rien sur la scène")
    }

    func test_sceneIsBlank_unTexteOuUnMedia_rendLaSceneNonVide() {
        XCTAssertFalse(ComposerSceneQuickCapture.sceneIsBlank(
            slide { $0.textObjects = [StoryTextObject(id: "t1", text: "salut")] }))
        XCTAssertFalse(ComposerSceneQuickCapture.sceneIsBlank(
            slide { $0.stickerObjects = [StorySticker(emoji: "🔥")] }))
    }

    // MARK: - Quand le geste est offert

    func test_offers_sceneVideCameraEteinteSansOutil_offreLaCapture() {
        XCTAssertTrue(ComposerSceneQuickCapture.offers(sceneIsBlank: true, format: .story,
                                                       stage: .off, toolIsOpen: false))
    }

    func test_offers_refuseHorsDeSonCas() {
        XCTAssertFalse(ComposerSceneQuickCapture.offers(sceneIsBlank: false, format: .story,
                                                        stage: .off, toolIsOpen: false))
        XCTAssertFalse(ComposerSceneQuickCapture.offers(sceneIsBlank: true, format: .story,
                                                        stage: .armed, toolIsOpen: false),
                       "viseur déjà là : le geste appartient au déclencheur")
        XCTAssertFalse(ComposerSceneQuickCapture.offers(sceneIsBlank: true, format: .story,
                                                        stage: .off, toolIsOpen: true))
        XCTAssertFalse(ComposerSceneQuickCapture.offers(sceneIsBlank: true, format: .status,
                                                        stage: .off, toolIsOpen: false),
                       "un statut n'a pas de viseur")
    }

    // MARK: - Ce que chaque geste fait

    func test_tap_prendUnePhoto_saufLaOuLeFormatNeSertQueLaVideo() {
        XCTAssertEqual(ComposerSceneQuickCapture.tap(format: .story), .photo)
        XCTAssertEqual(ComposerSceneQuickCapture.tap(format: .post), .photo)
        XCTAssertEqual(ComposerSceneQuickCapture.tap(format: .reel), .armOnly,
                       "un réel n'a pas de photo : le toucher ouvre le viseur, sans rien prendre")
        XCTAssertNil(ComposerSceneQuickCapture.tap(format: .status))
    }

    func test_release_clotLaPrise_ouAnnuleCeQuiNAPasDemarre() {
        XCTAssertEqual(ComposerSceneQuickCapture.release(isRecording: true, locked: false), .closeTake)
        XCTAssertEqual(ComposerSceneQuickCapture.release(isRecording: true, locked: true), .keepFilming,
                       "une prise verrouillée survit au relâchement")
        XCTAssertEqual(ComposerSceneQuickCapture.release(isRecording: false, locked: false), .cancelPending,
                       "relâcher avant que la caméra soit prête ne prend RIEN — jamais une photo imprévue")
    }

    func test_hint_ditLesDeuxGestes_ouLaVideoSeule() {
        XCTAssertEqual(ComposerSceneQuickCapture.hint(format: .story), .photoOrVideo)
        XCTAssertEqual(ComposerSceneQuickCapture.hint(format: .reel), .videoOnly)
        XCTAssertNil(ComposerSceneQuickCapture.hint(format: .status))
    }

    @MainActor
    func test_hintCopy_estServiDansLesSeptLangues() {
        XCTAssertFalse(ComposerSceneCameraCopy.quickCaptureHint(.photoOrVideo).isEmpty)
        XCTAssertNotEqual(ComposerSceneCameraCopy.quickCaptureHint(.photoOrVideo),
                          ComposerSceneCameraCopy.quickCaptureHint(.videoOnly))
    }

    // MARK: - Le flash

    func test_frontFlash_leSolSAllume_cameraAvantFlashActifViseurOuvert() {
        XCTAssertTrue(ComposerFrontFlash.lightsFloor(flash: .on, position: .front, stage: .armed))
        XCTAssertTrue(ComposerFrontFlash.lightsFloor(flash: .auto, position: .front, stage: .recording))
        XCTAssertFalse(ComposerFrontFlash.lightsFloor(flash: .off, position: .front, stage: .armed))
        XCTAssertFalse(ComposerFrontFlash.lightsFloor(flash: .on, position: .back, stage: .armed),
                       "à l'arrière, c'est le vrai flash qui éclaire")
        XCTAssertFalse(ComposerFrontFlash.lightsFloor(flash: .on, position: .front, stage: .off))
    }

    func test_torch_neSAllumeQuALArriere_pendantUneVideo() {
        XCTAssertEqual(ComposerFrontFlash.torch(flash: .on, position: .back), .on)
        XCTAssertEqual(ComposerFrontFlash.torch(flash: .auto, position: .back), .auto)
        XCTAssertEqual(ComposerFrontFlash.torch(flash: .off, position: .back), .off)
        XCTAssertEqual(ComposerFrontFlash.torch(flash: .on, position: .front), .off)
    }

    func test_previewRect_pleinEcranAllume_laisseUnAnneauBlanc() {
        let plein = CGRect(x: 0, y: 0, width: 390, height: 844)
        XCTAssertEqual(ComposerFrontFlash.previewRect(plein, size: .fullScreen, floorLit: false), plein)
        XCTAssertEqual(ComposerFrontFlash.previewRect(plein, size: .card, floorLit: true), plein,
                       "en carte, le sol autour de la carte suffit")
        let bague = ComposerFrontFlash.previewRect(plein, size: .fullScreen, floorLit: true)
        XCTAssertEqual(bague, plein.insetBy(dx: ComposerFrontFlash.fullScreenRim,
                                            dy: ComposerFrontFlash.fullScreenRim))
    }

    // MARK: - La luminosité : montée le temps de la prise, puis RENDUE

    @MainActor
    func test_screenFlash_monteAuMax_puisRestitueLaLuminositeDAvant() {
        let ecran = FakeScreen(brightness: 0.3)
        let flash = ComposerScreenFlash(screen: ecran)
        flash.light()
        XCTAssertEqual(ecran.brightness, 1)
        flash.light()
        flash.restore()
        XCTAssertEqual(ecran.brightness, 0.3, "un double allumage ne mémorise pas le maximum comme « avant »")
        flash.restore()
        XCTAssertEqual(ecran.brightness, 0.3, "restituer sans allumage ne touche à rien")
    }

    // MARK: - Le (x) toujours là

    func test_laBarreDuViseur_montreLaCroix_enCarteCommeEnPleinEcran() throws {
        let barre = try source("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        XCTAssertTrue(barre.contains("ComposerSceneCameraCopy.disarmLabel"), "la croix a disparu")
        XCTAssertFalse(barre.contains("showsClose"), "la croix ne dépend plus de la taille")
    }

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(chemin)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }
}

@MainActor
private final class FakeScreen: ScreenBrightnessControlling {
    nonisolated deinit {}
    var brightness: CGFloat
    init(brightness: CGFloat) { self.brightness = brightness }
}
