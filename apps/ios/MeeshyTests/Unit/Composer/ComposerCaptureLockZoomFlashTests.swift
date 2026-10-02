import XCTest
import AVFoundation
@testable import Meeshy

/// **Une scène vide qui donne envie, un cadenas et un zoom au glisser, un
/// curseur de verre pour l'intensité du flash** (#8671, directive porteur
/// 2026-09-29).
///
/// > « Être plus commercial : ceci est votre scène, ajouter texte, dessin,
/// > image, vidéo. Puis le petit détail en plus grand : Toucher et Maintenir…
/// > Ajouter une clé pour la vidéo permettant de lock la vidéo et de pouvoir
/// > zoomer : swipe vers le haut et swipe vers le bas ! Quand le flash est
/// > activé, une slide liquid glass s'allonge à droite, collée au bouton, pour
/// > décider de l'intensité du blanc du sol du composeur ! »
final class ComposerCaptureLockZoomFlashTests: XCTestCase {

    // MARK: - Le cadenas : tenu, verrouillé, annulé

    func test_phase_sousLeSeuil_leDoigtTient() {
        XCTAssertEqual(ComposerCaptureHold.phase(translation: CGPoint(x: 20, y: -80), wasLocked: false),
                       .holding, "un pouce qui remonte pour zoomer ne verrouille pas")
    }

    func test_phase_auCadenas_verrouille() {
        let seuil = ComposerShutterGesture.slideToLock
        XCTAssertEqual(ComposerCaptureHold.phase(translation: CGPoint(x: seuil, y: 0), wasLocked: false),
                       .locked)
    }

    func test_phase_unVerrouNeSeDefaitPasEnRevenant() {
        XCTAssertEqual(ComposerCaptureHold.phase(translation: CGPoint(x: -30, y: 40), wasLocked: true),
                       .locked)
    }

    func test_release_tenuClot_verrouilleContinue_tropTotAnnule() {
        XCTAssertEqual(ComposerCaptureHold.release(isRecording: true, phase: .holding), .closeTake)
        XCTAssertEqual(ComposerCaptureHold.release(isRecording: true, phase: .locked), .keepFilming)
        XCTAssertEqual(ComposerCaptureHold.release(isRecording: false, phase: .holding), .cancelPending,
                       "relâcher avant que la caméra soit prête ne prend RIEN")
        XCTAssertEqual(ComposerCaptureHold.release(isRecording: false, phase: .locked), .keepFilming,
                       "un verrou posé pendant l'ouverture vaut intention : la prise partira sans le doigt")
    }

    func test_showsLock_desQueLeDoigtTient_etJamaisUneFoisVerrouille() {
        XCTAssertTrue(ComposerCaptureHold.showsLock(stage: .armed, holding: true, locked: false),
                      "le cadenas paraît pendant que la caméra s'ouvre, pas après")
        XCTAssertTrue(ComposerCaptureHold.showsLock(stage: .recording, holding: false, locked: false))
        XCTAssertFalse(ComposerCaptureHold.showsLock(stage: .recording, holding: true, locked: true),
                       "verrouillé : le cadenas cède la place au bouton stop")
        XCTAssertFalse(ComposerCaptureHold.showsLock(stage: .armed, holding: false, locked: false))
        XCTAssertFalse(ComposerCaptureHold.showsLock(stage: .off, holding: true, locked: false))
    }

    func test_verticalDrag_zoomePendantLaPrise_rangeLaCameraHorsPrise() {
        XCTAssertEqual(ComposerCaptureHold.verticalDrag(stage: .recording), .zoom,
                       "dézoomer une prise verrouillée ne doit pas fermer le viseur")
        XCTAssertEqual(ComposerCaptureHold.verticalDrag(stage: .armed), .dismiss)
    }

    // MARK: - Le zoom au glisser

    private let plage: ClosedRange<CGFloat> = 1...10

    func test_zoom_remonterZoome_descendreDezoome() {
        let p = ComposerCaptureZoom.pointsPerDoubling
        XCTAssertEqual(ComposerCaptureZoom.factor(from: 1, translationY: -p, range: plage), 2, accuracy: 0.001)
        XCTAssertEqual(ComposerCaptureZoom.factor(from: 4, translationY: p, range: plage), 2, accuracy: 0.001)
    }

    func test_zoom_estProgressif() {
        let demi = ComposerCaptureZoom.factor(from: 1, translationY: -ComposerCaptureZoom.pointsPerDoubling / 2,
                                              range: plage)
        XCTAssertGreaterThan(demi, 1)
        XCTAssertLessThan(demi, 2)
    }

    func test_zoom_resteDansLesBornesDeLObjectif() {
        XCTAssertEqual(ComposerCaptureZoom.factor(from: 1, translationY: 5_000, range: plage), 1)
        XCTAssertEqual(ComposerCaptureZoom.factor(from: 1, translationY: -5_000, range: plage), 10)
    }

    func test_zoomRange_plafonneLeCapteur_etTolereUnObjectifFixe() {
        XCTAssertEqual(ComposerCaptureZoom.range(deviceMin: 1, deviceMax: 123), 1...ComposerCaptureZoom.ceiling)
        XCTAssertEqual(ComposerCaptureZoom.range(deviceMin: 1, deviceMax: 1), 1...1,
                       "sans zoom (simulateur), le geste n'a aucun effet")
    }

    func test_zoom_voiceOverIncremente_etSeBorne() {
        XCTAssertGreaterThan(ComposerCaptureZoom.stepped(1, up: true, range: plage), 1)
        XCTAssertEqual(ComposerCaptureZoom.stepped(1, up: false, range: plage), 1)
        XCTAssertFalse(ComposerCaptureZoom.showsBadge(1))
        XCTAssertTrue(ComposerCaptureZoom.showsBadge(1.5))
    }

    // MARK: - Le curseur d'intensité du flash

    func test_curseur_nApparaitQueFlashActif() {
        XCTAssertFalse(ComposerFlashIntensity.showsSlider(flash: .off))
        XCTAssertTrue(ComposerFlashIntensity.showsSlider(flash: .on))
        XCTAssertTrue(ComposerFlashIntensity.showsSlider(flash: .auto))
    }

    func test_curseur_laPisteVaDuPlancherAuPlein() {
        XCTAssertEqual(ComposerFlashIntensity.level(atX: 0, width: 120), ComposerFlashIntensity.range.lowerBound)
        XCTAssertEqual(ComposerFlashIntensity.level(atX: 120, width: 120), 1)
        XCTAssertEqual(ComposerFlashIntensity.level(atX: 500, width: 120), 1, "au-delà de la piste : plein")
        let milieu = ComposerFlashIntensity.level(atX: 60, width: 120)
        XCTAssertEqual(ComposerFlashIntensity.fill(milieu), 0.5, accuracy: 0.0001, "remplir est l'inverse de lire")
    }

    func test_intensite_reglePlancherBlancEtTorche() {
        XCTAssertEqual(ComposerFlashIntensity.floorWhite(0), ComposerFlashIntensity.range.lowerBound,
                       "jamais un blanc qui n'éclaire plus")
        XCTAssertEqual(ComposerFlashIntensity.floorWhite(0.7), 0.7)
        XCTAssertEqual(ComposerFlashIntensity.torchLevel(0.5, maxAvailable: 1), 0.5, accuracy: 0.0001)
        XCTAssertEqual(ComposerFlashIntensity.torchLevel(1, maxAvailable: 0.8), 0.8, accuracy: 0.0001,
                       "une torche chaude sert moins : on ne lui demande pas plus")
        XCTAssertEqual(ComposerFlashIntensity.clamped(.nan), ComposerFlashIntensity.defaultLevel)
    }

    func test_intensite_voiceOverAjuste_parPasDeDixPourCent() {
        XCTAssertEqual(ComposerFlashIntensity.stepped(0.5, up: true), 0.6, accuracy: 0.0001)
        XCTAssertEqual(ComposerFlashIntensity.stepped(1, up: true), 1)
        XCTAssertEqual(ComposerFlashIntensity.stepped(0.3, up: false), 0.3)
        XCTAssertEqual(ComposerFlashIntensity.percent(0.84), 84)
    }

    @MainActor
    func test_ecran_sAllumeAuNiveauDuCurseur_seRegle_puisRendSaLuminosite() {
        let ecran = IntensityScreen(brightness: 0.4)
        let flash = ComposerScreenFlash(screen: ecran)
        flash.adjust(level: 0.9)
        XCTAssertEqual(ecran.brightness, 0.4, "régler un écran éteint n'allume rien")
        flash.light(level: 0.6)
        XCTAssertEqual(ecran.brightness, 0.6, accuracy: 0.0001)
        flash.adjust(level: 0.8)
        XCTAssertEqual(ecran.brightness, 0.8, accuracy: 0.0001)
        flash.restore()
        XCTAssertEqual(ecran.brightness, 0.4, accuracy: 0.0001)
    }

    // MARK: - Le vocabulaire, dans les sept langues

    private static let clesNeuves = [
        "composer.scene.empty.title",
        "composer.scene.empty.invite",
        "composer.camera.lock.hint",
        "composer.camera.lock.done",
        "composer.camera.zoom",
        "composer.camera.flashIntensity",
        "composer.camera.gesture.tapArm",
        "composer.camera.gesture.tapAgainPhoto",
        "composer.camera.gesture.holdFilm",
    ]

    func test_catalogue_serLesClesNeuvesDansLesSeptLangues() throws {
        let catalogue = try Self.catalogue()
        for cle in Self.clesNeuves {
            let langues = try XCTUnwrap(catalogue[cle], "clé absente : \(cle)")
            for langue in ["fr", "en", "es", "de", "it", "pt-BR", "ar"] {
                XCTAssertFalse((langues[langue] ?? "").isEmpty, "\(cle) sans \(langue)")
            }
        }
    }

    func test_catalogue_laSceneVideParleAuRegistreDuComposer() throws {
        let catalogue = try Self.catalogue()
        let titre = try XCTUnwrap(catalogue["composer.scene.empty.title"])
        XCTAssertTrue(titre["fr"]?.contains("votre") == true, "le composer vouvoie en français")
        XCTAssertTrue(titre["de"]?.contains("deine") == true, "et tutoie en allemand, comme son catalogue")
    }

    @MainActor
    func test_sceneVide_ditTitreInvitationPuisGestes() {
        let parle = ComposerSceneCameraCopy.emptySceneSpoken(.photoOrVideo)
        XCTAssertTrue(parle.hasPrefix(ComposerSceneCameraCopy.emptySceneTitle))
        XCTAssertTrue(parle.contains(ComposerSceneCameraCopy.emptySceneInvite))
        XCTAssertTrue(parle.hasSuffix(ComposerSceneCameraCopy.gestureLine(.holdFilm)))
        XCTAssertTrue(parle.contains(ComposerSceneCameraCopy.gestureLine(.tapArm)))
        XCTAssertTrue(parle.contains(ComposerSceneCameraCopy.gestureLine(.tapAgainPhoto)))
    }

    // MARK: - Les gestes : une ligne chacun, précédée de son icône (complément porteur)

    /// **L'indication dit les DEUX temps de la photo** (#8711) : toucher arme,
    /// toucher encore prend — puis la vidéo au maintien.
    func test_gestes_armerPuisPhotographierPuisFilmer_chacunSaLigne() {
        XCTAssertEqual(ComposerSceneQuickCapture.gestureLines(.photoOrVideo), [.tapArm, .tapAgainPhoto, .holdFilm])
        XCTAssertEqual(ComposerSceneQuickCapture.gestureLines(.videoOnly), [.holdFilm],
                       "un réel n'offre pas la photo : sa ligne ne s'affiche pas")
    }

    func test_gestes_chaqueLigneASonIcone() {
        XCTAssertEqual(ComposerSceneQuickCapture.GestureLine.tapArm.symbol, "camera.viewfinder")
        XCTAssertEqual(ComposerSceneQuickCapture.GestureLine.tapAgainPhoto.symbol, "camera")
        XCTAssertEqual(ComposerSceneQuickCapture.GestureLine.holdFilm.symbol, "video")
    }

    func test_laSceneVide_nePorteAucunAppareilPhotoAuDessusDuTitre() throws {
        let cadre = try source("Meeshy/Features/Main/Composer/ComposerSceneCameraFrame.swift")
        XCTAssertFalse(cadre.contains("hint == .videoOnly ? \"video\" : \"camera\""),
                       "l'appareil photo au-dessus du titre ne représente pas une scène")
        XCTAssertTrue(cadre.contains("ComposerSceneQuickCapture.gestureLines(hint)"))
    }

    // MARK: - Le câblage

    func test_laSceneVideMontreLeTitreEtLInvitation() throws {
        let cadre = try source("Meeshy/Features/Main/Composer/ComposerSceneCameraFrame.swift")
        XCTAssertTrue(cadre.contains("ComposerSceneCameraCopy.emptySceneTitle"))
        XCTAssertTrue(cadre.contains("ComposerSceneCameraCopy.emptySceneInvite"))
    }

    func test_laBarreMontreLeCadenasLeZoomEtLeCurseur() throws {
        let barre = try source("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        XCTAssertTrue(barre.contains("ComposerCaptureHold.showsLock"))
        XCTAssertTrue(barre.contains("ComposerFlashIntensity.showsSlider"))
        XCTAssertTrue(barre.contains("accessibilityAdjustableAction"), "le curseur est ajustable à la voix")
        XCTAssertTrue(barre.contains("ComposerSceneCameraCopy.lockHint"), "la phrase du bas dit le cadenas")
        XCTAssertTrue(barre.contains("onShutterTouched()"),
                      "toucher le déclencheur clôt un appui long dont la levée s'est perdue")
        let hote = try source("Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift")
        XCTAssertTrue(hote.contains("onShutterTouched: { releaseStaleSceneHold() }"))
    }

    func test_lHoteZoomeLaCameraEtRegleLaTorche() throws {
        let hote = try source("Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift")
        XCTAssertTrue(hote.contains("ComposerCaptureZoom.factor"))
        XCTAssertTrue(hote.contains("ComposerCaptureHold.release"))
        XCTAssertTrue(hote.contains("ComposerCaptureHold.verticalDrag"))
        XCTAssertTrue(hote.contains("ComposerFlashIntensity.floorWhite"))
        let camera = try source("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(camera.contains("setTorchModeOn(level:"))
        XCTAssertTrue(camera.contains("videoZoomFactor"))
    }

    // MARK: - Outils

    private static func catalogue() throws -> [String: [String: String]] {
        let url = root().appendingPathComponent("Meeshy/Localizable.xcstrings")
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        let cles = json?["strings"] as? [String: Any] ?? [:]
        return cles.compactMapValues { entree in
            let langues = (entree as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
            return langues.compactMapValues {
                (($0 as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String
            }
        }
    }

    private static func root() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try String(
            contentsOf: Self.root().appendingPathComponent(chemin), encoding: .utf8))
    }
}

@MainActor
private final class IntensityScreen: ScreenBrightnessControlling {
    nonisolated deinit {}
    var brightness: CGFloat
    init(brightness: CGFloat) { self.brightness = brightness }
}
