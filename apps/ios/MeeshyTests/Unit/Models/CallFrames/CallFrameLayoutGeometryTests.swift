import CoreGraphics
import XCTest
@testable import Meeshy

/// LA GÉOMÉTRIE DES CADRES (#8741, spec § 4.1) — une case par personne, toutes dans la zone de
/// contenu, déterministes, pour chaque disposition, chaque nombre de 2 à 12 et les deux
/// orientations ; et la PARITÉ avec le web, case par case, contre la fixture partagée.
final class CallFrameLayoutGeometryTests: XCTestCase {
    private let portrait = CGSize(width: 1080, height: 1920)
    private let landscape = CGSize(width: 1920, height: 1080)
    private let people = Array(2 ... 12)

    private func layout(_ arrangement: CallFrameArrangement, margin: Double = 0.06, gap: Double = 0.03, top: Double = 0.18, bottom: Double = 0.12) -> CallFrameLayout {
        CallFrameLayout(arrangement: arrangement, margin: margin, gap: gap, top: top, bottom: bottom)
    }

    private func slot(shape: CallFrameSlotShape = .round, tilt: CallFrameTilt = .none) -> CallFrameSlotStyle {
        CallFrameSlotStyle(shape: shape, radius: 0.08, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: tilt, tone: .color, duotone: nil)
    }

    private func footprint(_ box: CallFrameSlotBox) -> CGRect {
        CallFrameRenderer.footprint(of: box)
    }

    private func overlap(_ a: CGRect, _ b: CGRect) -> CGFloat {
        let intersection = a.intersection(b)
        return intersection.isNull ? 0 : intersection.width * intersection.height
    }

    // MARK: - Chaque disposition, chaque nombre, chaque orientation

    func test_slots_everyArrangementCountOrientationAndTilt_oneBoxPerPersonInsideTheContentZone() {
        let epsilon: CGFloat = 0.0001
        for arrangement in CallFrameArrangement.allCases {
            for size in [portrait, landscape] {
                for tilt in CallFrameTilt.allCases {
                    for count in people {
                        let frameLayout = layout(arrangement)
                        let boxes = CallFrameLayoutGeometry.slots(layout: frameLayout, slot: slot(tilt: tilt), people: count, size: size)
                        let content = CallFrameLayoutGeometry.areas(frameLayout, size: size).content
                        let label = "\(arrangement.rawValue) \(Int(size.width))×\(Int(size.height)) \(tilt.rawValue) n=\(count)"
                        XCTAssertEqual(boxes.count, count, label)
                        XCTAssertEqual(boxes.map(\.index), Array(0 ..< count), label)
                        boxes.forEach { box in
                            XCTAssertTrue([box.rect.minX, box.rect.minY, box.rect.width, box.rect.height, CGFloat(box.rotation)].allSatisfy(\.isFinite), label)
                            XCTAssertGreaterThan(box.rect.width, 0, label)
                            XCTAssertGreaterThan(box.rect.height, 0, label)
                            let around = footprint(box)
                            XCTAssertGreaterThanOrEqual(around.minX, content.minX - epsilon, label)
                            XCTAssertGreaterThanOrEqual(around.minY, content.minY - epsilon, label)
                            XCTAssertLessThanOrEqual(around.maxX, content.maxX + epsilon, label)
                            XCTAssertLessThanOrEqual(around.maxY, content.maxY + epsilon, label)
                        }
                        XCTAssertEqual(CallFrameLayoutGeometry.slots(layout: frameLayout, slot: slot(tilt: tilt), people: count, size: size), boxes, label)
                    }
                }
            }
        }
    }

    func test_slots_uprightArrangements_doNotOverlap() {
        let arrangements: [CallFrameArrangement] = [.grid, .row, .column, .arch, .orbit, .tiers, .mosaic, .honeycomb, .hero, .scatter]
        for arrangement in arrangements {
            for size in [portrait, landscape] {
                for count in people {
                    let boxes = CallFrameLayoutGeometry.slots(layout: layout(arrangement), slot: slot(), people: count, size: size)
                    let collisions = boxes.enumerated().flatMap { index, a in
                        boxes.dropFirst(index + 1).compactMap { b -> String? in
                            let allowed = arrangement == .honeycomb ? a.rect.width * a.rect.height * 0.13 : 1
                            return overlap(a.rect, b.rect) > allowed ? "\(count):\(a.index)/\(b.index)" : nil
                        }
                    }
                    XCTAssertEqual(collisions, [], "\(arrangement.rawValue) \(Int(size.width))×\(Int(size.height))")
                }
            }
        }
    }

    func test_slots_honeycomb_forcesTheHexagon() {
        let hive = CallFrameLayoutGeometry.slots(layout: layout(.honeycomb), slot: slot(shape: .heart), people: 6, size: portrait)
        XCTAssertTrue(hive.allSatisfy { $0.shape == .hex })
        let grid = CallFrameLayoutGeometry.slots(layout: layout(.grid), slot: slot(shape: .heart), people: 6, size: portrait)
        XCTAssertTrue(grid.allSatisfy { $0.shape == .heart })
    }

    func test_slots_splitAndDiagonal_fallBackToTheGridBeyondTwo() {
        let split = CallFrameLayoutGeometry.slots(layout: layout(.split), slot: slot(), people: 4, size: portrait)
        let grid = CallFrameLayoutGeometry.slots(layout: layout(.grid), slot: slot(), people: 4, size: portrait)
        XCTAssertEqual(split, grid)
    }

    func test_slots_split_stacksInPortraitAndSitsSideBySideInLandscape() {
        let stacked = CallFrameLayoutGeometry.slots(layout: layout(.split), slot: slot(), people: 2, size: portrait)
        XCTAssertEqual(stacked[0].rect.minX, stacked[1].rect.minX, accuracy: 0.001)
        XCTAssertLessThan(stacked[0].rect.maxY, stacked[1].rect.minY)
        let beside = CallFrameLayoutGeometry.slots(layout: layout(.split), slot: slot(), people: 2, size: landscape)
        XCTAssertEqual(beside[0].rect.minY, beside[1].rect.minY, accuracy: 0.001)
        XCTAssertLessThan(beside[0].rect.maxX, beside[1].rect.minX)
    }

    func test_tiltDegrees_alternatesAndStaysWithinTheMaximum() {
        let wild = (0 ..< 8).map { CallFrameLayoutGeometry.tiltDegrees(.wild, index: $0) }
        XCTAssertTrue(wild.enumerated().allSatisfy { index, degrees in (index % 2 == 0 ? degrees < 0 : degrees > 0) && abs(degrees) <= 9 && abs(degrees) >= 4.5 })
        XCTAssertEqual((0 ..< 4).map { CallFrameLayoutGeometry.tiltDegrees(.none, index: $0) }, [0, 0, 0, 0])
    }

    func test_areas_reserveTheTopAndBottomBands() {
        let zones = CallFrameLayoutGeometry.areas(layout(.grid), size: portrait)
        XCTAssertEqual(zones.unit, 1080)
        XCTAssertEqual(zones.inner.minX, 64.8, accuracy: 0.001)
        XCTAssertEqual(zones.inner.minY, 64.8, accuracy: 0.001)
        XCTAssertEqual(zones.inner.width, 950.4, accuracy: 0.001)
        XCTAssertEqual(zones.inner.height, 1790.4, accuracy: 0.001)
        XCTAssertEqual(zones.top.height, 1920 * 0.18, accuracy: 0.001)
        XCTAssertEqual(zones.bottom.maxY, zones.inner.maxY, accuracy: 0.001)
        XCTAssertEqual(zones.content.minY, zones.top.maxY, accuracy: 0.001)
        XCTAssertEqual(zones.content.maxY, zones.bottom.minY, accuracy: 0.001)
    }

    // MARK: - Parité avec le web

    private struct Fixture: Decodable {
        struct Params: Decodable {
            struct Layout: Decodable {
                let margin: Double
                let gap: Double
                let top: Double
                let bottom: Double
            }

            struct Slot: Decodable {
                let shape: String
                let tilt: String
            }

            let name: String
            let layout: Layout
            let slot: Slot
        }

        struct Case: Decodable {
            struct Slot: Decodable {
                let box: [Double]
                let shape: String
            }

            let arrangement: String
            let params: String
            let people: Int
            let size: [Double]
            let slots: [Slot]
        }

        let params: [Params]
        let cases: [Case]
    }

    /// `packages/shared/design/call-capture-frames-layout.fixture.json`, lue DANS LE DÉPÔT
    /// (écrite par `apps/web/scripts/generate-frame-layout-fixture.ts`).
    private static var fixtureURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("packages/shared/design/call-capture-frames-layout.fixture.json")
    }

    func test_slots_matchTheWebFixture_boxByBox() throws {
        let data = try Data(contentsOf: Self.fixtureURL)
        let fixture = try JSONDecoder().decode(Fixture.self, from: data)
        XCTAssertFalse(fixture.cases.isEmpty)
        let params = Dictionary(uniqueKeysWithValues: fixture.params.map { ($0.name, $0) })
        var mismatches: [String] = []
        for entry in fixture.cases {
            guard let set = params[entry.params],
                  let arrangement = CallFrameArrangement(rawValue: entry.arrangement),
                  let shape = CallFrameSlotShape(rawValue: set.slot.shape),
                  let tilt = CallFrameTilt(rawValue: set.slot.tilt),
                  entry.size.count == 2 else {
                mismatches.append("illisible: \(entry.arrangement)/\(entry.params)")
                continue
            }
            let frameLayout = CallFrameLayout(arrangement: arrangement, margin: set.layout.margin, gap: set.layout.gap, top: set.layout.top, bottom: set.layout.bottom)
            let frameSlot = CallFrameSlotStyle(shape: shape, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: tilt, tone: .color, duotone: nil)
            let size = CGSize(width: entry.size[0], height: entry.size[1])
            let boxes = CallFrameLayoutGeometry.slots(layout: frameLayout, slot: frameSlot, people: entry.people, size: size)
            let label = "\(entry.arrangement)/\(entry.params) n=\(entry.people) \(Int(size.width))×\(Int(size.height))"
            guard boxes.count == entry.slots.count else {
                mismatches.append("\(label): \(boxes.count) cases au lieu de \(entry.slots.count)")
                continue
            }
            zip(boxes, entry.slots).forEach { box, expected in
                let ours = [Double(box.rect.minX), Double(box.rect.minY), Double(box.rect.width), Double(box.rect.height), box.rotation]
                let delta = zip(ours, expected.box).map { abs($0 - $1) }.max() ?? .infinity
                if delta > 0.5 || box.shape.rawValue != expected.shape {
                    mismatches.append("\(label) #\(box.index): \(ours) ≠ \(expected.box)")
                }
            }
        }
        XCTAssertEqual(mismatches, [])
    }
}
