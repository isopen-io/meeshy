import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Les réglages d'un outil de texte se composent par PARTIES** (#13839, L4) :
/// la barre collée au clavier regroupe les huit outils en quatre familles, et
/// une famille peut demander un outil sans sa palette (une seule palette par
/// panneau) ou la graisse sans l'alignement. Aucun hôte existant ne change :
/// sans omission, chaque outil garde toutes ses parties.
final class TextEditOptionPartsTests: XCTestCase {

    func test_parts_withoutOmission_keepEveryControlOfEachTool() {
        XCTAssertEqual(TextEditToolOptions.parts(for: .style, omitting: []), [.size, .fonts])
        XCTAssertEqual(TextEditToolOptions.parts(for: .effect, omitting: []), [.effects])
        XCTAssertEqual(TextEditToolOptions.parts(for: .color, omitting: []), [.colors])
        XCTAssertEqual(TextEditToolOptions.parts(for: .align, omitting: []), [.weight, .alignment])
        XCTAssertEqual(TextEditToolOptions.parts(for: .background, omitting: []), [.backgrounds])
        XCTAssertEqual(TextEditToolOptions.parts(for: .frame, omitting: []),
                       [.frameShapes, .framePadding, .frameBorderWidth, .frameBorderPalette])
        XCTAssertEqual(TextEditToolOptions.parts(for: .border, omitting: []), [.borderWidth, .borderPalette])
        XCTAssertEqual(TextEditToolOptions.parts(for: .language, omitting: []), [.language])
    }

    func test_parts_alignOmittingAlignment_isTheWeightAlone() {
        XCTAssertEqual(TextEditToolOptions.parts(for: .align, omitting: [.alignment]), [.weight])
    }

    func test_parts_alignOmittingWeight_isTheAlignmentAlone() {
        XCTAssertEqual(TextEditToolOptions.parts(for: .align, omitting: [.weight]), [.alignment])
    }

    func test_parts_borderOmittingItsPalette_keepsTheWidth() {
        XCTAssertEqual(TextEditToolOptions.parts(for: .border, omitting: [.borderPalette]), [.borderWidth])
    }

    func test_parts_frameOmittingItsPalette_keepsShapesAndSliders() {
        XCTAssertEqual(TextEditToolOptions.parts(for: .frame, omitting: [.frameBorderPalette]),
                       [.frameShapes, .framePadding, .frameBorderWidth])
    }

    func test_paletteParts_areExactlyTheThreeColourRows() {
        XCTAssertEqual(Set(TextEditOptionPart.allCases.filter(\.isPalette)),
                       [.colors, .frameBorderPalette, .borderPalette])
    }
}

/// **« Néon » n'a qu'une entrée, dans Effet** (#13839, inventaire G3, doublon 3) :
/// la POLICE qui portait le même nom se lit désormais « Lumière ». Elle reste
/// dans la grille — aucun réglage ne disparaît, les textes déjà posés en Néon
/// gardent leur police.
@MainActor
final class TextEditNeonSingleEntryTests: XCTestCase {

    func test_styleNeon_doesNotShareItsNameWithTheNeonEffect() {
        XCTAssertNotEqual(TextEditLabels.title(for: StoryTextStyle.neon),
                          TextEditLabels.title(for: StoryTextEffect.neon))
    }

    func test_styleTitles_neverRepeatAnEffectTitle() {
        let polices = Set(StoryTextStyle.allCases.map { TextEditLabels.title(for: $0) })
        let effets = Set(StoryTextEffect.allCases.map { TextEditLabels.title(for: $0) })
        XCTAssertTrue(polices.isDisjoint(with: effets),
                      "Un même mot dans la grille des polices et dans celle des effets : \(polices.intersection(effets))")
    }

    func test_neonStyle_staysInTheFontGrid() {
        XCTAssertTrue(StoryTextStyle.allCases.contains(.neon))
    }
}

/// **Une seule palette pour la couleur, le contour et le cadre** (#13839,
/// doublon 4) : la même rangée de pastilles écrit l'attribut de la cible
/// choisie, avec les mêmes effets de bord que les trois palettes qu'elle
/// remplace — une couleur de contour ou de liseré posée sur une épaisseur
/// nulle rend un trait visible.
final class TextEditPaletteTests: XCTestCase {

    private func texte() -> StoryTextObject { StoryTextObject(id: "t1", text: "Salut") }

    func test_applying_text_writesTheTextColorOnly() {
        let resultat = TextEditPalette.applying("FF2E63", to: .text, on: texte())
        XCTAssertEqual(resultat.textColor, "FF2E63")
        XCTAssertNil(resultat.borderColor)
        XCTAssertNil(resultat.frameBorderColor)
    }

    func test_applying_border_onANeutralText_givesItAVisibleWidth() {
        let resultat = TextEditPalette.applying("08D9D6", to: .border, on: texte())
        XCTAssertEqual(resultat.borderColor, "08D9D6")
        XCTAssertEqual(resultat.borderWidth, 4)
    }

    func test_applying_border_keepsAnExistingWidth() {
        var depart = texte()
        depart.borderWidth = 7
        XCTAssertEqual(TextEditPalette.applying("000000", to: .border, on: depart).borderWidth, 7)
    }

    func test_applying_frame_onANeutralText_givesTheFrameItsDefaultWidth() {
        let resultat = TextEditPalette.applying("F8B500", to: .frame, on: texte())
        XCTAssertEqual(resultat.frameBorderColor, "F8B500")
        XCTAssertEqual(resultat.frameBorderWidth, StoryTextAttributeCycle.defaultFrameBorderWidth)
    }

    func test_selected_readsTheTargetAttribute_caseInsensitively() {
        var depart = texte()
        depart.textColor = "ffffff"
        depart.borderColor = "ff2e63"
        XCTAssertEqual(TextEditPalette.selected(.text, in: depart, among: ["FFFFFF", "FF2E63"]), "FFFFFF")
        XCTAssertEqual(TextEditPalette.selected(.border, in: depart, among: ["FFFFFF", "FF2E63"]), "FF2E63")
        XCTAssertNil(TextEditPalette.selected(.frame, in: depart, among: ["FFFFFF", "FF2E63"]))
    }

    func test_selected_text_withoutAColour_isWhite() {
        XCTAssertEqual(TextEditPalette.selected(.text, in: texte(), among: TextEditPalette.colors), "FFFFFF")
    }

    func test_targets_coverTheThreePaletteParts() {
        XCTAssertEqual(Set(TextEditPaletteTarget.allCases.map(\.part)), Set(TextEditOptionPart.allCases.filter(\.isPalette)))
    }
}
