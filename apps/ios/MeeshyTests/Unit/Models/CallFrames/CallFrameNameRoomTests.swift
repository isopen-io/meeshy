import CoreGraphics
import XCTest
@testable import Meeshy

/// LES NOMS POSÉS SOUS LA CASE NE COUVRENT JAMAIS UN VISAGE (#9780). En appel à deux, le cadre
/// Cœur de rose empile ses deux cœurs : sans place entre eux, la banderole des noms se repliait
/// DANS chaque cœur sur son fond rose (`paintPlate`) et en masquait la moitié basse. La géométrie
/// laisse désormais sous chaque case la place de ses noms, et le peintre les pose dessous.
final class CallFrameNameRoomTests: XCTestCase {
    private let liveScreens = [
        CGSize(width: 440, height: 956),
        CGSize(width: 1320, height: 2868),
        CGSize(width: 393, height: 852),
        CGSize(width: 956, height: 440),
    ]
    private let texts = CallFrameTexts(groupName: nil, isGroup: false, date: "9 oct. 2026", accentHex: nil)
    private let duo = [
        CallFramePerson(id: "a", name: "Amélie Durand", handle: "amelie", isSelf: true),
        CallFramePerson(id: "b", name: "Bastien Morel", handle: "bastien", isSelf: false),
    ]

    private func coeurDeRose() throws -> CallFrameDesign {
        try XCTUnwrap(CallFrameCatalogue.all.first { $0.id == "feerique.coeur-de-rose.duo" })
    }

    private func stage(_ frame: CallFrameDesign, people: [CallFramePerson], size: CGSize) -> CallFrameStage {
        CallFrameStage(frame: frame, people: people, texts: texts, size: size)
    }

    func test_coeurDeRose_inALiveCall_paintsTheRibbonUnderEachHeart() throws {
        let frame = try coeurDeRose()
        for size in liveScreens {
            let scene = stage(frame, people: duo, size: size)
            let plan = CallFrameRenderer.planText(scene, fonts: CallFrameFontBook())
            XCTAssertTrue(CallFrameRenderer.namesFitBelow(scene, plan: plan), "\(size) : la banderole se replie dans le cœur")
        }
    }

    func test_coeurDeRose_inAPortraitLiveCall_theRibbonBandUnderAHeartTouchesNoOtherHeart() throws {
        let frame = try coeurDeRose()
        for size in liveScreens where size.height > size.width {
            let scene = stage(frame, people: duo, size: size)
            let room = CallFrameRenderer.nameRoom(frame.look, unit: scene.unit)
            let footprints = scene.boxes.map { CallFrameRenderer.footprint(of: $0) }
            XCTAssertGreaterThan(room, 0)
            footprints.enumerated().forEach { index, own in
                let band = CGRect(x: own.minX, y: own.maxY, width: own.width, height: room)
                XCTAssertLessThanOrEqual(band.maxY, scene.areas.content.maxY + 0.5, "\(size) case \(index) : la banderole sort de la zone de contenu")
                footprints.enumerated().filter { $0.offset != index }.forEach { _, other in
                    let shared = band.intersection(other)
                    XCTAssertTrue(shared.isNull || shared.height < 0.5, "\(size) case \(index) : la banderole couvre l'autre cœur")
                }
            }
        }
    }

    func test_slots_framesWhoseNamesSitInsideTheirSlot_keepTheWebGeometry() {
        let size = CGSize(width: 440, height: 956)
        CallFrameCatalogue.all
            .filter { CallFrameRenderer.nameRoom($0.look, unit: min(size.width, size.height)) == 0 }
            .forEach { frame in
                let people = frame.bucket.people.lowerBound
                XCTAssertEqual(
                    CallFrameLayoutGeometry.slots(for: frame, people: people, size: size),
                    CallFrameLayoutGeometry.slots(layout: frame.look.layout, slot: frame.look.slot, people: people, size: size),
                    frame.id
                )
            }
    }

    func test_slots_everyFrameWithNamesBelow_keepsEachSlotInsideTheContentZoneAndAtLeastHalfItsHeight() {
        CallFrameCatalogue.all.forEach { frame in
            liveScreens.forEach { size in
                let people = frame.bucket.people.lowerBound
                let made = CallFrameLayoutGeometry.slots(for: frame, people: people, size: size)
                let web = CallFrameLayoutGeometry.slots(layout: frame.look.layout, slot: frame.look.slot, people: people, size: size)
                let content = CallFrameLayoutGeometry.areas(frame.look.layout, size: size).content
                XCTAssertEqual(made.count, web.count, frame.id)
                zip(made, web).forEach { box, original in
                    XCTAssertGreaterThanOrEqual(box.rect.height, original.rect.height * 0.5 - 0.001, frame.id)
                    XCTAssertTrue(content.insetBy(dx: -0.5, dy: -0.5).contains(box.rect), frame.id)
                }
            }
        }
    }
}
