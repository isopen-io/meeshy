import SwiftUI
import MeeshySDK

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
