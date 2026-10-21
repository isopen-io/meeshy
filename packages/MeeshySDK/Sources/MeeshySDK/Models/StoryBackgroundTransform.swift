import CoreGraphics
import Foundation

// MARK: - Background Transform

public struct StoryBackgroundTransform: Codable, Sendable {
    public var scale: CGFloat?
    public var offsetX: CGFloat?
    public var offsetY: CGFloat?
    public var rotation: Double?
    /// User override for video background gravity. `nil` = auto by orientation
    /// (landscape → letterbox, portrait → aspectFill). `"fit"` = forced letterbox.
    /// `"fill"` = forced aspectFill. Same semantics applied to image backgrounds.
    public var videoFitMode: String?
    /// **Le fond des bandes d'un média AJUSTÉ** (#8414, panneau Cadre) : une
    /// valeur brute de `StoryBackdrop` — `nil` = le flou du média, la loi
    /// d'avant le panneau. Contrat commun au web, d'où la chaîne brute.
    public var backdrop: String?

    public init(scale: CGFloat? = nil, offsetX: CGFloat? = nil,
                offsetY: CGFloat? = nil, rotation: Double? = nil,
                videoFitMode: String? = nil, backdrop: String? = nil) {
        self.scale = scale; self.offsetX = offsetX
        self.offsetY = offsetY; self.rotation = rotation
        self.videoFitMode = videoFitMode
        self.backdrop = backdrop
    }

    public var isIdentity: Bool {
        (scale ?? 1.0) == 1.0 && (offsetX ?? 0) == 0 && (offsetY ?? 0) == 0
            && (rotation ?? 0) == 0 && videoFitMode == nil && backdrop == nil
    }
}
