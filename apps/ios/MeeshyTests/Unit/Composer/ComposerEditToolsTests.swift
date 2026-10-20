import AVFoundation
import CoreMedia
import XCTest
import UIKit
import MeeshyUI
@testable import Meeshy

/// **Les outils du mode édition d'une prise** (#9754, directives porteur
/// 2026-10-09) : Crop, Trim, Son — COMPOSABLES et actifs d'office, chacun se
/// retire d'un toucher sans fermer les autres — et la frame exacte sous la règle.
@MainActor
final class ComposerEditToolsTests: XCTestCase {

    private static func clip() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("clip_\(UUID().uuidString).mov")
    }

    private func videoSession(hasAudio: Bool = true) async -> (ComposerCaptureSession, MockComposerLoopPlayer) {
        let lecteur = MockComposerLoopPlayer(duration: 6, hasAudio: hasAudio)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        return (session, lecteur)
    }

    // MARK: - Ce que chaque prise offre, ACTIF D'OFFICE (porteur 2026-10-09)

    func test_offered_photoCrops_videoCropsTrimsAndSounds_audioTrimsAndSounds() {
        XCTAssertEqual(ComposerEditTools.offered(.photo), [.crop])
        XCTAssertEqual(ComposerEditTools.offered(.video(hasAudio: false)), [.crop, .trim])
        XCTAssertEqual(ComposerEditTools.offered(.video(hasAudio: true)), [.crop, .trim, .sound])
        XCTAssertEqual(ComposerEditTools.offered(.audio), [.trim, .sound], "un son ne se recadre pas")
    }

    /// **#10930 — les outils sont là dès l'entrée** (retour porteur 2026-10-20 :
    /// « les contrôleurs de l'édition ne fonctionnent pas — rien ne
    /// fonctionne »). Cachés derrière un glissé que rien n'annonce, aucun
    /// contrôle n'était atteignable : l'entrée allume ce que le glissé
    /// allumait, par-dessus une prise qui garde le viewport entier.
    func test_initial_theCutIsSelectedOnEntry_likeTheSwipeUpWould() {
        XCTAssertEqual(ComposerEditTools.initial(.photo), ComposerEditTools.revealed(.photo))
        XCTAssertEqual(ComposerEditTools.initial(.video(hasAudio: true)), [.trim, .sound])
        XCTAssertEqual(ComposerEditTools.initial(.video(hasAudio: false)), [.trim])
        XCTAssertEqual(ComposerEditTools.initial(.audio), [.trim, .sound])
    }

    /// **#10930 — le glissé vers le haut montre la barre de coupe, « Couper »
    /// sélectionné** ; son spectre se peint dessus quand la prise a un son.
    func test_revealed_aVideoShowsItsCut_aPhotoNothingYet() {
        XCTAssertEqual(ComposerEditTools.revealed(.video(hasAudio: true)), [.trim, .sound])
        XCTAssertEqual(ComposerEditTools.revealed(.video(hasAudio: false)), [.trim])
        XCTAssertEqual(ComposerEditTools.revealed(.audio), [.trim, .sound])
        XCTAssertEqual(ComposerEditTools.revealed(.photo), [], "une photo n'a que le recadrage, à choisir")
    }

    /// **#10930 — seul le recadrage réduit le média**, et seulement quand le
    /// chrome est montré.
    func test_onlyTheCrop_framesTheScene() {
        XCTAssertTrue(ComposerEditTools.framesScene(active: [.crop], chromeShown: true))
        XCTAssertTrue(ComposerEditTools.framesScene(active: [.crop, .trim], chromeShown: true))
        XCTAssertFalse(ComposerEditTools.framesScene(active: [.trim, .sound], chromeShown: true),
                       "la coupe se pose PAR-DESSUS la vidéo, elle ne la réduit pas")
        XCTAssertFalse(ComposerEditTools.framesScene(active: [.crop], chromeShown: false))
    }

    /// Hors recadrage, la scène est le conteneur entier : la prise « fit » le viewport.
    func test_anUnframedScene_isTheWholeContainer() {
        let ecran = CGSize(width: 402, height: 874)
        XCTAssertEqual(ComposerEditScene.area(container: ecran, top: 62, bottom: 34, panels: [.trim], framed: false),
                       CGRect(origin: .zero, size: ecran))
        let cadre = ComposerEditScene.area(container: ecran, top: 62, bottom: 34, panels: [.trim], framed: true)
        XCTAssertLessThan(cadre.height, ecran.height, "le recadrage réduit la scène pour libérer ses bords")
    }

    func test_toggled_onlyTheTouchedTool_neverTheOthers() {
        let tout: Set<ComposerEditTool> = [.crop, .trim, .sound]
        XCTAssertEqual(ComposerEditTools.toggled(tout, tapping: .trim, familyOpen: false), [.crop, .sound],
                       "désactiver Couper ne ferme ni Crop ni Son")
        XCTAssertEqual(ComposerEditTools.toggled([.crop, .sound], tapping: .trim, familyOpen: false), tout,
                       "le retoucher le réactive")
        XCTAssertEqual(ComposerEditTools.toggled([], tapping: .crop, familyOpen: false), [.crop])
    }

    func test_toggled_withABandOpen_revealsAFoldedTool_insteadOfDroppingIt() {
        XCTAssertEqual(ComposerEditTools.toggled([.crop, .trim], tapping: .trim, familyOpen: true), [.crop, .trim],
                       "Couper replié sous la bande : le toucher le MONTRE")
        XCTAssertEqual(ComposerEditTools.toggled([.crop, .trim], tapping: .crop, familyOpen: true), [.trim],
                       "les équerres restent visibles sous une bande : toucher Crop les retire")
    }

    func test_panels_stackEveryActiveTool_fromTheProportionsDownToTheCut() {
        XCTAssertEqual(ComposerEditTools.panels(familyOpen: false, active: [.trim, .sound, .crop]),
                       [.trim],
                       "les proportions se posent sur la scène (#10930) ; le son se peint sur la coupe (#10356)")
        XCTAssertEqual(ComposerEditTools.panels(familyOpen: false, active: [.sound, .crop]), [.sound],
                       "Couper retiré : le spectre garde sa propre piste")
        XCTAssertEqual(ComposerEditTools.panels(familyOpen: false, active: [.crop]), [])
        XCTAssertEqual(ComposerEditTools.panels(familyOpen: false, active: []), [])
        XCTAssertEqual(ComposerEditTools.panels(familyOpen: true, active: [.crop, .trim, .sound]), [.band],
                       "une bande ouverte replie les panneaux, sans désactiver leurs outils")
    }

    func test_shown_cropStaysOnTheSceneUnderABand_theTracksFold() {
        XCTAssertTrue(ComposerEditTools.isShown(.crop, active: [.crop], familyOpen: true))
        XCTAssertFalse(ComposerEditTools.isShown(.trim, active: [.trim], familyOpen: true))
        XCTAssertTrue(ComposerEditTools.isShown(.trim, active: [.trim], familyOpen: false))
        XCTAssertFalse(ComposerEditTools.isShown(.sound, active: [.trim], familyOpen: false))
    }

    // MARK: - (1) Crop fait paraître et disparaître les équerres

    func test_brackets_followTheCropTool_alone() {
        XCTAssertTrue(ComposerEditTools.showsBrackets(active: [.crop]))
        XCTAssertTrue(ComposerEditTools.showsBrackets(active: [.crop, .trim]))
        XCTAssertFalse(ComposerEditTools.showsBrackets(active: [.trim, .sound]))
        XCTAssertFalse(ComposerEditTools.showsBrackets(active: []))
    }

    func test_theBrackets_areMountedBehindTheCropTool() throws {
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("session.showsCropBrackets, let aspect = session.editAspect"))
    }

    func test_aPhoto_opensFullScreen_withItsToolsReachable_andCropsOnTap() {
        let photo = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        photo.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        XCTAssertTrue(photo.editChromeShown, "#10930 : les outils se posent sur la photo dès l'entrée")
        XCTAssertFalse(photo.showsCropBrackets)
        XCTAssertFalse(photo.editFramesScene, "montrer les outils ne réduit pas la photo")
        XCTAssertEqual(photo.editPanels, [])
        photo.toggleEditTool(.crop)
        XCTAssertTrue(photo.showsCropBrackets)
        XCTAssertTrue(photo.editFramesScene, "recadrer réduit la photo pour libérer ses bords")
        XCTAssertEqual(photo.editPanels, [], "les proportions se posent sur la scène")
        photo.hideEditChrome()
        XCTAssertFalse(photo.showsCropBrackets)
        XCTAssertFalse(photo.editFramesScene, "le chrome caché, la photo reprend l'écran")
        photo.revealEditChrome()
        XCTAssertTrue(photo.showsCropBrackets, "les outils reviennent comme on les a laissés")
        photo.toggleEditTool(.trim)
        XCTAssertEqual(photo.editTools, [.crop], "une photo ne se coupe pas")
    }

    // MARK: - (3) Les outils d'une vidéo, ensemble et chacun pour soi

    func test_aVideo_opensFullScreen_withTheCutSelected() async {
        let (session, _) = await videoSession()
        XCTAssertTrue(session.editChromeShown, "#10930 : les outils sont atteignables dès l'entrée")
        XCTAssertEqual(session.activeEditTools, [.trim, .sound], "« Couper » sélectionné, son spectre dessus")
        XCTAssertEqual(session.editPanels, [.trim])
        XCTAssertFalse(session.showsCropBrackets)
        XCTAssertFalse(session.editFramesScene, "la coupe se pose par-dessus la vidéo, qui garde l'écran")
        session.toggleEditTool(.crop)
        XCTAssertTrue(session.editFramesScene)
        XCTAssertEqual(session.editPanels, [.trim])
        session.toggleEditTool(.trim)
        XCTAssertEqual(session.editPanels, [.sound], "Couper se retire seul")
        XCTAssertTrue(session.showsCropBrackets, "les équerres restent")
        session.toggleEditTool(.trim)
        session.toggleFamily(.filters)
        XCTAssertEqual(session.editPanels, [.band])
        XCTAssertEqual(session.activeEditTools, [.crop, .trim, .sound], "la bande replie les panneaux, rien ne s'éteint")
        session.toggleFamily(.filters)
        XCTAssertEqual(session.editPanels, [.trim], "la bande repliée, ils reviennent")
        session.hideEditChrome()
        XCTAssertEqual(session.editPanels, [], "le glissé vers le bas rend tout l'écran à la vidéo")
        XCTAssertFalse(session.editFramesScene)
        session.revealEditChrome()
        XCTAssertEqual(session.activeEditTools, [.crop, .trim, .sound], "les outils reviennent comme on les a laissés")
        session.cancelEditing()
        XCTAssertEqual(session.activeEditTools, [])
        XCTAssertEqual(session.editPanels, [])
        XCTAssertFalse(session.editChromeShown)
    }

    func test_tappingAFoldedTool_closesTheBand_andShowsIt() async {
        let (session, _) = await videoSession()
        session.revealEditChrome()
        session.toggleFamily(.frames)
        session.toggleEditTool(.sound)
        XCTAssertNil(session.openFamily, "le toucher d'un outil replie la bande")
        XCTAssertEqual(session.activeEditTools, [.trim, .sound])
        XCTAssertEqual(session.editPanels, [.trim])
        XCTAssertTrue(session.shownEditTools.contains(.sound), "le son, lui, se montre sur la coupe")
    }

    // MARK: - #10930 — le glissé vertical montre et cache le chrome

    func test_theEditSwipe_upReveals_downHides_andTheCropKeepsTheFinger() {
        let seuil = ComposerEditSwipe.threshold
        XCTAssertEqual(ComposerEditSwipe.mode(translation: CGSize(width: 2, height: -20), zoomed: false, cropping: false),
                       .swipe, "vertical : c'est un glissé de chrome")
        XCTAssertEqual(ComposerEditSwipe.mode(translation: CGSize(width: 30, height: 4), zoomed: false, cropping: false),
                       .reframe, "horizontal : le doigt cadre le média")
        XCTAssertEqual(ComposerEditSwipe.mode(translation: CGSize(width: 0, height: -40), zoomed: true, cropping: false),
                       .reframe, "un média agrandi se déplace")
        XCTAssertEqual(ComposerEditSwipe.mode(translation: CGSize(width: 0, height: -40), zoomed: false, cropping: true),
                       .reframe, "en recadrage, le doigt cadre")
        XCTAssertEqual(ComposerEditSwipe.outcome(translationY: -seuil), .reveal)
        XCTAssertEqual(ComposerEditSwipe.outcome(translationY: seuil), .hide)
        XCTAssertEqual(ComposerEditSwipe.outcome(translationY: seuil / 2), .none, "une hésitation ne décide rien")
    }

    /// **#10930 — un toucher sur la prise montre ou cache ses outils**, comme
    /// dans la visionneuse : en retouche, il visait un objectif qui se repose
    /// et ne faisait RIEN — le geste universel était mort.
    func test_aTapOnTheTake_togglesItsTools() {
        let retouche = ComposerCaptureGestureContext(editing: true)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .scene, gesture: .tap, context: retouche),
                       .toggleEditChrome)
        let photo = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        photo.perform(.toggleEditChrome, item: nil)
        XCTAssertFalse(photo.editChromeShown, "hors retouche, rien à montrer")
        photo.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        photo.perform(.toggleEditChrome, item: nil)
        XCTAssertFalse(photo.editChromeShown, "le toucher rend tout l'écran à la photo")
        photo.perform(.toggleEditChrome, item: nil)
        XCTAssertTrue(photo.editChromeShown, "le suivant rend les outils")
    }

    func test_theSceneTap_isRoutedThroughTheTable_inEditing() throws {
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("ComposerCaptureGesture.action(zone: .scene, gesture: .tap, context: context)"),
                      "le toucher de la nappe consulte la table avant de viser")
    }

    /// **#10930 — les formats se posent sur la scène**, à gauche de la pause et
    /// du muet d'une vidéo, sans couvrir le crochet du coin.
    func test_thePresets_sitOnTheScene_leftOfThePlayback() {
        let cible = MeeshyControlSize.tapTarget
        let scene = CGRect(x: 16, y: 100, width: 370, height: 600)
        let lecture = ComposerEditPlaybackLayout.frame(scene: scene, hasAudio: true, clearsBrackets: true)
        let formats = ComposerEditPresetsLayout.frame(scene: scene, playback: lecture)
        XCTAssertLessThanOrEqual(formats.maxX, lecture.minX - ComposerEditPlaybackLayout.spacing + 0.001)
        XCTAssertEqual(formats.midY, lecture.midY, accuracy: 0.001, "sur la même rangée")
        XCTAssertGreaterThanOrEqual(formats.minX, scene.minX + cible, "le crochet du coin garde sa cible")
        let photo = ComposerEditPresetsLayout.frame(scene: scene, playback: nil)
        XCTAssertLessThanOrEqual(photo.maxX, scene.maxX - cible + 0.001)
        XCTAssertTrue(scene.contains(photo), "posés SUR la photo")
    }

    func test_theOverlayChrome_isWired() throws {
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("session.revealEditChrome()"))
        XCTAssertTrue(chrome.contains("session.hideEditChrome()"))
        XCTAssertTrue(chrome.contains("ComposerCropPresetBar("), "les formats sont posés sur la scène")
        XCTAssertTrue(chrome.contains("ComposerEditPresetsLayout.frame("))
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertFalse(bas.contains("ComposerCropPresetBar("), "plus de rangée de formats sous la scène")
        let montage = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureMount.swift")
        XCTAssertTrue(montage.contains("framed: session.editFramesScene"), "l'image ne se réduit qu'au recadrage")
    }

    // MARK: - (2) Son : spectre, ligne de volume, bouton muet

    /// **#10356 — « Son » ne rétrécit plus la scène.** Le spectre se pose sur
    /// la bande vidéo depuis #10341 ; il ne réserve donc aucune hauteur, et la
    /// scène garde la taille qu'elle a sans lui.
    func test_10356_theSoundTool_reservesNoHeight_whileTheCutIsShown() {
        let avecSon = ComposerEditTools.panels(familyOpen: false, active: [.crop, .trim, .sound])
        let sansSon = ComposerEditTools.panels(familyOpen: false, active: [.crop, .trim])
        XCTAssertEqual(ComposerEditScene.bottomReserve(avecSon), ComposerEditScene.bottomReserve(sansSon))
        let ecran = CGSize(width: 402, height: 874)
        XCTAssertEqual(ComposerEditScene.area(container: ecran, top: 62, bottom: 34, panels: avecSon),
                       ComposerEditScene.area(container: ecran, top: 62, bottom: 34, panels: sansSon),
                       "allumer « Son » ne déplace pas la scène")
    }

    /// **#10356 — lecture et muet, en bas à droite de la SCÈNE**, la pause à
    /// gauche du muet ; la rangée s'écarte du crochet du coin.
    func test_10356_playbackRow_sitsBottomRightOfTheScene_clearOfTheCornerBracket() {
        let cible = MeeshyControlSize.tapTarget
        let scene = CGRect(x: 16, y: 100, width: 300, height: 500)
        let deux = ComposerEditPlaybackLayout.frame(scene: scene, hasAudio: true, clearsBrackets: false)
        XCTAssertEqual(deux.height, cible, "cible de 44 pt")
        XCTAssertEqual(deux.width, cible * 2 + ComposerEditPlaybackLayout.spacing, accuracy: 0.001)
        XCTAssertEqual(deux.maxX, scene.maxX - ComposerEditPlaybackLayout.margin, accuracy: 0.001)
        XCTAssertEqual(deux.maxY, scene.maxY - ComposerEditPlaybackLayout.margin, accuracy: 0.001)
        XCTAssertTrue(scene.contains(deux), "posée SUR la vidéo")
        let crochets = ComposerEditPlaybackLayout.frame(scene: scene, hasAudio: true, clearsBrackets: true)
        XCTAssertLessThanOrEqual(crochets.maxX, scene.maxX - cible, "le crochet du coin garde sa cible")
        let seul = ComposerEditPlaybackLayout.frame(scene: scene, hasAudio: false, clearsBrackets: false)
        XCTAssertEqual(seul.width, cible, accuracy: 0.001, "un clip muet n'a que la lecture")
        XCTAssertNotEqual(ComposerCaptureCopy.playbackLabel(paused: true),
                          ComposerCaptureCopy.playbackLabel(paused: false), "« Lire » et « Pause »")
    }

    func test_10356_theMuteButton_leftTheBand_forTheScene() throws {
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertFalse(bas.contains("ComposerTakeMuteButton("), "plus de bouton muet sur la bande")
        XCTAssertFalse(bas.contains("toggleTakeMute"))
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("ComposerEditPlaybackControls("), "lecture et muet sont montés sur la scène")
        XCTAssertTrue(chrome.contains("onTogglePlayback: { session.toggleEditPlayback() }"))
        XCTAssertTrue(chrome.contains("onToggleMute: { session.toggleTakeMute() }"))
        XCTAssertTrue(chrome.contains("ComposerEditPlaybackLayout.frame(scene: ComposerEditScene.rect(aspect: aspect, in: zone)"),
                      "la rangée se pose sur la scène que les crochets cadrent")
    }

    func test_aSilentClip_offersNoSoundTool() async {
        let (session, _) = await videoSession(hasAudio: false)
        XCTAssertEqual(session.editTools, [.crop, .trim])
        session.revealEditChrome()
        XCTAssertEqual(session.activeEditTools, [.trim], "« Couper » seul, sans spectre (#10930)")
        session.toggleEditTool(.sound)
        XCTAssertEqual(session.activeEditTools, [.trim], "un outil que la prise n'offre pas ne s'active pas")
    }

    func test_takeSound_gainFollowsTheLine_andMuteRemembersTheGain() {
        XCTAssertEqual(ComposerTakeSound.gain(atY: 0, height: 52), 2, "en haut 200 % (#10341)")
        XCTAssertEqual(ComposerTakeSound.gain(atY: 52, height: 52), 0, "en bas le silence")
        XCTAssertEqual(ComposerTakeSound.gain(atY: 26, height: 52), 1, accuracy: 0.0001, "100 % au milieu")
        XCTAssertEqual(ComposerTakeSound.gain(atY: -40, height: 52), 2, "borné")
        XCTAssertEqual(ComposerTakeSound.lineY(gain: 1, height: 52), 26, accuracy: 0.0001, "le son intact au milieu")
        XCTAssertEqual(ComposerTakeSound.lineY(gain: 0.5, height: 52), 39, accuracy: 0.0001)
        XCTAssertEqual(ComposerTakeSound.percent(2), 200)
        var son = ComposerTakeSound(gain: 0.4)
        XCTAssertEqual(son.effectiveGain, 0.4, accuracy: 0.0001)
        son.muted = true
        XCTAssertEqual(son.effectiveGain, 0)
        son.muted = false
        XCTAssertEqual(son.effectiveGain, 0.4, accuracy: 0.0001, "réactiver rend le gain d'avant")
        XCTAssertTrue(ComposerTakeSound().isUntouched)
        XCTAssertEqual(ComposerTakeSound.stepped(1.95, up: true), 2)
    }

    func test_session_appliesGainAndMuteToThePreview_andResetsWithTheEdit() async {
        let (session, lecteur) = await videoSession()
        session.setTakeGain(0.3)
        XCTAssertEqual(lecteur.volumes.last ?? -1, 0.3, accuracy: 0.0001, "l'aperçu entend le gain")
        session.toggleTakeMute()
        XCTAssertEqual(lecteur.volumes.last, 0, "muet : plus rien")
        session.toggleTakeMute()
        XCTAssertEqual(lecteur.volumes.last ?? -1, 0.3, accuracy: 0.0001)
        session.isRenderingLook = true
        session.setTakeGain(1)
        XCTAssertEqual(session.takeSound.gain, 0.3, accuracy: 0.0001, "pendant le rendu, plus rien ne bouge")
        session.isRenderingLook = false
        session.cancelEditing()
        XCTAssertEqual(session.takeSound, ComposerTakeSound(), "la retouche suivante repart du son intact")
    }

    func test_theFinalRender_carriesTheGain_throughTheSingleRecipe() throws {
        let edition = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift")
        XCTAssertTrue(edition.contains("let gain = takeSound.effectiveGain"))
        XCTAssertTrue(edition.contains("declaredSpaceName: espace, audioGain: gain)"),
                      "« Terminé » et ⬇︎ exportent par la même recette, son compris")
        XCTAssertEqual(edition.components(separatedBy: "ComposerLookVideoExporter.export(").count - 1, 1,
                       "une seule recette de rendu vidéo")
        let export = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift")
        XCTAssertTrue(export.contains("|| audioGain != 1"), "un son réglé force le rendu")
        XCTAssertTrue(export.contains("session.audioMix = audioMix"), "le gain part dans le fichier")
        XCTAssertTrue(export.contains("setVolume("))
    }

    // MARK: - Le gain au-delà de 100 % s'entend dans l'aperçu (#10360)

    func test_takeGain_splitsIntoAnAttenuationAndABoost() {
        XCTAssertEqual(ComposerTakeGain.volume(0.5), 0.5, accuracy: 0.0001)
        XCTAssertEqual(ComposerTakeGain.boost(0.5), 1, "sous 100 %, rien à amplifier")
        XCTAssertEqual(ComposerTakeGain.volume(1), 1)
        XCTAssertEqual(ComposerTakeGain.boost(1), 1)
        XCTAssertEqual(ComposerTakeGain.volume(1.5), 1, "au-dessus de 100 %, le volume reste plein")
        XCTAssertEqual(ComposerTakeGain.boost(1.5), 1.5, accuracy: 0.0001, "et le tap amplifie le reste")
        XCTAssertEqual(ComposerTakeGain.boost(2), 2)
        XCTAssertEqual(ComposerTakeGain.boost(9), 2, "borné à 200 %")
        XCTAssertEqual(ComposerTakeGain.volume(0), 0, "muet")
        XCTAssertEqual(ComposerTakeGain.volume(.nan), 1)
        XCTAssertEqual(ComposerTakeGain.boost(.nan), 1)
    }

    func test_amplifiedSample_isLinearBelowTheKnee_andSoftClipsAbove() {
        XCTAssertEqual(ComposerTakeGain.amplified(0.7, boost: 1), 0.7, "sans amplification, intact")
        XCTAssertEqual(ComposerTakeGain.amplified(0.1, boost: 2), 0.2, accuracy: 0.0001, "200 % double le son")
        XCTAssertEqual(ComposerTakeGain.amplified(-0.2, boost: 1.5), -0.3, accuracy: 0.0001)
        XCTAssertEqual(ComposerTakeGain.amplified(0.4, boost: 2), 0.8, accuracy: 0.0001, "le genou lui-même")
        let fort = ComposerTakeGain.amplified(1, boost: 2)
        XCTAssertGreaterThan(fort, ComposerTakeGain.knee, "au-delà du genou, le son monte encore")
        XCTAssertLessThan(fort, 1, "sans jamais atteindre la pleine échelle : pas de craquement")
        XCTAssertEqual(ComposerTakeGain.amplified(-1, boost: 2), -fort, accuracy: 0.0001, "symétrique")
        XCTAssertLessThan(ComposerTakeGain.amplified(0.6, boost: 2), fort, "monotone")
        XCTAssertEqual(ComposerTakeGain.amplified(0.4001, boost: 2), 0.8002, accuracy: 0.001, "continu au genou")
    }

    func test_boostTap_amplifiesEverySampleOfEveryBuffer() {
        var echantillons: [Float] = [0.1, -0.2, 0.3, 1]
        echantillons.withUnsafeMutableBytes { octets in
            var liste = AudioBufferList(mNumberBuffers: 1, mBuffers: AudioBuffer(
                mNumberChannels: 1, mDataByteSize: UInt32(octets.count), mData: octets.baseAddress))
            ComposerTakeBoostTap.amplify(&liste, boost: 2)
        }
        XCTAssertEqual(echantillons[0], 0.2, accuracy: 0.0001)
        XCTAssertEqual(echantillons[1], -0.4, accuracy: 0.0001)
        XCTAssertEqual(echantillons[2], 0.6, accuracy: 0.0001)
        XCTAssertEqual(echantillons[3], ComposerTakeGain.amplified(1, boost: 2), accuracy: 0.0001)
        var intacts: [Float] = [0.5, -0.5]
        intacts.withUnsafeMutableBytes { octets in
            var liste = AudioBufferList(mNumberBuffers: 1, mBuffers: AudioBuffer(
                mNumberChannels: 1, mDataByteSize: UInt32(octets.count), mData: octets.baseAddress))
            ComposerTakeBoostTap.amplify(&liste, boost: 1)
        }
        XCTAssertEqual(intacts, [0.5, -0.5], "à 100 %, le tap ne touche rien")
    }

    func test_boostTap_acceptsOnlyFloat32() {
        var flottant = AudioStreamBasicDescription()
        flottant.mFormatID = kAudioFormatLinearPCM
        flottant.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsNonInterleaved
        flottant.mBitsPerChannel = 32
        XCTAssertTrue(ComposerTakeBoostTap.acceptsFloats(flottant))
        var entier = flottant
        entier.mFormatFlags = kAudioFormatFlagIsSignedInteger
        entier.mBitsPerChannel = 16
        XCTAssertFalse(ComposerTakeBoostTap.acceptsFloats(entier), "un format inattendu passe intact")
    }

    func test_boostTap_mixPutsATapOnEveryTrack_sharingOneLevel() throws {
        let niveau = ComposerTakeBoostLevel()
        XCTAssertNotNil(ComposerTakeBoostTap.make(niveau), "le système crée le tap")
        let mixage = try XCTUnwrap(ComposerTakeBoostTap.audioMix(trackIDs: [1, 2], volume: 1, level: niveau))
        XCTAssertEqual(mixage.inputParameters.map(\.trackID), [1, 2])
        XCTAssertTrue(mixage.inputParameters.allSatisfy { $0.audioTapProcessor != nil })
        XCTAssertNil(ComposerTakeBoostTap.audioMix(trackIDs: [], volume: 1, level: niveau), "sans son, pas de mixage")
        niveau.boost = 1.5
        XCTAssertEqual(niveau.boost, 1.5, accuracy: 0.0001, "le tap lit le niveau qu'on règle, sans se reconstruire")
        niveau.boost = 7
        XCTAssertEqual(niveau.boost, 2)
        XCTAssertEqual(ComposerTakeBoostLevel(boost: 0.3).boost, 1, "un niveau n'atténue jamais")
    }

    func test_session_passesTheGainAbove100_toThePreview() async {
        let (session, lecteur) = await videoSession()
        session.setTakeGain(1.5)
        XCTAssertEqual(lecteur.volumes.last ?? -1, 1.5, accuracy: 0.0001, "l'aperçu reçoit le gain réel, pas 1")
        session.toggleTakeMute()
        XCTAssertEqual(lecteur.volumes.last, 0)
        session.toggleTakeMute()
        XCTAssertEqual(lecteur.volumes.last ?? -1, 1.5, accuracy: 0.0001, "rétabli, le son amplifié revient")
    }

    /// Le niveau vit sur le lecteur, et chaque élément qui joue — boucle
    /// reconstruite, frame sous la règle, filet du tick — porte son tap.
    func test_theLoopPlayer_andTheRender_serveTheSameGainLaw() throws {
        let boucle = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerEditSources.swift")
        XCTAssertTrue(boucle.contains("player.volume = ComposerTakeGain.volume(gain)"))
        XCTAssertTrue(boucle.contains("boostLevel.boost = ComposerTakeGain.boost(gain)"))
        XCTAssertFalse(boucle.contains("max(0, min(1, gain))"), "l'aperçu ne borne plus le gain à 100 %")
        XCTAssertGreaterThanOrEqual(boucle.components(separatedBy: "attachBoost(to: element)").count - 1, 3,
                                    "la boucle reconstruite, la règle et le filet portent chacun le tap")
        XCTAssertTrue(boucle.contains("level: boostLevel"), "un seul niveau, partagé par tous les éléments")
        let export = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift")
        XCTAssertTrue(export.contains("ComposerTakeBoostTap.audioMix("), "le rendu amplifie par le même tap")
        XCTAssertTrue(export.contains("ComposerTakeGain.volume(gain)"))
        XCTAssertFalse(export.contains("max(0, min(1, gain))"))
    }

    // MARK: - (4) La frame exacte sous la règle

    func test_seekChase_oneSeekInFlight_thenOnlyTheLatestTarget() {
        var chasse = ComposerSeekChase()
        XCTAssertEqual(chasse.request(1), 1, "rien ne vole : on cherche tout de suite")
        XCTAssertNil(chasse.request(1.5), "une recherche vole : la cible attend")
        XCTAssertNil(chasse.request(2))
        XCTAssertEqual(chasse.completed(), 2, "seule la DERNIÈRE cible part — l'aperçu finit sous le doigt")
        XCTAssertNil(chasse.completed())
        XCTAssertEqual(chasse.request(3), 3)
        XCTAssertEqual(ComposerSeekChase.tolerance, .zero, "tolérance nulle : la frame EXACTE")
    }

    func test_movingAHandle_scrubsToItsBound_andTheEndOfTheGestureRelaunchesTheLoop() async {
        let (session, lecteur) = await videoSession()
        XCTAssertEqual(ComposerTrimRule.scrubTime(handle: .start, range: 1...4), 1)
        XCTAssertEqual(ComposerTrimRule.scrubTime(handle: .end, range: 1...4), 4)
        session.setTrim(0...6, committed: false)
        session.scrubTrim(to: 2.5)
        session.scrubTrim(to: 99)
        XCTAssertEqual(lecteur.scrubs, [2.5, 6], "borné au clip")
        let avant = lecteur.ranges.count
        session.setTrim(0...6, committed: true)
        XCTAssertEqual(lecteur.ranges.count, avant + 1, "même plage : la boucle suspendue repart quand même")
        XCTAssertFalse(session.trimScrubbing)
    }

    func test_theTrack_scrubsWhileAHandleMoves() throws {
        let piste = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerTrimTrack.swift")
        XCTAssertTrue(piste.contains("session.scrubTrim(to: ComposerTrimRule.scrubTime(handle: poignee, range: nouvelle))"))
        let lecteur = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerEditSources.swift")
        XCTAssertTrue(lecteur.contains("toleranceBefore: ComposerSeekChase.tolerance"))
        XCTAssertTrue(lecteur.contains("chase.request("), "une recherche à la fois")
    }

    // MARK: - Le rail : les outils après les familles, qui rebondissent

    func test_theRail_listsTheTakeTools_andEveryEditControlBounces() throws {
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("editTools: session.editTools"))
        XCTAssertTrue(bas.contains("ForEach(session.editPanels, id: \\.self)"), "chaque outil actif a son panneau")
        XCTAssertTrue(bas.contains("ComposerSoundTrack("), "le spectre en couleur")
        let rail = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(rail.contains(".buttonStyle(ComposerBounceButtonStyle())"))
        let son = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerSoundTrack.swift")
        XCTAssertTrue(son.contains("accessibilityAdjustableAction"), "VoiceOver règle le volume")
        XCTAssertTrue(son.contains(".buttonStyle(ComposerBounceButtonStyle())"), "lecture et muet rebondissent")
    }
}
