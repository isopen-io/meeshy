import XCTest
import QuartzCore
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// **L'échelle d'une image clé MULTIPLIE celle de l'objet (#14316)**, sur le
/// fichier que le web et Android rejouent tel quel :
/// `packages/shared/fixtures/keyframe-scale.vectors.json`. Le rendu, la
/// description Core Animation et la signature du cache disent la même taille,
/// sans quoi une story animée sur une plateforme se lirait autrement sur l'autre.
@MainActor
final class StoryKeyframeScaleVectorTests: XCTestCase {

    private struct Vector: Decodable {
        let label: String
        let objectScale: Double
        let startTime: Double
        let at: Double
        let keyframes: [StoryKeyframe]
        let renderedScale: Double

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case objectScale, startTime, at, keyframes, renderedScale
        }
    }

    private struct File: Decodable {
        let vectors: [Vector]
    }

    private static let fileURL: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<7 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/shared/fixtures/keyframe-scale.vectors.json")
    }()

    private static let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))

    private func vectors() throws -> [Vector] {
        try JSONDecoder().decode(File.self, from: Data(contentsOf: Self.fileURL)).vectors
    }

    private func text(_ vector: Vector) -> StoryTextObject {
        var text = StoryTextObject(id: "t", text: "Bonjour", x: 0.5, y: 0.5, scale: vector.objectScale, rotation: 0, fontSize: 96)
        text.startTime = vector.startTime
        text.keyframes = vector.keyframes
        return text
    }

    private func media(scale: Double, startTime: Double, keyframes: [StoryKeyframe]) -> StoryMediaObject {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        media.scale = scale
        media.startTime = startTime
        media.keyframes = keyframes
        return media
    }

    private func rendered(_ effects: StoryEffects, at seconds: Double, id: String) throws -> CALayer {
        let root = StoryRenderer.render(slide: StorySlide(id: "s", content: "", effects: effects),
                                        into: Self.geometry,
                                        at: CMTime(seconds: seconds, preferredTimescale: 600),
                                        mode: .play)
        return try XCTUnwrap(root.sublayers?.first { $0.name == id }, "le calque \(id) est peint")
    }

    func test_theSharedFileIsRead_andCoversAnInterpolatedFactor() throws {
        let vectors = try vectors()
        XCTAssertGreaterThanOrEqual(vectors.count, 9)
        XCTAssertTrue(vectors.contains { $0.keyframes.count >= 2 })
    }

    func test_theRenderer_paintsATextAtObjectScaleTimesTheKeyframeFactor() throws {
        for vector in try vectors() {
            let layer = try rendered(StoryEffects(textObjects: [text(vector)]), at: vector.at, id: "t")
            XCTAssertEqual(Double(layer.transform.m11), vector.renderedScale, accuracy: 1e-6, vector.label)
        }
    }

    func test_theRenderer_paintsAMediaAtObjectScaleTimesTheKeyframeFactor() throws {
        let unit = try rendered(StoryEffects(mediaObjects: [media(scale: 1, startTime: 0, keyframes: [])]), at: 0, id: "m")
        for vector in try vectors() {
            let item = media(scale: vector.objectScale, startTime: vector.startTime, keyframes: vector.keyframes)
            let layer = try rendered(StoryEffects(mediaObjects: [item]), at: vector.at, id: "m")
            let side = Double(layer.bounds.width * layer.transform.m11) / Double(unit.bounds.width)
            XCTAssertEqual(side, vector.renderedScale, accuracy: 1e-6, vector.label)
        }
    }

    func test_theRendererCacheSignature_carriesTheRenderedScale() throws {
        for vector in try vectors() {
            let signature = StoryRendererCache.makeSignature(for: text(vector), at: vector.at, languages: [])
            XCTAssertEqual(signature.scale, vector.renderedScale, accuracy: 1e-6, vector.label)
        }
    }

    func test_theCoreAnimationDescription_composesTheFactorWithTheObjectScale() throws {
        for vector in try vectors() {
            let base = StoryTextLayer.sceneTransform(rotationDegrees: 0, scale: vector.objectScale)
            guard let plan = StoryKeyframeAnimationPlan.make(keyframes: vector.keyframes, startTime: vector.startTime) else {
                XCTFail("\(vector.label) : décrit pour Core Animation"); continue
            }
            let factor: Double
            if case .scalar(let value)? = plan.value(of: .scale, at: vector.at) { factor = Double(value) } else { factor = 1 }
            XCTAssertEqual(vector.objectScale * factor, vector.renderedScale, accuracy: 1e-6, vector.label)
            let played = plan.coreAnimations(projectPosition: { $0 }, baseTransform: base)
                .filter { $0.keyPath == "transform" }
                .flatMap { ($0.values ?? []).compactMap { ($0 as? NSValue)?.caTransform3DValue.m11 } }
            let keyed = vector.keyframes.compactMap(\.scale).map { Double($0) * vector.objectScale }
            let rounded: (Double) -> Double = { ($0 * 1e9).rounded() / 1e9 }
            XCTAssertEqual(Set(played.map { rounded(Double($0)) }), Set(keyed.map(rounded)), vector.label)
        }
    }
}
