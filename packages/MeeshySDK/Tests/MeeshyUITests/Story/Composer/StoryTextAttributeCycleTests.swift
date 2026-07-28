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

    // MARK: - Graisse

    func test_weight_visitsEveryStepThenWrapsAround() {
        let seen = trace(.weight, from: text(fontWeight: StoryTextWeight.thin.rawValue),
                         taps: 5) { $0.parsedFontWeight }
        XCTAssertEqual(seen, [.normal, .semibold, .bold, .thin, .normal],
                       "les quatre graisses doivent défiler puis reboucler sur la première")
    }

    /// Une graisse absente signifie « celle du style » : la traiter comme
    /// `normal` donne un point de départ prévisible, alors qu'un `nil` propagé
    /// ferait sauter le premier tap dans le vide.
    func test_weight_whenUnset_departsFromNormal() {
        var obj = text(fontWeight: nil)
        StoryTextAttributeCycle.advance(.weight, on: &obj)
        XCTAssertEqual(obj.parsedFontWeight, .semibold)
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

    /// Une forme de cadre sans fond ne se voit pas. Le panneau détaillé pose
    /// déjà un fond discret dans ce cas ; le tap doit faire de même, sinon la
    /// rotation paraît sans effet.
    func test_frame_withoutABackground_postsOne() {
        var obj = text(frameShape: nil, backgroundStyle: nil)
        StoryTextAttributeCycle.advance(.frame, on: &obj)
        guard case .solid(let hex) = obj.resolvedBackgroundStyle else {
            return XCTFail("un cadrage sans fond doit poser un fond visible")
        }
        XCTAssertEqual(hex, "000000A6")
    }

    func test_frame_neverReplacesABackgroundTheUserChose() {
        var obj = text(frameShape: nil, backgroundStyle: .solid(hex: "6366F1"))
        StoryTextAttributeCycle.advance(.frame, on: &obj)
        guard case .solid(let hex) = obj.resolvedBackgroundStyle else {
            return XCTFail("le fond choisi doit survivre au changement de forme")
        }
        XCTAssertEqual(hex, "6366F1")
    }

    // MARK: - Indicateurs

    /// Le bouton montre l'état courant, pas un pictogramme figé : sans cela
    /// une rotation à l'aveugle demande de deviner où l'on en est.
    func test_indicator_followsTheCurrentValue() {
        XCTAssertEqual(
            StoryTextAttributeCycle.indicator(.align, of: text(textAlign: "right")),
            .symbol(name: "text.alignright", emphasis: 0))
        XCTAssertEqual(
            StoryTextAttributeCycle.indicator(.weight, of: text(fontWeight: "bold")),
            .glyph("A", weight: .bold))
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
        guard case .symbol(_, let heavy) = thickest, case .symbol(_, let light) = thinnest else {
            return XCTFail("le contour doit rendre son épaisseur")
        }
        XCTAssertGreaterThan(heavy, light)
    }
}
