import XCTest
import UIKit
@testable import MeeshyUI

/// Mode dessin immersif (user 2026-07-11) : le canvas doit rester zoomable
/// PENDANT le dessin. La `StrokeCaptureView` porte donc un pinch 2 doigts
/// (zoom + pan par le centroïde) tout en gardant le tracé mono-doigt :
/// le doigt qui trace est suivi individuellement (`activeTouch`), et la
/// reconnaissance du pinch annule le trait en cours via `touchesCancelled`.
@MainActor
final class StrokeCaptureViewportGestureTests: XCTestCase {

    private func makeView() -> StrokeCaptureLayer.StrokeCaptureView {
        StrokeCaptureLayer.StrokeCaptureView(frame: CGRect(x: 0, y: 0, width: 300, height: 500))
    }

    func test_captureView_allowsMultipleTouches_forViewportPinch() {
        XCTAssertTrue(makeView().isMultipleTouchEnabled,
                      "Le pinch 2 doigts exige la réception multi-touch ; le tracé reste mono-doigt via activeTouch")
    }

    func test_captureView_carriesPinchRecognizer() {
        let recognizers = makeView().gestureRecognizers ?? []
        XCTAssertTrue(recognizers.contains(where: { $0 is UIPinchGestureRecognizer }),
                      "Zoomer/dézoomer le canvas pendant le dessin (pinch 2 doigts)")
    }

    func test_pinchRecognizer_cancelsTouchesInView() {
        let pinch = (makeView().gestureRecognizers ?? [])
            .compactMap { $0 as? UIPinchGestureRecognizer }.first
        XCTAssertEqual(pinch?.cancelsTouchesInView, true,
                       "La reconnaissance du pinch doit annuler le trait en cours (touchesCancelled)")
    }
}
