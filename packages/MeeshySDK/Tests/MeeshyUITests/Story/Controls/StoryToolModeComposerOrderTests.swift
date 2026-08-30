import XCTest
@testable import MeeshyUI

/// T6 — un seul ordre d'outils, un seul glyphe par outil.
///
/// Trois ordres divergents cohabitaient sur le même composer : la barre de FABs
/// (média, texte, dessin, son, fond, timeline), `selectableCases` (média, son,
/// dessin, texte, timeline, fond) et la grille d'état vide (média, son, texte,
/// dessin, fond, timeline) — l'utilisateur devait réapprendre la disposition à
/// chaque surface. Et QUATRE tables de glyphes SF les décrivaient, dont une dans
/// un fichier qui se déclarait lui-même « source de vérité unique ».
final class StoryToolModeComposerOrderTests: XCTestCase {

    func test_composerOrder_isTheFabBarOrder() {
        XCTAssertEqual(
            StoryToolMode.composerOrder,
            [.media, .text, .drawing, .audio, .texture, .timeline],
            "Ordre de la barre de FABs : création (média, texte, dessin), habillage (son, fond), montage (timeline)."
        )
    }

    func test_composerOrder_containsEverySelectableCase_andExcludesFilters() {
        XCTAssertEqual(
            Set(StoryToolMode.composerOrder),
            Set(StoryToolMode.allCases).subtracting([.filters]),
            "Un nouveau case ne peut pas disparaître silencieusement de l'UI."
        )
    }

    func test_selectableCases_equalsComposerOrder() {
        XCTAssertEqual(StoryToolMode.selectableCases, StoryToolMode.composerOrder)
    }

    func test_symbolName_isDefinedForEveryCase() {
        for tool in StoryToolMode.allCases {
            XCTAssertFalse(tool.symbolName.isEmpty, "\(tool) n'a pas de glyphe.")
        }
    }

    func test_symbolName_isUniquePerTool() {
        XCTAssertEqual(
            Set(StoryToolMode.allCases.map(\.symbolName)).count,
            StoryToolMode.allCases.count,
            "Deux outils partageant un glyphe rendraient la barre illisible."
        )
    }

    /// Garde de source, formulée GLOBALEMENT : une garde qui nomme ses fichiers
    /// un par un laisse toujours passer le prochain doublon — c'est exactement
    /// ainsi qu'une quatrième table de glyphes avait survécu.
    func test_composerSurfaces_iterateTheCanonicalOrder() throws {
        // #4136 — le rail de pastilles est devenu une RANGÉE à la forme
        // canonique, et le fichier a suivi le nom : `ComposerFABColumn` disait
        // « colonne » pour une barre horizontale depuis le 2026-07-10. L'adresse
        // d'une garde suit ce qu'elle mesure, jamais le nom qu'elle a connu.
        let toolRow = try ComposerSourceGuard.source("Controls/ComposerToolRow.swift")
        XCTAssertTrue(toolRow.contains("ForEach(StoryToolMode.composerOrder"))

        // S5 — il n'existe plus qu'UNE surface qui énumère les outils : le rail
        // de FABs. La grille d'état vide, seconde énumération (avec ses propres
        // sous-titres et son propre chemin d'ouverture Timeline), a disparu avec
        // l'état vide bloquant. Un compte EXACT, pas un « au moins un » : c'est
        // le retour d'une DEUXIÈME surface qu'on interdit ici.
        let enumerations = try ComposerSourceGuard.allStorySources()
            .filter { $0.code.contains("ForEach(StoryToolMode.composerOrder") }
        XCTAssertEqual(
            enumerations.map(\.path), ["Controls/ComposerToolRow.swift"],
            "Surfaces énumérant les outils : \(enumerations.map(\.path)). Une seule est autorisée."
        )

        let iconTables = try ComposerSourceGuard.allStorySources()
            .filter { $0.code.contains("func icon(for tool: StoryToolMode)") }
        XCTAssertTrue(
            iconTables.isEmpty,
            "Tables de glyphes résiduelles : \(iconTables.map(\.path)). Le glyphe vit sur StoryToolMode.symbolName."
        )
    }

    /// `ComposerToolSwitcherHeader` était DEAD CODE (aucun appelant hors sa
    /// propre déclaration) tout en portant un doublon de glyphes et deux titres
    /// non localisés (« Effets », « Timeline »). Supprimé — sa réapparition
    /// ressusciterait les deux problèmes d'un coup.
    func test_deadToolSwitcherHeader_isGone() {
        let url = ComposerSourceGuard.storyDirectory
            .appendingPathComponent("Controls/ComposerToolSwitcherHeader.swift")
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    }
}
