import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **La barre collée au clavier : Aa · Effet · Langue · ● · ◯ · Cadre · Style
/// du cadre · OK** (#18781, recette porteur du 2026-11-16, après #18640).
///
/// L'alignement quitte la barre (il reste dans le panneau Aa) ; Effet et
/// Langue y ont leur commande ; la couleur se peint en cercle plein, le contour
/// en cercle creux de sa propre couleur ; le cadre et son style viennent en
/// dernier. Aucun réglage des huit outils ne se perd.
final class ComposerKeyboardStyleBarTests: XCTestCase {

    func test_families_areTheSevenCommandsOfTheBar_inOrder() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.allCases,
                       [.typography, .effect, .language, .color, .outline, .frame, .frameStyle])
    }

    func test_tools_typography_isFontAndWeight_withTheAlignmentKept() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.typography.tools, [.style, .align])
    }

    func test_tools_effectAndLanguage_areCommandsOfTheirOwn() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.effect.tools, [.effect])
        XCTAssertEqual(ComposerKeyboardStyleFamily.language.tools, [.language])
    }

    func test_tools_colorThenOutline_areTwoCommands() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.color.tools, [.color])
        XCTAssertEqual(ComposerKeyboardStyleFamily.outline.tools, [.border])
    }

    func test_tools_frameThenItsStyle_comeLast() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.frame.tools, [.frame])
        XCTAssertEqual(ComposerKeyboardStyleFamily.frameStyle.tools, [.background, .frame])
    }

    /// **L'alignement n'a plus de commande** : il reste dans le panneau Aa.
    func test_noCommandIsTheAlignment() {
        XCTAssertFalse(ComposerKeyboardStyleFamily.allCases.map(\.quickTool).contains(.align))
        XCTAssertTrue(ComposerKeyboardStyleFamily.typography.panel.flatMap(\.parts).contains(.alignment))
    }

    /// **Aucun outil ne disparaît** — chacun est servi par au moins une commande.
    func test_tools_everyTextToolIsServed() {
        let servis = Set(ComposerKeyboardStyleFamily.allCases.flatMap(\.tools))
        XCTAssertEqual(servis, Set(TextEditTool.allCases))
    }

    /// **Chaque CONTRÔLE des huit outils est dans un panneau, une seule fois**
    /// — c'est le témoin du « regroupement ne retire aucun réglage ».
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

    func test_panel_typography_isTheFontsTheWeightThenTheAlignment() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.typography.panel.flatMap(\.parts),
                       [.size, .fonts, .weight, .alignment])
    }

    func test_panel_color_isTheTextPaletteAlone() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.color.panel, [.palette([.text])])
    }

    func test_panel_outline_isItsWidthThenItsOwnPalette() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.outline.panel.flatMap(\.parts), [.borderWidth, .borderPalette])
    }

    func test_panel_frame_isTheShapeAndThePadding() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.frame.panel.flatMap(\.parts), [.frameShapes, .framePadding])
    }

    func test_panel_frameStyle_isTheBackgroundThenTheBorderOfTheFrame() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.frameStyle.panel.flatMap(\.parts),
                       [.backgrounds, .frameBorderWidth, .frameBorderPalette])
    }

    // MARK: - Le cercle plein et le cercle creux montrent leur couleur

    func test_tint_color_isTheTextColour_whiteByDefault() {
        var texte = StoryTextObject(text: "a")
        XCTAssertEqual(ComposerKeyboardStyleFamily.color.tint(of: texte), "FFFFFF")
        texte.textColor = "FF2D55"
        XCTAssertEqual(ComposerKeyboardStyleFamily.color.tint(of: texte), "FF2D55")
    }

    func test_tint_outline_isTheChosenOutlineColour_onlyWhenThereIsAnOutline() {
        var texte = StoryTextObject(text: "a")
        XCTAssertNil(ComposerKeyboardStyleFamily.outline.tint(of: texte), "sans contour, aucune couleur à annoncer")
        texte = TextEditPalette.applying("34C759", to: .border, on: texte)
        XCTAssertEqual(ComposerKeyboardStyleFamily.outline.tint(of: texte), "34C759")
    }

    func test_tint_otherCommands_areNeutral() {
        let texte = StoryTextObject(text: "a")
        for famille in [ComposerKeyboardStyleFamily.typography, .effect, .language, .frame, .frameStyle] {
            XCTAssertNil(famille.tint(of: texte), "\(famille)")
        }
    }

    // MARK: - Ce que l'hôte ne sert pas n'a pas de commande

    func test_families_servingABakedText_dropTheLanguage() {
        let servies = ComposerKeyboardStyleFamily.served(by: StoryTextEditProfile.bakedIntoMedia.tools)
        XCTAssertFalse(servies.contains(.language))
        XCTAssertEqual(ComposerKeyboardStyleFamily.served(by: StoryTextEditProfile.composer.tools),
                       ComposerKeyboardStyleFamily.allCases)
    }

    func test_symbols_areDistinctGlyphs() {
        let glyphes = ComposerKeyboardStyleFamily.allCases.map(\.symbol)
        XCTAssertEqual(Set(glyphes).count, glyphes.count)
    }

    @MainActor
    func test_labels_areDistinctNonEmptyWords() {
        let libelles = ComposerKeyboardStyleFamily.allCases.map(\.label)
        XCTAssertTrue(libelles.allSatisfy { !$0.isEmpty })
        XCTAssertEqual(Set(libelles).count, libelles.count, "VoiceOver doit distinguer les commandes")
        XCTAssertFalse(ComposerKeyboardStyleCopy.done.isEmpty)
    }

    /// Chaque rangée d'un panneau porte un titre qu'aucune autre rangée du
    /// même panneau ne répète.
    @MainActor
    func test_sectionTitles_neverRepeatWithinAPanel() {
        for famille in ComposerKeyboardStyleFamily.allCases {
            let titres = famille.panel.map(\.title)
            XCTAssertEqual(Set(titres).count, titres.count, "\(famille) : \(titres)")
        }
    }

    /// Un panneau ne répète pas le nom de la commande qui l'ouvre sous un autre
    /// sens : la palette du contour dit « contour », celle du cadre « cadre ».
    @MainActor
    func test_paletteTitles_nameWhatTheyColour() {
        XCTAssertEqual(ComposerKeyboardPanelSection.palette([.border]).title, ComposerKeyboardStyleCopy.outlineColor)
        XCTAssertEqual(ComposerKeyboardPanelSection.palette([.frame]).title, ComposerKeyboardStyleCopy.frameColor)
        XCTAssertNotEqual(ComposerKeyboardStyleCopy.outlineColor, ComposerKeyboardStyleCopy.frameColor)
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
