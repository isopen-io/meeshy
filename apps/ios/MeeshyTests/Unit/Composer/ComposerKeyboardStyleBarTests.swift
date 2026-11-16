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

    /// **La couleur du cadre se choisit avec sa forme** (retour porteur) : elle
    /// n'est plus dans « Style du cadre ».
    func test_panel_frame_isTheShapeThePaddingAndTheFrameColour() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.frame.panel.flatMap(\.parts),
                       [.frameShapes, .framePadding, .frameBorderPalette])
    }

    func test_panel_frameStyle_isTheBackgroundThenTheBorderWidth() {
        XCTAssertEqual(ComposerKeyboardStyleFamily.frameStyle.panel.flatMap(\.parts),
                       [.backgrounds, .frameBorderWidth])
    }

    // MARK: - Chaque commande montre ce qu'elle rend

    func test_indicator_font_isAaInTheCurrentFont() {
        var texte = StoryTextObject(text: "a")
        texte.textStyle = StoryTextStyle.allCases.last?.rawValue
        XCTAssertEqual(ComposerKeyboardStyleFamily.typography.indicator(of: texte),
                       .styledGlyph("Aa", style: texte.parsedTextStyle))
    }

    func test_indicator_effect_isAaWithTheSelectedEffect() {
        var texte = StoryTextObject(text: "a")
        let effet = StoryTextEffect.pickerChoices.last ?? .none
        texte.textEffect = effet.rawValue
        XCTAssertEqual(ComposerKeyboardStyleFamily.effect.indicator(of: texte), .effectGlyph("Aa", effect: effet))
    }

    func test_indicator_language_isTheLanguageCode_notAGlobe() {
        var texte = StoryTextObject(text: "a")
        texte.sourceLanguage = "de"
        XCTAssertEqual(ComposerKeyboardStyleFamily.language.indicator(of: texte), .code("DE"))
    }

    func test_indicator_color_isAFilledDotOfTheTextColour() {
        var texte = StoryTextObject(text: "a")
        texte.textColor = "FF2D55"
        XCTAssertEqual(ComposerKeyboardStyleFamily.color.indicator(of: texte), .colorDot(hex: "FF2D55"))
    }

    func test_indicator_outline_isARingOfTheOutlineColour_neutralWithoutOutline() {
        var texte = StoryTextObject(text: "a")
        XCTAssertEqual(ComposerKeyboardStyleFamily.outline.indicator(of: texte),
                       .symbol(name: "circle", emphasis: 0, tint: nil))
        texte.borderWidth = 1
        texte.borderColor = "34C759"
        XCTAssertEqual(ComposerKeyboardStyleFamily.outline.indicator(of: texte),
                       .symbol(name: "circle", emphasis: 0, tint: "34C759"))
    }

    func test_indicator_frame_isItsShapeTintedByTheFrameColour() {
        var texte = StoryTextObject(text: "a")
        texte.frameShape = StoryTextFrameShape.pill.rawValue
        texte.frameBorderWidth = 2
        texte.frameBorderColor = "FF9500"
        XCTAssertEqual(ComposerKeyboardStyleFamily.frame.indicator(of: texte),
                       StoryTextAttributeCycle.indicator(.frame, of: texte))
        guard case .symbol(_, _, let teinte) = ComposerKeyboardStyleFamily.frame.indicator(of: texte) else {
            return XCTFail("le cadre se montre par sa forme")
        }
        XCTAssertEqual(teinte, "FF9500")
    }

    func test_indicator_frameStyle_isTheBackgroundSwatch() {
        let texte = StoryTextObject(text: "a")
        XCTAssertEqual(ComposerKeyboardStyleFamily.frameStyle.indicator(of: texte),
                       StoryTextAttributeCycle.indicator(.background, of: texte))
    }

    // MARK: - Le contour au toucher : 1 pt, puis les couleurs

    func test_quickAdvance_outline_withoutOutline_setsOnePointAndAColour() {
        var texte = StoryTextObject(text: "a")
        ComposerKeyboardStyleFamily.quickAdvance(.border, on: &texte, backgrounds: [])
        XCTAssertEqual(texte.borderWidth, 1)
        XCTAssertEqual(texte.borderColor, TextEditPalette.colors.first)
    }

    func test_quickAdvance_outline_cyclesTheColours_keepingTheWidth() {
        var texte = StoryTextObject(text: "a")
        texte.borderWidth = 6
        texte.borderColor = TextEditPalette.colors[0]
        ComposerKeyboardStyleFamily.quickAdvance(.border, on: &texte, backgrounds: [])
        XCTAssertEqual(texte.borderColor, TextEditPalette.colors[1])
        XCTAssertEqual(texte.borderWidth, 6, "la taille se règle à l'appui long, pas au toucher")
    }

    func test_quickAdvance_outline_afterTheLastColour_removesTheOutline() {
        var texte = StoryTextObject(text: "a")
        texte.borderWidth = 1
        texte.borderColor = TextEditPalette.colors.last
        ComposerKeyboardStyleFamily.quickAdvance(.border, on: &texte, backgrounds: [])
        XCTAssertEqual(texte.borderWidth ?? 0, 0)
    }

    func test_quickAdvance_otherTools_followTheSDKRotation() {
        var attendu = StoryTextObject(text: "a")
        var texte = attendu
        StoryTextAttributeCycle.advance(.effect, on: &attendu, backgrounds: [])
        ComposerKeyboardStyleFamily.quickAdvance(.effect, on: &texte, backgrounds: [])
        XCTAssertEqual(texte.textEffect, attendu.textEffect)
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
