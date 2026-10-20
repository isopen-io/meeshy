import XCTest
@testable import Meeshy

/// Retour du chrome du fil « quand on s'approche de la fin du scroll »
/// (directive user 2026-08-21) + escamotage vers les bords.
final class FocalChromeReturnTests: XCTestCase {

    func test_fingerDown_hides_whateverTheDistance() {
        XCTAssertTrue(FocalChromeReturn.isHidden(isTracking: true, isDecelerating: false, remainingDistance: nil))
        XCTAssertTrue(FocalChromeReturn.isHidden(isTracking: true, isDecelerating: true, remainingDistance: 0))
    }

    func test_decelerating_hides_whileFarFromTheTarget_andShows_whenApproaching() {
        XCTAssertTrue(FocalChromeReturn.isHidden(isTracking: false, isDecelerating: true, remainingDistance: FocalChromeReturn.returnDistance + 1))
        XCTAssertTrue(FocalChromeReturn.isHidden(isTracking: false, isDecelerating: true, remainingDistance: -(FocalChromeReturn.returnDistance + 1)), "dans les deux sens")
        XCTAssertFalse(FocalChromeReturn.isHidden(isTracking: false, isDecelerating: true, remainingDistance: FocalChromeReturn.returnDistance))
        XCTAssertFalse(FocalChromeReturn.isHidden(isTracking: false, isDecelerating: true, remainingDistance: 12))
    }

    func test_decelerating_withoutAKnownTarget_shows() {
        XCTAssertFalse(FocalChromeReturn.isHidden(isTracking: false, isDecelerating: true, remainingDistance: nil))
    }

    func test_atRest_shows() {
        XCTAssertFalse(FocalChromeReturn.isHidden(isTracking: false, isDecelerating: false, remainingDistance: nil))
    }

    func test_edgeHiddenChrome_slidesTowardsItsEdge_andNotAtAll_whenShown() {
        XCTAssertEqual(EdgeHiddenChrome.offset(isHidden: true, edge: .top), -FocalMetrics.HiddenChrome.edgeTravel)
        XCTAssertEqual(EdgeHiddenChrome.offset(isHidden: true, edge: .bottom), FocalMetrics.HiddenChrome.edgeTravel)
        XCTAssertEqual(EdgeHiddenChrome.offset(isHidden: false, edge: .top), 0)
        XCTAssertEqual(EdgeHiddenChrome.offset(isHidden: false, edge: .bottom), 0)
    }

    // MARK: - Structure

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    private func normalized(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.text(at: Self.iosRoot.appendingPathComponent(relativePath)))
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }

    func test_host_decidesTheChromeWithTheRule_fromTheDecelerationTarget() throws {
        let code = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(code.contains("setChromeHiddenForScroll(FocalChromeReturn.isHidden( isTracking: scrollView.isTracking, isDecelerating: scrollView.isDecelerating, remainingDistance: decelerationTargetOffsetY.map { $0 - scrollView.contentOffset.y } ) && keyboardFirst.chromeMayCollapse)"),
                      "Le chrome suit la règle, alimentée par l'offset d'arrivée de la décélération.")
        XCTAssertTrue(code.contains("func scrollViewWillEndDragging(_ scrollView: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>) { decelerationTargetOffsetY = targetContentOffset.pointee.y }"),
                      "L'offset d'arrivée est capturé à la fin du geste.")
        XCTAssertFalse(code.contains("setChromeHiddenForScroll(scrollView.isTracking)"),
                       "Plus de retour à la simple levée du doigt.")
    }

    func test_conversationView_slidesEachChromePiece_towardsItsOwnEdge() throws {
        let code = try normalized("Meeshy/Features/Main/Views/ConversationView.swift")
        let band = try normalized("Meeshy/Features/Main/Views/ConversationExpandedHeaderBand.swift")
        let stage = try normalized("Meeshy/Features/Main/Views/ConversationLayers/ConversationBodyStage.swift")
        XCTAssertTrue(code.contains("hidesBandForScroll: hidesEntireHeaderForScroll"), "l'hôte remet à la section la loi de l'en-tête")
        XCTAssertTrue(band.contains("expandedBand() .hiddenTowardsEdge(hidesBandForScroll, .top)"), "l'en-tête glisse vers le HAUT, DANS le corps de la section")
        XCTAssertTrue(code.contains("hidesComposerChrome: hidesComposerChromeForScroll"), "l'hôte remet à la scène la loi du composeur")
        XCTAssertTrue(stage.contains(".hiddenTowardsEdge(hidesComposerChrome, .bottom)"), "le composeur glisse vers le BAS")
        XCTAssertEqual(stage.components(separatedBy: ".hiddenTowardsEdge(hidesComposerChrome, .bottom)").count - 1, 1,
                       "le composeur seul glisse vers le bas — la bulle « retour en bas » reste (#8002)")
        XCTAssertFalse(code.contains(".opacity(hidesComposerChromeForScroll ? 0 : 1)"), "plus de simple fondu sans glissement")
        XCTAssertFalse(code.contains("else if hidesEntireHeaderForScroll {"), "plus de démontage de l'en-tête")
    }
}
