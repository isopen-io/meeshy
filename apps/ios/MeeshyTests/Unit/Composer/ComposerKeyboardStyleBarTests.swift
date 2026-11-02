import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **La barre collée au clavier : Aa · ● · ≡ · ▣ · OK** (#13839, L4 — maquette
/// du 2026-10-30, état 2 « On écrit »).
///
/// Les huit outils du texte se rangent en quatre familles, et chaque réglage
/// que la colonne de neuf glyphes offrait reste atteignable : police, taille,
/// graisse, effet et langue sous Aa ; couleur et contour sous ● ; alignement
/// sous ≡ ; fond et cadre sous ▣.
final class ComposerKeyboardStyleBarTests: XCTestCase {

    func test_families_areTheFourIconsOfTheBar_inOrder() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.allCases, [.typography, .color, .alignment, .surface])
    }

    func test_tools_typography_isFontEffectAndLanguage() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.typography.tools, [.style, .effect, .language])
    }

    func test_tools_color_isColourThenOutline() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.color.tools, [.color, .border])
    }

    func test_tools_alignment_isAlignment() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.alignment.tools, [.align])
    }

    func test_tools_surface_isBackgroundThenFrame() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.surface.tools, [.background, .frame])
    }

    /// **Aucun outil ne disparaît, aucun n'est servi deux fois** — la colonne
    /// de neuf glyphes devient quatre familles, pas cinq réglages perdus.
    func test_tools_everyTextToolBelongsToExactlyOneFamily() {
        let ranges = ComposerKeyboardStyleFamily.allCases.flatMap(\.tools)
        XCTAssertEqual(ranges.count, Set(ranges).count, "un outil servi par deux familles")
        XCTAssertEqual(Set(ranges), Set(TextEditTool.allCases))
    }

    /// **Chaque CONTRÔLE des huit outils est dans un panneau, une seule fois**
    /// — taille, graisse, contour et langue compris. C'est le témoin du
    /// « regroupement ne retire aucun réglage ».
    func test_panels_coverEveryControlOfTheEightTools_once() {
        let parties = ComposerKeyboardStyleFamily.allCases.flatMap { famille in
            famille.panel.flatMap(\.parts)
        }
        XCTAssertEqual(parties.count, Set(parties).count, "un contrôle peint deux fois : \(parties)")
        XCTAssertEqual(Set(parties), Set(TextEditOptionPart.allCases))
    }

    /// **Une seule palette par panneau** (doublon 4 de l'inventaire).
    func test_panels_neverShowTwoPalettes() {
        for famille in ComposerKeyboardStyleFamily.allCases {
            let palettes = famille.panel.filter { section in
                if case .palette = section { return true }
                return section.parts.contains(where: \.isPalette)
            }
            XCTAssertLessThanOrEqual(palettes.count, 1, "\(famille) peint \(palettes.count) palettes")
        }
    }

    func test_panel_typography_putsTheWeightWithTheFonts() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.typography.panel.flatMap(\.parts),
                       [.size, .fonts, .weight, .effects, .language])
    }

    func test_panel_color_sharesOnePaletteBetweenTextAndOutline() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.color.panel.first, .palette([.text, .border]))
        XCTAssertTrue(ComposerKeyboardStyleFamily.color.panel.flatMap(\.parts).contains(.borderWidth))
    }

    func test_panel_alignment_isTheAlignmentRowAlone() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.alignment.panel.flatMap(\.parts), [.alignment])
    }

    func test_panel_surface_isBackgroundThenFrameWithItsPalette() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.surface.panel.flatMap(\.parts),
                       [.backgrounds, .frameShapes, .framePadding, .frameBorderWidth, .frameBorderPalette])
    }

    func test_symbols_areFourDistinctGlyphs() {
        let glyphes = ComposerKeyboardStyleFamily.allCases.map(\.symbol)
        XCTAssertEqual(Set(glyphes).count, 4)
    }

    @MainActor
    func test_labels_areFourDistinctNonEmptyWords() {
        let libelles = ComposerKeyboardStyleFamily.allCases.map(\.label)
        XCTAssertTrue(libelles.allSatisfy { !$0.isEmpty })
        XCTAssertEqual(Set(libelles).count, 4, "VoiceOver doit distinguer les quatre familles")
        XCTAssertFalse(ComposerKeyboardStyleCopy.done.isEmpty)
    }

    /// Chaque rangée d'un panneau porte un titre qu'aucune autre rangée du
    /// même panneau ne répète : « Cadre » au-dessus des formes PUIS au-dessus
    /// de la palette ne dit pas ce que la seconde colore.
    @MainActor
    func test_sectionTitles_neverRepeatWithinAPanel() {
        for famille in ComposerKeyboardStyleFamily.allCases {
            let titres = famille.panel.map(\.title)
            XCTAssertEqual(Set(titres).count, titres.count, "\(famille) : \(titres)")
        }
    }

    func test_barHeight_isAFortyFourPointTarget() {
        XCTAssertEqual(ComposerKeyboardStyleBar.height, 44)
    }

    // MARK: - « Langue : FR » (légende et corps du post)

    @MainActor
    func test_writingLabel_namesTheLanguageInWords_notAFlag() {
        let libelle = ComposerLanguageFlag.writingLabel(for: "fr")
        XCTAssertTrue(libelle.contains("FR"), libelle)
        XCTAssertFalse(libelle.contains(ComposerLanguageFlag.label(for: "fr")),
                       "le drapeau seul ne dit pas ce qu'il règle")
    }

    @MainActor
    func test_writingLabel_regionalCode_showsItsLanguage() {
        XCTAssertTrue(ComposerLanguageFlag.writingLabel(for: "pt-BR").contains("PT"))
    }
}
