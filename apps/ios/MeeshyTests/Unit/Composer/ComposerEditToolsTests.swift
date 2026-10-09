import CoreMedia
import XCTest
import UIKit
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

    func test_initial_everyOfferedToolIsActiveOnEntry() {
        XCTAssertEqual(ComposerEditTools.initial(.photo), [.crop], "les équerres blanches d'office sur une photo")
        XCTAssertEqual(ComposerEditTools.initial(.video(hasAudio: true)), [.crop, .trim, .sound],
                       "Couper, Son et Crop ENSEMBLE à l'entrée d'une vidéo")
        XCTAssertEqual(ComposerEditTools.initial(.audio), [.trim, .sound])
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
                       [.presets, .sound, .trim], "la coupe se pose au plus près des outils")
        XCTAssertEqual(ComposerEditTools.panels(familyOpen: false, active: [.crop]), [.presets])
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

    func test_aPhoto_opensWithItsWhiteBrackets_andHidesThemWithOneTouch() {
        let photo = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        photo.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        XCTAssertTrue(photo.showsCropBrackets, "après une photo, les équerres blanches sont là sans rien toucher")
        XCTAssertEqual(photo.editPanels, [.presets])
        photo.toggleEditTool(.crop)
        XCTAssertFalse(photo.showsCropBrackets)
        XCTAssertEqual(photo.editPanels, [])
        photo.toggleEditTool(.trim)
        XCTAssertEqual(photo.activeEditTools, [], "une photo ne se coupe pas")
        XCTAssertEqual(photo.editTools, [.crop])
    }

    // MARK: - (3) Les outils d'une vidéo, ensemble et chacun pour soi

    func test_aVideo_opensWithCutSoundAndCropTogether_andEachLeavesAlone() async {
        let (session, _) = await videoSession()
        XCTAssertEqual(session.activeEditTools, [.crop, .trim, .sound])
        XCTAssertEqual(session.editPanels, [.presets, .sound, .trim])
        XCTAssertTrue(session.showsCropBrackets)
        session.toggleEditTool(.trim)
        XCTAssertEqual(session.editPanels, [.presets, .sound], "Couper se retire seul")
        XCTAssertTrue(session.showsCropBrackets, "les équerres restent")
        session.toggleEditTool(.trim)
        XCTAssertEqual(session.editPanels, [.presets, .sound, .trim])
        session.toggleFamily(.filters)
        XCTAssertEqual(session.editPanels, [.band])
        XCTAssertEqual(session.activeEditTools, [.crop, .trim, .sound], "la bande replie les panneaux, rien ne s'éteint")
        session.toggleFamily(.filters)
        XCTAssertEqual(session.editPanels, [.presets, .sound, .trim], "la bande repliée, ils reviennent")
        session.cancelEditing()
        XCTAssertEqual(session.activeEditTools, [])
        XCTAssertEqual(session.editPanels, [])
    }

    func test_tappingAFoldedTool_closesTheBand_andShowsIt() async {
        let (session, _) = await videoSession()
        session.toggleFamily(.frames)
        session.toggleEditTool(.sound)
        XCTAssertNil(session.openFamily, "le toucher d'un outil replie la bande")
        XCTAssertEqual(session.activeEditTools, [.crop, .trim, .sound])
        XCTAssertEqual(session.editPanels, [.presets, .sound, .trim])
    }

    // MARK: - (2) Son : spectre, ligne de volume, bouton muet

    func test_theMuteSwitch_sitsRightOfOneTrack_theSpectrumFirst() {
        XCTAssertEqual(ComposerEditTools.muteHost(panels: [.presets, .sound, .trim], hasAudio: true), .sound)
        XCTAssertEqual(ComposerEditTools.muteHost(panels: [.trim], hasAudio: true), .trim,
                       "le bouton muet se pose à DROITE de la barre de trim quand le spectre est retiré")
        XCTAssertNil(ComposerEditTools.muteHost(panels: [.trim], hasAudio: false), "un clip muet n'en a pas")
        XCTAssertNil(ComposerEditTools.muteHost(panels: [.presets], hasAudio: true))
        XCTAssertTrue(ComposerEditTools.reservesMuteColumn(.trim, panels: [.sound, .trim], hasAudio: true),
                      "la coupe sous le spectre garde la place du bouton : les deux pistes du temps s'alignent")
        XCTAssertFalse(ComposerEditTools.reservesMuteColumn(.sound, panels: [.sound, .trim], hasAudio: true))
        XCTAssertFalse(ComposerEditTools.reservesMuteColumn(.trim, panels: [.trim], hasAudio: true))
    }

    func test_aSilentClip_offersNoSoundTool() async {
        let (session, _) = await videoSession(hasAudio: false)
        XCTAssertEqual(session.editTools, [.crop, .trim])
        XCTAssertEqual(session.activeEditTools, [.crop, .trim])
        session.toggleEditTool(.sound)
        XCTAssertEqual(session.activeEditTools, [.crop, .trim], "un outil que la prise n'offre pas ne s'active pas")
    }

    func test_takeSound_gainFollowsTheLine_andMuteRemembersTheGain() {
        XCTAssertEqual(ComposerTakeSound.gain(atY: 0, height: 52), 1, "en haut le plein")
        XCTAssertEqual(ComposerTakeSound.gain(atY: 52, height: 52), 0, "en bas le silence")
        XCTAssertEqual(ComposerTakeSound.gain(atY: 26, height: 52), 0.5, accuracy: 0.0001)
        XCTAssertEqual(ComposerTakeSound.gain(atY: -40, height: 52), 1, "borné")
        XCTAssertEqual(ComposerTakeSound.lineY(gain: 0.25, height: 52), 39, accuracy: 0.0001)
        var son = ComposerTakeSound(gain: 0.4)
        XCTAssertEqual(son.effectiveGain, 0.4, accuracy: 0.0001)
        son.muted = true
        XCTAssertEqual(son.effectiveGain, 0)
        son.muted = false
        XCTAssertEqual(son.effectiveGain, 0.4, accuracy: 0.0001, "réactiver rend le gain d'avant")
        XCTAssertTrue(ComposerTakeSound().isUntouched)
        XCTAssertEqual(ComposerTakeSound.stepped(0.95, up: true), 1)
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
        XCTAssertTrue(bas.contains("ComposerTakeMuteButton("), "le bouton muet")
        XCTAssertTrue(bas.contains("ComposerSoundTrack("), "le spectre en couleur")
        let rail = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(rail.contains(".buttonStyle(ComposerBounceButtonStyle())"))
        let son = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerSoundTrack.swift")
        XCTAssertTrue(son.contains("accessibilityAdjustableAction"), "VoiceOver règle le volume")
        XCTAssertTrue(son.contains(".buttonStyle(ComposerBounceButtonStyle())"))
    }
}
