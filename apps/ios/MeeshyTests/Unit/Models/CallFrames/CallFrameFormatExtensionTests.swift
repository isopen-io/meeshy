import CoreGraphics
import MeeshySDK
import XCTest
@testable import Meeshy

/// L'EXTENSION DU FORMAT DES CADRES (#9197, doc 06 § 3, étape 3.1) — les clés ajoutées pour les
/// frames en direct et les packs sont FACULTATIVES : un cadre qui ne les déclare pas garde ses
/// valeurs neutres et se rend comme avant ; un cadre sans signature se rend sans marque ; les trois
/// nouvelles formes de case se tracent DANS leur rectangle (miroir de `frame-spec-extension.test.ts`).
final class CallFrameFormatExtensionTests: XCTestCase {
    private let size = CGSize(width: 540, height: 960)
    private let texts = CallFrameTexts(groupName: nil, isGroup: false, date: "2 oct. 2026", accentHex: nil)

    private func makeSUT(brand: CallFrameBrand? = nil, shape: CallFrameSlotShape = .rect) -> CallFrameDesign {
        CallFrameDesign(
            id: "test.extension.duo",
            motif: "test.extension",
            mood: .signature,
            name: "Extension",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.05, gap: 0.02, top: 0.1, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: shape, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .solid(color: "#000000"),
                pattern: nil,
                border: nil,
                ornaments: [CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front)],
                brand: brand,
                names: CallFrameNames(show: .name, style: .caption, font: .bubble, color: "#FFFFFF", fill: nil),
                title: CallFrameTitle(source: .names, font: .bubble, color: "#FFFFFF", place: .top, size: .m, effect: nil, letterCase: nil),
                subtitle: nil
            )
        )
    }

    private func portraits() -> [CallFramePortrait] {
        [
            CallFramePortrait(id: "me", name: "Awa", handle: "awa", isSelf: true, image: nil),
            CallFramePortrait(id: "you", name: "Karim", handle: "karim", isSelf: false, image: nil),
        ]
    }

    // MARK: - Valeurs neutres

    func test_init_withoutTheNewKeys_keepsNeutralValues() {
        let sut = makeSUT()
        XCTAssertNil(sut.look.brand)
        XCTAssertEqual(sut.look.slot.look, [])
        XCTAssertEqual(sut.look.ornaments.map(\.motion), [.still])
        XCTAssertNil(sut.look.title.form)
        XCTAssertEqual(sut.look.elements, [])
        XCTAssertEqual(sut.look.scene, [])
        XCTAssertEqual(sut.look.behaviors, [])
        XCTAssertNil(sut.look.fallbacks)
        XCTAssertNil(sut.credits)
        XCTAssertNil(sut.cost)
        XCTAssertEqual(sut.surfaces, [.capture])
    }

    func test_isOffered_withoutSurfaces_isCaptureOnly() {
        let sut = makeSUT()
        XCTAssertTrue(sut.isOffered(on: .capture))
        XCTAssertFalse(sut.isOffered(on: .live))
    }

    func test_isOffered_whenLiveIsDeclared_isOfferedLive() {
        let base = makeSUT()
        let sut = CallFrameDesign(id: base.id, motif: base.motif, mood: base.mood, name: base.name, bucket: base.bucket, look: base.look, surfaces: [.capture, .live], cost: .light)
        XCTAssertTrue(sut.isOffered(on: .live))
        XCTAssertEqual(sut.cost, .light)
    }

    func test_catalogue_declaresNoNewKeyYet_soEveryFrameStaysCaptureOnly() {
        let declaring = CallFrameCatalogue.all.filter { $0.surfaces != [.capture] || $0.credits != nil || $0.cost != nil }.map(\.id)
        XCTAssertEqual(declaring, [])
    }

    // MARK: - Signature facultative

    func test_brandFrame_withoutBrand_isNil() {
        let people = portraits().map(\.person)
        XCTAssertNil(CallFrameRenderer.brandFrame(frame: makeSUT(), people: people, texts: texts, size: size))
    }

    func test_render_withoutBrand_stillDrawsTheFrame() {
        let image = CallFrameRenderer.render(frame: makeSUT(), portraits: portraits(), texts: texts, size: size)
        XCTAssertEqual(image?.width, 540)
        XCTAssertEqual(image?.height, 960)
        CallFrameRenderer.purgeLayers()
    }

    func test_brand_withWatermark_keepsTheDeclaredOrientation() {
        let watermark = CallFrameWatermark(content: .brandHandle, orientation: .diagonalDown, opacity: 0.05)
        let brand = CallFrameBrand(mark: .both, place: .watermark, color: "#C9A45C", size: .m, font: .elegant, watermark: watermark)
        XCTAssertEqual(makeSUT(brand: brand).look.brand?.watermark, watermark)
    }

    // MARK: - Nouvelles sources de texte

    func test_titleText_newSources_writeNothingUntilTheirEngineExists() {
        let people = portraits().map(\.person)
        let sources: [CallFrameTitleSource] = [.time, .datetime, .place, .landmark, .emotion]
        XCTAssertEqual(sources.map { CallFrameText.titleText($0, people: people, texts: texts) }, ["", "", "", "", ""])
    }

    // MARK: - Nouvelles formes de case

    func test_slotPath_newShapes_stayInsideTheirRect() {
        let rect = CGRect(x: 10, y: 20, width: 200, height: 300)
        let shapes: [CallFrameSlotShape] = [.torn, .polaroid, .frameOval]
        shapes.forEach { shape in
            let bounds = CallFrameRenderer.slotPath(shape, in: rect, radius: nil, seed: 3).boundingBoxOfPath
            XCTAssertFalse(bounds.isEmpty, shape.rawValue)
            XCTAssertTrue(rect.insetBy(dx: -0.5, dy: -0.5).contains(bounds), shape.rawValue)
        }
    }

    func test_tornPoints_sameSeed_isDeterministic_otherSeed_differs() {
        let rect = CGRect(x: 10, y: 20, width: 200, height: 300)
        let points = CallFrameRenderer.tornPoints(rect, seed: 3)
        XCTAssertGreaterThan(points.count, 20)
        XCTAssertEqual(CallFrameRenderer.tornPoints(rect, seed: 3), points)
        XCTAssertNotEqual(CallFrameRenderer.tornPoints(rect, seed: 4), points)
    }

    func test_polaroidWindow_isSquare_withAThickBottomMargin() {
        let rect = CGRect(x: 10, y: 20, width: 200, height: 300)
        let photo = CallFrameRenderer.polaroidWindow(rect)
        XCTAssertEqual(photo.width, photo.height, accuracy: 0.001)
        XCTAssertGreaterThan(rect.maxY - photo.maxY, (photo.minY - rect.minY) * 2)
        XCTAssertEqual(photo.minX - rect.minX, rect.maxX - photo.maxX, accuracy: 0.001)
    }

    func test_medallionRect_isAThreeByFourOval_centeredInside() {
        let rect = CGRect(x: 10, y: 20, width: 200, height: 300)
        let medallion = CallFrameRenderer.medallionRect(rect)
        XCTAssertEqual(medallion.width / medallion.height, 0.75, accuracy: 0.001)
        XCTAssertTrue(rect.insetBy(dx: -0.001, dy: -0.001).contains(medallion))
        XCTAssertEqual(medallion.midX, rect.midX, accuracy: 0.001)
    }
}
