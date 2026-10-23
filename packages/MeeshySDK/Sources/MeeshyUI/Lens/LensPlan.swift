import CoreGraphics
import Foundation
import MeeshySDK

/// Le palier de dégradation d'une lens : `reduced` masque ce que la lens nomme
/// dans `fallbacks.reduced` et divise les particules par deux ; `minimal` masque
/// aussi `fallbacks.minimal` et retire toute particule.
public nonisolated enum LensLevel: String, Sendable, CaseIterable {
    case full
    case reduced
    case minimal
}

public nonisolated struct LensDot: Sendable, Equatable {
    public let x: Double
    public let y: Double
    public let r: Double
    public let alpha: Double
}

public nonisolated struct LensLutOp: Sendable, Equatable {
    public let id: String
    public let asset: String
    public let intensity: Double
}

public nonisolated struct LensFrameOp: Sendable, Equatable {
    public let id: String
    public let motif: String
    public let opacity: Double
}

/// Un sticker centré en (`x`, `y`), carré de `size` pixels, tourné de `rotation`
/// radians dans le sens des aiguilles d'une montre.
public nonisolated struct LensStickerOp: Sendable, Equatable {
    public let id: String
    public let asset: String
    public let x: Double
    public let y: Double
    public let size: Double
    public let rotation: Double
}

public nonisolated struct LensTextOp: Sendable, Equatable {
    public let id: String
    public let text: String
    public let language: String
    public let font: LensFont
    public let pixelSize: Int
    public let color: String
    public let x: Double
    public let y: Double
}

public nonisolated struct LensParticlesOp: Sendable, Equatable {
    public let id: String
    public let preset: LensParticlePreset
    public let dots: [LensDot]
}

/// Une opération de dessin. Coordonnées en PIXELS de l'image, origine en HAUT à
/// gauche — le repère du canevas du web, pour que les deux plans soient le même.
public nonisolated enum LensDrawOp: Sendable, Equatable {
    case lut(LensLutOp)
    case frame(LensFrameOp)
    case sticker(LensStickerOp)
    case text(LensTextOp)
    case particles(LensParticlesOp)

    public var id: String {
        switch self {
        case let .lut(op): return op.id
        case let .frame(op): return op.id
        case let .sticker(op): return op.id
        case let .text(op): return op.id
        case let .particles(op): return op.id
        }
    }
}

public nonisolated struct LensPlanInput: Sendable {
    public let lens: LensDocument
    public let frame: CGSize
    /// La boîte du visage en pixels, origine en haut ; `nil` : aucune couche ancrée au visage ne se pose.
    public let face: CGRect?
    /// Les langues du lecteur, dans l'ordre du Prisme.
    public let languages: [String]
    public let level: LensLevel
    public let milliseconds: Double

    public init(lens: LensDocument, frame: CGSize, face: CGRect?, languages: [String], level: LensLevel, milliseconds: Double) {
        self.lens = lens
        self.frame = frame
        self.face = face
        self.languages = languages
        self.level = level
        self.milliseconds = milliseconds
    }
}

/// **CE QU'UNE LENS PEINT SUR UNE IMAGE** (#11300) — pur, et le MÊME que
/// `planLens` du web (`apps/web/src/lib/meeshy-lens/lens-plan.ts`, W14 #11320) :
/// le golden `packages/shared/fixtures/lens-v1/aurore-polaire.plan.json` est
/// rejoué par les deux. Une couche ancrée au visage suit sa boîte, sa taille en
/// largeurs de visage ; ancrée à l'écran, en petits côtés de l'image. Les
/// particules sont déterministes : la même image au même instant, le même dessin.
public nonisolated enum LensPlan {

    static let particlePeriod = 4000.0
    static let golden = 0.6180339887
    static let plastic = 0.7548776662
    static let dotRadius = 0.012
    static let anchoredField = 1.2
    static let degrees = Double.pi / 180

    /// Les points nommés du visage, en fractions de sa boîte, sur un visage de face.
    /// Les côtés sont ceux de la PERSONNE sur l'image envoyée, jamais en miroir.
    static func fractions(of point: LensFacePoint) -> (x: Double, y: Double) {
        switch point {
        case .topOfHead: return (0.5, -0.12)
        case .forehead: return (0.5, 0.18)
        case .leftEyebrow: return (0.67, 0.3)
        case .rightEyebrow: return (0.33, 0.3)
        case .leftEye: return (0.67, 0.4)
        case .rightEye: return (0.33, 0.4)
        case .noseTip: return (0.5, 0.6)
        case .mouth: return (0.5, 0.78)
        case .chin: return (0.5, 0.98)
        case .leftCheek: return (0.75, 0.65)
        case .rightCheek: return (0.25, 0.65)
        case .leftEar: return (1, 0.48)
        case .rightEar: return (0, 0.48)
        }
    }

    public static func plan(_ input: LensPlanInput) -> [LensDrawOp] {
        let hidden = hiddenIds(input.lens, level: input.level)
        let ops = input.lens.layers.filter { !hidden.contains($0.id) }.compactMap { op(of: $0, input: input) }
        return ops.filter(isLut) + ops.filter { !isLut($0) }
    }

    public static func anchorPoint(_ anchor: LensAnchor, frame: CGSize, face: CGRect?) -> CGPoint? {
        switch anchor {
        case let .screen(x, y):
            return CGPoint(x: x * Double(frame.width), y: y * Double(frame.height))
        case let .face(point, dx, dy):
            guard let face else { return nil }
            let at = fractions(of: point)
            let width = Double(face.width)
            return CGPoint(x: Double(face.minX) + at.x * width + (dx ?? 0) * width,
                           y: Double(face.minY) + at.y * Double(face.height) + (dy ?? 0) * width)
        }
    }

    public static func particleCount(_ density: LensDensity, level: LensLevel) -> Int {
        let full: Int = {
            switch density {
            case .low: return 12
            case .mid: return 24
            case .high: return 40
            }
        }()
        switch level {
        case .full: return full
        case .reduced: return (full + 1) / 2
        case .minimal: return 0
        }
    }

    // MARK: - Les couches

    private static func isLut(_ op: LensDrawOp) -> Bool {
        guard case .lut = op else { return false }
        return true
    }

    private static func hiddenIds(_ lens: LensDocument, level: LensLevel) -> Set<String> {
        guard level != .full else { return [] }
        let reduced = lens.fallbacks?.reduced?.hide ?? []
        let minimal = level == .minimal ? (lens.fallbacks?.minimal?.hide ?? []) : []
        return Set(reduced + minimal)
    }

    private static func anchorScale(_ anchor: LensAnchor, frame: CGSize, face: CGRect?) -> Double {
        guard case .face = anchor, let face else { return Double(min(frame.width, frame.height)) }
        return Double(face.width)
    }

    private static func op(of layer: LensLayer, input: LensPlanInput) -> LensDrawOp? {
        switch layer {
        case let .lut(lut):
            return .lut(LensLutOp(id: lut.id, asset: lut.asset, intensity: lut.intensity ?? 1))
        case let .frame(frame):
            return .frame(LensFrameOp(id: frame.id, motif: frame.motif, opacity: frame.opacity ?? 1))
        case let .sticker(sticker):
            guard let at = anchorPoint(sticker.anchor, frame: input.frame, face: input.face) else { return nil }
            return .sticker(LensStickerOp(id: sticker.id, asset: sticker.asset, x: cents(Double(at.x)), y: cents(Double(at.y)),
                                          size: cents(sticker.size * anchorScale(sticker.anchor, frame: input.frame, face: input.face)),
                                          rotation: (sticker.rotation ?? 0) * degrees))
        case let .text(text):
            guard let at = anchorPoint(text.anchor, frame: input.frame, face: input.face) else { return nil }
            let served = servedText(text.text, languages: input.languages)
            return .text(LensTextOp(id: text.id, text: served.text, language: served.language, font: text.font,
                                    pixelSize: max(1, Int(jsRound(text.size * Double(input.frame.height)))),
                                    color: text.color, x: cents(Double(at.x)), y: cents(Double(at.y))))
        case let .particles(particles):
            return particlesOp(particles, input: input)
        }
    }

    private static func particlesOp(_ layer: LensParticlesLayer, input: LensPlanInput) -> LensDrawOp? {
        let count = particleCount(layer.density, level: input.level)
        guard count > 0, let field = field(of: layer.anchor, frame: input.frame, face: input.face) else { return nil }
        return .particles(LensParticlesOp(id: layer.id, preset: layer.preset,
                                          dots: dots(preset: layer.preset, count: count, field: field, milliseconds: input.milliseconds)))
    }

    private static func servedText(_ text: [String: String], languages: [String]) -> (text: String, language: String) {
        let language = languages.first { text[$0] != nil } ?? "fr"
        return (text[language] ?? text["fr"] ?? "", language)
    }

    // MARK: - Les particules

    nonisolated struct Field {
        let left: Double
        let top: Double
        let width: Double
        let height: Double
        let scale: Double
    }

    private static func field(of anchor: LensAnchor?, frame: CGSize, face: CGRect?) -> Field? {
        guard let anchor else {
            return Field(left: 0, top: 0, width: Double(frame.width), height: Double(frame.height), scale: Double(min(frame.width, frame.height)))
        }
        guard let at = anchorPoint(anchor, frame: frame, face: face) else { return nil }
        let scale = anchorScale(anchor, frame: frame, face: face)
        let side = scale * anchoredField
        return Field(left: Double(at.x) - side / 2, top: Double(at.y) - side / 2, width: side, height: side, scale: scale)
    }

    private static func falls(_ preset: LensParticlePreset) -> Bool {
        preset == .snow || preset == .petals || preset == .confetti
    }

    static func dots(preset: LensParticlePreset, count: Int, field: Field, milliseconds: Double) -> [LensDot] {
        (0..<count).map { index in
            let u = fract(Double(index + 1) * golden)
            let phase = fract(Double(index + 1) * plastic + milliseconds / particlePeriod)
            let y = falls(preset) ? field.top + phase * field.height : field.top + (1 - phase) * field.height
            return LensDot(x: cents(field.left + u * field.width), y: cents(y),
                           r: cents(field.scale * dotRadius * (0.6 + 0.8 * u)), alpha: cents(sin(phase * Double.pi)))
        }
    }

    // MARK: - L'arithmétique du web

    private static func fract(_ value: Double) -> Double { value - value.rounded(.down) }

    /// `Math.round` : l'entier le plus proche, les demis vers +∞.
    static func jsRound(_ value: Double) -> Double {
        let floor = value.rounded(.down)
        return value - floor >= 0.5 ? floor + 1 : floor
    }

    /// Au centième, comme le plan du web.
    static func cents(_ value: Double) -> Double { jsRound(value * 100) / 100 }
}

extension LensFaceFrame {
    /// La boîte du visage en pixels d'une image de `size`, origine en HAUT (Vision la rend
    /// normalisée, origine en bas).
    public nonisolated func imageBox(in size: CGSize) -> CGRect {
        CGRect(x: boundingBox.minX * size.width, y: (1 - boundingBox.maxY) * size.height,
               width: boundingBox.width * size.width, height: boundingBox.height * size.height)
    }
}
