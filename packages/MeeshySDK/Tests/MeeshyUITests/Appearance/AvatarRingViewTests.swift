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

    // MARK: Un cadre illustré à la bonne taille partout (#15157)

    private func toile() throws -> AvatarRingDesign {
        let pack = try XCTUnwrap(AvatarRingCatalog.shared.packs.first { $0.slug == "cadres-illustres" })
        return try XCTUnwrap(pack.rings.first { $0.key == "toile-araignee" })
    }

    /// Le profil : le cadre ne peint pas plus loin que l'anneau seul — ni sur le nom, ni deux fois l'avatar.
    func test_layout_profile_paintsNoFurtherThanThePlainRing() throws {
        let avatar = AvatarContext.profileBanner.size
        let box = avatar * 100 / 84
        let layout = AvatarRingLayout.make(try toile(), box: box, baseScale: 1)
        XCTAssertNotNil(layout.decor)
        XCTAssertLessThanOrEqual(layout.paintedSide(box: box), box + 0.001)
        XCTAssertLessThanOrEqual(layout.paintedSide(box: box) / avatar, 1.2)
        XCTAssertFalse(layout.drawsStill, "l'anneau de repli ne se dessine pas sous le film")
        XCTAssertEqual(layout.contentScale, 1 / 1.4, accuracy: 0.0001, "l'avatar se réduit avec son cadre, l'illustration reste calée")
    }

    /// La rangée des stories : le film tient dans l'empreinte, il n'atteint ni la pastille « + » ni l'avatar voisin.
    func test_layout_storyTray_staysInsideTheFootprint() throws {
        let context = AvatarContext.storyTray
        let layout = AvatarRingLayout.make(try toile(), box: context.size,
                                           baseScale: AvatarRingGeometry.footprintScale(footprint: context.size, storyRingSize: context.ringSize))
        XCTAssertNotNil(layout.decor)
        XCTAssertLessThanOrEqual(layout.paintedSide(box: context.size), context.size + 0.001)
        XCTAssertFalse(layout.drawsStill)
        XCTAssertEqual(context.ringSize * layout.contentScale, context.size * 0.84 / 1.4, accuracy: 0.001)
    }

    /// Liste, bulle et mini-avatar : le cadre s'affiche ENTIER, dans l'empreinte, l'avatar réduit avec lui (#16114).
    func test_layout_listAndMiniAvatar_showTheWholeFrame() throws {
        for size in [AvatarContext.conversationList.size, AvatarContext.messageBubble.size, AvatarContext.postReaction.size] {
            let layout = AvatarRingLayout.make(try toile(), box: size, baseScale: 0.84)
            XCTAssertNotNil(layout.decor, "\(size)")
            XCTAssertFalse(layout.drawsStill)
            XCTAssertEqual(layout.paintedSide(box: size), size, accuracy: 0.001)
            XCTAssertEqual(layout.contentScale, 0.84 / 1.4, accuracy: 0.0001)
        }
    }

    /// La bulle de frappe retire les films : l'anneau fixe seul, à sa taille d'avant (#16114).
    func test_layout_withoutDecor_keepsTheRingAlone() throws {
        let layout = AvatarRingLayout.make(try toile(), box: 22, baseScale: 0.84, decor: false)
        XCTAssertNil(layout.decor)
        XCTAssertTrue(layout.drawsStill)
        XCTAssertEqual(layout.paintedSide(box: 22), 22)
        XCTAssertEqual(layout.contentScale, 0.84, accuracy: 0.0001)
    }

    /// Une place déclarée libre par l'hôte se prend, jamais plus.
    func test_layout_declaredRoom_isTheOnlySpill() throws {
        let layout = AvatarRingLayout.make(try toile(), box: 100, baseScale: 1, room: 8)
        XCTAssertEqual(layout.paintedSide(box: 100), 116, accuracy: 0.001)
        XCTAssertEqual(layout.ringScale, 116 / 140, accuracy: 0.0001)
    }

    func test_layout_aPlainRing_isUnchanged() throws {
        let plain = try XCTUnwrap(AvatarRingCatalog.shared.packs.flatMap(\.rings).first { $0.decor == nil })
        let layout = AvatarRingLayout.make(plain, box: 107, baseScale: 1)
        XCTAssertNil(layout.decor)
        XCTAssertTrue(layout.drawsStill)
        XCTAssertEqual(layout.contentScale, 1)
    }

    /// Le profil réserve tout le débordement : l'avatar garde ses 90 pt, le film sa taille, et l'écran
    /// sait ce qu'il peint sous l'avatar pour y faire passer le nom (#15157).
    func test_fullSpill_profile_keepsTheAvatarIntact() throws {
        let design = try toile()
        let avatar = AvatarContext.profileBanner.size
        let box = avatar * 100 / 84
        let spill = AvatarRingLayout.fullSpill(design, box: box)
        XCTAssertEqual(spill, box * 0.2, accuracy: 0.001)
        let layout = AvatarRingLayout.make(design, box: box, baseScale: 1, room: spill)
        XCTAssertEqual(layout.contentScale, 1, accuracy: 0.0001)
        XCTAssertEqual(layout.paintedSide(box: box), box * 1.4, accuracy: 0.001)
        XCTAssertEqual(AvatarRingLayout.paintBeyondAvatar(design, avatarSize: avatar), (box * 1.4 - avatar) / 2, accuracy: 0.001)
    }

    func test_fullSpill_withoutFilm_isZero() throws {
        let plain = try XCTUnwrap(AvatarRingCatalog.shared.packs.flatMap(\.rings).first { $0.decor == nil })
        XCTAssertEqual(AvatarRingLayout.fullSpill(plain, box: 107), 0)
        XCTAssertEqual(AvatarRingLayout.fullSpill(nil, box: 107), 0)
        XCTAssertEqual(AvatarRingLayout.paintBeyondAvatar(plain, avatarSize: 90), 0)
        XCTAssertEqual(AvatarRingLayout.fullSpill(try toile(), box: 40), 8, accuracy: 0.001, "même petit, le film demande sa place (#16114)")
    }
}
