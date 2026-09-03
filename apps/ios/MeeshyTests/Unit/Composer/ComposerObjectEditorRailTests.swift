import XCTest
@testable import Meeshy
@testable import MeeshyUI

/// **Le rail d'outils de l'éditeur d'objet** (#4936).
///
/// > Directive porteur 2026-09-03 : « Plutôt que d'avoir une liste de fold, ce
/// > n'est pas mieux d'avoir une rangée de tool à gauche […] et préserver le bas
/// > pour afficher les options des tools à chaque fois ? »
///
/// ## Ce que le passage de la LISTE au RAIL change vraiment
///
/// Les deux modèles portent le même jeu d'entrées — le dépliant en avait déjà
/// une par outil. Ce qui change est une seule règle, et c'est elle que ces
/// témoins gardent : **dans une liste, tout replier est un état voulu** (le
/// doc-comment de `ComposerObjectEditorDisclosure` l'écrit : « pouvoir tout
/// replier rend la hauteur à la scène »). Dans un rail, la même bascule
/// viderait le bas — c'est-à-dire rejouerait le défaut que la liste dépliante
/// avait été écrite pour fermer.
final class ComposerObjectEditorRailTests: XCTestCase {

    // MARK: - Les entrées se DÉRIVENT, elles ne se recopient pas

    /// Le rail porte les huit outils du SDK, puis le temps, puis le plan.
    ///
    /// Il les LIT de `TextEditTool.all` : un neuvième outil doit entrer sans
    /// qu'une ligne change ici, comme l'EFFET (#4870) est entré dans les
    /// sections. Une liste écrite à la main se périmerait à la prochaine
    /// capacité — le motif exact qui a fait tomber deux témoins au #4919.
    func test_lesEntrees_seDeriventDesOutilsDuSDK() {
        let entrees = ComposerObjectEditorRail.entries
        XCTAssertEqual(entrees.count, TextEditTool.all.count + 2,
                       "les 8 outils, plus le temps et le plan")
        for outil in TextEditTool.all {
            XCTAssertTrue(entrees.contains(.tool(outil)), "\(outil) manque au rail")
        }
        XCTAssertEqual(entrees.suffix(2), [.timing, .plan],
                       "le temps puis le plan ferment le rail — ce qui QUALIFIE l'objet "
                       + "vient après ce qui le DESSINE")
    }

    /// L'ordre des outils est celui de la rangée du SDK, pas celui de
    /// `allCases` : passer de l'atelier à cet écran ne doit pas demander de
    /// réapprendre où se trouve POLICE.
    func test_lOrdreDesOutils_estCeluiDeLaRangee() {
        let outils = ComposerObjectEditorRail.entries.compactMap { entree -> TextEditTool? in
            if case .tool(let t) = entree { return t }
            return nil
        }
        XCTAssertEqual(outils, TextEditTool.all)
    }

    // MARK: - Le témoin qui PORTE la loi du lot

    /// **Le bas n'est JAMAIS vide.** Retaper l'outil déjà ouvert ne le referme
    /// pas — il reste ouvert.
    ///
    /// C'est la seule règle que le passage au rail change, et sans ce témoin
    /// « garder l'outil » et « le basculer » rendent le même verdict sur tout
    /// tap qui CHANGE d'outil, c'est-à-dire sur le cas nominal et sur lui seul.
    ///
    /// Le doc-comment de la liste dépliante disait pourquoi la bascule était
    /// bonne CHEZ ELLE : « pouvoir tout replier rend la hauteur à la scène ».
    /// Dans un rail, la scène ne récupère rien — le rail occupe le couloir, pas
    /// le bas — et un bas vide serait le défaut que cet écran existe pour
    /// fermer : « toutes les options n'existaient nulle part ».
    /// **Le bas ne PEUT PAS être vide** — et c'est le type qui le garantit, pas
    /// une garde d'exécution.
    ///
    /// La liste dépliante portait un état optionnel (`ComposerObjectEditorSection?`)
    /// parce que « tout replier » y était un geste utile : la hauteur revenait à
    /// la scène. Dans un rail, refermer ne rend rien — le rail occupe le
    /// couloir, pas le bas — et un `nil` y rejouerait le défaut que cet écran
    /// existe pour fermer : « toutes les options n'existaient nulle part ».
    ///
    /// Ce témoin lit la SOURCE parce que l'invariant est structurel : il vérifie
    /// que la vue déclare sa sélection en NON optionnel. Une garde d'exécution
    /// pourrait être oubliée à un site d'appel ; un type qui ne sait pas dire
    /// l'état interdit ne peut pas l'être.
    func test_laSelectionDeLaVue_nEstPasOptionnelle() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerObjectEditorView.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            source.contains("@State private var selectedTool: ComposerObjectEditorSection ="),
            "la sélection du rail doit être NON optionnelle — un `ComposerObjectEditorSection?` "
            + "rendrait le bas vide représentable, et le vide est le défaut que cet écran ferme")
        XCTAssertFalse(
            source.contains("@State private var selectedTool: ComposerObjectEditorSection?"),
            "un point d'interrogation ici rouvre exactement le défaut du dépliant")
    }

    /// À l'ouverture, le STYLE — le premier geste sur un texte, et la raison
    /// que la liste dépliante donnait déjà pour ne jamais naître toute fermée.
    func test_aLOuverture_leStyleEstSelectionne() {
        XCTAssertEqual(ComposerObjectEditorRail.initiallySelected, .tool(.style))
    }
}
