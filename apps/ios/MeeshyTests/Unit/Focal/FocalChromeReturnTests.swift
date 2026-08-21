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
        AppSourceGuard.stripComments(try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }

    func test_host_decidesTheChromeWithTheRule_fromTheDecelerationTarget() throws {
        let code = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(code.contains("setChromeHiddenForScroll(FocalChromeReturn.isHidden( isTracking: scrollView.isTracking, isDecelerating: scrollView.isDecelerating, remainingDistance: decelerationTargetOffsetY.map { $0 - scrollView.contentOffset.y } ))"),
                      "Le chrome suit la règle, alimentée par l'offset d'arrivée de la décélération.")
        XCTAssertTrue(code.contains("func scrollViewWillEndDragging(_ scrollView: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>) { decelerationTargetOffsetY = targetContentOffset.pointee.y }"),
                      "L'offset d'arrivée est capturé à la fin du geste.")
        XCTAssertFalse(code.contains("setChromeHiddenForScroll(scrollView.isTracking)"),
                       "Plus de retour à la simple levée du doigt.")
    }

    func test_conversationView_slidesEachChromePiece_towardsItsOwnEdge() throws {
        let code = try normalized("Meeshy/Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(code.contains("AnyView(expandedHeaderBand.hiddenTowardsEdge(hidesEntireHeaderForScroll, .top))"), "l'en-tête glisse vers le HAUT")
        XCTAssertTrue(code.contains(".hiddenTowardsEdge(hidesComposerChromeForScroll, .bottom)"), "le composeur et la bulle « retour en bas » glissent vers le BAS")
        XCTAssertEqual(code.components(separatedBy: ".hiddenTowardsEdge(hidesComposerChromeForScroll, .bottom)").count - 1, 2,
                       "composeur + bulle : deux composants vers le bas")
        XCTAssertFalse(code.contains(".opacity(hidesComposerChromeForScroll ? 0 : 1)"), "plus de simple fondu sans glissement")
        XCTAssertFalse(code.contains("else if hidesEntireHeaderForScroll { AnyView(EmptyView()) }"), "plus de démontage de l'en-tête")
    }
}
