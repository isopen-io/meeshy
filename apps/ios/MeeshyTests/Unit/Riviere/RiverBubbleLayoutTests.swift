import XCTest
@testable import Meeshy

/// `RiverBubbleLayout.initials` — pur, testable sans monter `RiverBubbleView`
/// (§ « ce que tu peux éprouver sans runtime UIKit complet »).
final class RiverBubbleLayoutTests: XCTestCase {

    func test_initials_twoWords_takesFirstLetterOfEach() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: "Marie Curie"), "MC")
    }

    func test_initials_oneWord_takesFirstLetterOnly() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: "Bob"), "B")
    }

    func test_initials_threeWords_takesOnlyFirstTwo() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: "Jean de La Fontaine"), "JD")
    }

    func test_initials_uppercasesLowercaseInput() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: "marie curie"), "MC")
    }

    func test_initials_extraWhitespace_isIgnored() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: "  Marie   Curie  "), "MC")
    }

    func test_initials_emptyName_returnsPlaceholder() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: ""), "?")
    }

    func test_initials_whitespaceOnlyName_returnsPlaceholder() {
        XCTAssertEqual(RiverBubbleLayout.initials(for: "   "), "?")
    }

    func test_initials_toi_isTreatedAsAnyOtherWord_noSpecialCase() {
        // Le SENS de « Toi » (résolution `isViewer`) est une affaire de
        // l'appelant, jamais de ce calcul purement typographique.
        XCTAssertEqual(RiverBubbleLayout.initials(for: "Toi"), "T")
    }

    // MARK: - Lot G : quels bords un contour de groupe ferme, lequel il partage

    /// Le bord PARTAGÉ (pointillé) est le haut d'une bulle qui continue un
    /// groupe ; une tête ou une bulle seule n'en a pas. Le bas n'est fermé que
    /// sur la queue ou la bulle seule — sinon la bulle suivante vient s'y
    /// coller et c'est ELLE qui dessine la jointure.
    func test_groupPosition_joins_aboveForContinuations_belowForHeadsAndMiddles() {
        XCTAssertFalse(RiverGroupPosition.solo.joinsAbove);   XCTAssertFalse(RiverGroupPosition.solo.joinsBelow)
        XCTAssertFalse(RiverGroupPosition.head.joinsAbove);   XCTAssertTrue(RiverGroupPosition.head.joinsBelow)
        XCTAssertTrue(RiverGroupPosition.middle.joinsAbove);  XCTAssertTrue(RiverGroupPosition.middle.joinsBelow)
        XCTAssertTrue(RiverGroupPosition.tail.joinsAbove);    XCTAssertFalse(RiverGroupPosition.tail.joinsBelow)
    }

    /// Les coins ne s'arrondissent qu'aux EXTRÉMITÉS du groupe : un contour
    /// joint est droit là où il rencontre son voisin, sinon le fond continu
    /// laisserait deux encoches au milieu du groupe.
    func test_groupOutline_cornerRadii_roundOnlyTheGroupsOuterCorners() {
        let r: CGFloat = 14
        let solo = RiverBubbleOutline.cornerRadii(position: .solo, radius: r)
        XCTAssertEqual([solo.topLeading, solo.topTrailing, solo.bottomLeading, solo.bottomTrailing], [r, r, r, r])
        let head = RiverBubbleOutline.cornerRadii(position: .head, radius: r)
        XCTAssertEqual([head.topLeading, head.topTrailing, head.bottomLeading, head.bottomTrailing], [r, r, 0, 0])
        let middle = RiverBubbleOutline.cornerRadii(position: .middle, radius: r)
        XCTAssertEqual([middle.topLeading, middle.topTrailing, middle.bottomLeading, middle.bottomTrailing], [0, 0, 0, 0])
        let tail = RiverBubbleOutline.cornerRadii(position: .tail, radius: r)
        XCTAssertEqual([tail.topLeading, tail.topTrailing, tail.bottomLeading, tail.bottomTrailing], [0, 0, r, r])
    }

    /// Le contour plein d'une bulle jointe est OUVERT du côté partagé : son
    /// chemin ne touche pas ce bord (la bordure y est le pointillé, dessiné à
    /// part), et il touche l'autre.
    func test_groupOutline_solidPath_isOpenOnTheSharedEdge() {
        let rect = CGRect(x: 0, y: 0, width: 200, height: 100)
        let head = RiverBubbleOutline(position: .head, cornerRadius: 14, lineWidth: 2).path(in: rect).boundingRect
        XCTAssertEqual(head.minY, 1, accuracy: 0.01, "la tête ferme le haut (inset d'un demi-trait)")
        let tail = RiverBubbleOutline(position: .tail, cornerRadius: 14, lineWidth: 2).path(in: rect).boundingRect
        XCTAssertEqual(tail.maxY, 99, accuracy: 0.01, "la queue ferme le bas (inset d'un demi-trait)")
        let middle = RiverBubbleOutline(position: .middle, cornerRadius: 14, lineWidth: 2).path(in: rect)
        XCTAssertFalse(middle.isEmpty, "un milieu garde ses deux flancs")
        XCTAssertEqual(middle.boundingRect.width, 198, accuracy: 0.01, "les flancs seulement, à un demi-trait du bord")
    }

    // MARK: - R-8 : le canvas tolère les rangs que la pile paresseuse n'a pas posés

    /// Dans une pile paresseuse, seuls les rangs VISIBLES publient un cadre.
    /// Un segment de branche qui commence plus haut, ou finit plus bas, doit
    /// quand même se tracer sur la part visible : un rang sans cadre est
    /// AU-DESSUS s'il précède le premier rang connu, AU-DESSOUS s'il suit le
    /// dernier — jamais « absent » (mesuré au simulateur : aucun rail, aucun
    /// connecteur dès que l'on quitte le haut de l'histoire).
    func test_rankPlacement_knownAboveBelow_followsTheKnownRanks() {
        let known: [Int: CGRect] = [
            10: CGRect(x: 0, y: 100, width: 10, height: 10),
            12: CGRect(x: 0, y: 300, width: 10, height: 10),
        ]
        XCTAssertEqual(RiverCanvasRankPlacement.resolve(rank: 10, known: known), .known(known[10]!))
        XCTAssertEqual(RiverCanvasRankPlacement.resolve(rank: 3, known: known), .above)
        XCTAssertEqual(RiverCanvasRankPlacement.resolve(rank: 40, known: known), .below)
        XCTAssertEqual(RiverCanvasRankPlacement.resolve(rank: 11, known: known), .unknown, "entre deux rangs connus sans cadre : rien à supposer")
        XCTAssertEqual(RiverCanvasRankPlacement.resolve(rank: 5, known: [:]), .unknown, "aucun cadre connu : rien à tracer")
    }
}
