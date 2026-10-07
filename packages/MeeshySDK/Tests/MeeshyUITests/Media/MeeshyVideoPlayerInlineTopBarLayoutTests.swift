import XCTest
@testable import MeeshyUI

/// **Agrandir au bord GAUCHE, le son au bord DROIT** (#9575, directive porteur
/// 2026-10-07 — supplante le groupe centré du 2026-08-10).
///
/// Les deux contrôles les plus touchés ne se disputent plus le centre de la
/// vidéo : chacun a son coin, et les autres (PiP, AirPlay, vitesse) restent
/// groupés à droite, AVANT le son.
final class MeeshyVideoPlayerInlineTopBarLayoutTests: XCTestCase {

    private typealias Controls = MeeshyVideoPlayer.ControlSet
    private typealias Item = _InlineOverlayControls.TopBarItem

    private func layout(_ controls: Controls,
                        expandHandler: Bool = true,
                        pipSupported: Bool = true) -> _InlineOverlayControls.TopBarLayout {
        _InlineOverlayControls.topBarLayout(controls: controls,
                                            hasExpandHandler: expandHandler,
                                            isPipSupported: pipSupported)
    }

    func test_expand_sitsAloneOnTheLeadingEdge() {
        XCTAssertEqual(layout(.inlineDefault).leading, [.expand])
        XCTAssertEqual(layout(.inlineMinimal).leading, [.expand])
    }

    func test_mute_isTheLastItemOfTheTrailingEdge() {
        let full: Controls = [.expand, .pip, .airplay, .speed, .mute]
        XCTAssertEqual(layout(full).trailing.last, .mute)
        XCTAssertEqual(layout(.inlineMinimal).trailing, [.mute])
    }

    func test_theOtherControls_stayGroupedOnTheRight_beforeTheMute() {
        let full: Controls = [.expand, .pip, .airplay, .speed, .mute]
        XCTAssertEqual(layout(full).trailing, [.pip, .airplay, .speed, .mute])
    }

    func test_nothingIsLeftInTheMiddle() {
        let full: Controls = [.expand, .pip, .airplay, .speed, .mute]
        let placed = layout(full)
        XCTAssertEqual(Set(placed.leading).union(placed.trailing).count,
                       placed.leading.count + placed.trailing.count,
                       "un contrôle n'est posé qu'une fois")
        XCTAssertFalse(placed.trailing.contains(.expand))
        XCTAssertFalse(placed.leading.contains(.mute))
    }

    func test_expand_needsItsHandler() {
        XCTAssertTrue(layout(.inlineDefault, expandHandler: false).leading.isEmpty,
                      "sans hôte de plein écran, le bouton n'existe pas (loi 4)")
    }

    func test_pip_isAbsentWhereTheDeviceCannotServeIt() {
        XCTAssertFalse(layout(.inlineDefault, pipSupported: false).trailing.contains(.pip))
        XCTAssertTrue(layout(.inlineDefault, pipSupported: true).trailing.contains(.pip))
    }

    func test_aBareControlSet_placesNothing() {
        let placed = layout([.playPause])
        XCTAssertTrue(placed.leading.isEmpty)
        XCTAssertTrue(placed.trailing.isEmpty)
    }
}
