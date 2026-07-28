import XCTest
@testable import MeeshyUI

/// La timeline défilait sans le dire : pas d'indicateur, et pour seule prise le
/// fond laissé libre entre les clips. Ces règles sont celles de la poignée qui
/// répond enfin à « où suis-je, et que reste-t-il à droite ? ».
final class TimelineScrollMetricsTests: XCTestCase {

    // MARK: - Raison d'être

    func test_notNeeded_whenEverythingFitsOnScreen() {
        XCTAssertFalse(TimelineScrollMetrics.isNeeded(contentWidth: 300, viewportWidth: 390))
    }

    /// Contenu exactement de la taille de la fenêtre : rien à faire défiler.
    /// Une poignée pleine largeur et immobile serait un contrôle sans effet.
    func test_notNeeded_whenContentMatchesTheViewport() {
        XCTAssertFalse(TimelineScrollMetrics.isNeeded(contentWidth: 390, viewportWidth: 390))
    }

    func test_needed_whenContentOverflows() {
        XCTAssertTrue(TimelineScrollMetrics.isNeeded(contentWidth: 1200, viewportWidth: 390))
    }

    // MARK: - Avancement

    func test_progress_isZeroAtTheStart() {
        XCTAssertEqual(TimelineScrollMetrics.progress(scrollX: 0, contentWidth: 1200,
                                                      viewportWidth: 400), 0, accuracy: 0.001)
    }

    func test_progress_isOneAtTheEnd() {
        XCTAssertEqual(TimelineScrollMetrics.progress(scrollX: 800, contentWidth: 1200,
                                                      viewportWidth: 400), 1, accuracy: 0.001)
    }

    func test_progress_isHalfwayInTheMiddle() {
        XCTAssertEqual(TimelineScrollMetrics.progress(scrollX: 400, contentWidth: 1200,
                                                      viewportWidth: 400), 0.5, accuracy: 0.001)
    }

    /// Le rebond élastique d'iOS produit des décalages négatifs, et au-delà de
    /// la fin. La poignée doit rester dans sa piste plutôt que d'en sortir.
    func test_progress_clampsElasticOverscroll() {
        XCTAssertEqual(TimelineScrollMetrics.progress(scrollX: -60, contentWidth: 1200,
                                                      viewportWidth: 400), 0, accuracy: 0.001)
        XCTAssertEqual(TimelineScrollMetrics.progress(scrollX: 3000, contentWidth: 1200,
                                                      viewportWidth: 400), 1, accuracy: 0.001)
    }

    /// Contenu plus court que la fenêtre : aucune division par zéro.
    func test_progress_isZeroWhenNothingScrolls() {
        XCTAssertEqual(TimelineScrollMetrics.progress(scrollX: 50, contentWidth: 200,
                                                      viewportWidth: 400), 0, accuracy: 0.001)
    }

    // MARK: - Largeur du curseur

    /// La largeur DIT quelle part du contenu tient à l'écran : un tiers visible,
    /// un tiers de piste.
    func test_thumbWidth_mirrorsTheVisibleShare() {
        let w = TimelineScrollMetrics.thumbWidth(trackWidth: 300, contentWidth: 1200,
                                                 viewportWidth: 400)
        XCTAssertEqual(w, 100, accuracy: 0.5)
    }

    /// Sur une timeline très longue, la proportion exacte donnerait un curseur
    /// de quelques points, impossible à attraper au doigt.
    func test_thumbWidth_neverFallsBelowTheGrabbableMinimum() {
        let w = TimelineScrollMetrics.thumbWidth(trackWidth: 300, contentWidth: 40_000,
                                                 viewportWidth: 400)
        XCTAssertEqual(w, TimelineScrollMetrics.minimumThumbWidth, accuracy: 0.001)
    }

    func test_thumbWidth_neverExceedsTheTrack() {
        let w = TimelineScrollMetrics.thumbWidth(trackWidth: 300, contentWidth: 200,
                                                 viewportWidth: 400)
        XCTAssertEqual(w, 300, accuracy: 0.001)
    }

    // MARK: - Position du curseur

    func test_thumbX_restsAtTheLeadingEdgeAtStart() {
        XCTAssertEqual(TimelineScrollMetrics.thumbX(progress: 0, trackWidth: 300,
                                                    thumbWidth: 100), 0, accuracy: 0.001)
    }

    /// En fin de course, le curseur touche le bord droit — il ne le dépasse pas.
    func test_thumbX_endsFlushWithTheTrailingEdge() {
        XCTAssertEqual(TimelineScrollMetrics.thumbX(progress: 1, trackWidth: 300,
                                                    thumbWidth: 100), 200, accuracy: 0.001)
    }

    // MARK: - Réciprocité

    /// Poser le curseur puis le relire ne doit pas le faire sauter : sans cette
    /// symétrie, chaque glissement produirait un décrochage visible.
    func test_thumbXAndScrollX_areExactInverses() {
        let track: CGFloat = 300, content: CGFloat = 1200, viewport: CGFloat = 400
        let thumb = TimelineScrollMetrics.thumbWidth(trackWidth: track, contentWidth: content,
                                                     viewportWidth: viewport)
        for progress in [0.0, 0.17, 0.5, 0.83, 1.0] as [CGFloat] {
            let x = TimelineScrollMetrics.thumbX(progress: progress, trackWidth: track,
                                                 thumbWidth: thumb)
            let scrollX = TimelineScrollMetrics.scrollX(forThumbX: x, trackWidth: track,
                                                        thumbWidth: thumb,
                                                        contentWidth: content,
                                                        viewportWidth: viewport)
            let roundTrip = TimelineScrollMetrics.progress(scrollX: scrollX,
                                                           contentWidth: content,
                                                           viewportWidth: viewport)
            XCTAssertEqual(roundTrip, progress, accuracy: 0.001,
                           "avancement \(progress) ne revient pas sur lui-même")
        }
    }

    /// Tirer la poignée au-delà du bord ne dépasse jamais la fin du contenu.
    func test_scrollX_clampsBeyondTheTrack() {
        let target = TimelineScrollMetrics.scrollX(forThumbX: 9_999, trackWidth: 300,
                                                   thumbWidth: 100, contentWidth: 1200,
                                                   viewportWidth: 400)
        XCTAssertEqual(target, 800, accuracy: 0.001)
    }

    func test_scrollX_isZeroWhenNothingScrolls() {
        let target = TimelineScrollMetrics.scrollX(forThumbX: 120, trackWidth: 300,
                                                   thumbWidth: 300, contentWidth: 200,
                                                   viewportWidth: 400)
        XCTAssertEqual(target, 0, accuracy: 0.001)
    }
}
