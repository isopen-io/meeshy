import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Les attributs à valeurs discrètes du texte (graisse, alignement, contour,
/// forme du cadre) se règlent d'un tap sur la rangée haute : chaque tap avance
/// d'un cran et reboucle, le canvas se redessinant dans la foulée.
///
/// Ce sont ces crans que la rangée haute rend visibles ; s'ils sautent une
/// valeur ou ne rebouclent pas, l'attribut devient inatteignable — le panneau
/// détaillé reste joignable par appui long, mais l'utilisateur n'a aucune
/// raison de le soupçonner.
final class StoryTextAttributeCycleTests: XCTestCase {

    private func text(
        fontWeight: String? = nil,
        textAlign: String? = "center",
        borderWidth: Double? = nil,
        borderColor: String? = nil,
        frameShape: String? = nil,
        backgroundStyle: StoryTextBackgroundStyle? = nil
    ) -> StoryTextObject {
        StoryTextObject(
            id: "t1", text: "Bonjour",
            textAlign: textAlign,
            backgroundStyle: backgroundStyle,
            fontWeight: fontWeight,
            frameShape: frameShape,
            borderColor: borderColor,
            borderWidth: borderWidth
        )
    }

    /// Applique `count` taps et retourne la valeur observée à chaque étape.
    private func trace<T: Equatable>(
        _ tool: TextEditTool, from start: StoryTextObject, taps: Int,
        reading value: (StoryTextObject) -> T
    ) -> [T] {
        var obj = start
        return (0..<taps).map { _ in
            StoryTextAttributeCycle.advance(tool, on: &obj)
            return value(obj)
        }
    }

    // MARK: - Alignement

    func test_align_visitsEveryStepThenWrapsAround() {
        let seen = trace(.align, from: text(textAlign: "left"), taps: 4) { $0.textAlign }
        XCTAssertEqual(seen, ["center", "right", "left", "center"])
    }

    func test_align_whenUnset_departsFromCenter() {
        var obj = text(textAlign: nil)
        StoryTextAttributeCycle.advance(.align, on: &obj)
        XCTAssertEqual(obj.textAlign, "right", "un alignement absent vaut « centre »")
    }

    // MARK: - Contour

    func test_border_visitsEveryStepThenWrapsAround() {
        let seen = trace(.border, from: text(borderWidth: 0), taps: 5) { $0.borderWidth }
        XCTAssertEqual(seen, [2, 4, 8, 12, 0])
    }

    /// Le panneau détaillé pose une valeur continue au slider (pas 0,5).
    /// Reprendre au cran STRICTEMENT supérieur évite de redescendre : un tap
    /// doit toujours épaissir, jamais surprendre en amincissant.
    func test_border_fromAValueBetweenSteps_advancesToTheNextHigherStep() {
        var obj = text(borderWidth: 5.5)
        StoryTextAttributeCycle.advance(.border, on: &obj)
        XCTAssertEqual(obj.borderWidth, 8)
    }

    /// Un contour d'épaisseur non nulle sans couleur ne se voit pas : le tap
    /// qui quitte zéro pose donc le blanc, comme le fait déjà l'ouverture du
    /// panneau détaillé.
    func test_border_leavingZero_postsTheDefaultWhite() {
        var obj = text(borderWidth: 0, borderColor: nil)
        StoryTextAttributeCycle.advance(.border, on: &obj)
        XCTAssertEqual(obj.borderColor, "FFFFFF")
    }

    func test_border_keepsAColourTheUserAlreadyChose() {
        var obj = text(borderWidth: 0, borderColor: "FF2E63")
        StoryTextAttributeCycle.advance(.border, on: &obj)
        XCTAssertEqual(obj.borderColor, "FF2E63")
    }

    /// Revenir à zéro conserve la couleur : l'utilisateur peut remonter le
    /// contour sans avoir à la re-choisir.
    func test_border_returningToZero_keepsTheColour() {
        var obj = text(borderWidth: 12, borderColor: "FF2E63")
        StoryTextAttributeCycle.advance(.border, on: &obj)
        XCTAssertEqual(obj.borderWidth, 0)
        XCTAssertEqual(obj.borderColor, "FF2E63")
    }

    // MARK: - Forme du cadre

    func test_frame_visitsEveryShapeThenWrapsAround() {
        let seen = trace(.frame, from: text(frameShape: StoryTextFrameShape.rounded.rawValue),
                         taps: 7) { $0.parsedFrameShape }
        XCTAssertEqual(seen, [.pill, .rectangle, .diamond, .cloud, .speech,
                              StoryTextFrameShape.none, .rounded])
    }

    func test_frame_includesNoneInTheRotation() {
        var obj = text(frameShape: StoryTextFrameShape.speech.rawValue)
        StoryTextAttributeCycle.advance(.frame, on: &obj)
        XCTAssertEqual(obj.parsedFrameShape, StoryTextFrameShape.none,
                       "après la dernière forme vient Aucun")
    }

    /// Le comportement d'avant posait un fond noir 65 % pour rendre la forme
    /// visible — ce qui recouvrait le texte sans qu'on l'ait demandé. On pose
    /// un liseré : même intention, geste non destructeur.
    func test_frame_leavingNoneLaysAThinBorderRatherThanRepaintingTheText() {
        var obj = text(frameShape: StoryTextFrameShape.none.rawValue)

        StoryTextAttributeCycle.advance(.frame, on: &obj)

        XCTAssertEqual(obj.parsedFrameShape, StoryTextFrameShape.rounded)
        XCTAssertEqual(obj.frameBorderWidth, StoryTextAttributeCycle.defaultFrameBorderWidth)
        XCTAssertEqual(obj.frameBorderColor, "FFFFFF")
        XCTAssertEqual(obj.resolvedBackgroundStyle, StoryTextBackgroundStyle.none,
                       "le fond du texte n'est pas touché")
    }

    func test_frame_keepsAnExistingBackgroundAndAddsNoBorder() {
        var obj = text(frameShape: StoryTextFrameShape.none.rawValue,
                       backgroundStyle: .solid(hex: "6366F1"))

        StoryTextAttributeCycle.advance(.frame, on: &obj)

        XCTAssertEqual(obj.resolvedBackgroundStyle, StoryTextBackgroundStyle.solid(hex: "6366F1"))
        XCTAssertNil(obj.frameBorderWidth, "un fond suffit déjà à rendre la forme visible")
    }

    // MARK: - Rotations nouvellement couvertes

    func test_style_visitsEveryFamilyThenWrapsAround() {
        var obj = text()
        obj.textStyle = StoryTextStyle.bold.rawValue
        var seen: [StoryTextStyle] = []
        for _ in 0..<StoryTextStyle.allCases.count {
            StoryTextAttributeCycle.advance(.style, on: &obj)
            seen.append(obj.parsedTextStyle)
        }
        XCTAssertEqual(Set(seen), Set(StoryTextStyle.allCases))
        XCTAssertEqual(obj.parsedTextStyle, .bold, "un tour complet revient au départ")
    }

    func test_color_visitsEveryPaletteEntryThenWrapsAround() {
        var obj = text()
        obj.textColor = StoryTextColors.palette[0]
        for _ in 0..<StoryTextColors.palette.count {
            StoryTextAttributeCycle.advance(.color, on: &obj)
        }
        XCTAssertEqual(obj.textColor, StoryTextColors.palette[0])
    }

    /// La rotation doit écrire `backgroundStyle` ET purger le champ legacy
    /// `textBg` : sinon le renderer, qui préfère `backgroundStyle` mais lit
    /// encore `textBg` en repli, garderait un fond fantôme.
    func test_background_advancesAndClearsTheLegacyField() {
        var obj = text()
        obj.textBg = "123456"
        StoryTextAttributeCycle.advance(.background, on: &obj)

        XCTAssertNil(obj.textBg)
        XCTAssertEqual(obj.backgroundStyle, StoryTextBackgroundPresets.all[1])
    }

    func test_background_wrapsAroundTheWholePresetList() {
        var obj = text()
        obj.backgroundStyle = StoryTextBackgroundPresets.all[0]
        for _ in 0..<StoryTextBackgroundPresets.all.count {
            StoryTextAttributeCycle.advance(.background, on: &obj)
        }
        XCTAssertEqual(obj.resolvedBackgroundStyle, StoryTextBackgroundPresets.all[0])
    }

    func test_language_visitsEveryOfferedCodeThenWrapsAround() {
        let codes = TextEditToolOptions.languageChoices(current: nil)
        var obj = text()
        obj.sourceLanguage = codes[0]
        for _ in 0..<codes.count {
            StoryTextAttributeCycle.advance(.language, on: &obj)
        }
        XCTAssertEqual(obj.sourceLanguage, codes[0])
    }

    // MARK: - Indicateurs

    /// Le bouton montre l'état courant, pas un pictogramme figé : sans cela
    /// une rotation à l'aveugle demande de deviner où l'on en est.
    func test_indicator_followsTheCurrentValue() {
        XCTAssertEqual(
            StoryTextAttributeCycle.indicator(.align, of: text(textAlign: "right")),
            .symbol(name: "text.alignright", emphasis: 0))
        XCTAssertEqual(
            StoryTextAttributeCycle.indicator(.frame, of: text(frameShape: "pill")),
            .symbol(name: "capsule", emphasis: 0))
    }

    /// Le contour n'a pas de pictogramme par valeur : c'est l'épaisseur du
    /// trait qui porte l'information, et zéro se distingue par un tracé
    /// discontinu.
    func test_indicator_forBorder_rendersItsThicknessAsStrokeEmphasis() {
        XCTAssertEqual(
            StoryTextAttributeCycle.indicator(.border, of: text(borderWidth: 0)),
            .symbol(name: "square.dashed", emphasis: 0))
        let thickest = StoryTextAttributeCycle.indicator(.border, of: text(borderWidth: 12))
        let thinnest = StoryTextAttributeCycle.indicator(.border, of: text(borderWidth: 2))
        guard case .symbol(_, let heavy, _) = thickest,
              case .symbol(_, let light, _) = thinnest else {
            return XCTFail("le contour doit rendre son épaisseur")
        }
        XCTAssertGreaterThan(heavy, light)
    }

    // MARK: - Les couleurs se lisent sur la bulle

    /// La bulle Couleur montre déjà sa teinte ; le contour du texte doit la
    /// montrer aussi, sinon l'épaisseur se règle à l'aveugle sur la couleur.
    func test_indicator_forBorder_carriesItsColour() {
        let obj = text(borderWidth: 4, borderColor: "FF2E63")
        guard case .symbol(_, _, let tint) = StoryTextAttributeCycle.indicator(.border, of: obj) else {
            return XCTFail("le contour doit rester un symbole")
        }
        XCTAssertEqual(tint, "FF2E63")
    }

    /// Sans trait, il n'y a pas de couleur à annoncer — la bulle reprend la
    /// teinte neutre du verre.
    func test_indicator_forBorder_withoutAStroke_carriesNoColour() {
        guard case .symbol(_, _, let tint) =
                StoryTextAttributeCycle.indicator(.border, of: text(borderWidth: 0, borderColor: "FF2E63")) else {
            return XCTFail("le contour doit rester un symbole")
        }
        XCTAssertNil(tint)
    }

    func test_indicator_forFrame_carriesItsBorderColour() {
        var obj = text(frameShape: StoryTextFrameShape.pill.rawValue)
        obj.frameBorderWidth = 3
        obj.frameBorderColor = "34D399"
        guard case .symbol(_, _, let tint) = StoryTextAttributeCycle.indicator(.frame, of: obj) else {
            return XCTFail("le cadre doit rester un symbole")
        }
        XCTAssertEqual(tint, "34D399")
    }

    func test_indicator_forFrame_withoutALiseré_carriesNoColour() {
        var obj = text(frameShape: StoryTextFrameShape.pill.rawValue)
        obj.frameBorderWidth = 0
        obj.frameBorderColor = "34D399"
        guard case .symbol(_, _, let tint) = StoryTextAttributeCycle.indicator(.frame, of: obj) else {
            return XCTFail("le cadre doit rester un symbole")
        }
        XCTAssertNil(tint)
    }

    func test_indicator_forStyle_showsTheCurrentFamily() {
        var obj = text()
        obj.textStyle = StoryTextStyle.neon.rawValue
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.style, of: obj),
                       .styledGlyph("Aa", style: .neon))
    }

    func test_indicator_forColor_showsTheCurrentSwatch() {
        var obj = text()
        obj.textColor = "FF2E63"
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.color, of: obj),
                       .colorDot(hex: "FF2E63"))
    }

    func test_indicator_forBackground_distinguishesNoneGlassAndSolid() {
        var obj = text()

        obj.backgroundStyle = StoryTextBackgroundStyle.none
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.background, of: obj),
                       .backgroundSwatch(hex: nil, isGlass: false))

        obj.backgroundStyle = .glass(radius: 24)
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.background, of: obj),
                       .backgroundSwatch(hex: nil, isGlass: true))

        obj.backgroundStyle = .solid(hex: "34D399")
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.background, of: obj),
                       .backgroundSwatch(hex: "34D399", isGlass: false))
    }

    func test_indicator_forLanguage_showsTheUppercasedCode() {
        var obj = text()
        obj.sourceLanguage = "pt-BR"
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.language, of: obj),
                       .code("PT"))
    }

    // MARK: - Effet (#4870)

    /// Le cycle visite les quatre valeurs et reboucle sur « aucun » : un effet
    /// doit pouvoir se RETIRER d'un tap, pas seulement se changer.
    func test_effect_visitsEveryStepThenWrapsAround() {
        let seen = trace(.effect, from: text(), taps: 4) { $0.textEffect }
        XCTAssertEqual(seen, ["glow", "shadow", "relief", nil])
    }

    /// « Aucun » s'écrit `nil`, jamais `"none"` : un texte sans effet garde le
    /// JSON qu'il avait, et un blob publié ne change pas de forme.
    func test_effect_returningToNone_writesNil() {
        var obj = text()
        obj.textEffect = "relief"
        StoryTextAttributeCycle.advance(.effect, on: &obj)
        XCTAssertNil(obj.textEffect)
        XCTAssertEqual(obj.parsedTextEffect, StoryTextEffect.none)
    }

    /// Une valeur inconnue (client plus récent) repart du début plutôt que de
    /// bloquer la rotation.
    func test_effect_fromAnUnknownValue_restartsTheCycle() {
        var obj = text()
        obj.textEffect = "effect-from-the-future"
        StoryTextAttributeCycle.advance(.effect, on: &obj)
        XCTAssertEqual(obj.textEffect, "glow")
    }

    /// La bulle rend « Aa » AVEC l'effet courant — pas un pictogramme figé.
    func test_indicator_forEffect_showsTheCurrentEffect() {
        var obj = text()
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.effect, of: obj),
                       .effectGlyph("Aa", effect: StoryTextEffect.none))
        obj.textEffect = "shadow"
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.effect, of: obj),
                       .effectGlyph("Aa", effect: .shadow))
    }
}
