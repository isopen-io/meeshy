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
public extension View {
    func adaptiveLiquidGlass<S: Shape>(
        in shape: S,
        tint: Color? = nil,
        interactive: Bool = false
    ) -> some View {
        modifier(AdaptiveLiquidGlassModifier(shape: shape, tint: tint, interactive: interactive))
    }
}

/// The hand-made glass recipe, as plain values — a `ViewModifier` cannot be
/// inspected, its recipe can.
public struct LiquidGlassFallbackRecipe: Equatable, Sendable {
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

private struct AdaptiveLiquidGlassModifier<S: Shape>: ViewModifier {
    let shape: S
    let tint: Color?
    let interactive: Bool

    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(makeMeeshyGlass(tint: tint, interactive: interactive), in: shape)
        } else {
            content.background(fallback)
        }
    }

    private var fallback: some View {
        let recipe = LiquidGlassFallbackRecipe.resolve(isDark: colorScheme == .dark, isTinted: tint != nil)
        return shape
            .fill(.ultraThinMaterial)
            .overlay(shape.fill((tint ?? .clear).opacity(recipe.tintWash)))
            .overlay(
                shape.fill(
                    LinearGradient(
                        colors: [Color.white.opacity(recipe.sheen), Color.white.opacity(0)],
                        startPoint: .top,
                        endPoint: .center
                    )
                )
            )
            .overlay(
                shape.stroke(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(recipe.rimLit),
                            Color.white.opacity(recipe.rimShade),
                            Color.white.opacity(recipe.rimLit * 0.5)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
            )
            .compositingGroup()
            .shadow(color: Color.black.opacity(recipe.shadowOpacity), radius: recipe.shadowRadius, y: 6)
    }
}
