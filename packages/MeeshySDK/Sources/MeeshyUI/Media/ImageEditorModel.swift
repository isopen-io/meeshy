import CoreGraphics
import Foundation

// MARK: - Image Editor Mode

/// Two-way switch selecting the editor surface density.
///
/// `.simple` — curated essentials (crop, core filters, 3 adjustments).
/// `.pro`    — full toolset (all ratios, all filters, 9 adjustments, effects).
///
/// Mirrors the Story timeline `TimelineMode` so the Simple/Pro affordance is
/// consistent across the app.
public enum ImageEditorMode: String, Codable, Sendable, CaseIterable {
    case simple
    case pro

    public var toggled: ImageEditorMode {
        self == .simple ? .pro : .simple
    }

    public var isPro: Bool { self == .pro }
}

// MARK: - Adjustment Kind

/// A single non-destructive tonal/colour adjustment. `CaseIterable` drives the
/// adjustment panel UI so adding a slider never requires touching the view.
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
public struct ImageAdjustments: Codable, Equatable, Sendable {
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

    /// Count of adjustments that currently differ from neutral.
    public var activeCount: Int {
        AdjustmentKind.allCases.reduce(0) { acc, kind in
            abs(self[kind] - kind.neutralValue) > 0.0001 ? acc + 1 : acc
        }
    }
}

// MARK: - Image Edit State

/// The complete non-destructive description of an edit. It is a small value
/// type (~100 bytes) — the source image is never embedded — so a full history
/// of snapshots costs almost nothing and `render` can be replayed at any
/// resolution from the untouched original.
public struct ImageEditState: Codable, Equatable, Sendable {
    /// Orthogonal rotation in 90° clockwise steps (normalised to 0...3).
    public var orientationTurns: Int
    public var flipHorizontal: Bool
    public var flipVertical: Bool
    /// Crop rectangle in the oriented image's normalised [0,1] space.
    /// `nil` means the full frame.
    public var cropNormalized: CGRect?
    public var filter: ImageFilter
    public var adjustments: ImageAdjustments
    public var effect: ImageEffect

    public init(
        orientationTurns: Int = 0,
        flipHorizontal: Bool = false,
        flipVertical: Bool = false,
        cropNormalized: CGRect? = nil,
        filter: ImageFilter = .original,
        adjustments: ImageAdjustments = .neutral,
        effect: ImageEffect = .none
    ) {
        self.orientationTurns = ((orientationTurns % 4) + 4) % 4
        self.flipHorizontal = flipHorizontal
        self.flipVertical = flipVertical
        self.cropNormalized = cropNormalized
        self.filter = filter
        self.adjustments = adjustments
        self.effect = effect
    }

    public static let identity = ImageEditState()

    public var hasEdits: Bool { self != ImageEditState.identity }

    /// True when only colour/tonal edits are applied — geometry is untouched.
    public var hasGeometryEdits: Bool {
        orientationTurns != 0 || flipHorizontal || flipVertical || cropNormalized != nil
    }

    // MARK: Geometry mutations

    /// Rotates 90° clockwise, carrying any existing crop into the new frame.
    public mutating func rotateClockwise() {
        orientationTurns = (orientationTurns + 1) % 4
        if let crop = cropNormalized {
            cropNormalized = ImageEditState.rotateRectCW(crop)
        }
    }

    /// Rotates 90° counter-clockwise, carrying any existing crop.
    public mutating func rotateCounterClockwise() {
        orientationTurns = (orientationTurns + 3) % 4
        if let crop = cropNormalized {
            cropNormalized = ImageEditState.rotateRectCW(ImageEditState.rotateRectCW(ImageEditState.rotateRectCW(crop)))
        }
    }

    public mutating func toggleFlipHorizontal() {
        flipHorizontal.toggle()
        if let crop = cropNormalized {
            cropNormalized = ImageEditState.flipRectHorizontal(crop)
        }
    }

    public mutating func toggleFlipVertical() {
        flipVertical.toggle()
        if let crop = cropNormalized {
            cropNormalized = ImageEditState.flipRectVertical(crop)
        }
    }

    /// Rotates a normalised rect 90° clockwise within the unit square.
    public static func rotateRectCW(_ r: CGRect) -> CGRect {
        CGRect(x: 1 - r.minY - r.height, y: r.minX, width: r.height, height: r.width)
    }

    public static func flipRectHorizontal(_ r: CGRect) -> CGRect {
        CGRect(x: 1 - r.minX - r.width, y: r.minY, width: r.width, height: r.height)
    }

    public static func flipRectVertical(_ r: CGRect) -> CGRect {
        CGRect(x: r.minX, y: 1 - r.minY - r.height, width: r.width, height: r.height)
    }
}
