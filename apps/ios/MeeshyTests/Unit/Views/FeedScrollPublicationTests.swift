import XCTest
import MeeshyUI
@testable import Meeshy

/// **Le fil ne republie pas sa géométrie à chaque image** (#7625).
///
/// L'offset relayé à l'en-tête partait deux fois par image, et la frame de
/// chaque réel / scène une fois par image — chaque écriture forçant une mise à
/// jour du graphe pendant que les rangées suivantes attendaient d'être
/// peintes. Ces lois gardent ce que leurs lecteurs lisent vraiment.
final class FeedScrollPublicationTests: XCTestCase {

    // MARK: - Offset relayé à l'en-tête

    /// Le relais publie sur `willSet`, valeur changée ou non : le fil ne doit
    /// donc pas réécrire une valeur identique (deux sources par image).
    func test_relayFeedOffset_sameValueTwice_publishesOnlyTheChange() {
        let relay = ScrollOffsetRelay()
        var publications = 0
        let subscription = relay.objectWillChange.sink { publications += 1 }

        relay.relayFeedOffset(-1_000)
        relay.relayFeedOffset(-1_000)
        relay.relayFeedOffset(-1_005)

        XCTAssertEqual(publications, 2, "la seconde écriture identique ne publie rien ; la suivante, si")
        XCTAssertEqual(relay.offset, -1_005)
        subscription.cancel()
    }

    // MARK: - Frame d'un réel rapportée au coordinateur d'autoplay

    /// L'élection cherche le réel le plus CENTRÉ : un pas de quelques points
    /// ne change pas le gagnant.
    func test_reportedMidY_absorbsSubStepMotion() {
        XCTAssertEqual(FeedScrollPublication.reportedMidY(401), FeedScrollPublication.reportedMidY(407))
        XCTAssertNotEqual(FeedScrollPublication.reportedMidY(401), FeedScrollPublication.reportedMidY(460))
    }

    func test_reportedMidY_staysWithinHalfAStepOfTheTruth() {
        for value in stride(from: -900.0, through: 900.0, by: 13.7) {
            XCTAssertLessThanOrEqual(abs(FeedScrollPublication.reportedMidY(CGFloat(value)) - CGFloat(value)),
                                     FeedScrollPublication.frameStep / 2)
        }
    }
}
