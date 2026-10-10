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
        let echelle = ComposerCaptureZoomScale(base: 1)
        XCTAssertEqual(echelle.displayedRange(deviceMin: 1, deviceMax: 123), 1...ComposerCaptureZoom.ceiling)
        XCTAssertEqual(echelle.displayedRange(deviceMin: 1, deviceMax: 1), 1...1,
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

    /// La piste est VERTICALE (#9566) : en haut le plein, en bas le plancher.
    func test_curseur_laPisteVerticaleVaDuPleinEnHautAuPlancherEnBas() {
        XCTAssertEqual(ComposerFlashIntensity.level(atY: 0, height: 120), 1)
        XCTAssertEqual(ComposerFlashIntensity.level(atY: 120, height: 120), ComposerFlashIntensity.range.lowerBound,
                       accuracy: 0.0001)
        XCTAssertEqual(ComposerFlashIntensity.level(atY: -50, height: 120), 1, "au-dessus de la piste : plein")
        XCTAssertEqual(ComposerFlashIntensity.level(atY: 30, height: 0), ComposerFlashIntensity.defaultLevel)
        let milieu = ComposerFlashIntensity.level(atY: 60, height: 120)
        XCTAssertEqual(ComposerFlashIntensity.thumbPosition(milieu), 0.5, accuracy: 0.0001, "poser est l'inverse de lire")
        XCTAssertEqual(ComposerFlashIntensity.thumbPosition(1), 0, accuracy: 0.0001)
        XCTAssertEqual(ComposerFlashIntensity.thumbPosition(ComposerFlashIntensity.range.lowerBound), 1, accuracy: 0.0001)
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
        XCTAssertTrue(barre.contains("ComposerFlashIntensity.showsSlider"))
        XCTAssertTrue(barre.contains("accessibilityAdjustableAction"), "le curseur est ajustable à la voix")
        // #9351 — le cadenas, le zoom et la phrase sont passés au bas de la capture.
        let bas = try source("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("ComposerCaptureHold.showsLock"))
        XCTAssertTrue(bas.contains("ComposerCaptureZoomBar("), "les crans, montés par la barre qui morphe (#9753)")
        XCTAssertTrue(bas.contains("ComposerSceneCameraCopy.lockHint"), "la phrase du bas dit le cadenas")
        let bande = try source("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(bande.contains("session.releaseStaleHold()"),
                      "un appui long dont la levée s'est perdue se clôt sur la miniature choisie")
    }

    func test_lHoteZoomeLaCameraEtRegleLaTorche() throws {
        // #9134 — la machine de capture câble les lois pour les deux montages.
        let machine = try source("Meeshy/Features/Main/Composer/ComposerCaptureSession.swift")
        XCTAssertTrue(machine.contains("ComposerCaptureZoom.factor"))
        XCTAssertTrue(machine.contains("ComposerCaptureHold.release"))
        XCTAssertTrue(machine.contains("ComposerCaptureHold.verticalDrag"))
        XCTAssertTrue(machine.contains("ComposerFlashIntensity.floorWhite"))
        let chrome = try source("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("ComposerCaptureGesture.action(zone: .scene, gesture: .drag"),
                      "le glissé de la nappe lit la table, qui suit la même loi")
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

/// **#9295 — la mise au point automatique, le double toucher qui vise, le
/// pincement qui zoome** (directive porteur 2026-10-04).
///
/// > « L'appareil doit avoir l'auto mise au point et lorsqu'on double tap à une
/// > position elle fait la mise au point à cet emplacement. […] Le zoom par
/// > pinch-in/out doit fonctionner ainsi que longpress swipe down/up. »
///
/// Les gestes vivent dans le chrome PARTAGÉ (`ComposerCaptureChrome`) : le
/// viseur plein écran et le viseur de la scène des posts et des stories en
/// profitent d'un même câblage.
final class ComposerCaptureFocusAndPinchTests: XCTestCase {

    private static let objectifComplet = ComposerCaptureFocus.Capabilities(
        focusPointOfInterest: true, autoFocus: true, continuousAutoFocus: true,
        exposurePointOfInterest: true, autoExpose: true, continuousAutoExposure: true)

    // MARK: - La mise au point

    func test_continuous_ouverture_suitLaSceneSansGuet() {
        let plan = ComposerCaptureFocus.continuous(Self.objectifComplet)
        XCTAssertEqual(plan.focus, .continuous)
        XCTAssertEqual(plan.exposure, .continuous)
        XCTAssertFalse(plan.watchesSubjectArea, "en continu, l'objectif suit déjà la scène")
    }

    func test_focusing_doubleToucher_viseLePointPuisGuetteLaScene() {
        let point = CGPoint(x: 0.25, y: 0.7)
        let plan = ComposerCaptureFocus.focusing(at: point, Self.objectifComplet)
        XCTAssertEqual(plan.focus, .once(at: point))
        XCTAssertEqual(plan.exposure, .once(at: point))
        XCTAssertTrue(plan.watchesSubjectArea, "la scène qui change rend l'objectif au continu")
    }

    func test_focusing_toucherAuRasDuBord_resteDansLeCapteur() {
        let plan = ComposerCaptureFocus.focusing(at: CGPoint(x: -0.2, y: 1.4), Self.objectifComplet)
        XCTAssertEqual(plan.focus, .once(at: CGPoint(x: 0, y: 1)))
    }

    func test_focusing_objectifSansPointDInteret_garderSonContinu() {
        let fixe = ComposerCaptureFocus.Capabilities(
            focusPointOfInterest: false, autoFocus: false, continuousAutoFocus: true,
            exposurePointOfInterest: false, autoExpose: false, continuousAutoExposure: true)
        let plan = ComposerCaptureFocus.focusing(at: CGPoint(x: 0.3, y: 0.3), fixe)
        XCTAssertEqual(plan.focus, .continuous)
        XCTAssertEqual(plan.exposure, .continuous)
        XCTAssertFalse(plan.watchesSubjectArea, "rien n'a été visé, rien à rendre au continu")
    }

    func test_focusing_objectifQuiNeSaitRien_neToucheARien() {
        let plan = ComposerCaptureFocus.focusing(at: CGPoint(x: 0.5, y: 0.5), .none)
        XCTAssertNil(plan.focus)
        XCTAssertNil(plan.exposure)
        XCTAssertEqual(ComposerCaptureFocus.continuous(.none),
                       ComposerCaptureFocus.Plan(focus: nil, exposure: nil, watchesSubjectArea: false))
    }

    func test_focusesOnTap_seulementQuandLImageEstLa() {
        XCTAssertFalse(ComposerCaptureFocus.focusesOnTap(stage: .off))
        XCTAssertTrue(ComposerCaptureFocus.focusesOnTap(stage: .armed))
        XCTAssertTrue(ComposerCaptureFocus.focusesOnTap(stage: .recording))
    }

    // MARK: - Le pincement

    func test_pinched_ecarterGrandit_rapprocherRetrecit() {
        let plage: ClosedRange<CGFloat> = 1...10
        XCTAssertEqual(ComposerCaptureZoom.pinched(from: 2, scale: 2, range: plage), 4, accuracy: 0.0001)
        XCTAssertEqual(ComposerCaptureZoom.pinched(from: 4, scale: 0.5, range: plage), 2, accuracy: 0.0001)
        XCTAssertEqual(ComposerCaptureZoom.pinched(from: 3, scale: 1, range: plage), 3, accuracy: 0.0001,
                       "des doigts posés sans bouger ne recadrent pas")
    }

    func test_pinched_resteDansLesBornesDeLObjectif() {
        let plage: ClosedRange<CGFloat> = 1...6
        XCTAssertEqual(ComposerCaptureZoom.pinched(from: 4, scale: 3, range: plage), 6)
        XCTAssertEqual(ComposerCaptureZoom.pinched(from: 2, scale: 0.2, range: plage), 1)
        XCTAssertEqual(ComposerCaptureZoom.pinched(from: 1, scale: 4, range: 1...1), 1,
                       "un objectif fixe ne zoome pas")
    }

    func test_pinchSpoilsGestures_pendantEtJusteApresLePincement() {
        let maintenant = Date()
        XCTAssertTrue(ComposerCaptureZoom.pinchSpoilsGestures(isPinching: true, pinchEndedAt: nil, now: maintenant))
        XCTAssertTrue(ComposerCaptureZoom.pinchSpoilsGestures(
            isPinching: false, pinchEndedAt: maintenant.addingTimeInterval(-0.1), now: maintenant),
                      "le dernier doigt se lève après le premier")
        XCTAssertFalse(ComposerCaptureZoom.pinchSpoilsGestures(
            isPinching: false, pinchEndedAt: maintenant.addingTimeInterval(-1), now: maintenant))
        XCTAssertFalse(ComposerCaptureZoom.pinchSpoilsGestures(isPinching: false, pinchEndedAt: nil, now: maintenant),
                       "sans pincement, le glissé vers le bas range le viseur")
    }

    // MARK: - La machine

    @MainActor
    func test_pinchZoom_viseurEteint_neFaitRien() {
        let session = ComposerCaptureSession()
        session.pinchZoom(scale: 2)
        XCTAssertFalse(session.isPinching)
        XCTAssertFalse(session.pinchSpoilsGestures)
    }

    @MainActor
    func test_rangement_sansPincement_suitLeDoigtPuisRange() {
        let session = ComposerCaptureSession(stage: .armed, mode: .photo)
        session.followDismissDrag(translationY: 80)
        XCTAssertEqual(session.dismissDrag, 80, "le viseur suit le doigt")
        XCTAssertTrue(session.releaseDismissDrag(translationY: 400))
        XCTAssertEqual(session.dismissDrag, 0)
    }

    @MainActor
    func test_rangement_unGlisseQuiCroiseUnPincement_resteGateJusquALaLevee() {
        let session = ComposerCaptureSession(stage: .armed, mode: .photo)
        session.followDismissDrag(translationY: 80)
        session.pinchZoom(scale: 1.5)
        XCTAssertTrue(session.isPinching)
        XCTAssertEqual(session.dismissDrag, 0, "deux doigts qui descendent dézooment, ils ne rangent pas")
        session.endPinchZoom()
        session.followDismissDrag(translationY: 500)
        XCTAssertEqual(session.dismissDrag, 0, "après le délai, le glissé ne saute pas à sa course entière")
        XCTAssertFalse(session.releaseDismissDrag(translationY: 500))
        session.followDismissDrag(translationY: 60)
        XCTAssertEqual(session.dismissDrag, 0, "le glissé suivant tombe encore dans le délai du dernier doigt")
        XCTAssertFalse(session.releaseDismissDrag(translationY: 60))
    }

    @MainActor
    func test_endPinchZoom_estIdempotente_etDesarmerOublieLePincement() {
        let session = ComposerCaptureSession(stage: .armed, mode: .photo)
        session.endPinchZoom()
        XCTAssertFalse(session.pinchSpoilsGestures, "une fin sans pincement ne gâte rien")
        session.pinchZoom(scale: 1.4)
        session.disarm()
        XCTAssertFalse(session.isPinching, "un pincement annulé par le système ne survit pas au rangement")
        XCTAssertFalse(session.pinchSpoilsGestures)
    }

    @MainActor
    func test_pinchZoom_annuleLAppuiLongQuiAttendaitLaCamera_jusquALaLeveeDuGeste() {
        let session = ComposerCaptureSession(stage: .armed, mode: .photo)
        session.beginHold()
        XCTAssertNotNil(session.holdStartedAt)
        session.pinchZoom(scale: 1.2)
        XCTAssertNil(session.holdStartedAt, "deux doigts demandent un cadrage, pas une vidéo")
        XCTAssertNil(session.holdPhase)
        session.beginHold()
        XCTAssertNil(session.holdStartedAt, "pas d'appui long pendant un pincement")
        session.endPinchZoom()
        session.beginHold()
        XCTAssertNil(session.holdStartedAt, "le doigt resté posé ne relance pas la vidéo annulée")
        session.endHold()
        session.beginHold()
        XCTAssertNotNil(session.holdStartedAt, "la levée du geste libère l'appui long suivant")
        session.endHold()
    }

    @MainActor
    func test_focus_sansAperculALEcran_nAnnoncePasDeMiseAuPoint() {
        let session = ComposerCaptureSession(stage: .armed, mode: .photo)
        XCTAssertFalse(session.focus(atGlobalPoint: CGPoint(x: 100, y: 100)),
                       "l'anneau ne paraît pas pour une mise au point qui n'a pas eu lieu")
        let eteinte = ComposerCaptureSession()
        XCTAssertFalse(eteinte.focus(atGlobalPoint: CGPoint(x: 100, y: 100)))
    }

    func test_layerPoint_rameneLeToucherAuRepereDeLApercu() {
        let cadre = CGRect(x: 0, y: 59, width: 393, height: 700)
        XCTAssertEqual(CameraPreviewFocusPoints.layerPoint(global: CGPoint(x: 100, y: 159), previewFrame: cadre),
                       CGPoint(x: 100, y: 100), "le plein écran pose l'aperçu sous la zone sûre")
        XCTAssertNil(CameraPreviewFocusPoints.layerPoint(global: CGPoint(x: 100, y: 20), previewFrame: cadre),
                     "un toucher hors de l'image ne vise pas")
        XCTAssertNil(CameraPreviewFocusPoints.layerPoint(global: CGPoint(x: 10, y: 10), previewFrame: .zero),
                     "un aperçu pas encore mesuré ne vise pas")
    }

    // MARK: - Le câblage

    func test_leChromePartage_porteLeDoubleToucherEtLePincement() throws {
        let chrome = try source("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("SpatialTapGesture(count: 1, coordinateSpace: .global)"), "un toucher vise (#9464)")
        XCTAssertTrue(chrome.contains("session.focus(atGlobalPoint:"))
        XCTAssertTrue(chrome.contains("MagnificationGesture()"), "pincer zoome")
        XCTAssertTrue(chrome.contains("session.pinchZoom(scale:"))
        XCTAssertTrue(chrome.contains("session.followDismissDrag(") && chrome.contains("session.releaseDismissDrag("),
                      "un pincement ne range jamais le viseur")
        XCTAssertTrue(chrome.contains("guard !session.pinchSpoilsGestures"),
                      "la levée d'un pincement ne photographie pas et ne vise pas")
        XCTAssertTrue(chrome.contains(".updating($pinchActive)"),
                      "un pincement annulé par le système finit quand même")
        XCTAssertTrue(chrome.contains("focusPoints: session.focusPoints"),
                      "l'aperçu partagé s'accroche au pont toucher → capteur")
        XCTAssertTrue(chrome.contains("adaptiveOnChange(of: proxy.frame(in: .global), initial: true)"),
                      "l'aperçu mesure son cadre dans le repère du toucher")
        XCTAssertTrue(chrome.contains("session.focusPoints.previewFrame = cadre"))
    }

    func test_lesDeuxMontages_profitentDesGestesSansLesRecabler() throws {
        for montage in ["Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift",
                        "Meeshy/Features/Main/Composer/ComposerViewfinder.swift"] {
            let code = try source(montage)
            XCTAssertTrue(code.contains("ComposerCaptureMount("), "\(montage) monte le montage partagé")
            XCTAssertFalse(code.contains("MagnificationGesture"), "\(montage) recâble le pincement")
            XCTAssertFalse(code.contains("SpatialTapGesture"), "\(montage) recâble la mise au point")
        }
    }

    func test_laCamera_seRegleEnContinuEtViseAuPoint() throws {
        let camera = try source("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(camera.contains("ComposerCaptureFocus.continuous("), "mise au point automatique à l'ouverture")
        XCTAssertTrue(camera.contains("ComposerCaptureFocus.focusing(at:"), "le double toucher vise")
        XCTAssertTrue(camera.contains("subjectAreaDidChangeNotification"), "la scène qui change rend le continu")
        XCTAssertTrue(camera.contains(".continuousAutoFocus"))
        XCTAssertTrue(camera.contains(".continuousAutoExposure"))
    }

    // MARK: - Outils

    private func source(_ chemin: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(chemin), encoding: .utf8))
    }
}
