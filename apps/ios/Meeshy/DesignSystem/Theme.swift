import SwiftUI
import MeeshySDK

// MARK: - Theme Manager
class ThemeManager: ObservableObject {
    static let shared = ThemeManager()

    @Published var mode: ThemeMode = .dark

    // MARK: - Background Colors (Warm tones for both modes)
    var backgroundPrimary: Color {
        mode.isDark ?
            Color(hex: "0F0F14") :  // Deep warm charcoal
            Color(hex: "F8F6F2")    // Warm off-white
    }

    var backgroundSecondary: Color {
        mode.isDark ?
            Color(hex: "191920") :  // Warm dark surface
            Color(hex: "FFFFFF")    // Clean white
    }

    var backgroundTertiary: Color {
        mode.isDark ?
            Color(hex: "222230") :  // Warm elevated surface
            Color(hex: "F2EDE6")    // Warm cream
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
        mode.isDark ? Color(hex: "F5F5F0") : Color(hex: "1C1917")
    }

    var textSecondary: Color {
        mode.isDark ? Color(hex: "F5F5F0").opacity(0.7) : Color(hex: "1C1917").opacity(0.6)
    }

    var textMuted: Color {
        mode.isDark ? Color(hex: "F5F5F0").opacity(0.5) : Color(hex: "1C1917").opacity(0.4)
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
                ("E76F51", 0.10, 300, CGPoint(x: -100, y: -200)),
                ("2A9D8F", 0.10, 350, CGPoint(x: 150, y: 300)),
                ("9B59B6", 0.08, 250, CGPoint(x: 100, y: -100)),
                ("E9C46A", 0.07, 200, CGPoint(x: -150, y: 200))
            ]
        } else {
            return [
                ("E76F51", 0.06, 300, CGPoint(x: -100, y: -200)),
                ("2A9D8F", 0.06, 350, CGPoint(x: 150, y: 300)),
                ("9B59B6", 0.04, 250, CGPoint(x: 100, y: -100)),
                ("E9C46A", 0.04, 200, CGPoint(x: -150, y: 200))
            ]
        }
    }

    // MARK: - Background Gradient (Warm tones for both modes)
    var backgroundGradient: LinearGradient {
        if mode.isDark {
            return LinearGradient(
                colors: [
                    Color(hex: "141418"),  // Deep warm charcoal
                    Color(hex: "18161E"),  // Hint of warm purple
                    Color(hex: "0F0F14")   // Deepest warm black
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        } else {
            return LinearGradient(
                colors: [
                    Color(hex: "FAF8F5"),  // Warm white
                    Color(hex: "F5F0EA"),  // Warm cream
                    Color(hex: "F8F6F2")   // Warm off-white
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    // MARK: - Input Field Styling
    var inputBackground: Color {
        mode.isDark ? Color(hex: "1E1E28") : Color(hex: "F5F2ED")
    }

    var inputBorder: Color {
        mode.isDark ? Color(hex: "3A3A48") : Color(hex: "DDD8D0")
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
