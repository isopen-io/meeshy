import XCTest
@testable import Meeshy

/// **L'appui long sur la SCÈNE ouvre ET filme ; le toucher ouvre ET photographie**
/// (#8653, directive porteur 2026-09-29 : « par tap simple ça ouvre et prend
/// la photo, longpress ouvre et lance la vidéo ! »).
///
/// Le lot du 2026-09-04 faisait choisir la LEVÉE de l'appui long entre photo et
/// vidéo, au seuil de l'obturateur. La directive sépare les deux intentions :
/// chaque geste n'en porte plus qu'une, et `ComposerSceneQuickCapture` en est
/// la loi. Le geste vit dans UIKit : ce qui est décidable, et ce que ces
/// témoins tiennent, est que les sites appellent la loi et rien d'autre.
@MainActor
final class ComposerSceneShutterWiringTests: XCTestCase {

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **La levée CLÔT la prise, ou n'en prend aucune.** Plus de photo au
    /// relâchement : un doigt parti avant que la caméra soit prête ne prend
    /// RIEN — la photo a son propre geste, le toucher.
    func test_laLevéeSurLaScène_clotLaPrise_sansJamaisPrendreDePhoto() throws {
        let hote = try source("MeeshyComposerHost+Viewfinder.swift")
        XCTAssertTrue(hote.contains("funchandleSceneCaptureLongPressEnded(){sceneCapture.endHold()}"),
                      "la levée de la scène est celle de la machine partagée (#9134)")
        let code = try source("ComposerCaptureSession.swift")
        guard let début = code.range(of: "funcendHold(){"),
              let fin = code.range(of: "funcreleaseStaleHold()", range: début.upperBound..<code.endIndex)
        else { return XCTFail("la levée a changé de forme") }
        let corps = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("ComposerCaptureHold.release("),
                      "la levée se lit sur le cadenas (#8671) : tenu, verrouillé ou annulé")
        XCTAssertTrue(corps.contains("case.closeTake:"))
        XCTAssertTrue(corps.contains("closeTake()"))
        XCTAssertFalse(corps.contains("takePhoto()"),
                       "relâcher un appui long ne prend jamais de photo")
    }

    /// **Le verrou par glissement vient de la même loi, avec le même sens.**
    /// Une comparaison écrite ici — `> 64`, ou pire `abs(x) > 64` — perdrait le
    /// sens du geste : glisser à GAUCHE ramène vers les portes du rail, ce qui
    /// veut dire autre chose.
    func test_leVerrou_vientDeLaLoi_etGardeSonSens() throws {
        let hote = try source("MeeshyComposerHost+Viewfinder.swift")
        XCTAssertTrue(hote.contains("funchandleSceneCaptureLongPressChanged(_translation:CGPoint){sceneCapture.holdChanged(translation)}"))
        let code = try source("ComposerCaptureSession.swift")
        guard let début = code.range(of: "funcholdChanged(_translation:CGPoint){"),
              let fin = code.range(of: "funcendHold(){", range: début.upperBound..<code.endIndex)
        else { return XCTFail("le glissement a changé de forme") }
        let corps = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("ComposerCaptureHold.phase(translation:translation"),
                      "le cadenas (#8671) lit la loi, qui garde le seuil et le sens de ComposerShutterGesture")
        XCTAssertTrue(corps.contains("ComposerShutterGesture.lockProgress(translationX:translation.x)"))
        XCTAssertTrue(corps.contains("lockTake()"))
        XCTAssertTrue(corps.contains("dragZoom(translationY:translation.y)"),
                      "le glissé vertical zoome pendant la prise (#8671)")
    }

    /// **L'appui long FILME dès que la session peut écrire** — sans seuil à
    /// franchir en tenant. L'attente est celle de la caméra, pas du doigt.
    func test_lAppuiLong_filmeDesQueLaCameraEstPrete() throws {
        let hote = try source("MeeshyComposerHost+Viewfinder.swift")
        guard let geste = hote.range(of: "funchandleSceneCaptureLongPress(){"),
              let finGeste = hote.range(of: "funchandleSceneQuickTap()", range: geste.upperBound..<hote.endIndex)
        else { return XCTFail("le geste a changé de forme") }
        let appel = String(hote[geste.upperBound..<finGeste.lowerBound])
        XCTAssertTrue(appel.contains("armSceneCamera()sceneCapture.beginHold()"),
                      "le geste arme PUIS tient — la tenue est celle de la machine (#9134)")
        XCTAssertFalse(appel.contains("ComposerShutterGesture.holdToFilm"),
                       "le seuil de l'obturateur n'appartient plus au geste de la scène")
        let code = try source("ComposerCaptureSession.swift")
        guard let début = code.range(of: "funcbeginHold(){"),
              let fin = code.range(of: "funcholdChanged(", range: début.upperBound..<code.endIndex)
        else { return XCTFail("la tenue a changé de forme") }
        let corps = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("holdTask=Task"))
        XCTAssertTrue(corps.contains("camera.waitUntilCaptureReady("))
        XCTAssertTrue(corps.contains("startFilming()"))
    }

    /// **Le toucher d'une scène vide ARME le viseur, sans rien prendre**
    /// (#8711), et le tap du fond le lui demande d'abord.
    func test_lePremierToucher_armeSansPhotographier_parLaLoi() throws {
        let code = try source("MeeshyComposerHost+Viewfinder.swift")
        guard let début = code.range(of: "funchandleSceneQuickTap()->Bool{"),
              let fin = code.range(of: "funchandleArmedSceneTap()", range: début.upperBound..<code.endIndex)
        else { return XCTFail("le toucher a changé de forme") }
        let corps = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("ComposerSceneQuickCapture.offers("))
        XCTAssertTrue(corps.contains("ComposerSceneQuickCapture.tap(format:selectedFormat)"))
        XCTAssertTrue(corps.contains("armSceneCamera()"))
        XCTAssertFalse(corps.contains("takeScenePhoto()"), "le premier toucher ne prend plus la photo")
        let hote = try source("MeeshyComposerHost.swift")
        XCTAssertTrue(hote.contains("funchandleSceneBackgroundTap(){ifhandleSceneQuickTap(){return}"))
    }

    /// **Le second toucher, n'importe où sur la scène, prend la photo** (#8711)
    /// — la nappe du viseur le reçoit, et la loi décide.
    func test_leSecondToucher_prendLaPhoto_parLaLoi() throws {
        let code = try source("MeeshyComposerHost+Viewfinder.swift")
        guard let début = code.range(of: "funchandleArmedSceneTap(){"),
              let fin = code.range(of: "funchandleArmedSceneHold(){", range: début.upperBound..<code.endIndex)
        else { return XCTFail("le second toucher a disparu") }
        let corps = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("ComposerSceneQuickCapture.armedTap("))
        XCTAssertTrue(corps.contains("sceneCapture.photographWhenReady()"))
        let machine = try source("ComposerCaptureSession.swift")
        guard let photo = machine.range(of: "funcphotographWhenReady(){"),
              let finPhoto = machine.range(of: "funcbeginHold(){", range: photo.upperBound..<machine.endIndex)
        else { return XCTFail("la photo au toucher a changé de forme") }
        XCTAssertTrue(String(machine[photo.upperBound..<finPhoto.lowerBound]).contains("takePhoto()"))
        // Depuis #8846 le toucher passe APRÈS l'appui long (qui filme), sur
        // la même nappe — celle du chrome PARTAGÉ (#9134).
        XCTAssertTrue(code.contains("onTap:{handleArmedSceneTap()}"),
                      "la nappe du viseur ne transmet pas le second toucher")
        let chrome = try source("ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("holdGesture.exclusively(before:TapGesture().onEnded{onTap()})"))
    }

    /// **La levée sans début ne fait RIEN.** Le canvas émet sa fin même quand
    /// l'hôte a refusé l'armement : ses trois gardes ne connaissent pas la
    /// clause « scène vide », qui vit chez le meuble. Sans ce témoin de début,
    /// une levée poserait une photo que personne n'a armée — et sur une scène
    /// qui a déjà un fond.
    func test_uneLevéeSansDébut_neDéclencheRien() throws {
        let code = try source("ComposerCaptureSession.swift")
        guard let début = code.range(of: "funcendHold(){"),
              let fin = code.range(of: "switchComposerCaptureHold.release", range: début.upperBound..<code.endIndex)
        else { return XCTFail("la levée a changé de forme") }
        let avant = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertTrue(avant.contains("guardholdStartedAt!=nilelse{"))
        XCTAssertFalse(avant.contains("takePhoto()"))
    }

    /// **Le meuble câble les DEUX bouts du geste.** Un début sans fin laisse le
    /// viseur armé pour toujours ; une fin sans début ne peut rien décider.
    func test_leMeuble_câbleLesDeuxBoutsDuGeste() throws {
        let code = try source("MeeshyComposerHost+Surfaces.swift")
        XCTAssertTrue(code.contains("onBackgroundLongPressChanged:{handleSceneCaptureLongPressChanged($0)}"))
        XCTAssertTrue(code.contains("onBackgroundLongPressEnded:{handleSceneCaptureLongPressEnded()}"))
    }
}
