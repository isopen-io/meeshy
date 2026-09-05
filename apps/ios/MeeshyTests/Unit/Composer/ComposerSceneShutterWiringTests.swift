import XCTest
@testable import Meeshy

/// **L'appui long sur la SCÈNE est un obturateur** (directive porteur
/// 2026-09-04) :
///
/// > « il faut que le simple longpress déclenche la photo et non pas juste
/// > l'objectif, si on a un vrai longpress ça déclenche la capture vidéo avec
/// > le chrono »
///
/// Le geste vit dans UIKit et sa levée dans un `@State` : rien de tout cela ne
/// s'éprouve sans appareil. Ce qui est décidable, et ce que ces témoins
/// tiennent, est que la LOI employée soit celle de la barre — un second seuil
/// écrit pour la scène divergerait au premier réglage, et le porteur a déjà
/// fait déplacer celui-ci une fois (0,35 s → 0,8 s).
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

    /// **Une seule loi pour les deux obturateurs.** La barre et la scène
    /// appellent `ComposerShutterGesture.outcome` ; aucune ne compare une durée
    /// à un littéral.
    func test_laLevéeSurLaScène_appliqueLaLoiDeLObturateur() throws {
        let code = try source("MeeshyComposerHost+Viewfinder.swift")
        guard let début = code.range(of: "funchandleSceneCaptureLongPressEnded(){"),
              let fin = code.range(of: "case.keepFilming:", range: début.upperBound..<code.endIndex)
        else { return XCTFail("la levée a changé de forme") }
        let corps = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("ComposerShutterGesture.outcome("))
        XCTAssertTrue(corps.contains("case.photo:takeScenePhoto()"))
        XCTAssertTrue(corps.contains("case.closeTake:closeSceneTake()"))
        XCTAssertFalse(corps.contains("ComposerShutterGesture.holdToFilm"),
                       "la durée se compare DANS la loi, jamais chez son appelant")
    }

    /// **Le verrou par glissement vient de la même loi, avec le même sens.**
    /// Une comparaison écrite ici — `> 64`, ou pire `abs(x) > 64` — perdrait le
    /// sens du geste : glisser à GAUCHE ramène vers les portes du rail, ce qui
    /// veut dire autre chose.
    func test_leVerrou_vientDeLaLoi_etGardeSonSens() throws {
        let code = try source("MeeshyComposerHost+Viewfinder.swift")
        guard let début = code.range(of: "funchandleSceneCaptureLongPressChanged(_translation:CGPoint){"),
              let fin = code.range(of: "funchandleSceneCaptureLongPressEnded", range: début.upperBound..<code.endIndex)
        else { return XCTFail("le glissement a changé de forme") }
        let corps = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("ComposerShutterGesture.locks(translationX:translation.x)"))
        XCTAssertTrue(corps.contains("lockSceneTake()"))
    }

    /// **La bascule en vidéo vient d'une HORLOGE, pas du geste.**
    ///
    /// Un `UILongPressGestureRecognizer` n'émet `.changed` que sur un
    /// MOUVEMENT. Le cas nominal — un doigt immobile pendant qu'on cadre — ne
    /// réveille personne : sans minuterie, la vidéo ne partirait jamais tant
    /// qu'on ne bouge pas, et le défaut passerait pour un seuil mal réglé.
    func test_laBasculeEnVidéo_estPortéeParUneMinuterie() throws {
        let code = try source("MeeshyComposerHost+Viewfinder.swift")
        guard let début = code.range(of: "funchandleSceneCaptureLongPress(){"),
              let fin = code.range(of: "funchandleSceneCaptureLongPressChanged", range: début.upperBound..<code.endIndex)
        else { return XCTFail("le geste a changé de forme") }
        let corps = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("sceneHoldTask=Task"))
        XCTAssertTrue(corps.contains("ComposerShutterGesture.holdToFilm"),
                      "le délai vient de la loi, pas d'un littéral")
        XCTAssertTrue(corps.contains("startSceneFilming()"))
    }

    /// **La levée sans début ne fait RIEN.** Le canvas émet sa fin même quand
    /// l'hôte a refusé l'armement : ses trois gardes ne connaissent pas la
    /// clause « scène vide », qui vit chez le meuble. Sans ce témoin de début,
    /// une levée poserait une photo que personne n'a armée — et sur une scène
    /// qui a déjà un fond.
    func test_uneLevéeSansDébut_neDéclencheRien() throws {
        let code = try source("MeeshyComposerHost+Viewfinder.swift")
        guard let début = code.range(of: "funchandleSceneCaptureLongPressEnded(){"),
              let fin = code.range(of: "switchComposerShutterGesture.outcome", range: début.upperBound..<code.endIndex)
        else { return XCTFail("la levée a changé de forme") }
        XCTAssertTrue(String(code[début.upperBound..<fin.lowerBound])
            .contains("guardletdebut=sceneHoldStartedAt"))
    }

    /// **Le meuble câble les DEUX bouts du geste.** Un début sans fin laisse le
    /// viseur armé pour toujours ; une fin sans début ne peut rien décider.
    func test_leMeuble_câbleLesDeuxBoutsDuGeste() throws {
        let code = try source("MeeshyComposerHost+Surfaces.swift")
        XCTAssertTrue(code.contains("onBackgroundLongPressChanged:{handleSceneCaptureLongPressChanged($0)}"))
        XCTAssertTrue(code.contains("onBackgroundLongPressEnded:{handleSceneCaptureLongPressEnded()}"))
    }
}
