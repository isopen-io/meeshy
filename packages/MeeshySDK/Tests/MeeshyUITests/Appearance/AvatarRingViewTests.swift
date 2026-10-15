import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// #10632 — `AvatarRingView` : le dégradé cyclique du contour reboucle sur sa première couleur
/// (miroir de `cyclicColor`), et un contour absent laisse la vue telle quelle.
@MainActor
final class AvatarRingViewTests: XCTestCase {

    func test_cyclicHex_startsOnTheFirstColorAndLoopsBackToIt() {
        let colors = ["#2DD4BF", "#7C3AED", "#6366F1"]
        XCTAssertEqual(AvatarRingView.cyclicHex(colors, at: 0), "#2DD4BF")
        XCTAssertEqual(AvatarRingView.cyclicHex(colors, at: 0.25), "#7C3AED")
        XCTAssertEqual(AvatarRingView.cyclicHex(colors, at: 0.5), "#6366F1")
        XCTAssertEqual(AvatarRingView.cyclicHex(colors, at: 0.999).prefix(3), "#2D", "le dernier segment ramène à la première couleur")
    }

    func test_lerpHex_mixesChannelsAndRounds() {
        XCTAssertEqual(AvatarRingView.lerpHex("#000000", "#FFFFFF", 0.5), "#808080")
    }

    func test_equality_followsTheDesign() throws {
        let filet = try XCTUnwrap(AvatarRingCatalog.shared.ring(pack: "contours-essentiels", item: "filet"))
        let perle = try XCTUnwrap(AvatarRingCatalog.shared.ring(pack: "contours-essentiels", item: "perle"))
        XCTAssertEqual(AvatarRingView(design: filet), AvatarRingView(design: filet))
        XCTAssertNotEqual(AvatarRingView(design: filet), AvatarRingView(design: perle))
    }
}
