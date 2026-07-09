import SwiftUI
import Combine
import MeeshySDK

// MARK: - Glass Card

public struct GlassCard: ViewModifier {
    public var cornerRadius: CGFloat = 20
    @ObservedObject private var theme = ThemeManager.shared

    public func body(content: Content) -> some View {
        content
            .background(.ultraThinMaterial)
            .cornerRadius(cornerRadius)
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(MeeshyColors.glassBorderGradient(isDark: theme.mode.isDark), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.2), radius: 10, x: 0, y: 5)
    }
}

// MARK: - Glass Control Foreground (lisibilité light + dark)

/// Foreground adaptatif pour une icône / un label posé sur une surface glass ou
/// material (barre, capsule, menu). Blanc en mode sombre, `indigo950` en mode
/// clair : le glass seul ne garantit pas le contraste d'un contenu **blanc** sur
/// fond clair, d'où les boutons du composer illisibles en light mode. Miroir du
/// pattern déjà éprouvé dans `ComposerToolPanelHost` / `ComposerBottomBand`.
public struct GlassControlForeground: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    public init() {}
    public func body(content: Content) -> some View {
        content.foregroundStyle(colorScheme == .dark ? Color.white : MeeshyColors.indigo950)
    }
}

public extension View {
    /// Applique un foreground adaptatif (blanc en sombre, `indigo950` en clair)
    /// pour rester lisible sur une surface glass dans les deux thèmes.
    func glassControlForeground() -> some View {
        modifier(GlassControlForeground())
    }
}

// MARK: - Glowing Border

public struct GlowingBorder: ViewModifier {
    public let gradient: LinearGradient
    public var cornerRadius: CGFloat = 20
    public var lineWidth: CGFloat = 2

    public func body(content: Content) -> some View {
        content
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(gradient, lineWidth: lineWidth)
            )
    }
}

// MARK: - Pressable Button

public struct PressableButton: ViewModifier {
    @State private var isPressed = false

    public func body(content: Content) -> some View {
        content
            .scaleEffect(isPressed ? 0.93 : 1.0)
            .brightness(isPressed ? -0.05 : 0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: isPressed)
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in isPressed = true }
                    .onEnded { _ in isPressed = false }
            )
    }
}

// MARK: - Shimmer Effect

public struct ShimmerEffect: ViewModifier {
    @State private var phase: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    private var reduceMotion: Bool { systemReduceMotion || userForcedReduceMotion }

    public func body(content: Content) -> some View {
        content
            .overlay(
                GeometryReader { geo in
                    LinearGradient(
                        colors: [
                            Color.white.opacity(0),
                            Color.white.opacity(0.15),
                            Color.white.opacity(0)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: geo.size.width * 0.6)
                    .offset(x: -geo.size.width * 0.3 + phase * (geo.size.width * 1.6))
                    .mask(content)
                }
            )
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.linear(duration: 2.0).repeatForever(autoreverses: false)) {
                    phase = 1
                }
            }
            .onDisappear {
                withTransaction(Transaction(animation: nil)) {
                    phase = 0
                }
            }
    }
}

// MARK: - Pulse Effect

public struct PulseEffect: ViewModifier {
    public let intensity: CGFloat
    @State private var isPulsing = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    private var reduceMotion: Bool { systemReduceMotion || userForcedReduceMotion }

    public init(intensity: CGFloat = 0.04) {
        self.intensity = intensity
    }

    public func body(content: Content) -> some View {
        content
            .scaleEffect(isPulsing ? 1 + intensity : 1)
            .animation(
                .easeInOut(duration: 1.8).repeatForever(autoreverses: true),
                value: isPulsing
            )
            .onAppear { guard !reduceMotion else { return }; isPulsing = true }
            .onDisappear {
                withTransaction(Transaction(animation: nil)) {
                    isPulsing = false
                }
            }
    }
}

// MARK: - Breathing Glow Effect

public struct BreathingGlow: ViewModifier {
    public let color: Color
    public let intensity: Double
    @State private var isGlowing = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    private var reduceMotion: Bool { systemReduceMotion || userForcedReduceMotion }

    public init(color: Color, intensity: Double = 0.5) {
        self.color = color
        self.intensity = intensity
    }

    public func body(content: Content) -> some View {
        content
            .shadow(
                color: color.opacity(isGlowing ? intensity : intensity * 0.3),
                radius: isGlowing ? 12 : 6,
                y: isGlowing ? 6 : 3
            )
            .animation(
                .easeInOut(duration: 2.0).repeatForever(autoreverses: true),
                value: isGlowing
            )
            .onAppear { guard !reduceMotion else { return }; isGlowing = true }
            .onDisappear {
                withTransaction(Transaction(animation: nil)) {
                    isGlowing = false
                }
            }
    }
}

// MARK: - Staggered Appear Animation

public struct StaggeredAppear: ViewModifier {
    public let index: Int
    public let baseDelay: Double
    @State private var isVisible = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    private var reduceMotion: Bool { systemReduceMotion || userForcedReduceMotion }

    public init(index: Int, baseDelay: Double = 0.05) {
        self.index = index
        self.baseDelay = baseDelay
    }

    public func body(content: Content) -> some View {
        content
            // Reduce Motion: render in the final (visible) state immediately —
            // no stagger fade/offset/scale, so content appears instantly.
            .opacity(reduceMotion || isVisible ? 1 : 0)
            .offset(y: reduceMotion ? 0 : (isVisible ? 0 : 20))
            .scaleEffect(reduceMotion ? 1 : (isVisible ? 1 : 0.95))
            .animation(
                reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.8)
                    .delay(Double(index) * baseDelay),
                value: isVisible
            )
            .onAppear { isVisible = true }
    }
}

// MARK: - Bounce On Appear

public struct BounceOnAppear: ViewModifier {
    @State private var isVisible = false
    public let delay: Double
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    private var reduceMotion: Bool { systemReduceMotion || userForcedReduceMotion }

    public init(delay: Double = 0) {
        self.delay = delay
    }

    public func body(content: Content) -> some View {
        content
            // Reduce Motion: appear instantly at full scale/opacity, no bounce.
            .scaleEffect(reduceMotion ? 1 : (isVisible ? 1 : 0.5))
            .opacity(reduceMotion || isVisible ? 1 : 0)
            .animation(
                reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.6).delay(delay),
                value: isVisible
            )
            .onAppear { isVisible = true }
    }
}

// MARK: - Floating Animation

public struct FloatingAnimation: ViewModifier {
    public let offsetRange: CGFloat
    public let duration: Double
    @State private var isFloating = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    private var reduceMotion: Bool { systemReduceMotion || userForcedReduceMotion }

    public init(offsetRange: CGFloat = 15, duration: Double = 4.0) {
        self.offsetRange = offsetRange
        self.duration = duration
    }

    public func body(content: Content) -> some View {
        content
            .offset(
                x: reduceMotion ? 0 : (isFloating ? offsetRange : -offsetRange),
                y: reduceMotion ? 0 : (isFloating ? -offsetRange * 0.7 : offsetRange * 0.7)
            )
            .animation(
                .easeInOut(duration: duration).repeatForever(autoreverses: true),
                value: isFloating
            )
            .onAppear { guard !reduceMotion else { return }; isFloating = true }
            .onDisappear {
                withTransaction(Transaction(animation: nil)) {
                    isFloating = false
                }
            }
    }
}

// MARK: - Bounce On Tap

public struct BounceOnTap: ViewModifier {
    public let scale: CGFloat
    @State private var isPressed = false

    public init(scale: CGFloat = 0.92) {
        self.scale = scale
    }

    public func body(content: Content) -> some View {
        content
            .scaleEffect(isPressed ? scale : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isPressed)
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        if !isPressed { isPressed = true }
                    }
                    .onEnded { _ in isPressed = false }
            )
    }
}

// MARK: - Bounce On Focus (text fields)

public struct BounceOnFocus: ViewModifier {
    public let focused: Bool

    public init(focused: Bool) {
        self.focused = focused
    }

    public func body(content: Content) -> some View {
        content
            .scaleEffect(focused ? 1.02 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: focused)
    }
}

// MARK: - Rounded Corner Shape

public struct RoundedCorner: Shape {
    public var radius: CGFloat = .infinity
    public var corners: UIRectCorner = .allCorners

    public init(radius: CGFloat = .infinity, corners: UIRectCorner = .allCorners) {
        self.radius = radius
        self.corners = corners
    }

    public func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(roundedRect: rect, byRoundingCorners: corners, cornerRadii: CGSize(width: radius, height: radius))
        return Path(path.cgPath)
    }
}

// MARK: - View Extensions

extension View {
    public func glassCard(cornerRadius: CGFloat = 20) -> some View {
        modifier(GlassCard(cornerRadius: cornerRadius))
    }

    public func glowingBorder(_ gradient: LinearGradient = MeeshyColors.brandGradient, cornerRadius: CGFloat = 20, lineWidth: CGFloat = 2) -> some View {
        modifier(GlowingBorder(gradient: gradient, cornerRadius: cornerRadius, lineWidth: lineWidth))
    }

    public func pressable() -> some View {
        modifier(PressableButton())
    }

    public func shimmer() -> some View {
        modifier(ShimmerEffect())
    }

    public func pulse(intensity: CGFloat = 0.04) -> some View {
        modifier(PulseEffect(intensity: intensity))
    }

    public func breathingGlow(color: Color, intensity: Double = 0.5) -> some View {
        modifier(BreathingGlow(color: color, intensity: intensity))
    }

    public func staggeredAppear(index: Int, baseDelay: Double = 0.05) -> some View {
        modifier(StaggeredAppear(index: index, baseDelay: baseDelay))
    }

    public func bounceOnAppear(delay: Double = 0) -> some View {
        modifier(BounceOnAppear(delay: delay))
    }

    public func floating(range: CGFloat = 15, duration: Double = 4.0) -> some View {
        modifier(FloatingAnimation(offsetRange: range, duration: duration))
    }

    public func bounceOnTap(scale: CGFloat = 0.92) -> some View {
        modifier(BounceOnTap(scale: scale))
    }

    /// Applique un modificateur conditionnel sans `AnyView`.
    @ViewBuilder
    public func ifTrue<T: View>(_ condition: Bool, transform: (Self) -> T) -> some View {
        if condition { transform(self) } else { self }
    }

    public func bounceOnFocus(_ focused: Bool) -> some View {
        modifier(BounceOnFocus(focused: focused))
    }

    public func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCorner(radius: radius, corners: corners))
    }
}

// MARK: - Zoom Transition (iOS 18+) — U1 story-sota

/// Namespace partagé pour les transitions zoom source→destination (iOS 18
/// `matchedTransitionSource` / `navigationTransition(.zoom)`). Injecté par
/// l'hôte qui présente (ex. RootView), lu par la surface source (ex. bulle
/// du story tray) et la destination (contenu du cover). `nil` = pas de zoom
/// (fallback transition système, iOS 16-17 inclus) — atome agnostique, la
/// décision « quelles surfaces zooment » reste app-side.
private struct ZoomTransitionNamespaceKey: EnvironmentKey {
    static let defaultValue: Namespace.ID? = nil
}

public extension EnvironmentValues {
    var zoomTransitionNamespace: Namespace.ID? {
        get { self[ZoomTransitionNamespaceKey.self] }
        set { self[ZoomTransitionNamespaceKey.self] = newValue }
    }
}

public extension View {
    /// Marque la vue comme SOURCE d'une transition zoom (no-op < iOS 18 ou
    /// sans namespace — jamais de régression 16-17).
    @ViewBuilder
    func zoomTransitionSource(id: String, in namespace: Namespace.ID?) -> some View {
        if #available(iOS 18.0, *), let namespace {
            self.matchedTransitionSource(id: id, in: namespace)
        } else {
            self
        }
    }

    /// Applique la transition zoom à la DESTINATION présentée (sheet/cover).
    /// No-op < iOS 18 ou sans namespace ; si aucune source enregistrée pour
    /// `sourceID`, iOS retombe sur la transition système standard.
    @ViewBuilder
    func zoomTransitionDestination(sourceID: String, in namespace: Namespace.ID?) -> some View {
        if #available(iOS 18.0, *), let namespace {
            self.navigationTransition(.zoom(sourceID: sourceID, in: namespace))
        } else {
            self
        }
    }
}
