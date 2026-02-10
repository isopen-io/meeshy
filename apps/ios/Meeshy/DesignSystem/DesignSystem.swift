import SwiftUI

// MARK: - Color Palette

public struct MeeshyColors {

    // MARK: Primary Colors
    public static let pink = Color(hex: "FF2E63")
    public static let coral = Color(hex: "FF6B6B")
    public static let cyan = Color(hex: "08D9D6")
    public static let purple = Color(hex: "A855F7")
    public static let deepPurple = Color(hex: "302B63")
    public static let darkBlue = Color(hex: "0F0C29")
    public static let green = Color(hex: "4ADE80")
    public static let orange = Color(hex: "F59E0B")

    // MARK: Gradients

    /// Main app background - Deep purple to dark
    public static let mainBackgroundGradient = LinearGradient(
        colors: [
            Color(hex: "0F0C29"),
            Color(hex: "302B63"),
            Color(hex: "24243E")
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Primary action gradient - Pink to coral
    public static let primaryGradient = LinearGradient(
        colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Secondary gradient - Cyan to dark
    public static let secondaryGradient = LinearGradient(
        colors: [Color(hex: "08D9D6"), Color(hex: "252A34")],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Accent gradient - Purple to pink to orange
    public static let accentGradient = LinearGradient(
        colors: [Color(hex: "8A2387"), Color(hex: "E94057"), Color(hex: "F27121")],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Avatar ring gradient - Pink to cyan
    public static let avatarRingGradient = LinearGradient(
        colors: [Color(hex: "FF2E63"), Color(hex: "08D9D6")],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Glass border gradient
    public static let glassBorderGradient = LinearGradient(
        colors: [Color.white.opacity(0.3), Color.white.opacity(0.1)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Material fill
    public static let glassFill = Material.ultraThin
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 255, 255, 255)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - View Modifiers

struct GlassCard: ViewModifier {
    var cornerRadius: CGFloat = 20

    func body(content: Content) -> some View {
        content
            .background(.ultraThinMaterial)
            .background(Color.black.opacity(0.2))
            .cornerRadius(cornerRadius)
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(MeeshyColors.glassBorderGradient, lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.2), radius: 10, x: 0, y: 5)
    }
}

struct GlowingBorder: ViewModifier {
    let gradient: LinearGradient
    var cornerRadius: CGFloat = 20
    var lineWidth: CGFloat = 2

    func body(content: Content) -> some View {
        content
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(gradient, lineWidth: lineWidth)
            )
    }
}

struct PressableButton: ViewModifier {
    @State private var isPressed = false

    func body(content: Content) -> some View {
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
struct ShimmerEffect: ViewModifier {
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
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
                withAnimation(.linear(duration: 2.0).repeatForever(autoreverses: false)) {
                    phase = 1
                }
            }
    }
}

// MARK: - Pulse Effect (gentle scale breathing)
struct PulseEffect: ViewModifier {
    let intensity: CGFloat
    @State private var isPulsing = false

    init(intensity: CGFloat = 0.04) {
        self.intensity = intensity
    }

    func body(content: Content) -> some View {
        content
            .scaleEffect(isPulsing ? 1 + intensity : 1)
            .animation(
                .easeInOut(duration: 1.8).repeatForever(autoreverses: true),
                value: isPulsing
            )
            .onAppear { isPulsing = true }
    }
}

// MARK: - Breathing Glow Effect
struct BreathingGlow: ViewModifier {
    let color: Color
    let intensity: Double
    @State private var isGlowing = false

    init(color: Color, intensity: Double = 0.5) {
        self.color = color
        self.intensity = intensity
    }

    func body(content: Content) -> some View {
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
            .onAppear { isGlowing = true }
    }
}

// MARK: - Staggered Appear Animation
struct StaggeredAppear: ViewModifier {
    let index: Int
    let baseDelay: Double
    @State private var isVisible = false

    init(index: Int, baseDelay: Double = 0.05) {
        self.index = index
        self.baseDelay = baseDelay
    }

    func body(content: Content) -> some View {
        content
            .opacity(isVisible ? 1 : 0)
            .offset(y: isVisible ? 0 : 20)
            .scaleEffect(isVisible ? 1 : 0.95)
            .animation(
                .spring(response: 0.45, dampingFraction: 0.8)
                    .delay(Double(index) * baseDelay),
                value: isVisible
            )
            .onAppear {
                isVisible = true
            }
    }
}

// MARK: - Bounce On Appear
struct BounceOnAppear: ViewModifier {
    @State private var isVisible = false
    let delay: Double

    init(delay: Double = 0) {
        self.delay = delay
    }

    func body(content: Content) -> some View {
        content
            .scaleEffect(isVisible ? 1 : 0.5)
            .opacity(isVisible ? 1 : 0)
            .animation(
                .spring(response: 0.4, dampingFraction: 0.6).delay(delay),
                value: isVisible
            )
            .onAppear { isVisible = true }
    }
}

// MARK: - Floating Animation (for ambient elements)
struct FloatingAnimation: ViewModifier {
    let offsetRange: CGFloat
    let duration: Double
    @State private var isFloating = false

    init(offsetRange: CGFloat = 15, duration: Double = 4.0) {
        self.offsetRange = offsetRange
        self.duration = duration
    }

    func body(content: Content) -> some View {
        content
            .offset(
                x: isFloating ? offsetRange : -offsetRange,
                y: isFloating ? -offsetRange * 0.7 : offsetRange * 0.7
            )
            .animation(
                .easeInOut(duration: duration).repeatForever(autoreverses: true),
                value: isFloating
            )
            .onAppear { isFloating = true }
    }
}

// MARK: - View Extensions

extension View {
    func glassCard(cornerRadius: CGFloat = 20) -> some View {
        modifier(GlassCard(cornerRadius: cornerRadius))
    }

    func glowingBorder(_ gradient: LinearGradient = MeeshyColors.avatarRingGradient, cornerRadius: CGFloat = 20, lineWidth: CGFloat = 2) -> some View {
        modifier(GlowingBorder(gradient: gradient, cornerRadius: cornerRadius, lineWidth: lineWidth))
    }

    func pressable() -> some View {
        modifier(PressableButton())
    }

    func shimmer() -> some View {
        modifier(ShimmerEffect())
    }

    func pulse(intensity: CGFloat = 0.04) -> some View {
        modifier(PulseEffect(intensity: intensity))
    }

    func breathingGlow(color: Color, intensity: Double = 0.5) -> some View {
        modifier(BreathingGlow(color: color, intensity: intensity))
    }

    func staggeredAppear(index: Int, baseDelay: Double = 0.05) -> some View {
        modifier(StaggeredAppear(index: index, baseDelay: baseDelay))
    }

    func bounceOnAppear(delay: Double = 0) -> some View {
        modifier(BounceOnAppear(delay: delay))
    }

    func floating(range: CGFloat = 15, duration: Double = 4.0) -> some View {
        modifier(FloatingAnimation(offsetRange: range, duration: duration))
    }

    public func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCorner(radius: radius, corners: corners))
    }
}

// MARK: - Shapes

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

// MARK: - Haptic Feedback

struct HapticFeedback {
    static func light() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func medium() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    static func heavy() {
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}
