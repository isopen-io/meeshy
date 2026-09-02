import XCTest
@testable import Meeshy

/// #4633 — **aucun rail ne se pose sur le canvas.**
///
/// Directive porteur du 2026-08-31 : « la bande gauche d'outil applicable dans
/// un canvas doit être placée sur le plateau hors du canvas ».
///
/// ## Ce que ces témoins gardent, et pourquoi il fallait les écrire
///
/// La directive #4561 disait déjà « les deux rails vivent dans les COULOIRS du
/// plateau », et son doc-comment vivait DANS le fichier. **Une seule des deux
/// moitiés était appliquée** : le rail *trailing* était monté APRÈS
/// l'encastrement, le *leading* AVANT — donc sur la scène.
///
/// > **L'ORDRE des modificateurs EST la disposition, et il ne rougit nulle
/// > part.** Les deux formes compilent, les deux montent le rail, et la
/// > différence ne se voit qu'au pixel — ou au doigt, quand on essaie de
/// > traîner un objet sous la colonne et que la scène ne répond pas. Aucun
/// > témoin de PRÉSENCE ne pouvait l'attraper : le rail était bien là.
///
/// C'est pourquoi ces témoins mesurent des POSITIONS dans la source, et non des
/// occurrences. Une garde qui demande « l'overlay est-il monté ? » serait restée
/// verte pendant toute la durée du défaut.
final class ComposerRailPlateauOrderTests: XCTestCase {

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func sceneSurface() throws -> String {
        try source("ComposerSceneSurface.swift")
    }

    /// **Le fusible** — une source vide rendrait toutes les mesures de position
    /// muettes, et muet se lit comme vert.
    func test_laSource_estLisibleEtEntiere() throws {
        let code = try sceneSurface()
        XCTAssertGreaterThan(code.count, 1_500)
        XCTAssertTrue(code.contains("struct ComposerSceneSurface"))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// L'encastrement — le modificateur qui crée les deux couloirs.
    private let inset = ".padding(.horizontal,ComposerRailGeometry.sceneInset("

    /// Les deux poses de rail, telles que `7b412fab` (2026-09-01, « les deux
    /// rails s'ancrent au bas du DESSIN, plus au bas de la frame ») les écrit :
    /// chaque overlay enveloppe son rail dans `ancreAuDessin(_:alignment:)`, qui
    /// retire par le bas ce que le 9:16 laisse vide sous la carte. **Cela ne
    /// change rien à ce que ces témoins mesurent** — `ancreAuDessin` ne touche
    /// qu'au bas ; le repère HORIZONTAL du rail reste celui de la vue sur
    /// laquelle l'overlay est posé, donc l'ordre overlay / encastrement décide
    /// toujours seul si le rail tombe dans le couloir ou sur la scène. Les
    /// ancres se re-pointent (2026-09-02) sur la forme actuelle, l'affirmation
    /// reste : le rail est monté APRÈS `sceneInset`.
    ///
    /// Elles nomment l'enveloppe, et non seulement l'alignement : un rail qui
    /// quitterait `ancreAuDessin` reviendrait s'asseoir au bas de la FRAME, le
    /// défaut que `7b412fab` corrige, et une ancre réduite à `.bottomLeading){`
    /// ne le verrait pas.
    private let poseRailGauche = ".overlay(alignment:.bottomLeading){ancreAuDessin(floatingRail,alignment:.bottomLeading)}"
    private let poseRailDroit = ".overlay(alignment:.bottomTrailing){ancreAuDessin("

    /// **Le témoin qui se retourne sur le défaut d'origine.**
    ///
    /// Un overlay posé AVANT le padding a pour repère la vue NUE : son
    /// `.leading` tombe sur le bord de la scène. Posé après, le repère inclut
    /// les couloirs, et le rail tombe sur le plateau.
    func test_leRailGauche_estMonteApresLEncastrement_doncSurLePlateau() throws {
        let code = compact(try sceneSurface())
        guard let posePadding = code.range(of: inset)?.lowerBound else {
            return XCTFail("L'encastrement est introuvable — la garde doit être re-pointée.")
        }
        guard let poseRail = code.range(of: poseRailGauche)?.lowerBound else {
            return XCTFail("Le rail *leading* n'est plus monté en `.bottomLeading` via "
                           + "`ancreAuDessin` — s'il a changé d'ancre, cette garde doit dire laquelle.")
        }
        XCTAssertTrue(posePadding < poseRail,
            "Le rail *leading* est monté AVANT l'encastrement : son repère exclut les "
            + "couloirs, donc il se pose SUR la scène. C'est le défaut de #4633 — il "
            + "compile, il s'affiche, et il vole les touches de la bande qu'il couvre.")
    }

    /// **Son jumeau, pour que la comparaison reste vraie.** C'est lui qui était
    /// juste ; le garder mesuré empêche qu'un futur remaniement les réaligne
    /// dans le mauvais sens.
    func test_leRailDroit_estMonteApresLEncastrement_lui_aussi() throws {
        let code = compact(try sceneSurface())
        guard let posePadding = code.range(of: inset)?.lowerBound,
              let poseRail = code.range(of: poseRailDroit)?.lowerBound else {
            return XCTFail("Les ancres du rail *trailing* ont changé — re-pointer la garde.")
        }
        XCTAssertTrue(posePadding < poseRail)
    }

    /// **Les deux rails portent les MÊMES marges.** Deux rails qui encadrent la
    /// même scène à deux hauteurs ou deux marges différentes se voient avant de
    /// se comprendre — et la symétrie est ce qui rend la place APPRENABLE.
    func test_lesDeuxRails_partagentLeursMarges() throws {
        let code = compact(try sceneSurface())
        XCTAssertTrue(code.contains(".padding(.leading,ComposerRailGeometry.outerMargin)"))
        XCTAssertTrue(code.contains(".padding(.trailing,ComposerRailGeometry.outerMargin)"))
        XCTAssertTrue(code.contains(".padding(.bottom,ComposerRailGeometry.gutter)"),
                      "Les marges se lisent de `ComposerRailGeometry`, jamais d'un littéral : "
                      + "un nombre recopié ferait diverger les deux couloirs en silence.")
    }

    /// **Aucun overlay ne subsiste AVANT l'encastrement.** C'est la garde
    /// générale, celle qui attrape le troisième rail qu'on ajoutera un jour : un
    /// overlay posé avant le padding est, par construction, posé sur la scène.
    func test_aucunOverlay_nEstMonteAvantLEncastrement() throws {
        let code = compact(try sceneSurface())
        guard let posePadding = code.range(of: inset)?.lowerBound else {
            return XCTFail("L'encastrement est introuvable — la garde doit être re-pointée.")
        }
        let avant = code[code.startIndex..<posePadding]
        XCTAssertFalse(avant.contains(".overlay(alignment:"),
            "Un overlay ALIGNÉ est monté avant l'encastrement : son repère exclut les "
            + "couloirs, donc il se pose sur la scène. Si c'est voulu (une surface qui "
            + "DOIT couvrir le canvas, comme le dessin), il passe par `canvasOverlay` — "
            + "le paramètre qui pose DANS la carte, et que le rendu final connaît.")
    }
}
