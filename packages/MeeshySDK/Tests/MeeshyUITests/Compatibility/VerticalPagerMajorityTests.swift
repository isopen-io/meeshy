import XCTest
import CoreGraphics
@testable import MeeshyUI

/// La page élue d'un pager vertical est celle dont PLUS de la moitié est
/// visible (#9837) — jamais celle au bord d'attaque de la zone visible.
final class VerticalPagerMajorityTests: XCTestCase {

    private let height: CGFloat = 874

    private func viewport(scrolledBy offset: CGFloat) -> CGRect {
        CGRect(x: 0, y: offset, width: 402, height: height)
    }

    func test_pageAtRest_isElected() {
        XCTAssertTrue(VerticalPagerMajority.isMajorityVisible(pageHeight: height, viewport: viewport(scrolledBy: 0)))
    }

    func test_nextPage_isElectedAsSoonAsItCrossesHalf_duringTheGesture() {
        // Le voisin du dessous montre 51 % de lui-même : la zone visible, dans
        // SON repère, commence 49 % au-dessus de son bord haut.
        let next = viewport(scrolledBy: -height * 0.49)
        XCTAssertTrue(VerticalPagerMajority.isMajorityVisible(pageHeight: height, viewport: next),
                      "le voisin occupe 51 % de l'écran : il doit être élu sans attendre la fin de la décélération")
    }

    func test_leavingPage_isNoLongerElected_onceLessThanHalfRemains() {
        let leaving = viewport(scrolledBy: height * 0.51)
        XCTAssertFalse(VerticalPagerMajority.isMajorityVisible(pageHeight: height, viewport: leaving))
    }

    func test_previousPage_isNotElected_whileOnlyASliverShows() {
        let previous = viewport(scrolledBy: height * 0.95)
        XCTAssertFalse(VerticalPagerMajority.isMajorityVisible(pageHeight: height, viewport: previous),
                       "en arrière, un liseré du réel précédent ne doit pas couper celui qu'on regarde")
    }

    func test_exactHalf_electsNeitherPage() {
        let leaving = viewport(scrolledBy: height / 2)
        let arriving = viewport(scrolledBy: -height / 2)
        XCTAssertFalse(VerticalPagerMajority.isMajorityVisible(pageHeight: height, viewport: leaving))
        XCTAssertFalse(VerticalPagerMajority.isMajorityVisible(pageHeight: height, viewport: arriving))
    }

    func test_noScrollView_orEmptyPage_electsNothing() {
        XCTAssertFalse(VerticalPagerMajority.isMajorityVisible(pageHeight: height, viewport: nil))
        XCTAssertFalse(VerticalPagerMajority.isMajorityVisible(pageHeight: 0, viewport: viewport(scrolledBy: 0)))
    }
}
