import XCTest
import SwiftUI
@testable import Meeshy

/// Le plancher du panneau des pièces jointes (grille des médias récents) se choisissait sur le TYPE d'appareil
/// (`DeviceLayout.isPad`) : un iPad en Slide Over, en Split View étroit ou dans une petite fenêtre Stage Manager — une
/// colonne de largeur iPhone — gardait le plancher de 460 pt d'un iPad plein écran. Il suit la CLASSE DE TAILLE.
final class ComposerRecentMediaFloorTests: XCTestCase {

    func test_aRegularWidth_getsTheRoomyFloor() {
        XCTAssertEqual(ComposerPanelHeightLaw.recentMediaFloor(horizontalSizeClass: .regular), 460)
    }

    func test_aCompactWidth_getsThePhoneFloor_evenOnAnIPad() {
        XCTAssertEqual(ComposerPanelHeightLaw.recentMediaFloor(horizontalSizeClass: .compact), 324)
    }

    func test_anUnknownSizeClass_getsThePhoneFloor() {
        XCTAssertEqual(ComposerPanelHeightLaw.recentMediaFloor(horizontalSizeClass: nil), 324)
    }

    func test_theBar_readsTheSizeClass_notTheDevice() throws {
        let bar = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Components/UniversalComposerBar.swift"))
        XCTAssertTrue(bar.contains("ComposerPanelHeightLaw.recentMediaFloor(horizontalSizeClass: horizontalSizeClass)"))
        XCTAssertFalse(bar.contains("DeviceLayout.isPad ? 460 : 324"))
    }
}
