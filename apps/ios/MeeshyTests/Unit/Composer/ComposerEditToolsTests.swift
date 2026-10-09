import CoreMedia
import XCTest
import UIKit
@testable import Meeshy

/// **Les outils du mode édition d'une prise** (#9754, directive porteur
/// 2026-10-09) : Crop, Trim, Son — chacun affiche ou masque sa surface — et la
/// frame exacte sous la règle.
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

    // MARK: - Ce que chaque prise offre

    func test_offered_photoCrops_videoCropsAndTrims_andItsSoundOnlyWithAudio() {
        XCTAssertEqual(ComposerEditTools.offered(isVideo: false, hasAudio: false), [.crop])
        XCTAssertEqual(ComposerEditTools.offered(isVideo: true, hasAudio: false), [.crop, .trim])
        XCTAssertEqual(ComposerEditTools.offered(isVideo: true, hasAudio: true), [.crop, .trim, .sound])
    }

    func test_toggled_opensThenHides_andSwitchesBetweenTools() {
        XCTAssertEqual(ComposerEditTools.toggled(nil, tapping: .trim), .trim)
        XCTAssertNil(ComposerEditTools.toggled(.trim, tapping: .trim), "retoucher l'outil le masque")
        XCTAssertEqual(ComposerEditTools.toggled(.trim, tapping: .sound), .sound)
    }

    // MARK: - (1) Crop fait paraître et disparaître les équerres

    func test_brackets_existOnlyWhileCropIsOpen() {
        XCTAssertTrue(ComposerEditTools.showsBrackets(tool: .crop, familyOpen: false))
        XCTAssertFalse(ComposerEditTools.showsBrackets(tool: nil, familyOpen: false))
        XCTAssertFalse(ComposerEditTools.showsBrackets(tool: .trim, familyOpen: false))
        XCTAssertFalse(ComposerEditTools.showsBrackets(tool: .crop, familyOpen: true))
    }

    func test_theBrackets_areMountedBehindTheCropTool() throws {
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("session.showsCropBrackets, let aspect = session.editAspect"))
    }

    // MARK: - (3) Trim affiche ou masque la barre de coupe

    func test_trim_showsAndHidesTheCuttingBar_andAPhotoHasNone() async {
        let (session, _) = await videoSession()
        XCTAssertEqual(session.editPanel, .none, "masquée à l'entrée")
        session.toggleEditTool(.trim)
        XCTAssertEqual(session.editPanel, .trim)
        session.toggleEditTool(.trim)
        XCTAssertEqual(session.editPanel, .none)

        let photo = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        photo.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        photo.toggleEditTool(.trim)
        XCTAssertNil(photo.editTool, "une photo ne se coupe pas")
        XCTAssertEqual(photo.editTools, [.crop])
    }

    // MARK: - (2) Son : spectre, ligne de volume, bouton muet

    func test_sound_opensTheSpectrum_withTheMuteSwitchRightOfTheTrack() async {
        let (session, _) = await videoSession()
        session.toggleEditTool(.sound)
        XCTAssertEqual(session.editPanel, .sound)
        XCTAssertTrue(ComposerEditTools.offersMuteSwitch(panel: .sound, hasAudio: true))
        XCTAssertTrue(ComposerEditTools.offersMuteSwitch(panel: .trim, hasAudio: true),
                      "le bouton muet se pose à DROITE de la barre de trim")
        XCTAssertFalse(ComposerEditTools.offersMuteSwitch(panel: .trim, hasAudio: false), "un clip muet n'en a pas")
        XCTAssertFalse(ComposerEditTools.offersMuteSwitch(panel: .presets, hasAudio: true))
    }

    func test_aSilentClip_offersNoSoundTool() async {
        let (session, _) = await videoSession(hasAudio: false)
        XCTAssertEqual(session.editTools, [.crop, .trim])
        session.toggleEditTool(.sound)
        XCTAssertNil(session.editTool)
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
        XCTAssertTrue(bas.contains("ComposerTakeMuteButton("), "le bouton muet")
        XCTAssertTrue(bas.contains("ComposerSoundTrack("), "le spectre en couleur")
        let rail = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(rail.contains(".buttonStyle(ComposerBounceButtonStyle())"))
        let son = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerSoundTrack.swift")
        XCTAssertTrue(son.contains("accessibilityAdjustableAction"), "VoiceOver règle le volume")
        XCTAssertTrue(son.contains(".buttonStyle(ComposerBounceButtonStyle())"))
    }
}
