import Foundation

// MARK: - Adjustment Kind

/// A single non-destructive tonal/colour adjustment. `CaseIterable` drives the
/// adjustment panels (the full-screen avatar editor and the scene's in-place
/// editor, #9175) so adding a slider never requires touching a view.
///
/// Lives in the CORE since #9175: an image placed on a scene CARRIES its
/// adjustments (`StoryMediaObject.adjustments`), and an object model cannot
/// depend on the UI layer. The rendering stays in `ImageFilterEngine` (MeeshyUI).
public enum AdjustmentKind: String, Codable, Sendable, CaseIterable, Identifiable {
    case exposure
    case brightness
    case contrast
    case saturation
    case vibrance
    case temperature
    case sharpness
    case blur
    case vignette

    public var id: String { rawValue }

    /// Adjustments surfaced in Simple mode. Pro mode shows every case.
    public var isEssential: Bool {
        switch self {
        case .brightness, .contrast, .saturation: return true
        default: return false
        }
    }

    public var icon: String {
        switch self {
        case .exposure: return "plusminus"
        case .brightness: return "sun.max.fill"
        case .contrast: return "circle.lefthalf.filled"
        case .saturation: return "drop.fill"
        case .vibrance: return "paintpalette.fill"
        case .temperature: return "thermometer.medium"
        case .sharpness: return "wand.and.rays"
        case .blur: return "aqi.medium"
        case .vignette: return "camera.filters"
        }
    }

    /// User-facing slider bounds. The neutral value sits inside the range.
    public var range: ClosedRange<Float> {
        switch self {
        case .exposure: return -2.0...2.0
        case .brightness: return -0.4...0.4
        case .contrast: return 0.5...1.5
        case .saturation: return 0.0...2.0
        case .vibrance: return -1.0...1.0
        case .temperature: return -1.0...1.0
        case .sharpness: return 0.0...1.0
        case .blur: return 0.0...1.0
        case .vignette: return 0.0...2.0
        }
    }

    /// The value at which the adjustment is a no-op.
    public var neutralValue: Float {
        switch self {
        case .contrast, .saturation: return 1.0
        default: return 0.0
        }
    }

    public var label: String {
        switch self {
        case .exposure: return "Exposition"
        case .brightness: return "Luminosit\u{00E9}"
        case .contrast: return "Contraste"
        case .saturation: return "Saturation"
        case .vibrance: return "Vibrance"
        case .temperature: return "Temp\u{00E9}rature"
        case .sharpness: return "Nettet\u{00E9}"
        case .blur: return "Flou"
        case .vignette: return "Vignette"
        }
    }
}

// MARK: - Image Adjustments

/// Bag of non-destructive adjustment values. All defaults are neutral, so a
/// freshly constructed value applies no change.
///
/// ## The wire form (#9175)
///
/// Only the ACTIVE values are written — a neutral one is omitted and its absence
/// restores it, like every other default of the scene object models. Decoding is
/// lenient and bounded: a missing or unreadable key reads as neutral, and an
/// out-of-range value is clamped to its slider range. The payload never decides
/// the cost of a render — a `blur` of 400 would otherwise ask CoreImage for a
/// 6 400 px Gaussian radius on every reader.
public struct ImageAdjustments: Codable, Hashable, Sendable {
    public var exposure: Float
    public var brightness: Float
    public var contrast: Float
    public var saturation: Float
    public var vibrance: Float
    public var temperature: Float
    public var sharpness: Float
    public var blur: Float
    public var vignette: Float

    public init(
        exposure: Float = 0,
        brightness: Float = 0,
        contrast: Float = 1,
        saturation: Float = 1,
        vibrance: Float = 0,
        temperature: Float = 0,
        sharpness: Float = 0,
        blur: Float = 0,
        vignette: Float = 0
    ) {
        self.exposure = exposure
        self.brightness = brightness
        self.contrast = contrast
        self.saturation = saturation
        self.vibrance = vibrance
        self.temperature = temperature
        self.sharpness = sharpness
        self.blur = blur
        self.vignette = vignette
    }

    public static let neutral = ImageAdjustments()

    public var isNeutral: Bool { self == ImageAdjustments.neutral }

    public subscript(kind: AdjustmentKind) -> Float {
        get {
            switch kind {
            case .exposure: return exposure
            case .brightness: return brightness
            case .contrast: return contrast
            case .saturation: return saturation
            case .vibrance: return vibrance
            case .temperature: return temperature
            case .sharpness: return sharpness
            case .blur: return blur
            case .vignette: return vignette
            }
        }
        set {
            let clamped = min(max(newValue, kind.range.lowerBound), kind.range.upperBound)
            switch kind {
            case .exposure: exposure = clamped
            case .brightness: brightness = clamped
            case .contrast: contrast = clamped
            case .saturation: saturation = clamped
            case .vibrance: vibrance = clamped
            case .temperature: temperature = clamped
            case .sharpness: sharpness = clamped
            case .blur: blur = clamped
            case .vignette: vignette = clamped
            }
        }
    }

    /// Whether `kind` differs from its neutral value.
    public func isActive(_ kind: AdjustmentKind) -> Bool {
        abs(self[kind] - kind.neutralValue) > 0.0001
    }

    /// Count of adjustments that currently differ from neutral.
    public var activeCount: Int {
        AdjustmentKind.allCases.filter(isActive).count
    }

    /// The active values only, keyed by `AdjustmentKind.rawValue` — what travels.
    public var activeValues: [String: Float] {
        Dictionary(uniqueKeysWithValues: AdjustmentKind.allCases.filter(isActive).map { ($0.rawValue, self[$0]) })
    }

    /// Rebuilds a value from `activeValues`-shaped input: unknown keys are
    /// ignored, missing ones stay neutral, every value is clamped.
    public init(values: [String: Double]) {
        self = AdjustmentKind.allCases.reduce(into: ImageAdjustments()) { result, kind in
            guard let value = values[kind.rawValue], value.isFinite else { return }
            result[kind] = Float(value)
        }
    }

    private struct Key: CodingKey {
        let stringValue: String
        var intValue: Int? { nil }
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: Key.self)
        let values = AdjustmentKind.allCases.reduce(into: [String: Double]()) { result, kind in
            let key = Key(stringValue: kind.rawValue)
            guard let value = try? container.decodeIfPresent(Double.self, forKey: key) else { return }
            result[kind.rawValue] = value
        }
        self.init(values: values)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: Key.self)
        for kind in AdjustmentKind.allCases where isActive(kind) {
            try container.encode(self[kind], forKey: Key(stringValue: kind.rawValue))
        }
    }
}

// MARK: - CanvasV3 payload

extension ImageAdjustments {

    /// `payload.adjustments` of a v3 `media` object — an object of the active
    /// values, `nil` when nothing is active (the absence restores neutral).
    var canvasPayload: CanvasJSONValue? {
        guard activeCount > 0 else { return nil }
        return .object(activeValues.mapValues { .number(Double("\($0)") ?? Double($0)) })
    }

    /// Reads `payload.adjustments`; `nil` when absent, not an object, or neutral.
    init?(canvasPayload: CanvasJSONValue?) {
        guard case .object(let entries)? = canvasPayload else { return nil }
        let values = entries.compactMapValues { value -> Double? in
            if case .number(let number) = value { return number }
            return nil
        }
        let reglages = ImageAdjustments(values: values)
        guard reglages.activeCount > 0 else { return nil }
        self = reglages
    }
}
