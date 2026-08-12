import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TransportBarTests: XCTestCase {

    private func makeSUT(
        isPlaying: Bool = false,
        currentTime: Float = 4.25,
        duration: Float = 10,
        zoomScale: CGFloat = 1.0,
        isMuted: Bool = false
    ) -> TransportBar {
        TransportBar(
            isPlaying: isPlaying,
            currentTime: currentTime,
            duration: duration,
            zoomScale: zoomScale,
            isMuted: isMuted,
            onPlayToggle: {},
            onMuteToggle: {},
            onZoomIn: {},
            onZoomOut: {},
            onZoomReset: {}
        )
    }

    func test_init_doesNotCrash() {
        _ = makeSUT().body
    }

    func test_formatTime_pads_minutesAndFraction() {
        XCTAssertEqual(TransportBar.formatTime(seconds: 4.25), "0:04.250")
        XCTAssertEqual(TransportBar.formatTime(seconds: 65.0), "1:05.000")
        XCTAssertEqual(TransportBar.formatTime(seconds: 0), "0:00.000")
    }

    func test_zoomLabel_returnsPercent() {
        XCTAssertEqual(TransportBar.zoomLabel(scale: 1.0), "100%")
        XCTAssertEqual(TransportBar.zoomLabel(scale: 0.5), "50%")
        XCTAssertEqual(TransportBar.zoomLabel(scale: 2.0), "200%")
    }



    // MARK: - HIG Hit Target Contract

    func test_minimumHitTargetSize_width_meetsHIG44pt() {
        XCTAssertGreaterThanOrEqual(
            TransportBar.minimumHitTargetSize.width, 44,
            "TransportBar buttons extend hit zone via .contentShape(Rectangle().inset(by:)) " +
            "to meet Apple HIG 44pt minimum touch target"
        )
    }

    func test_minimumHitTargetSize_height_meetsHIG44pt() {
        XCTAssertGreaterThanOrEqual(
            TransportBar.minimumHitTargetSize.height, 44,
            "TransportBar buttons extend hit zone via .contentShape(Rectangle().inset(by:)) " +
            "to meet Apple HIG 44pt minimum touch target"
        )
    }

    // MARK: - Time readout gating (vue simple sans timer, retour user 2026-07-11)

    func test_init_withoutTimeReadout_doesNotCrash() {
        let bar = TransportBar(
            isPlaying: false, currentTime: 4.25, duration: 10,
            zoomScale: 1.0, isMuted: false,
            showsTimeReadout: false,
            onPlayToggle: {}, onMuteToggle: {},
            onZoomIn: {}, onZoomOut: {}, onZoomReset: {}
        )
        XCTAssertFalse(bar.showsTimeReadout)
        _ = bar.body
    }

    func test_init_defaultsToShowingTimeReadout() {
        XCTAssertTrue(makeSUT().showsTimeReadout)
    }

    func test_quickTimeline_transportShowsTimeReadout() {
        XCTAssertTrue(StoryTimelineView.transportShowsTimeReadout,
                      "Le timer est affiché en Quick — retiré puis redemandé par le user (2026-07-11)")
    }


    // MARK: - Snap chip (fusion Simple+Pro : le snap vit dans le transport)

    func test_init_withSnapParams_showsSnapChip() {
        let bar = TransportBar(
            isPlaying: false, currentTime: 0, duration: 10,
            zoomScale: 1.0, isMuted: false,
            isSnapEnabled: true,
            onPlayToggle: {}, onMuteToggle: {},
            onZoomIn: {}, onZoomOut: {}, onZoomReset: {},
            onSnapToggle: {}
        )
        XCTAssertEqual(bar.isSnapEnabled, true)
        _ = bar.body
    }

    func test_init_withoutSnapParams_hidesSnapChip() {
        // nil = pas de chip — les surfaces sans moteur de snap (par ex. un
        // futur éditeur média réutilisant TransportBar) ne l'affichent pas.
        let bar = makeSUT()
        XCTAssertNil(bar.isSnapEnabled)
        _ = bar.body
    }
}
