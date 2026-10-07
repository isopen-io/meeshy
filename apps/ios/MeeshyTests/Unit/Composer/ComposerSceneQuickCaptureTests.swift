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

    /// **La photo se prend en DEUX temps** (#8711, directive porteur
    /// 2026-09-29 : « le premier tap arme et affiche avec les contrôleurs
    /// habituels, second tap n'importe où sur la scène prend la photo »).
    func test_tap_premierToucher_armeLeViseurSansRienPrendre() {
        XCTAssertEqual(ComposerSceneQuickCapture.tap(format: .story), .arm)
        XCTAssertEqual(ComposerSceneQuickCapture.tap(format: .post), .arm)
        XCTAssertEqual(ComposerSceneQuickCapture.tap(format: .reel), .arm,
                       "un réel arme aussi son viseur : c'est l'appui long qui filme")
        XCTAssertNil(ComposerSceneQuickCapture.tap(format: .status))
    }

    // MARK: - Viseur armé : la TABLE des gestes décide (#9351)

    /// Les témoins des anciennes lois du viseur armé (#8711, #8846), sur les mêmes cas,
    /// dits par la table qui les remplace : le double toucher photographie
    /// (inversion assumée du « un toucher prend » de #8711 — décision (b)).
    func test_table_viseurArme_doubleToucherPhotographie() {
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .scene, gesture: .doubleTap,
                                                     context: ComposerCaptureGestureContext()), .photoToEdit)
    }

    func test_table_doubleToucher_refuseHorsDuViseurArme() {
        func double(_ contexte: ComposerCaptureGestureContext) -> ComposerCaptureAction {
            ComposerCaptureGesture.action(zone: .scene, gesture: .doubleTap, context: contexte)
        }
        XCTAssertEqual(double(ComposerCaptureGestureContext(stage: .off)), .none,
                       "viseur éteint : le premier toucher appartient à l'armement")
        XCTAssertEqual(double(ComposerCaptureGestureContext(stage: .recording)), .none,
                       "une prise en cours ne se coupe pas d'une photo")
        XCTAssertEqual(double(ComposerCaptureGestureContext(allowsPhoto: ComposerSceneCamera.modes(for: .reel)
            .contains(.photo))), .none, "un réel n'a pas de photo")
        XCTAssertEqual(double(ComposerCaptureGestureContext(pendingSegments: 2)), .none,
                       "des segments en attente de ✓ ne se perdent pas sous une photo")
    }

    /// > « le longpress à partir de la scène doit déclencher la capture vidéo
    /// > après avoir armé l'objectif » — directive porteur 2026-09-30.
    func test_table_appuiLong_filmeUnSegment() {
        func tenue(_ contexte: ComposerCaptureGestureContext) -> ComposerCaptureAction {
            ComposerCaptureGesture.action(zone: .scene, gesture: .longPress, context: contexte)
        }
        XCTAssertEqual(tenue(ComposerCaptureGestureContext()), .filmSegment)
        XCTAssertEqual(tenue(ComposerCaptureGestureContext(stage: .recording)), .none,
                       "une prise en cours n'en démarre pas une seconde")
        XCTAssertEqual(tenue(ComposerCaptureGestureContext(allowsVideo: false)), .none)
        XCTAssertEqual(tenue(ComposerCaptureGestureContext(pendingSegments: 2)), .filmSegment,
                       "une nouvelle prise s'AJOUTE aux segments en attente")
    }

    /// Trois gestes, trois intentions, sur la MÊME nappe du viseur armé.
    func test_viseurArme_toucherEtAppuiLong_nePortentPasLaMemeIntention() {
        let contexte = ComposerCaptureGestureContext()
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .scene, gesture: .tap, context: contexte), .focus)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .scene, gesture: .doubleTap, context: contexte), .photoToEdit)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .scene, gesture: .longPress, context: contexte), .filmSegment)
    }

    /// La nappe du viseur armé câble l'appui long vers la prise vidéo.
    func test_nappeDuViseurArme_cableLAppuiLongVersLaVideo() throws {
        let chrome = try source("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("scene(.longPress)"), "l'appui long de la nappe filme, décidé par la table")
        // #9134 — la nappe est celle du chrome PARTAGÉ : sa levée est celle de la machine.
        XCTAssertTrue(chrome.contains(".onEnded { _ in session.endHold() }"), "relâcher n'arrête pas la prise")
    }

    /// La levée d'un appui long se lit désormais sur le cadenas (#8671) —
    /// `ComposerCaptureHold.release`, éprouvée par `ComposerCaptureLockZoomFlashTests`.
    func test_release_clotLaPrise_ouAnnuleCeQuiNAPasDemarre() {
        XCTAssertEqual(ComposerCaptureHold.release(isRecording: true, phase: .holding), .closeTake)
        XCTAssertEqual(ComposerCaptureHold.release(isRecording: true, phase: .locked), .keepFilming,
                       "une prise verrouillée survit au relâchement")
        XCTAssertEqual(ComposerCaptureHold.release(isRecording: false, phase: .holding), .cancelPending,
                       "relâcher avant que la caméra soit prête ne prend RIEN — jamais une photo imprévue")
    }

    func test_hint_ditLesDeuxGestes_ouLaVideoSeule() {
        XCTAssertEqual(ComposerSceneQuickCapture.hint(format: .story), .photoOrVideo)
        XCTAssertEqual(ComposerSceneQuickCapture.hint(format: .reel), .videoOnly)
        XCTAssertNil(ComposerSceneQuickCapture.hint(format: .status))
    }

    @MainActor
    func test_hintCopy_estServiDansLesSeptLangues() {
        let lignes = ComposerSceneQuickCapture.gestureLines(.photoOrVideo).map(ComposerSceneCameraCopy.gestureLine)
        XCTAssertFalse(lignes.contains(where: \.isEmpty))
        XCTAssertEqual(Set(lignes).count, lignes.count, "chaque temps a ses propres mots")
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

    // MARK: - La place du viseur sous le flash d'écran (#9566)

    func test_placement_enRetouche_toujoursPleinEcran() {
        for demandee in ComposerSceneCameraSize.allCases {
            for carte in [true, false] {
                for flash in [true, false] {
                    XCTAssertEqual(ComposerCapturePlacement.size(requested: demandee, hostHasCard: carte,
                                                                 screenFlash: flash, editing: true), .fullScreen)
                }
            }
        }
    }

    func test_placement_unHoteACarte_suitLaTailleDemandee() {
        XCTAssertEqual(ComposerCapturePlacement.size(requested: .card, hostHasCard: true,
                                                     screenFlash: false, editing: false), .card)
        XCTAssertEqual(ComposerCapturePlacement.size(requested: .fullScreen, hostHasCard: true,
                                                     screenFlash: true, editing: false), .fullScreen,
                       "agrandi, le selfie éclairé prend tout l'écran")
    }

    func test_placement_viseurServiSeul_neSeReduitEnSceneQueSousLeFlashDEcran() {
        XCTAssertEqual(ComposerCapturePlacement.size(requested: .card, hostHasCard: false,
                                                     screenFlash: false, editing: false), .fullScreen,
                       "sans carte ni flash d'écran, il n'a nulle part où rentrer")
        XCTAssertEqual(ComposerCapturePlacement.size(requested: .card, hostHasCard: false,
                                                     screenFlash: true, editing: false), .card)
        XCTAssertEqual(ComposerCapturePlacement.size(requested: .fullScreen, hostHasCard: false,
                                                     screenFlash: true, editing: false), .fullScreen)
    }

    func test_placement_laSceneDUnViseurServiSeul_estLEcranMoinsUnAnneau() {
        let plein = CGRect(x: 0, y: 0, width: 390, height: 844)
        let ancre = CGRect(x: 40, y: 120, width: 300, height: 533)
        XCTAssertEqual(ComposerCapturePlacement.card(anchor: ancre, full: plein, hostHasCard: true), ancre)
        XCTAssertEqual(ComposerCapturePlacement.card(anchor: plein, full: plein, hostHasCard: false),
                       plein.insetBy(dx: ComposerCapturePlacement.sceneRim, dy: ComposerCapturePlacement.sceneRim))
    }

    func test_placement_leSolBlancNEntoureQueLaScene_jamaisLePleinEcran() {
        XCTAssertTrue(ComposerCapturePlacement.showsFloor(size: .card, screenFlash: true))
        XCTAssertFalse(ComposerCapturePlacement.showsFloor(size: .fullScreen, screenFlash: true),
                       "agrandi : plus de blanc en continu")
        XCTAssertFalse(ComposerCapturePlacement.showsFloor(size: .card, screenFlash: false))
    }

    func test_placement_enPleinEcran_lEcranNeBlanchitQuALaPrise() {
        XCTAssertTrue(ComposerCapturePlacement.showsBurst(bursting: true, size: .fullScreen))
        XCTAssertFalse(ComposerCapturePlacement.showsBurst(bursting: false, size: .fullScreen))
        XCTAssertFalse(ComposerCapturePlacement.showsBurst(bursting: true, size: .card),
                       "en scène le sol éclaire déjà : rien ne recouvre l'aperçu")
    }

    func test_placement_leBoutonDeTaille_resteOffertSousLeFlashDEcran_etSeTaitEnRetouche() {
        XCTAssertTrue(ComposerCapturePlacement.offersSizeToggle(hostHasCard: true, screenFlash: false, editing: false))
        XCTAssertFalse(ComposerCapturePlacement.offersSizeToggle(hostHasCard: false, screenFlash: false, editing: false))
        XCTAssertTrue(ComposerCapturePlacement.offersSizeToggle(hostHasCard: false, screenFlash: true, editing: false),
                      "le selfie éclairé peut toujours s'agrandir")
        XCTAssertFalse(ComposerCapturePlacement.offersSizeToggle(hostHasCard: true, screenFlash: true, editing: true))
    }

    func test_montage_placeLeViseurParLaRegle_etArronditLaScene() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer")
        let montage = AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent("ComposerCaptureMount.swift"), encoding: .utf8))
        XCTAssertTrue(montage.contains("ComposerCapturePlacement.size("))
        XCTAssertTrue(montage.contains("ComposerCapturePlacement.showsFloor("))
        XCTAssertTrue(montage.contains("ComposerCapturePlacement.showsBurst("))
        XCTAssertTrue(montage.contains("ComposerCapturePlacement.offersSizeToggle("))
        XCTAssertFalse(montage.contains("size: size,"), "les couches reçoivent la taille PLACÉE, jamais la demandée")
        XCTAssertEqual(ComposerSceneCameraFrame.radius(for: .card), ComposerSceneCameraFrame.cardRadius,
                       "la scène entourée de blanc a des coins arrondis")
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
