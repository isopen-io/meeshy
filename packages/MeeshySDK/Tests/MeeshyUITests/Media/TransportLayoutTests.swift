import XCTest
@testable import MeeshyUI

/// Répartition barre/menu du lifting Liquid Glass (spec 2026-07-11) :
/// `.mute`/`.airplay` restent visibles dans la barre unique, `.speed`/
/// `.loop`/`.pip` migrent dans le menu ⋯ — le bouton ⋯ n'existe que si
/// au moins un item de menu est présent dans le ControlSet.
final class TransportLayoutTests: XCTestCase {

    func test_barItems_galleryControlSet_returnsMuteOnly() {
        let set: MeeshyVideoPlayer.ControlSet = [.playPause, .scrubber, .duration, .speed, .mute, .pip]
        XCTAssertEqual(TransportLayout.barItems(for: set), [.mute])
    }

    func test_menuItems_galleryControlSet_returnsSpeedAndPip() {
        let set: MeeshyVideoPlayer.ControlSet = [.playPause, .scrubber, .duration, .speed, .mute, .pip]
        XCTAssertEqual(TransportLayout.menuItems(for: set), [.speed, .pip])
    }

    func test_barItems_fullscreenDefault_returnsMuteAndAirplay() {
        XCTAssertEqual(
            TransportLayout.barItems(for: .fullscreenDefault),
            [.mute, .airplay]
        )
    }

    func test_menuItems_fullscreenDefault_returnsSpeedLoopPip() {
        XCTAssertEqual(
            TransportLayout.menuItems(for: .fullscreenDefault),
            [.speed, .loop, .pip]
        )
    }

    func test_showsMenuButton_withoutMenuControls_isFalse() {
        let set: MeeshyVideoPlayer.ControlSet = [.playPause, .scrubber, .duration, .mute]
        XCTAssertFalse(TransportLayout.showsMenuButton(for: set))
    }

    func test_showsMenuButton_withAnyMenuControl_isTrue() {
        XCTAssertTrue(TransportLayout.showsMenuButton(for: [.loop]))
        XCTAssertTrue(TransportLayout.showsMenuButton(for: [.speed]))
        XCTAssertTrue(TransportLayout.showsMenuButton(for: [.pip]))
    }

    func test_barAndMenuItems_emptySet_areEmpty() {
        XCTAssertTrue(TransportLayout.barItems(for: .none).isEmpty)
        XCTAssertTrue(TransportLayout.menuItems(for: .none).isEmpty)
        XCTAssertFalse(TransportLayout.showsMenuButton(for: .none))
    }
}
