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

    /// #13864 (R1) — un document, avec ou sans scène, se compose sur la scène :
    /// il n'existe plus de vue « document sans scène ».
    func test_unDocument_monteToujoursLaSurfaceDeScene() {
        XCTAssertEqual(ComposerMountedView.mounted(surface: .document), .scene)
    }

    /// **L'atelier EST une scène : la question ne se pose pas.**
    func test_lAtelier_resteLAtelier() {
        XCTAssertEqual(ComposerMountedView.mounted(surface: .scene), .atelier)
    }

    /// **Un mood n'a pas de scène**, et la tâche 4.3 lui a justement retiré les
    /// exceptions qu'il ne porte pas. Ce témoin garde qu'on ne lui en rend
    /// aucune.
    func test_leMood_resteLeMood() {
        XCTAssertEqual(ComposerMountedView.mounted(surface: .mood), .mood)
    }

    /// Les trois vues sont atteignables — aucune n'est du code mort.
    func test_lesTroisVues_sontToutesAtteignables() {
        let atteintes = Set([ComposerSurfaceKind.scene, .document, .mood].map { ComposerMountedView.mounted(surface: $0) })
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
    func test_laSourceDeLaScene_estLisibleEtNonVide() throws {
        let scene = try source("ComposerSceneSurface.swift")
        XCTAssertGreaterThan(scene.count, 1_500)
        XCTAssertTrue(scene.contains("struct ComposerSceneSurface"))
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

    /// **La barre haute a quitté la scène** : ✕, la rangée des diapos et ↶ ↷
    /// se posent sur la scène.
    func test_laBarreHaute_aQuitteLaScene() throws {
        XCTAssertFalse(compact(try source("ComposerSceneSurface.swift")).contains("ComposerTopBar("),
                       "la barre haute est revenue au-dessus de la scène")
    }

    /// #13907 — **la barre haute et le rail gauche ont quitté le projet** :
    /// aucun hôte ne les montait plus. Leurs mots (`ComposerRailCopy`) et le
    /// visage du ⋯ (`ComposerTopBarMenuFace`) restent, chez qui les sert.
    func test_laBarreHauteEtLeRailGauche_ontQuitteLeProjet() throws {
        let ios = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let projet = try String(contentsOf: ios.appendingPathComponent("Meeshy.xcodeproj/project.pbxproj"),
                                encoding: .utf8)
        for fichier in ["ComposerTopBar.swift", "ComposerLeadingRail.swift"] {
            XCTAssertFalse(FileManager.default.fileExists(
                atPath: ios.appendingPathComponent("Meeshy/Features/Composer/\(fichier)").path), fichier)
            XCTAssertFalse(projet.contains("/* \(fichier) */"), "\(fichier) reste inscrit au projet")
        }
        let composer = ios.appendingPathComponent("Meeshy/Features/Composer")
        let sources = try FileManager.default.contentsOfDirectory(at: composer, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(sources.count, 50, "le dossier lu n'est pas celui du composer")
        for url in sources {
            let code = compact(AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8)))
            for type in ["structComposerTopBar:", "structComposerTopBarMenu<", "structComposerLeadingRail:",
                         "structComposerSceneToggleEntry:"] {
                XCTAssertFalse(code.contains(type), "\(type) revit dans \(url.lastPathComponent)")
            }
        }
        XCTAssertFalse(ComposerRailCopy.label(.media).isEmpty, "les mots du rail servent encore la colonne")
    }
}
