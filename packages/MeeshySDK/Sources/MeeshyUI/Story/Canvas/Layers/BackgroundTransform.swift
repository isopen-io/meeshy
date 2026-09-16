import QuartzCore

/// Affine transform applied to the background layer (zoom + pan + rotation).
/// Mirrors `StoryBackgroundTransform` from the SDK schema, in render-space.
///
/// All members are `nonisolated` so the struct can be used freely from both
/// the MeeshyUI (defaultIsolation MainActor) and nonisolated contexts.
///
/// Sorti de `StoryBackgroundLayer.swift` (#6636), qui passait le plafond de
/// 1200 lignes : on extrait d'abord, on ajoute ensuite. La valeur n'a rien à
/// voir avec le cycle de vie du calque — elle se lit seule.
public struct BackgroundTransform: Sendable, Equatable {
    public nonisolated var scale: Double
    public nonisolated var offsetX: Double
    public nonisolated var offsetY: Double
    public nonisolated var rotation: Double  // degrees
    /// Background fit mode override. `nil` = auto-by-orientation (landscape
    /// videos/images → letterbox, portrait → aspectFill). `"fit"` = forced
    /// letterbox. `"fill"` = forced aspectFill. Despite its `videoFitMode`
    /// name (legacy from the original spec), this override applies to BOTH
    /// `.video` and `.image` backgrounds — the resolver helpers
    /// `resolveVideoGravity` and `resolveImageGravity` share identical
    /// orientation logic and both consume this same field.
    public nonisolated var videoFitMode: String?

    public nonisolated init(scale: Double = 1.0, offsetX: Double = 0,
                            offsetY: Double = 0, rotation: Double = 0,
                            videoFitMode: String? = nil) {
        self.scale = scale
        self.offsetX = offsetX
        self.offsetY = offsetY
        self.rotation = rotation
        self.videoFitMode = videoFitMode
    }

    public nonisolated static let identity = BackgroundTransform()

    public nonisolated func caTransform() -> CATransform3D {
        let r = CGFloat(rotation * .pi / 180)
        var t = CATransform3DIdentity
        t = CATransform3DTranslate(t, CGFloat(offsetX), CGFloat(offsetY), 0)
        t = CATransform3DRotate(t, r, 0, 0, 1)
        t = CATransform3DScale(t, CGFloat(scale), CGFloat(scale), 1)
        return t
    }
}
