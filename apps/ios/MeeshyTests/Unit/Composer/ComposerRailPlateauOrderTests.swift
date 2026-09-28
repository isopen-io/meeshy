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
            "Meeshy/Features/Main/Composer/ComposerSceneSurface.swift"))
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

    /// **Les deux rails sont dans la scène LIBRE du chrome**, au même endroit
    /// et à la même hauteur : deux rails qui encadrent la même scène à deux
    /// hauteurs différentes se voient avant de se comprendre.
    func test_lesDeuxRails_flottentDansLaSceneLibre() throws {
        let code = compact(try sceneSurface())
        guard let debut = code.range(of: "privatevarfreeZone:someView{") else {
            return XCTFail("La scène libre a changé de nom — la garde doit être re-pointée.")
        }
        let libre = code[debut.upperBound...]
        // Au bas sur téléphone (le pouce), CENTRÉS sur grand écran (maquette
        // `iPad.dc.html`, retour porteur 2026-09-28) — une seule règle, lue
        // de `isRoomy`.
        XCTAssertTrue(libre.contains("HStack(alignment:isRoomy?.center:.bottom,spacing:0){floatingRailSpacer(minLength:0)ComposerTrailingRail("),
                      "Rail gauche, ressort, rail droit — dans cet ordre, au bas sur téléphone, centrés sur grand écran.")
        XCTAssertTrue(code.contains("freeZone"))
    }

    /// **Les deux rails portent les MÊMES marges.** La symétrie est ce qui rend
    /// la place APPRENABLE.
    func test_lesDeuxRails_partagentLeursMarges() throws {
        let code = compact(try sceneSurface())
        // La marge de bord se lit d'UNE règle (`edgeMargin(roomy:)`) : 10 pt sur
        // téléphone, 24 sur iPad/Mac — et c'est la même des deux côtés.
        XCTAssertTrue(code.contains("privatevaredge:CGFloat{ComposerRailGeometry.edgeMargin(roomy:isRoomy)}"))
        XCTAssertTrue(code.contains(".padding(.leading,edge)"))
        XCTAssertTrue(code.contains(".padding(.trailing,edge)"))
        XCTAssertTrue(code.contains(".padding(.bottom,ComposerRailGeometry.gutter)"),
                      "Les marges se lisent de `ComposerRailGeometry`, jamais d'un littéral : "
                      + "un nombre recopié ferait diverger les deux rails en silence.")
    }
}
