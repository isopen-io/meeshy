import XCTest
@testable import Meeshy

/// **Les rails flottent SUR la scène, depuis le calque du chrome** (#8370,
/// directive porteur 2026-09-27 — elle supplante #4633).
///
/// #4633 (2026-08-31) posait les rails dans les COULOIRS du plateau, hors du
/// canvas, et ces témoins mesuraient l'ordre overlay / encastrement qui les y
/// tenait. La maquette plein écran retourne la géographie : la scène prend le
/// viewport, et TOUT le chrome flotte dessus. Ce qui reste vrai de #4633 est ce
/// que ces témoins gardent désormais :
///
/// - un rail ne vit jamais DANS le calque de la scène — il y deviendrait un
///   objet du canvas, que le rendu final connaîtrait ;
/// - les deux rails partagent leurs marges, lues de la règle.
///
/// > L'ORDRE des modificateurs EST la disposition, et il ne rougit nulle part.
/// > C'est pourquoi ces témoins mesurent des POSITIONS dans la source, et non
/// > des occurrences.
final class ComposerRailPlateauOrderTests: XCTestCase {

    private func sceneSurface() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Composer/ComposerSceneSurface.swift"))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible** — une source vide rendrait toutes les mesures de position
    /// muettes, et muet se lit comme vert.
    func test_laSource_estLisibleEtEntiere() throws {
        let code = try sceneSurface()
        XCTAssertGreaterThan(code.count, 1_500)
        XCTAssertTrue(code.contains("struct ComposerSceneSurface"))
    }

    private func bloc(_ debut: String, jusqua fin: String) throws -> Substring {
        let code = compact(try sceneSurface())
        guard let a = code.range(of: debut), let b = code.range(of: fin),
              a.upperBound <= b.lowerBound else {
            XCTFail("`\(debut)` ou `\(fin)` introuvable — la garde doit être re-pointée.")
            return ""
        }
        return code[a.upperBound..<b.lowerBound]
    }

    /// **Aucun rail ni overlay ALIGNÉ dans le calque de la scène.** C'est la
    /// garde générale, celle qui attrape le troisième rail qu'on ajoutera un
    /// jour : posé dans ce calque, il suivrait la carte au lieu de flotter, et
    /// volerait les gestes de la bande qu'il couvre sans que rien ne le dise.
    /// Une surface qui DOIT couvrir le canvas (le dessin) passe par
    /// `canvasOverlay`, le paramètre qui pose DANS la carte.
    func test_aucunRail_nEstMonteDansLeCalqueDeLaScene() throws {
        let scene = try bloc("privatevarsceneLayer:someView{", jusqua: "privatevarchromeLayer:someView{")
        XCTAssertFalse(scene.isEmpty)
        for interdit in ["floatingRail", "ComposerTrailingRail(", "lowToolRow", ".overlay(alignment:"] {
            XCTAssertFalse(scene.contains(interdit),
                           "`\(interdit)` est monté dans le calque de la scène : il n'y flotte pas.")
        }
    }

    /// **Le témoin INVERSE de « les deux rails flottent dans la scène libre »**
    /// (#13839, directive porteur du 2026-10-30). Le rail gauche est parti ; le
    /// repos est un CALQUE à lui, posé au-dessus du chrome, jamais dans le
    /// calque de la scène — ce qu'il porte n'entre ni dans l'export ni dans la
    /// vignette. La colonne droite qui reste (outil, objet) garde sa place.
    func test_leRepos_estUnCalqueAuDessusDuChrome_etLaColonneDroiteResteDansLaSceneLibre() throws {
        let code = compact(try sceneSurface())
        XCTAssertTrue(code.contains("sceneLetterboxsceneLayerchromeLayer.modifier(ComposerIntakeVeil(veiled:intakeBlocks))ifarrangement==.rails{railsLayer.modifier(ComposerIntakeVeil(veiled:intakeBlocks))}else{restChrome.modifier(ComposerIntakeVeil(veiled:intakeBlocks))}}"),
                      "sol, scène, chrome, repos (ou les rails du grand écran, #13839 L6) — dans cet ordre")
        guard let debut = code.range(of: "privatevarfreeZone:someView{") else {
            return XCTFail("La scène libre a changé de nom — la garde doit être re-pointée.")
        }
        XCTAssertTrue(code[debut.upperBound...].contains(
            "HStack(alignment:isRoomy?.center:.bottom,spacing:0){Spacer(minLength:0)iftrailingRailIsShown{ComposerTrailingRail("))
        let scene = try bloc("privatevarsceneLayer:someView{", jusqua: "privatevarchromeLayer:someView{")
        XCTAssertFalse(scene.contains("restChrome"), "le repos est monté dans le calque de la scène")
        XCTAssertFalse(scene.contains("railsLayer"), "les rails du grand écran sont montés dans le calque de la scène")
    }

    /// **Les boutons du repos ont UN gabarit** : 44 pt, verre, voile de 38 %,
    /// et des marges lues des jetons d'espacement — jamais d'un littéral.
    func test_lesBoutonsDuRepos_partagentUnGabarit() throws {
        XCTAssertEqual(ComposerSceneRoundGlyph.size, 44)
        XCTAssertEqual(ComposerSceneRoundGlyph.veil, 0.38, accuracy: 0.0001)
        let repos = compact(AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Composer/ComposerSceneOverlayChrome.swift")))
        XCTAssertTrue(repos.contains(".padding(.horizontal,MeeshySpacing.smPlus)"))
        XCTAssertEqual(repos.components(separatedBy: "ComposerSceneRoundGlyph(symbol:").count - 1, 1,
                       "un seul site de dessin pour les boutons ronds")
    }
}
