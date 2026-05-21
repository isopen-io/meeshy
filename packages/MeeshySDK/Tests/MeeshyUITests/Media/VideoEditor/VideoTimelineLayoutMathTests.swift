import XCTest
import CoreGraphics
@testable import MeeshyUI

/// Pin l'algorithme « auto-follow with hold » de la timeline du video editor.
///
/// Cas couverts :
/// 1. **Strip plus court que le viewport** : ancré à gauche, playhead libre.
/// 2. **Strip plus long, zone début (playhead < halfViewport)** : leadingX = 0,
///    la première frame reste visible — **fix du bug « début pas visible »**.
/// 3. **Strip plus long, zone médiane** : playhead pinné au centre, strip
///    translate sous le playhead.
/// 4. **Strip plus long, zone fin** : leadingX clampé pour que la dernière
///    frame reste visible, playhead glisse vers le bord droit.
/// 5. **Garde-fous** : viewport / pixelsPerSecond ≤ 0 → fallback neutre,
///    playheadTime hors borne → clampé à `[0, duration]`.
final class VideoTimelineLayoutMathTests: XCTestCase {

    private let viewport: CGFloat = 400
    private let pps: CGFloat = 58 // base pixelsPerSecond du video editor

    // MARK: - Strip plus court que le viewport

    func test_layout_shortStrip_alwaysAnchorLeft() {
        // 5s × 58 px/s = 290 px < 400 px viewport → strip rentre.
        // Playhead à 0 → leadingX = 0, playheadX = 0.
        let atZero = VideoTimelineLayoutMath.layout(
            playheadTime: 0,
            duration: 5,
            viewport: viewport,
            pixelsPerSecond: pps
        )
        XCTAssertEqual(atZero.leadingX, 0)
        XCTAssertEqual(atZero.playheadX, 0)

        // Playhead à mi-clip → leadingX toujours à 0, playhead = 2.5 × pps = 145.
        let atMid = VideoTimelineLayoutMath.layout(
            playheadTime: 2.5,
            duration: 5,
            viewport: viewport,
            pixelsPerSecond: pps
        )
        XCTAssertEqual(atMid.leadingX, 0)
        XCTAssertEqual(atMid.playheadX, 2.5 * pps, accuracy: 0.01)
    }

    // MARK: - Strip plus long — zone de début (LE FIX)

    func test_layout_longStrip_startZone_leadingAnchoredAtZero() {
        // 20s × 58 px/s = 1160 px > 400 px viewport.
        // Playhead à 0 → on est en « zone début ».
        // **Avant** ce fix : leadingX = 200 (centerX), le strip démarrait
        // au milieu de l'écran → moitié gauche vide.
        // **Maintenant** : leadingX = 0, le strip commence flush à gauche.
        let layout = VideoTimelineLayoutMath.layout(
            playheadTime: 0,
            duration: 20,
            viewport: viewport,
            pixelsPerSecond: pps
        )
        XCTAssertEqual(layout.leadingX, 0, "Premier frame doit être visible à gauche")
        XCTAssertEqual(layout.playheadX, 0, "Playhead doit être au bord gauche au time = 0")
    }

    func test_layout_longStrip_stillInStartZone_playheadFollows() {
        // Toujours dans la zone de début : playheadX < halfViewport (= 200).
        // playheadTime = 2s → playheadX_natural = 116 px < 200 → start zone.
        let layout = VideoTimelineLayoutMath.layout(
            playheadTime: 2,
            duration: 20,
            viewport: viewport,
            pixelsPerSecond: pps
        )
        XCTAssertEqual(layout.leadingX, 0)
        XCTAssertEqual(layout.playheadX, 2 * pps, accuracy: 0.01,
                       "Playhead glisse vers le centre depuis le bord gauche")
    }

    // MARK: - Zone médiane — playhead pinné au centre

    func test_layout_longStrip_middleZone_playheadCentered() {
        // playheadTime = 10s → playheadX_natural = 580 px.
        // stripWidth = 1160 px ; halfViewport = 200 ; viewport - stripWidth = -760.
        // centered = 200 - 580 = -380 ; clamp = max(-760, min(0, -380)) = -380.
        // playheadX = 580 + (-380) = 200 = halfViewport ✓
        let layout = VideoTimelineLayoutMath.layout(
            playheadTime: 10,
            duration: 20,
            viewport: viewport,
            pixelsPerSecond: pps
        )
        XCTAssertEqual(layout.playheadX, viewport / 2, accuracy: 0.01,
                       "En zone médiane, playhead doit être pinné au centre")
    }

    // MARK: - Zone fin — strip ancré à droite, playhead glisse

    func test_layout_longStrip_endZone_lastFrameStaysVisible() {
        // playheadTime = 20s (fin de clip) → playheadX_natural = 1160 px.
        // centered = 200 - 1160 = -960. clamp avec floor = viewport - stripWidth
        // = -760 → clampedLeading = -760.
        // playheadX = 1160 + (-760) = 400 = viewport ✓
        let layout = VideoTimelineLayoutMath.layout(
            playheadTime: 20,
            duration: 20,
            viewport: viewport,
            pixelsPerSecond: pps
        )
        XCTAssertEqual(layout.leadingX, viewport - 20 * pps, accuracy: 0.01,
                       "leadingX doit être clampé pour que la fin du strip reste visible")
        XCTAssertEqual(layout.playheadX, viewport, accuracy: 0.01,
                       "Playhead doit être au bord droit du viewport à la fin")
    }

    // MARK: - Garde-fous

    func test_layout_zeroViewport_returnsNeutral() {
        // GeometryReader peut nous proposer viewport = 0 avant le layout
        // initial. On évite les NaN et on retourne (0, 0).
        let layout = VideoTimelineLayoutMath.layout(
            playheadTime: 5,
            duration: 20,
            viewport: 0,
            pixelsPerSecond: pps
        )
        XCTAssertEqual(layout.leadingX, 0)
        XCTAssertEqual(layout.playheadX, 0)
    }

    func test_layout_negativePixelsPerSecond_returnsNeutral() {
        let layout = VideoTimelineLayoutMath.layout(
            playheadTime: 5,
            duration: 20,
            viewport: viewport,
            pixelsPerSecond: -1
        )
        XCTAssertEqual(layout.leadingX, 0)
        XCTAssertEqual(layout.playheadX, 0)
    }

    func test_layout_playheadBeyondDuration_clampedToDuration() {
        // Si AVPlayer pousse `playheadTime` au-delà de duration (rare mais
        // possible en fin de loop), on ne veut pas que le playhead sorte
        // du viewport vers la droite.
        let layout = VideoTimelineLayoutMath.layout(
            playheadTime: 25,
            duration: 20,
            viewport: viewport,
            pixelsPerSecond: pps
        )
        XCTAssertEqual(layout.playheadX, viewport, accuracy: 0.01,
                       "Playhead clampé doit s'arrêter au bord droit (fin de clip)")
    }

    func test_layout_negativePlayheadTime_clampedToZero() {
        let layout = VideoTimelineLayoutMath.layout(
            playheadTime: -2,
            duration: 20,
            viewport: viewport,
            pixelsPerSecond: pps
        )
        XCTAssertEqual(layout.playheadX, 0,
                       "Playhead négatif clampé au début, donc au bord gauche")
    }
}
