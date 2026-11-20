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

    // MARK: Une seule taille de cadre, partout (#19988)

    private func toile() throws -> AvatarRingDesign {
        let pack = try XCTUnwrap(AvatarRingCatalog.shared.packs.first { $0.slug == "cadres-illustres" })
        return try XCTUnwrap(pack.rings.first { $0.key == "toile-araignee" })
    }

    private func plain() throws -> AvatarRingDesign {
        try XCTUnwrap(AvatarRingCatalog.shared.packs.flatMap(\.rings).first { $0.decor == nil })
    }

    private let everyAvatarSize: [CGFloat] = [
        AvatarContext.postReaction.size, AvatarContext.messageBubble.size, 38, AvatarContext.conversationList.size,
        AvatarContext.storyTray.size, AvatarContext.profileBanner.size, 110
    ]

    /// Le retour porteur du 2026-11-20 : un cadre, quel qu'il soit, peint dans le MÊME encombrement rapporté au
    /// diamètre de l'avatar — la boîte d'un contour simple, `d / 0,84` —, de la réaction de 20 pt au profil.
    func test_layout_everyFrame_paintsTheSameSideProportionalToTheAvatar() throws {
        for design in [try toile(), try plain()] {
            for size in everyAvatarSize {
                let layout = AvatarRingLayout.make(design, avatarSize: size)
                XCTAssertEqual(layout.paintedSide, size / AvatarRingGeometry.holeFraction, accuracy: 0.001, "\(design.key) \(size)")
                XCTAssertEqual(layout.paintedSide, AvatarRingGeometry.decoratedSide(avatarSize: size), accuracy: 0.001)
            }
        }
    }

    /// Un cadre illustré ne grossit plus : le visage se ramène au trou que dessine son film (`1 / reach`).
    func test_layout_illustratedFrame_bringsTheFaceIntoItsHole() throws {
        let layout = AvatarRingLayout.make(try toile(), avatarSize: 88)
        XCTAssertNotNil(layout.decor)
        XCTAssertFalse(layout.drawsStill, "l'anneau de repli ne se dessine pas sous le film")
        XCTAssertEqual(layout.contentScale, 1 / 1.4, accuracy: 0.0001)
        XCTAssertEqual(layout.ringScale, 1 / 1.4, accuracy: 0.0001)
    }

    /// Un contour simple entoure l'avatar entier : le visage garde son diamètre.
    func test_layout_plainRing_keepsTheFaceWhole() throws {
        let layout = AvatarRingLayout.make(try plain(), avatarSize: 52)
        XCTAssertNil(layout.decor)
        XCTAssertTrue(layout.drawsStill)
        XCTAssertEqual(layout.contentScale, 1, accuracy: 0.0001)
    }

    /// L'anneau de story reste concentrique, dans le trou du cadre (#10714).
    func test_layout_storyRing_fitsTheFrameHole() throws {
        let context = AvatarContext.storyTray
        let layout = AvatarRingLayout.make(try toile(), avatarSize: context.size, storyRingSize: context.ringSize)
        XCTAssertEqual(context.ringSize * layout.contentScale, context.size / 1.4, accuracy: 0.001)
    }

    /// La bulle de frappe retire les films : l'anneau fixe seul, à la même taille normalisée (#16114).
    func test_layout_withoutDecor_keepsTheRingAloneAtTheSameSide() throws {
        let layout = AvatarRingLayout.make(try toile(), avatarSize: 24, decor: false)
        XCTAssertNil(layout.decor)
        XCTAssertTrue(layout.drawsStill)
        XCTAssertEqual(layout.paintedSide, 24 / 0.84, accuracy: 0.001)
        XCTAssertEqual(layout.contentScale, 1, accuracy: 0.0001)
    }

    /// Ce qu'un avatar décoré peint au-delà de son diamètre, de chaque côté : la marge qu'un hôte laisse libre
    /// (aucun clip) — la même fraction pour tous les cadres, rien sans cadre.
    func test_spill_isTheSameFractionForEveryFrame_andNothingWithoutOne() throws {
        for design in [try toile(), try plain()] {
            XCTAssertEqual(AvatarRingGeometry.spill(design, avatarSize: 88), 88 * (1 / 0.84 - 1) / 2, accuracy: 0.001)
        }
        XCTAssertEqual(AvatarRingGeometry.spill(nil, avatarSize: 88), 0)
    }
}
