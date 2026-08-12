import SwiftUI

// MARK: - Adaptive Liquid Glass (iOS 26)

/// iOS 26 introduced Liquid Glass (`glassEffect`, `GlassEffectContainer`,
/// `Glass`). These wrappers apply the real effect on iOS 26+ and degrade to a
/// translucent material (regular) or a solid tinted fill (prominent) on earlier
/// versions, so controls stay legible on every supported OS.
///
/// The gate lives here — like every other `Compatibility/` wrapper — because the
/// Swift compiler requires a real `if #available` to unlock a version-restricted
/// symbol; a `Platform` runtime `Bool` cannot. The iOS 26 branch is the
/// canonical Apple call, kept byte-for-byte so nothing regresses on iOS 26.
///
/// These are opaque atoms: the caller passes a `Shape` + `Color`; the wrapper
/// stays agnostic of any product styling (per SDK purity).
/// Reference: developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views
public extension View {
    /// Regular Liquid Glass — translucent, for secondary / neutral controls.
    ///
    /// - iOS 26+: `.glassEffect(.regular[.tint][.interactive], in: shape)`.
    /// - iOS < 26: an `.ultraThinMaterial` blur (the defining trait of glass) with
    ///   the `tint` layered on top when given, plus a hairline stroke so the
    ///   control reads as a distinct surface.
    ///
    /// Apply LAST in the modifier chain (after sizing) for correct rendering.
    @ViewBuilder
    func adaptiveGlass<S: Shape>(
        in shape: S = Circle(),
        tint: Color? = nil,
        interactive: Bool = false
    ) -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(makeMeeshyGlass(tint: tint, interactive: interactive), in: shape)
        } else {
            background(adaptiveGlassRegularFallback(in: shape, tint: tint))
        }
    }

    /// Prominent Liquid Glass — stronger emphasis, for the primary / destructive
    /// control (mirrors Apple's `.glassProminent`).
    ///
    /// - iOS 26+: tinted `.glassEffect`.
    /// - iOS < 26: a solid `tint` gradient + soft shadow, preserving the bold
    ///   affordance (e.g. a red hang-up button) instead of a pale translucency.
    @ViewBuilder
    func adaptiveGlassProminent<S: Shape>(
        in shape: S = Circle(),
        tint: Color,
        interactive: Bool = true
    ) -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(makeMeeshyGlass(tint: tint, interactive: interactive), in: shape)
        } else {
            background(adaptiveGlassProminentFallback(in: shape, tint: tint))
        }
    }

    /// Translucent sheet backdrop — the Liquid Glass treatment for sheets: the
    /// presenting context shows through instead of an opaque slab.
    ///
    /// - iOS 16.4+ (incl. 26): `presentationBackground(.ultraThinMaterial)` —
    ///   on iOS 26 the system sheet chrome already composes this as glass.
    /// - iOS < 16.4: no-op (the API doesn't exist; the sheet keeps its default
    ///   opaque background).
    ///
    /// Apply on the sheet's ROOT view, alongside `presentationDetents`.
    @ViewBuilder
    func adaptiveSheetGlassBackground() -> some View {
        if #available(iOS 16.4, *) {
            presentationBackground(.ultraThinMaterial)
        } else {
            self
        }
    }

    @ViewBuilder
    private func adaptiveGlassRegularFallback<S: Shape>(in shape: S, tint: Color?) -> some View {
        if let tint {
            shape.fill(.ultraThinMaterial)
                .overlay(shape.fill(tint.opacity(0.22)))
                .overlay(shape.stroke(tint.opacity(0.5), lineWidth: 1))
        } else {
            shape.fill(.ultraThinMaterial)
                .overlay(shape.stroke(Color.white.opacity(0.18), lineWidth: 1))
        }
    }

    private func adaptiveGlassProminentFallback<S: Shape>(in shape: S, tint: Color) -> some View {
        shape
            .fill(
                LinearGradient(
                    colors: [tint, tint.opacity(0.85)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .shadow(color: tint.opacity(0.4), radius: 8, y: 4)
    }
}

/// Builds the iOS 26 `Glass` value from the agnostic params. Free function so it
/// is callable from the `@ViewBuilder` body (which can't hold local statements).
@available(iOS 26.0, *)
private func makeMeeshyGlass(tint: Color?, interactive: Bool) -> Glass {
    var glass: Glass = .regular
    if let tint { glass = glass.tint(tint) }
    if interactive { glass = glass.interactive() }
    return glass
}

/// Groups adjacent Liquid Glass elements so they blend/morph (glass cannot
/// sample glass; without a container, overlapping glass clips). iOS 26+ uses the
/// real `GlassEffectContainer`; earlier versions render the content unchanged.
public struct AdaptiveGlassContainer<Content: View>: View {
    private let spacing: CGFloat
    private let content: Content

    public init(spacing: CGFloat = 20, @ViewBuilder content: () -> Content) {
        self.spacing = spacing
        self.content = content()
    }

    public var body: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) { content }
        } else {
            content
        }
    }
}
