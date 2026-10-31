import XCTest
@testable import Meeshy
import MeeshyUI

/// #4070 — la scène incrustée devient une SURFACE, pas un cas du document.
///
/// La règle est celle de la tâche **4.3** de la planche :
///
///   > « `.mood` devient une SURFACE, pas un cas du document. […] une humeur
///   > n'est pas un post court, et la traiter comme tel obligeait chaque règle
///   > du document à porter une exception. »
///
/// Ces témoins gardent les deux moitiés : que l'aiguillage DIT la bonne vue, et
/// que le document ne porte PLUS l'exception.
final class ComposerSceneSurfaceTests: XCTestCase {

    // MARK: - L'aiguillage

    /// Le point de la règle : `hasScene` n'est lu que pour `.document`.
    func test_unDocumentAvecScene_monteLaSurfaceDeScene() {
        XCTAssertEqual(ComposerMountedView.mounted(surface: .document, hasScene: true), .scene)
    }

    func test_unDocumentSansScene_resteLeDocument() {
        XCTAssertEqual(ComposerMountedView.mounted(surface: .document, hasScene: false), .document)
    }

    /// **L'atelier EST une scène : la question ne se pose pas.** Lire `hasScene`
    /// ici l'aurait fait dépendre d'un état qui ne le concerne pas.
    func test_lAtelier_neDependPasDeHasScene() {
        XCTAssertEqual(ComposerMountedView.mounted(surface: .scene, hasScene: false), .atelier)
        XCTAssertEqual(ComposerMountedView.mounted(surface: .scene, hasScene: true), .atelier)
    }

    /// **Un mood n'a pas de scène**, et la tâche 4.3 lui a justement retiré les
    /// exceptions qu'il ne porte pas. Ce témoin garde qu'on ne lui en rend
    /// aucune.
    func test_leMood_neDependPasDeHasScene() {
        XCTAssertEqual(ComposerMountedView.mounted(surface: .mood, hasScene: false), .mood)
        XCTAssertEqual(ComposerMountedView.mounted(surface: .mood, hasScene: true), .mood)
    }

    /// Les quatre vues sont atteignables — aucune n'est du code mort.
    func test_lesQuatreVues_sontToutesAtteignables() {
        let atteintes = Set([
            ComposerMountedView.mounted(surface: .scene, hasScene: false),
            ComposerMountedView.mounted(surface: .document, hasScene: true),
            ComposerMountedView.mounted(surface: .document, hasScene: false),
            ComposerMountedView.mounted(surface: .mood, hasScene: false)
        ])
        XCTAssertEqual(atteintes, Set(ComposerMountedView.allCases))
    }

    // MARK: - Les sources

    private func source(_ fichier: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/\(fichier)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible.** Sans lui, les gardes négatives qui suivent seraient
    /// vertes par OMISSION le jour où un chemin de fichier change — le mode
    /// d'échec le plus discret de ce dépôt.
    func test_lesDeuxSources_sontLisiblesEtNonVides() throws {
        let scene = try source("ComposerSceneSurface.swift")
        let document = try source("ComposerDocumentSurface.swift")
        XCTAssertGreaterThan(scene.count, 1_500)
        XCTAssertGreaterThan(document.count, 5_000)
        XCTAssertTrue(scene.contains("struct ComposerSceneSurface"))
        XCTAssertTrue(document.contains("struct ComposerDocumentSurface"))
    }

    /// **LA garde de #4070.** Elle rougit si une entrée de scène revient dans le
    /// document — le geste exact que cette issue existe pour rendre impossible.
    ///
    /// Ce n'est pas une préférence de rangement : chaque entrée réintroduite
    /// oblige la règle du document à porter une exception, et c'est ce que la
    /// tâche 4.3 a fermé.
    func test_leDocument_neDeclarePlusAucuneEntreeDeRail() throws {
        let s = compact(try source("ComposerDocumentSurface.swift"))
        for interdit in ["varshowsRails", "varrailDoors", "varonRailDoor",
                         "vartrailingRailActions", "varonTrailingRailAction",
                         "ComposerLeadingRail(", "ComposerTrailingRail("] {
            XCTAssertFalse(s.contains(interdit),
                           "`\(interdit)` est revenu dans le document : la règle 4.3 est rouverte.")
        }
    }

    /// **Le témoin INVERSE de « la surface de scène monte les deux rails »**
    /// (#13839, directive porteur du 2026-10-30). Le rail gauche à glyphes est
    /// parti : le repos se pose SUR la scène par `ComposerSceneOverlayChrome`.
    /// La colonne droite reste pour un outil ouvert ou un objet touché, le temps
    /// que la barre d'actions de L5 la remplace.
    func test_laSurfaceDeScene_poseLeReposSurLaScene_sansRailGauche() throws {
        let s = compact(try source("ComposerSceneSurface.swift"))
        XCTAssertFalse(s.contains("ComposerLeadingRail("), "le rail gauche à glyphes est revenu sur la scène")
        XCTAssertTrue(s.contains("ComposerSceneOverlayChrome("))
        XCTAssertTrue(s.contains("ComposerTrailingRail("))
    }

    /// **Le témoin INVERSE de l'encastrement** : plus de carte ni de couloir.
    /// La scène est le plus grand 9:16 de la zone, et un panneau du bas la
    /// RÉDUIT par une échelle — jamais par une marge qui relancerait la mise en
    /// page du canvas.
    func test_laSurfaceDeScene_neReserveAucunCouloir_etSeReduitParUneEchelle() throws {
        let code = compact(try source("ComposerSceneSurface.swift"))
        XCTAssertTrue(code.contains("ComposerSceneFit.frame(in:"))
        XCTAssertTrue(code.contains("ComposerSceneFit.lift(scene:"))
        XCTAssertTrue(code.contains(".scaleEffect(lift.scale"))
        XCTAssertFalse(code.contains(".padding(.bottom,sceneLiftInset)"),
                       "une marge basse relance la mise en page du canvas à chaque image du geste")
        XCTAssertFalse(code.contains("ComposerTopBar.height"), "la scène ne réserve plus la barre haute")
    }

    /// **La barre haute reste au document, plus à la scène** : ✕, la rangée
    /// des diapos et ↶ ↷ se posent sur la scène.
    func test_laBarreHaute_resteAuDocument_quitteLaScene() throws {
        XCTAssertTrue(compact(try source("ComposerDocumentSurface.swift")).contains("ComposerTopBar("))
        XCTAssertFalse(compact(try source("ComposerSceneSurface.swift")).contains("ComposerTopBar("),
                       "la barre haute est revenue au-dessus de la scène")
    }
}
