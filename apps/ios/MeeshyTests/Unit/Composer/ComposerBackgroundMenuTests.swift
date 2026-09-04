import XCTest
@testable import Meeshy

/// #5041 — **l'appui long sur un fond image/vidéo ouvre un MENU à trois
/// entrées**, pas l'éditeur d'un trait (directive porteur 2026-09-04).
@MainActor
final class ComposerBackgroundMenuTests: XCTestCase {

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Les trois entrées de la directive, et elles seules.** Une quatrième
    /// n'est pas interdite — elle doit être DÉCIDÉE, et ce témoin est l'endroit
    /// où la décision se prend.
    func test_leMenu_sertLesTroisActionsDeLaDirective() {
        XCTAssertEqual(ComposerBackgroundMenuAction.served,
                       [.edit, .bringForward, .delete])
    }

    /// **`served` n'est pas `allCases`, et ce n'est pas un oubli** : un cas
    /// ajouté au milieu de la déclaration atterrirait entre l'édition et la
    /// suppression sans que personne ne l'ait voulu. Le témoin exige que les
    /// deux restent d'accord sur le CONTENU — pas sur l'ordre.
    func test_aucuneAction_neResteHorsDuMenu() {
        XCTAssertEqual(Set(ComposerBackgroundMenuAction.served),
                       Set(ComposerBackgroundMenuAction.allCases),
                       "une action déclarée et non servie serait un contrôle mort")
    }

    /// **Une seule entrée détruit, et elle est la DERNIÈRE.** La destruction se
    /// range là où le pouce ne la trouve pas par accident.
    func test_seuleLaSuppression_estDestructive_etElleFerme() {
        XCTAssertEqual(ComposerBackgroundMenuAction.served.filter(\.isDestructive),
                       [.delete])
        XCTAssertEqual(ComposerBackgroundMenuAction.served.last, .delete)
    }

    func test_chaqueAction_aSonGlyphe_etAucunNEstPartagé() {
        let glyphes = ComposerBackgroundMenuAction.allCases.map(\.symbol)
        XCTAssertFalse(glyphes.contains(where: \.isEmpty))
        XCTAssertEqual(Set(glyphes).count, glyphes.count,
                       "deux entrées au même glyphe sont, pour l'œil, le même bouton")
    }

    func test_chaqueAction_aSonLibellé_etAucunNEstPartagé() {
        let libellés = ComposerBackgroundMenuAction.allCases.map(ComposerBackgroundMenuCopy.label(for:))
        XCTAssertFalse(libellés.contains(where: \.isEmpty))
        XCTAssertEqual(Set(libellés).count, libellés.count)
        XCTAssertFalse(ComposerBackgroundMenuCopy.title().isEmpty)
    }

    /// **« Ramener en avant » ne peut PAS être `bringForward(id:)`.**
    ///
    /// Ce dernier déplace un z-index parmi les objets de PREMIER PLAN, et un
    /// fond se rend depuis `backgroundLayer` quel que soit son z : l'entrée
    /// aurait été INERTE — un bouton qui a l'air de marcher et ne change rien
    /// à l'écran. Ce que « ramener en avant » veut dire sur un fond, c'est le
    /// faire SORTIR du plan de fond, et `toggleBackground` fait exactement cela.
    ///
    /// Le témoin est une garde de SOURCE parce que la distinction ne se lit pas
    /// dans une valeur : les deux fonctions rendent `Void`, et l'une des deux
    /// ne fait rien.
    func test_ramenerEnAvant_bascule_lePlan_etNePermutePasUnZIndex() throws {
        let code = try source("MeeshyComposerHost+BackgroundMenu.swift")
        guard let début = code.range(of: "case.bringForward:"),
              let fin = code.range(of: "case.delete:", range: début.upperBound..<code.endIndex)
        else { return XCTFail("le menu a changé de forme") }
        let corps = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("viewModel.toggleBackground(id:id)"))
        XCTAssertFalse(corps.contains("bringForward(id:"),
                       "un z-index ne fait pas sortir un média du plan de fond")
    }

    /// **L'éditeur est le MÊME que celui du double-tap et du rail.** Un second
    /// chemin d'ouverture divergerait au premier outil ajouté, et personne ne
    /// le verrait avant que l'un des deux n'en manque un.
    func test_modifier_passeParLEditeurUnique() throws {
        let code = try source("MeeshyComposerHost+BackgroundMenu.swift")
        XCTAssertTrue(code.contains("case.edit:openObjectEditor(id)"))
    }

    /// **L'identifiant se lit AVANT d'agir.** SwiftUI referme le dialogue et
    /// exécute l'action dans la même passe, sans garantir l'ordre : lire après
    /// l'effacement ferait arriver l'action sur un `nil`, et jamais de façon
    /// reproductible — donc jamais dans un test.
    func test_lIdentifiant_estLuAvantDEtreEffacé() throws {
        let code = try source("MeeshyComposerHost+BackgroundMenu.swift")
        guard let lecture = code.range(of: "guardletid=backgroundMenuObjectId"),
              let effacement = code.range(of: "backgroundMenuObjectId=nil")
        else { return XCTFail("la lecture ou l'effacement a changé de forme") }
        XCTAssertLessThan(lecture.lowerBound, effacement.lowerBound)
    }

    /// **Le menu est monté sur la PILE, jamais sur la racine.** SwiftUI
    /// n'honore qu'UNE présentation par vue, et la racine porte déjà la feuille
    /// de partage (#4996) : une seconde y serait silencieusement avalée.
    func test_leMenu_estMontéSurLaPile_pasSurLaRacine() throws {
        XCTAssertTrue(try source("MeeshyComposerHost.swift")
            .contains("withSceneCameraViewfinder(backgroundMenuPresented(composerStack))"))
    }

    /// **Le fond ouvre son menu, pas le viseur.** C'est le câblage qui fait
    /// basculer la règle du canvas : tant que ce rappel est nil, elle retombe
    /// sur le viseur — donc le geste n'est jamais muet, mais il reste faux.
    func test_leMeuble_sertLeMenu_doncLaRègleDuCanvasBascule() throws {
        XCTAssertTrue(try source("MeeshyComposerHost+Surfaces.swift")
            .contains("onBackgroundMediaLongPressed:{backgroundMenuObjectId=$0}"))
    }
}
