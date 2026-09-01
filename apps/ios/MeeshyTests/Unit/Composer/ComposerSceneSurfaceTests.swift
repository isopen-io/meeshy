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
        XCTAssertEqual(ComposerMountedView.mounted(surface: .document, hasScene: true, editsScene: true), .scene)
    }

    func test_unDocumentSansScene_resteLeDocument() {
        XCTAssertEqual(ComposerMountedView.mounted(surface: .document, hasScene: false, editsScene: false), .document)
    }

    /// **L'atelier EST une scène : la question ne se pose pas.** Lire `hasScene`
    /// ici l'aurait fait dépendre d'un état qui ne le concerne pas.
    func test_lAtelier_neDependPasDeHasScene() {
        XCTAssertEqual(ComposerMountedView.mounted(surface: .scene, hasScene: false, editsScene: false), .atelier)
        XCTAssertEqual(ComposerMountedView.mounted(surface: .scene, hasScene: true, editsScene: false), .atelier)
    }

    /// **Un mood n'a pas de scène**, et la tâche 4.3 lui a justement retiré les
    /// exceptions qu'il ne porte pas. Ce témoin garde qu'on ne lui en rend
    /// aucune.
    func test_leMood_neDependPasDeHasScene() {
        XCTAssertEqual(ComposerMountedView.mounted(surface: .mood, hasScene: false, editsScene: false), .mood)
        XCTAssertEqual(ComposerMountedView.mounted(surface: .mood, hasScene: true, editsScene: false), .mood)
    }

    /// Les quatre vues sont atteignables — aucune n'est du code mort.
    func test_lesQuatreVues_sontToutesAtteignables() {
        let atteintes = Set([
            ComposerMountedView.mounted(surface: .scene, hasScene: false, editsScene: false),
            ComposerMountedView.mounted(surface: .document, hasScene: true, editsScene: true),
            ComposerMountedView.mounted(surface: .document, hasScene: false, editsScene: false),
            ComposerMountedView.mounted(surface: .mood, hasScene: false, editsScene: false)
        ])
        XCTAssertEqual(atteintes, Set(ComposerMountedView.allCases))
    }

    // MARK: - Les sources

    private func source(_ fichier: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(fichier)")
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

    /// La surface de scène, elle, les porte — sinon les deux vues de rail
    /// n'auraient toujours aucun site de montage.
    func test_laSurfaceDeScene_monteLesDeuxRails() throws {
        let s = compact(try source("ComposerSceneSurface.swift"))
        XCTAssertTrue(s.contains("ComposerLeadingRail("))
        XCTAssertTrue(s.contains("ComposerTrailingRail("))
    }

    /// L'encastrement se lit de la RÈGLE, et `railsShown: true` DIT ce que
    /// cette surface est — une scène a ses rails.
    func test_laSurfaceDeScene_encastreParLaRegle() throws {
        XCTAssertTrue(compact(try source("ComposerSceneSurface.swift"))
            .contains("ComposerRailGeometry.sceneInset(railsShown:true)"))
    }

    /// **La barre haute est PARTAGÉE, pas recopiée.** Deux copies auraient
    /// divergé au premier ajustement — c'est la raison même de l'extraire
    /// avant de séparer les surfaces.
    func test_lesDeuxSurfaces_partagentLaBarreHaute() throws {
        for fichier in ["ComposerSceneSurface.swift", "ComposerDocumentSurface.swift"] {
            XCTAssertTrue(compact(try source(fichier)).contains("ComposerTopBar("),
                          "\(fichier) doit CONSOMMER la barre, jamais la redessiner.")
        }
    }
}
