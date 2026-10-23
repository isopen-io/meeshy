import CoreGraphics
import Foundation
import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// #11300 — **ce qu'une lens peint, décidé à l'identique sur iOS et sur le web**.
/// Le golden `aurore-polaire` est le MÊME fichier que rejoue le web (W14, #11320) :
/// la lens complète des vecteurs partagés, à 1280 × 720, visage au centre, à t = 1 000 ms.
final class LensPlanTests: XCTestCase {

    private static let frame = CGSize(width: 1280, height: 720)
    private static let face = CGRect(x: 520, y: 160, width: 240, height: 312)

    // MARK: - Le golden partagé

    func test_plan_reproducesTheSharedGolden_exactlyAsTheWebDoes() throws {
        let golden = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: Self.repoFile("packages/shared/fixtures/lens-v1/aurore-polaire.plan.json"))) as? [Any])

        let plan = LensPlan.plan(Self.input(time: 1000))

        XCTAssertEqual(plan.count, golden.count)
        zip(plan.map(Self.json), golden).enumerated().forEach { index, pair in
            Self.assertSameJSON(pair.0, pair.1, at: "op[\(index)]")
        }
    }

    // MARK: - L'ancrage

    func test_faceAnchor_followsTheFaceBox_andIsOffsetInFaceWidths() {
        let point = LensPlan.anchorPoint(.face(point: .noseTip, dx: 0.5, dy: -0.25), frame: Self.frame, face: Self.face)

        XCTAssertEqual(point, CGPoint(x: 640 + 120, y: 160 + 0.6 * 312 - 60))
    }

    func test_screenAnchor_isAFractionOfTheImage() {
        XCTAssertEqual(LensPlan.anchorPoint(.screen(x: 0.25, y: 0.5), frame: Self.frame, face: nil), CGPoint(x: 320, y: 360))
    }

    func test_faceAnchoredSticker_movesWithTheFace() {
        let moved = Self.face.offsetBy(dx: 100, dy: 40)

        let before = Self.stickers(LensPlan.plan(Self.input()))
        let after = Self.stickers(LensPlan.plan(Self.input(face: moved)))

        XCTAssertEqual(after.first?.x, before.first.map { $0.x + 100 })
        XCTAssertEqual(after.first?.y, before.first.map { $0.y + 40 })
        XCTAssertEqual(after.last?.x, before.last?.x, "un sticker ancré à l'écran ne suit pas le visage")
    }

    /// Sans visage, une couche ancrée au visage ne se pose nulle part au hasard : elle se tait.
    func test_withoutAFace_faceAnchoredLayersAreLeftOut() {
        let ids = LensPlan.plan(Self.input(face: nil)).map(\.id)

        XCTAssertEqual(ids, ["grade", "cadre", "etoile", "legende", "neige"])
    }

    // MARK: - Le Prisme du texte

    func test_text_isServedInTheFirstReaderLanguageItCarries_elseInFrench() {
        XCTAssertEqual(Self.caption(["de", "en"]), "en:Happy new year")
        XCTAssertEqual(Self.caption(["es"]), "es:Feliz año")
        XCTAssertEqual(Self.caption(["ar", "de"]), "fr:Bonne année")
        XCTAssertEqual(Self.caption([]), "fr:Bonne année")
    }

    // MARK: - Les paliers

    func test_reducedLevel_hidesWhatTheLensNames() {
        XCTAssertEqual(LensPlan.plan(Self.input(level: .reduced)).map(\.id), ["grade", "cadre", "couronne", "etoile", "legende"])
    }

    func test_minimalLevel_hidesBothLists() {
        XCTAssertEqual(LensPlan.plan(Self.input(level: .minimal)).map(\.id), ["grade", "cadre", "etoile", "legende"])
    }

    func test_particles_areBounded_andHalvedThenRemovedByLevel() {
        let snow = LensLayer.particles(LensParticlesLayer(id: "flocons", preset: .snow, density: .mid, anchor: nil))
        let count = { (level: LensLevel) in
            LensPlan.plan(Self.input(layers: [snow], level: level)).compactMap(Self.dots).first?.count ?? 0
        }

        XCTAssertEqual(count(.full), 24)
        XCTAssertEqual(count(.reduced), 12)
        XCTAssertEqual(count(.minimal), 0)
        XCTAssertLessThanOrEqual(LensPlan.particleCount(.high, level: .full), 40)
    }

    // MARK: - Le temps

    func test_particles_areDeterministic_andMoveWithTime() {
        let hearts = LensLayer.particles(LensParticlesLayer(id: "coeurs", preset: .hearts, density: .low, anchor: .face(point: .topOfHead, dx: nil, dy: nil)))
        let dots = { (time: Double) in LensPlan.plan(Self.input(layers: [hearts], time: time)).compactMap(Self.dots).first ?? [] }

        XCTAssertEqual(dots(500), dots(500))
        XCTAssertNotEqual(dots(500), dots(1500))
        XCTAssertEqual(dots(0), dots(4000), "le cycle d'une particule dure quatre secondes")
    }

    // MARK: - Le visage de Vision

    /// Vision rend une boîte normalisée, origine en BAS à gauche ; le plan lit des pixels, origine en HAUT.
    func test_visionFace_becomesAPixelBox_withTheOriginOnTop() {
        let visage = LensFaceFrame(boundingBox: CGRect(x: 0.25, y: 0.5, width: 0.25, height: 0.25), points: [],
                                   leftEye: [], rightEye: [], innerLips: [], yaw: nil, roll: nil, pitch: nil)

        XCTAssertEqual(visage.imageBox(in: CGSize(width: 400, height: 200)), CGRect(x: 100, y: 50, width: 100, height: 50))
    }

    // MARK: - Outils

    private static func repoFile(_ path: String) -> URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url.appendingPathComponent(path)
    }

    private struct SharedVector: Decodable { let input: LensJSONValue }
    private struct SharedVectors: Decodable { let vectors: [SharedVector] }

    private static func sharedLens() -> LensDocument {
        guard let data = try? Data(contentsOf: repoFile("packages/shared/fixtures/lens-v1/vectors.json")),
              let first = try? JSONDecoder().decode(SharedVectors.self, from: data).vectors.first,
              case let .ok(lens, _, _) = LensFormat.parse(first.input) else {
            preconditionFailure("le premier vecteur partagé est la lens aurore-polaire")
        }
        return lens
    }

    private static func input(layers: [LensLayer]? = nil, face: CGRect? = Self.face,
                              languages: [String] = ["fr"], level: LensLevel = .full, time: Double = 0) -> LensPlanInput {
        let lens = sharedLens()
        let document = layers.map { LensDocument(id: lens.id, name: lens.name, names: lens.names, credits: lens.credits, surfaces: lens.surfaces,
                                                 cost: lens.cost, window: lens.window, layers: $0, triggers: [], fallbacks: nil) } ?? lens
        return LensPlanInput(lens: document, frame: frame, face: face, languages: languages, level: level, milliseconds: time)
    }

    private static func caption(_ languages: [String]) -> String? {
        LensPlan.plan(input(languages: languages)).compactMap { op -> String? in
            guard case let .text(text) = op else { return nil }
            return "\(text.language):\(text.text)"
        }.first
    }

    private static func stickers(_ plan: [LensDrawOp]) -> [LensStickerOp] {
        plan.compactMap { op in
            guard case let .sticker(sticker) = op else { return nil }
            return sticker
        }
    }

    private static func dots(_ op: LensDrawOp) -> [LensDot]? {
        guard case let .particles(particles) = op else { return nil }
        return particles.dots
    }

    /// La forme JSON du plan du web : ce que `JSON.stringify(planLens(…))` écrit.
    private static func json(_ op: LensDrawOp) -> [String: Any] {
        switch op {
        case let .lut(lut):
            return ["kind": "lut", "id": lut.id, "asset": lut.asset, "intensity": lut.intensity]
        case let .frame(frame):
            return ["kind": "frame", "id": frame.id, "motif": frame.motif, "opacity": frame.opacity]
        case let .sticker(sticker):
            return ["kind": "sticker", "id": sticker.id, "asset": sticker.asset, "x": sticker.x, "y": sticker.y,
                    "size": sticker.size, "rotation": sticker.rotation]
        case let .text(text):
            return ["kind": "text", "id": text.id, "text": text.text, "language": text.language,
                    "font": "\(text.pixelSize)px \"\(text.font.rawValue)\"", "color": text.color, "x": text.x, "y": text.y]
        case let .particles(particles):
            return ["kind": "particles", "id": particles.id, "preset": particles.preset.rawValue,
                    "dots": particles.dots.map { ["x": $0.x, "y": $0.y, "r": $0.r, "alpha": $0.alpha] as [String: Any] }]
        }
    }

    private static func assertSameJSON(_ actual: Any, _ expected: Any, at path: String, file: StaticString = #filePath, line: UInt = #line) {
        switch (actual, expected) {
        case let (a as [String: Any], e as [String: Any]):
            XCTAssertEqual(Set(a.keys), Set(e.keys), path, file: file, line: line)
            e.forEach { key, value in a[key].map { assertSameJSON($0, value, at: "\(path).\(key)", file: file, line: line) } }
        case let (a as [Any], e as [Any]):
            XCTAssertEqual(a.count, e.count, path, file: file, line: line)
            zip(a, e).enumerated().forEach { assertSameJSON($0.element.0, $0.element.1, at: "\(path)[\($0.offset)]", file: file, line: line) }
        case let (a as String, e as String):
            XCTAssertEqual(a, e, path, file: file, line: line)
        case let (a as Double, e as NSNumber):
            XCTAssertEqual(a, e.doubleValue, accuracy: 1e-9, path, file: file, line: line)
        default:
            XCTFail("\(path) : \(actual) ≠ \(expected)", file: file, line: line)
        }
    }
}
