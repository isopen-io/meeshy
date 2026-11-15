import Foundation

// MARK: - FrameDecor (#10932)
//
// MIROIR de `packages/shared/types/frame-decor.ts` : les briques COMMUNES aux
// contours d'avatar et aux cadres de bannière — les DÉGRADÉS et les MOUVEMENTS
// déclarés. Un mouvement est une donnée, rendue par le GPU sur transform et
// opacity seuls ; il désigne ses cibles par le `group` des chemins qu'il anime.
// Sur divergence, le TypeScript a raison.
//
// Décodage TOLÉRANT là où il le faut : un mouvement inconnu ou hors bornes est
// IGNORÉ (les autres restent), un dégradé inconnu GARDE SA PLACE (`nil`) pour que
// l'index des traits reste juste, le trait retombant sur sa couleur.

public enum FrameMotionKind: String, Codable, Sendable, Hashable, CaseIterable {
    case rotate
    case pulse
    case sweep
    case twinkle
    case skew
}

/// `frame` : le centre du cadre ; `self` : le centre de la cible ; `top` / `bottom` : son bord.
public enum FrameMotionOrigin: String, Codable, Sendable, Hashable, CaseIterable {
    case frame
    case own = "self"
    case top
    case bottom
}

public enum FrameMotionDirection: String, Codable, Sendable, Hashable, CaseIterable {
    case normal
    case reverse
    case alternate
}

public struct FrameMotion: Codable, Sendable, Hashable {
    public static let maxMotions = 8
    public static let maxTargets = 16
    public static let durationRange: ClosedRange<Double> = 0.5...180
    public static let maxDelay: Double = 30
    public static let maxStagger: Double = 10

    public let kind: FrameMotionKind
    public let targets: [String]
    /// Secondes.
    public let duration: Double
    public let delay: Double?
    /// Le décalage entre deux cibles successives.
    public let stagger: Double?
    public let direction: FrameMotionDirection?
    public let amplitude: Double?
    public let origin: FrameMotionOrigin?

    /// L'amplitude admise par mouvement ; `nil` = il n'en prend pas.
    public static func amplitudeRange(_ kind: FrameMotionKind) -> ClosedRange<Double>? {
        switch kind {
        case .rotate: return 1...360
        case .pulse: return 0.01...0.3
        case .sweep: return nil
        case .twinkle: return 0.05...1
        case .skew: return 1...15
        }
    }

    public static func origins(_ kind: FrameMotionKind) -> Set<FrameMotionOrigin> {
        switch kind {
        case .rotate: return [.frame, .own, .top, .bottom]
        case .pulse: return [.frame, .own]
        case .sweep, .twinkle: return []
        case .skew: return [.own, .top, .bottom]
        }
    }

    private enum CodingKeys: String, CodingKey { case kind, targets, duration, delay, stagger, direction, amplitude, origin }

    public init(kind: FrameMotionKind, targets: [String], duration: Double, delay: Double? = nil, stagger: Double? = nil,
                direction: FrameMotionDirection? = nil, amplitude: Double? = nil, origin: FrameMotionOrigin? = nil) {
        self.kind = kind
        self.targets = targets
        self.duration = duration
        self.delay = delay
        self.stagger = stagger
        self.direction = direction
        self.amplitude = amplitude
        self.origin = origin
    }

    /// Fail-closed PAR mouvement : la liste qui le porte le tait (`FrameMotion.list`), jamais le cadre.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = try c.decode(FrameMotionKind.self, forKey: .kind)
        targets = try c.decode([String].self, forKey: .targets)
        duration = try c.decode(Double.self, forKey: .duration)
        delay = try c.decodeIfPresent(Double.self, forKey: .delay)
        stagger = try c.decodeIfPresent(Double.self, forKey: .stagger)
        direction = try c.decodeIfPresent(FrameMotionDirection.self, forKey: .direction)
        amplitude = try c.decodeIfPresent(Double.self, forKey: .amplitude)
        origin = try c.decodeIfPresent(FrameMotionOrigin.self, forKey: .origin)
        guard isWithinBounds else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "mouvement hors bornes")
        }
    }

    private var isWithinBounds: Bool {
        guard (1...Self.maxTargets).contains(targets.count), Set(targets).count == targets.count,
              targets.allSatisfy(FrameDecorField.isGroup) else { return false }
        guard Self.durationRange.contains(duration) else { return false }
        if let delay, !(0...Self.maxDelay).contains(delay) { return false }
        if let stagger, !(0...Self.maxStagger).contains(stagger) { return false }
        if let amplitude {
            guard let range = Self.amplitudeRange(kind), range.contains(amplitude) else { return false }
        }
        if let origin, !Self.origins(kind).contains(origin) { return false }
        return true
    }

    /// Les mouvements lisibles d'une liste, dans l'ordre, au plus huit.
    static func list<K: CodingKey>(from container: KeyedDecodingContainer<K>, forKey key: K) -> [FrameMotion] {
        let boxes = (try? container.decodeIfPresent([LossyBox<FrameMotion>].self, forKey: key)) ?? nil
        // Au-delà de trente-deux, la liste est un abus (le TypeScript refuse le dessin) : rien ne s'anime.
        guard let boxes, boxes.count <= 32 else { return [] }
        return Array(boxes.compactMap(\.value).prefix(maxMotions))
    }
}

public struct FrameGradientStop: Codable, Sendable, Hashable {
    /// Index dans la palette fixe du cadre.
    public let color: Int
    public let at: Double
    public let opacity: Double?
}

/// Un dégradé linéaire, en fractions de la boîte du chemin qui le porte.
public struct FrameGradient: Codable, Sendable, Hashable {
    public static let maxGradients = 4

    public let x1: Double
    public let y1: Double
    public let x2: Double
    public let y2: Double
    public let stops: [FrameGradientStop]

    private enum CodingKeys: String, CodingKey { case kind, x1, y1, x2, y2, stops }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard try c.decode(String.self, forKey: .kind) == "linear" else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "dégradé inconnu")
        }
        x1 = try c.decode(Double.self, forKey: .x1)
        y1 = try c.decode(Double.self, forKey: .y1)
        x2 = try c.decode(Double.self, forKey: .x2)
        y2 = try c.decode(Double.self, forKey: .y2)
        stops = try c.decode([FrameGradientStop].self, forKey: .stops)
        let unit: ClosedRange<Double> = 0...1
        guard [x1, y1, x2, y2].allSatisfy(unit.contains), (2...4).contains(stops.count),
              stops.allSatisfy({ unit.contains($0.at) && ($0.opacity.map(unit.contains) ?? true) && $0.color >= 0 }),
              zip(stops, stops.dropFirst()).allSatisfy({ $0.at <= $1.at }) else {
            throw DecodingError.dataCorruptedError(forKey: .stops, in: c, debugDescription: "dégradé hors bornes")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode("linear", forKey: .kind)
        try c.encode(x1, forKey: .x1)
        try c.encode(y1, forKey: .y1)
        try c.encode(x2, forKey: .x2)
        try c.encode(y2, forKey: .y2)
        try c.encode(stops, forKey: .stops)
    }

    /// Les dégradés d'un cadre de `colorCount` couleurs : un dégradé illisible, ou qui désigne une
    /// couleur absente, garde sa place (`nil`) — le trait qui le désigne retombe sur sa couleur.
    static func list<K: CodingKey>(from container: KeyedDecodingContainer<K>, forKey key: K, colorCount: Int) -> [FrameGradient?] {
        let boxes = (try? container.decodeIfPresent([LossyBox<FrameGradient>].self, forKey: key)) ?? nil
        return Array((boxes ?? []).map { box in box.value.flatMap { $0.stops.allSatisfy { $0.color < colorCount } ? $0 : nil } }.prefix(maxGradients))
    }
}

enum FrameDecorField {
    private static let pathData = try? NSRegularExpression(pattern: #"^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]+$"#)

    /// Les seules commandes de chemin SVG, comme `PATH_D_PATTERN` : aucun autre caractère ne se dessine.
    static func isPathData(_ value: String, maxLength: Int) -> Bool {
        guard !value.isEmpty, value.count <= maxLength, let pathData else { return false }
        return pathData.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) != nil
    }

    /// L'identifiant d'un groupe de chemins : le motif des slugs de packs.
    static func isGroup(_ value: String) -> Bool {
        value.range(of: #"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"#, options: .regularExpression) != nil && value.count <= 24
    }
}
