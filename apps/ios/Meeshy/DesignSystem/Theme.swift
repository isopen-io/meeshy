import SwiftUI

// MARK: - Theme Mode
enum ThemeMode: String, CaseIterable {
    case dark
    case light

    var isDark: Bool { self == .dark }
}

// MARK: - Conversation Context (for dynamic colors)
struct ConversationContext {
    let name: String
    let type: ConversationType
    let language: ConversationLanguage
    let theme: ConversationTheme
    let memberCount: Int

    enum ConversationType: String, CaseIterable {
        case direct      // 1-to-1
        case group       // Small group
        case community   // Large community
        case channel     // Broadcast channel
        case bot         // AI/Bot conversation
    }

    enum ConversationLanguage: String, CaseIterable {
        case french      // Blue tones
        case english     // Red/coral tones
        case spanish     // Orange/yellow tones
        case german      // Green tones
        case japanese    // Pink/cherry tones
        case arabic      // Gold/amber tones
        case chinese     // Red/crimson tones
        case portuguese  // Green/yellow tones
        case italian     // Green/red tones
        case other       // Purple tones
    }

    enum ConversationTheme: String, CaseIterable {
        case general     // Default
        case work        // Professional blue
        case social      // Vibrant pink
        case gaming      // Neon green
        case music       // Purple
        case sports      // Orange
        case tech        // Cyan
        case art         // Magenta
        case travel      // Teal
        case food        // Warm orange
    }
}

// MARK: - Dynamic Color Generator
struct DynamicColorGenerator {

    // Base vibrant colors for each factor
    private static let languageColors: [ConversationContext.ConversationLanguage: String] = [
        .french: "3498DB",      // Blue
        .english: "E74C3C",     // Red
        .spanish: "F39C12",     // Orange
        .german: "27AE60",      // Green
        .japanese: "E91E63",    // Pink
        .arabic: "F8B500",      // Gold
        .chinese: "C0392B",     // Crimson
        .portuguese: "2ECC71",  // Emerald
        .italian: "1ABC9C",     // Teal
        .other: "9B59B6"        // Purple
    ]

    private static let typeColors: [ConversationContext.ConversationType: String] = [
        .direct: "FF6B6B",      // Coral
        .group: "4ECDC4",       // Teal
        .community: "9B59B6",   // Purple
        .channel: "F8B500",     // Amber
        .bot: "00CED1"          // Cyan
    ]

    private static let themeColors: [ConversationContext.ConversationTheme: String] = [
        .general: "4ECDC4",
        .work: "3498DB",
        .social: "E91E63",
        .gaming: "2ECC71",
        .music: "9B59B6",
        .sports: "F39C12",
        .tech: "00CED1",
        .art: "E74C3C",
        .travel: "1ABC9C",
        .food: "FF7F50"
    ]

    // Generate color based on all context factors
    static func colorFor(context: ConversationContext) -> ConversationColorPalette {
        // Mix colors based on different factors with weights
        let nameHash = abs(context.name.hashValue)
        let langColor = languageColors[context.language] ?? "4ECDC4"
        let typeColor = typeColors[context.type] ?? "FF6B6B"
        let themeColor = themeColors[context.theme] ?? "4ECDC4"

        // Use member count to influence saturation
        let saturationBoost = min(1.0, Double(context.memberCount) / 100.0) * 0.2

        // Primary color based on weighted combination
        let primaryHex = blendColors(
            color1: langColor, weight1: 0.3,
            color2: typeColor, weight2: 0.3,
            color3: themeColor, weight3: 0.4
        )

        // Generate complementary colors
        let secondaryHex = shiftHue(hex: primaryHex, degrees: 30)
        let accentHex = shiftHue(hex: primaryHex, degrees: -30)

        return ConversationColorPalette(
            primary: primaryHex,
            secondary: secondaryHex,
            accent: accentHex,
            saturationBoost: saturationBoost
        )
    }

    // Simple color for name-based coloring (fallback)
    static func colorForName(_ name: String) -> String {
        let vibrantPalette = [
            "FF6B6B", "4ECDC4", "45B7D1", "96CEB4", "FFEAA7",
            "DDA0DD", "98D8C8", "F7DC6F", "BB8FCE", "85C1E9",
            "F8B500", "00CED1", "FF7F50", "9B59B6", "1ABC9C",
            "E74C3C", "3498DB", "2ECC71", "F39C12", "E91E63"
        ]
        let index = abs(name.hashValue) % vibrantPalette.count
        return vibrantPalette[index]
    }

    // Color blending helper
    private static func blendColors(color1: String, weight1: Double,
                                     color2: String, weight2: Double,
                                     color3: String, weight3: Double) -> String {
        let c1 = hexToRGB(color1)
        let c2 = hexToRGB(color2)
        let c3 = hexToRGB(color3)

        let r = Int(Double(c1.r) * weight1 + Double(c2.r) * weight2 + Double(c3.r) * weight3)
        let g = Int(Double(c1.g) * weight1 + Double(c2.g) * weight2 + Double(c3.g) * weight3)
        let b = Int(Double(c1.b) * weight1 + Double(c2.b) * weight2 + Double(c3.b) * weight3)

        return String(format: "%02X%02X%02X", min(255, r), min(255, g), min(255, b))
    }

    private static func hexToRGB(_ hex: String) -> (r: Int, g: Int, b: Int) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        var rgb: UInt64 = 0
        Scanner(string: hexSanitized).scanHexInt64(&rgb)

        return (
            r: Int((rgb & 0xFF0000) >> 16),
            g: Int((rgb & 0x00FF00) >> 8),
            b: Int(rgb & 0x0000FF)
        )
    }

    private static func shiftHue(hex: String, degrees: Double) -> String {
        let rgb = hexToRGB(hex)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0

        let color = UIColor(red: CGFloat(rgb.r)/255, green: CGFloat(rgb.g)/255, blue: CGFloat(rgb.b)/255, alpha: 1)
        color.getHue(&h, saturation: &s, brightness: &b, alpha: &a)

        h += CGFloat(degrees) / 360.0
        if h > 1 { h -= 1 }
        if h < 0 { h += 1 }

        let newColor = UIColor(hue: h, saturation: s, brightness: b, alpha: 1)
        var r: CGFloat = 0, g: CGFloat = 0, bl: CGFloat = 0
        newColor.getRed(&r, green: &g, blue: &bl, alpha: &a)

        return String(format: "%02X%02X%02X", Int(r*255), Int(g*255), Int(bl*255))
    }
}

// MARK: - Conversation Color Palette
struct ConversationColorPalette {
    let primary: String
    let secondary: String
    let accent: String
    let saturationBoost: Double

    var primaryColor: Color { Color(hex: primary) }
    var secondaryColor: Color { Color(hex: secondary) }
    var accentColor: Color { Color(hex: accent) }
}

// MARK: - Theme Manager
class ThemeManager: ObservableObject {
    static let shared = ThemeManager()

    @Published var mode: ThemeMode = .dark

    // MARK: - Background Colors (Pastel tones for both modes)
    var backgroundPrimary: Color {
        mode.isDark ?
            Color(hex: "1E1E2E") :  // Dark pastel blue-gray
            Color(hex: "E8E8F0")    // Light pastel blue-gray
    }

    var backgroundSecondary: Color {
        mode.isDark ?
            Color(hex: "252536") :  // Slightly lighter dark pastel
            Color(hex: "F0F0F8")    // Slightly lighter light pastel
    }

    var backgroundTertiary: Color {
        mode.isDark ?
            Color(hex: "2D2D40") :  // Even lighter dark pastel
            Color(hex: "E0E0EC")    // Slightly darker light pastel
    }

    // MARK: - Surface Colors (for cards)
    func surface(tint: String, intensity: Double = 0.15) -> Color {
        let tintColor = Color(hex: tint)
        if mode.isDark {
            return tintColor.opacity(intensity)
        } else {
            return tintColor.opacity(intensity * 0.5)
        }
    }

    func surfaceGradient(tint: String) -> LinearGradient {
        let intensity = mode.isDark ? 0.15 : 0.08
        return LinearGradient(
            colors: [
                Color(hex: tint).opacity(intensity),
                Color(hex: tint).opacity(intensity * 0.3)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Border Colors
    func border(tint: String, intensity: Double = 0.4) -> LinearGradient {
        LinearGradient(
            colors: [
                Color(hex: tint).opacity(mode.isDark ? intensity : intensity * 0.6),
                Color(hex: tint).opacity(mode.isDark ? intensity * 0.2 : intensity * 0.1)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Text Colors
    var textPrimary: Color {
        mode.isDark ? Color(hex: "FFFFFF") : Color(hex: "1A1A24")
    }

    var textSecondary: Color {
        mode.isDark ? Color(hex: "FFFFFF").opacity(0.7) : Color(hex: "1A1A24").opacity(0.6)
    }

    var textMuted: Color {
        mode.isDark ? Color(hex: "FFFFFF").opacity(0.5) : Color(hex: "1A1A24").opacity(0.4)
    }

    // MARK: - Button/Interactive Colors
    func buttonGradient(color: String) -> LinearGradient {
        LinearGradient(
            colors: [Color(hex: color), Color(hex: color).opacity(0.75)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    func buttonShadow(color: String) -> Color {
        Color(hex: color).opacity(mode.isDark ? 0.5 : 0.3)
    }

    // MARK: - Ambient Background Orbs
    var ambientOrbs: [(color: String, opacity: Double, size: CGFloat, offset: CGPoint)] {
        if mode.isDark {
            return [
                ("FF6B6B", 0.12, 300, CGPoint(x: -100, y: -200)),
                ("4ECDC4", 0.12, 350, CGPoint(x: 150, y: 300)),
                ("9B59B6", 0.10, 250, CGPoint(x: 100, y: -100)),
                ("F8B500", 0.08, 200, CGPoint(x: -150, y: 200))
            ]
        } else {
            return [
                ("FF6B6B", 0.08, 300, CGPoint(x: -100, y: -200)),
                ("4ECDC4", 0.08, 350, CGPoint(x: 150, y: 300)),
                ("9B59B6", 0.06, 250, CGPoint(x: 100, y: -100)),
                ("F8B500", 0.05, 200, CGPoint(x: -150, y: 200))
            ]
        }
    }

    // MARK: - Background Gradient (Pastel tones for both modes)
    var backgroundGradient: LinearGradient {
        if mode.isDark {
            return LinearGradient(
                colors: [
                    Color(hex: "252538"),  // Dark pastel purple-blue
                    Color(hex: "1E2A35"),  // Dark pastel teal-blue
                    Color(hex: "1E1E2E")   // Dark pastel blue-gray
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        } else {
            return LinearGradient(
                colors: [
                    Color(hex: "E8E0F0"),  // Light pastel purple
                    Color(hex: "E0ECF0"),  // Light pastel teal
                    Color(hex: "E8E8F0")   // Light pastel blue-gray
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    // MARK: - Input Field Styling
    var inputBackground: Color {
        mode.isDark ? Color(hex: "2D2D40") : Color(hex: "F0F0F8")
    }

    var inputBorder: Color {
        mode.isDark ? Color(hex: "404058") : Color(hex: "D0D0E0")
    }

    func inputBorderFocused(tint: String) -> LinearGradient {
        LinearGradient(
            colors: [Color(hex: tint), Color(hex: tint).opacity(0.6)],
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    // MARK: - Material
    var glassMaterial: some ShapeStyle {
        .ultraThinMaterial
    }
}

// MARK: - Environment Key
struct ThemeKey: EnvironmentKey {
    static let defaultValue = ThemeManager.shared
}

extension EnvironmentValues {
    var theme: ThemeManager {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

// MARK: - View Extension for Easy Theme Access
extension View {
    func withTheme(_ mode: ThemeMode) -> some View {
        self.environment(\.theme, ThemeManager.shared)
            .onAppear { ThemeManager.shared.mode = mode }
    }
}
