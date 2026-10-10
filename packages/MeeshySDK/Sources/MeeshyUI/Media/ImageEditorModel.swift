import CoreGraphics
import Foundation
import MeeshySDK

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

// `AdjustmentKind` et `ImageAdjustments` vivent dans le cœur
// (`MeeshySDK/Models/Story/ImageAdjustments.swift`) depuis #9175 : une image
// posée dans la scène les PORTE (`StoryMediaObject.adjustments`), et le modèle
// d'un objet ne peut pas dépendre de la couche UI.

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
