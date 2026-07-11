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

    func test_modeSwitchLabel_quickTowardPro_isPRO() {
        XCTAssertEqual(TransportBar.modeSwitchLabel(currentMode: .quick), "PRO ↗")
    }

    func test_modeSwitchLabel_proTowardQuick_isQUICK() {
        XCTAssertEqual(TransportBar.modeSwitchLabel(currentMode: .pro), "QUICK ↗")
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
}
