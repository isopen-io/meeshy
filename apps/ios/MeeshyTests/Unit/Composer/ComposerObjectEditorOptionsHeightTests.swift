import XCTest
@testable import Meeshy

/// #5083 — **les options s'ancrent en bas, et le panneau fait la hauteur de son
/// contenu.**
///
/// > « dans la page plein écran d'ajout de texte il faut que les options soient
/// > en bas et non en milieu de l'écran » — porteur, 2026-09-04
///
/// ## Le défaut avait DEUX causes, et aucune ne suffisait seule
///
/// Mesuré au simulateur `Meeshy-iOS26`, écran de 874 points : la grille des
/// polices finissait à **748**, laissant quatre-vingt-douze points vides sous
/// elle.
///
/// 1. Le panneau était le TROISIÈME enfant d'un `VStack` : il prenait la place
///    que la pile lui donnait, et ce qui restait dessous n'appartenait à
///    personne. `safeAreaInset(edge: .bottom)` renverse la question — la barre
///    est posée sur le bord, la scène reçoit le reste.
/// 2. Un `ScrollView` est GLOUTON dans son axe : il prenait les 260 points
///    qu'on l'autorisait à prendre même quand son contenu en occupait 168, et
///    calait ce contenu en HAUT de la boîte. Ancrer la boîte ne changeait donc
///    rien à ce qu'elle contenait.
///
/// Après les deux : la grille finit à **810**, et ce qui reste est sa propre
/// marge déclarée.
final class ComposerObjectEditorOptionsHeightTests: XCTestCase {

    private var cap: CGFloat { ComposerObjectEditorRail.optionsMaxHeight }

    /// Le cas nominal : le panneau fait la taille de son contenu, pas celle
    /// qu'on l'autorise à prendre.
    func test_unContenuCourt_neRéclamePasLePlafond() {
        XCTAssertEqual(ComposerObjectEditorOptions.height(content: 168, cap: cap), 168)
    }

    /// Le plafond de #4997 tient : au-delà, les options mangeraient la carte.
    func test_unContenuLong_estPlafonné() {
        XCTAssertEqual(ComposerObjectEditorOptions.height(content: 900, cap: cap), cap)
    }

    /// **Le plancher n'est pas une précaution défensive.** La hauteur mesurée
    /// vaut ZÉRO à la première passe de layout, avant que la préférence ne
    /// remonte. Servie telle quelle, elle ferait disparaître le panneau une
    /// frame — un clignotement à chaque ouverture d'outil, que rien ne
    /// signalerait comme un défaut.
    func test_uneHauteurNonEncoreMesurée_neFaitPasDisparaîtreLePanneau() {
        XCTAssertGreaterThan(ComposerObjectEditorOptions.height(content: 0, cap: cap), 0)
        XCTAssertGreaterThan(ComposerObjectEditorOptions.height(content: -40, cap: cap), 0)
    }

    /// **Les deux correctifs sont montés, et aucun ne suffit seul.** Ce témoin
    /// existe parce que retirer l'un des deux laisse l'autre en place et rend
    /// une disposition qui a l'air presque juste — le genre de régression qui
    /// passe une relecture.
    func test_lesDeuxMoitiésDuCorrectif_sontMontées() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerObjectEditorView.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("safeAreaInset(edge:.bottom,spacing:0){options}"),
                      "le panneau doit être POSÉ sur le bord, pas empilé dans la pile")
        XCTAssertTrue(code.contains("ComposerObjectEditorOptions.height("),
                      "…et faire la hauteur de son contenu, un ScrollView étant glouton")
    }
}
