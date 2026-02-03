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
            .scaleEffect(isPressed ? 0.95 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: isPressed)
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in isPressed = true }
                    .onEnded { _ in isPressed = false }
            )
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
