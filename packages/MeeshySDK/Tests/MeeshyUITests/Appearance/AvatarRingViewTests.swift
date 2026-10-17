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
        XCTAssertEqual(AvatarRingView.cyclicHex(colors, at: 1.0 / 3.0), "#7C3AED")
        XCTAssertEqual(AvatarRingView.cyclicHex(colors, at: 2.0 / 3.0), "#6366F1")
        XCTAssertEqual(AvatarRingView.cyclicHex(colors, at: 0.999).prefix(3), "#2D", "le dernier segment ramène à la première couleur")
    }

    func test_lerpHex_mixesChannelsAndRounds() {
        XCTAssertEqual(AvatarRingView.lerpHex("#000000", "#FFFFFF", 0.5), "#808080")
    }

    /// Une couleur courte ou illisible ne sort plus de la chaîne (plantage du dessin de l'avatar d'un autre).
    func test_lerpHex_neverReadsPastAShortOrMalformedColour() {
        XCTAssertEqual(AvatarRingView.lerpHex("#FFF", "#FFFFFF", 0), "#FFFFFF", "#RGB s'étend")
        XCTAssertEqual(AvatarRingView.lerpHex("red", "#000000", 0), "#000000", "illisible : noir, pas de plantage")
        XCTAssertEqual(AvatarRingView.lerpHex("#11223344", "#112233", 0), "#112233", "l'alpha est ignoré")
    }

    func test_equality_followsTheDesign() throws {
        let filet = try XCTUnwrap(AvatarRingCatalog.shared.ring(pack: "contours-essentiels", item: "filet"))
        let perle = try XCTUnwrap(AvatarRingCatalog.shared.ring(pack: "contours-essentiels", item: "perle"))
        XCTAssertEqual(AvatarRingView(design: filet), AvatarRingView(design: filet))
        XCTAssertNotEqual(AvatarRingView(design: filet), AvatarRingView(design: perle))
    }

    // MARK: Contour dehors, anneau de story dedans (#10714)

    func test_avatarScale_withoutAStoryRing_leavesTheAvatarIntact() {
        XCTAssertEqual(AvatarRingGeometry.avatarScale(avatarSize: 80, storyRingSize: nil), 1)
    }

    func test_avatarScale_withAStoryRing_bringsTheRingInsideTheContourHole() {
        let size = AvatarContext.profileSheet.size
        let ringSize = AvatarContext.profileSheet.ringSize
        let scale = AvatarRingGeometry.avatarScale(avatarSize: size, storyRingSize: ringSize)
        XCTAssertLessThan(scale, 1, "l'avatar se réduit légèrement")
        XCTAssertGreaterThan(scale, 0.9, "légèrement, jamais au point de disparaître")
        XCTAssertEqual(ringSize * scale, size, accuracy: 0.001, "l'anneau de story occupe exactement le trou du contour (rayon 42 du viewBox)")
    }

    func test_avatarScale_aDegenerateSizeNeverInverts() {
        XCTAssertEqual(AvatarRingGeometry.avatarScale(avatarSize: 0, storyRingSize: 6), 1)
        XCTAssertEqual(AvatarRingGeometry.avatarScale(avatarSize: 80, storyRingSize: 70), 1)
    }

    // MARK: Le contour dans l'empreinte (#10713)

    func test_footprintScale_withoutAStoryRing_fitsTheAvatarInTheContourHole() {
        XCTAssertEqual(AvatarRingGeometry.footprintScale(footprint: 52, storyRingSize: nil), 0.84, accuracy: 0.0001)
    }

    func test_footprintScale_withAStoryRing_fitsTheStoryRingInTheContourHole() {
        let context = AvatarContext.conversationList
        let scale = AvatarRingGeometry.footprintScale(footprint: context.size, storyRingSize: context.ringSize)
        XCTAssertEqual(context.ringSize * scale, context.size * AvatarRingGeometry.holeFraction, accuracy: 0.001)
    }
}

