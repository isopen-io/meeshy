import CoreGraphics
import MeeshySDK
import MeeshyUI
import XCTest
@testable import Meeshy

/// LE RENDU DES CADRES (#8741, #8743, spec § 5 et § 6) — chaque cadre du catalogue se peint pour
/// chaque nombre de sa tranche, la signature est TRACÉE (sonde de pixels), la capture n'est jamais
/// en miroir, et les couches qui ne dépendent pas des visages se réutilisent.
final class CallFrameRendererTests: XCTestCase {
    private let thumbnail = CGSize(width: 108, height: 192)
    private let texts = CallFrameTexts(groupName: "Les Copains", isGroup: true, date: "29 sept. 2026", accentHex: CallFrameAccent(primary: "#0EA5E9", secondary: "#6366F1"))

    private func portraits(_ count: Int, image: CGImage? = nil) -> [CallFramePortrait] {
        let names = ["Awa", "Karim", "Lina", "Tomás", "Mei", "Noé", "Ines", "Yao", "Sami", "Lou", "Zoé", "Ben"]
        return (0 ..< count).map { index in
            let name = names[index % names.count]
            return CallFramePortrait(id: "user-\(index)", name: name, handle: name.lowercased(), isSelf: index == 0, image: image)
        }
    }

    // MARK: - Pixels

    private struct Pixels {
        let width: Int
        let height: Int
        let bytes: [UInt8]

        init?(_ image: CGImage) {
            width = image.width
            height = image.height
            var buffer = [UInt8](repeating: 0, count: width * height * 4)
            let drawn: Bool = buffer.withUnsafeMutableBytes { raw in
                guard let context = CGContext(
                    data: raw.baseAddress,
                    width: image.width,
                    height: image.height,
                    bitsPerComponent: 8,
                    bytesPerRow: image.width * 4,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
                ) else { return false }
                context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
                return true
            }
            guard drawn else { return nil }
            bytes = buffer
        }

        /// RVBA du pixel (`x`, `y`), `y` compté depuis le HAUT de l'image.
        func rgba(_ x: Int, _ y: Int) -> [UInt8] {
            let offset = (y * width + x) * 4
            return Array(bytes[offset ..< offset + 4])
        }

        func region(_ rect: CGRect) -> [[UInt8]] {
            let clipped = rect.intersection(CGRect(x: 0, y: 0, width: width, height: height)).integral
            guard !clipped.isNull, clipped.width > 0, clipped.height > 0 else { return [] }
            return (Int(clipped.minY) ..< Int(clipped.maxY)).flatMap { y in
                (Int(clipped.minX) ..< Int(clipped.maxX)).map { x in rgba(min(x, width - 1), min(y, height - 1)) }
            }
        }
    }

    /// Une image source mi-rouge (gauche) mi-bleue (droite).
    private func leftRedRightBlue(width: Int = 64, height: Int = 64) -> CGImage? {
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width / 2, height: height))
        context.setFillColor(CGColor(red: 0, green: 0, blue: 1, alpha: 1))
        context.fill(CGRect(x: width / 2, y: 0, width: width - width / 2, height: height))
        return context.makeImage()
    }

    private func plainFrame(brand: CallFrameBrand, background: String = "#000000", shape: CallFrameSlotShape = .rect) -> CallFrameDesign {
        CallFrameDesign(
            id: "test.plain.duo",
            motif: "test.plain",
            mood: .signature,
            name: "Plain",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.05, gap: 0.02, top: 0.1, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: shape, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .solid(color: background),
                pattern: nil,
                border: nil,
                ornaments: [],
                brand: brand,
                names: CallFrameNames(show: .none, style: .caption, font: .bubble, color: "#FFFFFF", fill: nil),
                title: CallFrameTitle(source: .none, font: .bubble, color: "#FFFFFF", place: .top, size: .m, effect: nil, letterCase: nil),
                subtitle: nil
            )
        )
    }

    private func withBrand(_ frame: CallFrameDesign, color: String) -> CallFrameDesign {
        let look = frame.look
        let brand = look.brand.map { CallFrameBrand(mark: $0.mark, place: $0.place, color: color, size: $0.size, font: $0.font, watermark: $0.watermark) }
        return CallFrameDesign(
            id: frame.id + ".probe",
            motif: frame.motif,
            mood: frame.mood,
            name: frame.name,
            bucket: frame.bucket,
            look: CallFrameLook(
                layout: look.layout, slot: look.slot, background: look.background, pattern: look.pattern, border: look.border,
                ornaments: look.ornaments, brand: brand, names: look.names, title: look.title, subtitle: look.subtitle
            )
        )
    }

    // MARK: - Chaque cadre se peint

    func test_render_everyCatalogueFrame_forEveryCountOfItsBucket_drawsTheThumbnail() {
        var failures: [String] = []
        for frame in CallFrameCatalogue.all {
            for count in frame.people {
                let image = CallFrameRenderer.render(frame: frame, portraits: portraits(count), texts: texts, size: thumbnail)
                if image?.width != 108 || image?.height != 192 { failures.append("\(frame.id)@\(count)") }
            }
        }
        CallFrameRenderer.purgeLayers()
        XCTAssertEqual(failures, [])
    }

    func test_render_withCameraImages_drawsAtCaptureSize() {
        let image = leftRedRightBlue()
        let frames = CallFrameCatalogue.frames(forPeople: 4).prefix(6)
        XCTAssertFalse(frames.isEmpty)
        frames.forEach { frame in
            let rendered = CallFrameRenderer.render(frame: frame, portraits: portraits(4, image: image), texts: texts, size: CGSize(width: 540, height: 960))
            XCTAssertEqual(rendered?.width, 540, frame.id)
            XCTAssertEqual(rendered?.height, 960, frame.id)
        }
        CallFrameRenderer.purgeLayers()
    }

    func test_render_emptySize_isNil() {
        guard let frame = CallFrameCatalogue.all.first else { return XCTFail("catalogue vide") }
        XCTAssertNil(CallFrameRenderer.render(frame: frame, portraits: portraits(2), texts: texts, size: .zero))
    }

    // MARK: - La signature est tracée

    func test_brand_isPaintedInItsFrame_forSeveralFrames() throws {
        let size = CGSize(width: 540, height: 960)
        let probes = ["signature", "elegant", "corporate", "futuriste"].compactMap { mood in
            CallFrameCatalogue.all.first { $0.mood.rawValue == mood && $0.bucket == .duo && ($0.look.brand?.place ?? .watermark) != .watermark }
        }
        XCTAssertGreaterThanOrEqual(probes.count, 2)
        for frame in probes {
            let people = portraits(2).map(\.person)
            let rect = try XCTUnwrap(CallFrameRenderer.brandFrame(frame: frame, people: people, texts: texts, size: size), frame.id)
            let shown = try XCTUnwrap(CallFrameRenderer.render(frame: frame, portraits: portraits(2), texts: texts, size: size).flatMap(Pixels.init), frame.id)
            let hidden = try XCTUnwrap(CallFrameRenderer.render(frame: withBrand(frame, color: "#00000000"), portraits: portraits(2), texts: texts, size: size).flatMap(Pixels.init), frame.id)
            let changed = zip(shown.region(rect), hidden.region(rect)).filter { $0 != $1 }.count
            XCTAssertGreaterThan(changed, 20, "\(frame.id) : aucune signature dans \(rect)")
        }
        CallFrameRenderer.purgeLayers()
    }

    func test_brand_logoAndWordmark_bothLeaveInk() throws {
        let size = CGSize(width: 540, height: 960)
        for mark in CallFrameBrandMark.allCases {
            let brand = CallFrameBrand(mark: mark, place: .bottom, color: "#FFFFFF", size: .l, font: nil)
            let frame = plainFrame(brand: brand)
            let rect = try XCTUnwrap(CallFrameRenderer.brandFrame(frame: frame, people: portraits(2).map(\.person), texts: texts, size: size))
            let pixels = try XCTUnwrap(CallFrameRenderer.render(frame: frame, portraits: portraits(2), texts: texts, size: size).flatMap(Pixels.init))
            let lit = pixels.region(rect).filter { Int($0[0]) + Int($0[1]) + Int($0[2]) > 300 }.count
            XCTAssertGreaterThan(lit, 20, mark.rawValue)
        }
        CallFrameRenderer.purgeLayers()
    }

    // MARK: - Jamais en miroir

    func test_render_neverMirrorsTheCapture() throws {
        let size = CGSize(width: 400, height: 800)
        let frame = plainFrame(brand: CallFrameBrand(mark: .logo, place: .bottom, color: "#FFFFFF", size: .s, font: nil))
        let image = try XCTUnwrap(leftRedRightBlue())
        let people = [CallFramePortrait(id: "me", name: "Awa", handle: nil, isSelf: true, image: image), CallFramePortrait(id: "you", name: "Karim", handle: nil, isSelf: false, image: image)]
        let pixels = try XCTUnwrap(CallFrameRenderer.render(frame: frame, portraits: people, texts: texts, size: size).flatMap(Pixels.init))
        let box = try XCTUnwrap(CallFrameLayoutGeometry.slots(for: frame, people: 2, size: size).first).rect
        let left = pixels.rgba(Int(box.minX + box.width * 0.1), Int(box.midY))
        let right = pixels.rgba(Int(box.maxX - box.width * 0.1), Int(box.midY))
        XCTAssertGreaterThan(left[0], 200, "gauche : rouge attendu, \(left)")
        XCTAssertLessThan(left[2], 60)
        XCTAssertGreaterThan(right[2], 200, "droite : bleu attendu, \(right)")
        XCTAssertLessThan(right[0], 60)
        CallFrameRenderer.purgeLayers()
    }

    // MARK: - Les couches

    func test_layers_areReusedForTheSameFrameCountSizeAndTexts() throws {
        let frame = try XCTUnwrap(CallFrameCatalogue.all.first)
        let stage = CallFrameStage(frame: frame, people: portraits(2).map(\.person), texts: texts, size: thumbnail)
        let first = try XCTUnwrap(CallFrameRenderer.layers(for: stage))
        let second = try XCTUnwrap(CallFrameRenderer.layers(for: stage))
        XCTAssertTrue(first === second)
        let otherTexts = CallFrameTexts(groupName: "Autre", isGroup: true, date: texts.date, accentHex: nil)
        let other = CallFrameStage(frame: frame, people: portraits(2).map(\.person), texts: otherTexts, size: thumbnail)
        XCTAssertNotEqual(CallFrameRenderer.layerKey(stage), CallFrameRenderer.layerKey(other))
        CallFrameRenderer.purgeLayers()
    }

    func test_brandMark_dashesFitTheirSquare() {
        let rect = CGRect(x: 10, y: 20, width: 200, height: 100)
        let dashes = MeeshyBrandMark.dashes(in: rect)
        XCTAssertEqual(dashes.count, 3)
        XCTAssertTrue(dashes.allSatisfy { rect.contains($0.start) && rect.contains($0.end) })
        zip(dashes.map { $0.end.x - $0.start.x }, [500, 400, 300] as [CGFloat]).forEach { length, reference in
            XCTAssertEqual(length, reference * 100 / 1024, accuracy: 0.0001)
        }
        XCTAssertTrue(rect.contains(MeeshyBrandMark.inkBounds(in: rect)))
    }
}
