import SwiftUI

// MARK: - Adaptive Liquid Glass surface (#7884)

/// A Liquid Glass SURFACE — a panel or a control that must read as glass on
/// every supported OS, not merely as a blur.
///
/// - iOS 26+: the real `.glassEffect`, identical to `adaptiveGlass`.
/// - iOS 16→25: a hand-made liquid glass — a material blur, an optional tint
///   wash, a specular sheen fading from the top edge, a rim brighter on the lit
///   edge than on the shaded one, and a soft drop shadow that lifts the surface
///   off the content beneath.
///
/// `adaptiveGlass` keeps its plain material fallback: its 87 call sites were
/// designed against it. This atom is for surfaces that must look like glass
/// below iOS 26 too.
///
/// Opaque atom, per SDK purity: the caller passes a `Shape` and a `Color`.
///
/// Un renvoi : la matière, la recette et la réponse au toucher vivent dans
/// `.meeshyGlass` (`Kit/MeeshyGlassSurface.swift`), au ton `theme` — la recette
/// d'ici, inchangée au repos.
public extension View {
    func adaptiveLiquidGlass<S: Shape>(
        in shape: S,
        tint: Color? = nil,
        interactive: Bool = false
    ) -> some View {
        meeshyGlass(in: shape, tone: .theme, tint: tint, isInteractive: interactive)
    }
}

/// The hand-made glass recipe, as plain values — a `ViewModifier` cannot be
/// inspected, its recipe can. It is the `theme` tone of `MeeshyGlassRecipe`.
public nonisolated struct LiquidGlassFallbackRecipe: Equatable, Sendable {
    public let tintWash: Double
    public let sheen: Double
    public let rimLit: Double
    public let rimShade: Double
    public let shadowOpacity: Double
    public let shadowRadius: CGFloat

    public static func resolve(isDark: Bool, isTinted: Bool) -> LiquidGlassFallbackRecipe {
        LiquidGlassFallbackRecipe(
            tintWash: isTinted ? (isDark ? 0.22 : 0.16) : 0,
            sheen: isDark ? 0.10 : 0.32,
            rimLit: isDark ? 0.32 : 0.75,
            rimShade: isDark ? 0.06 : 0.14,
            shadowOpacity: isDark ? 0.35 : 0.12,
            shadowRadius: 14
        )
    }
}
