import SwiftUI
import MeeshySDK

public nonisolated struct ThemePalette: Equatable, Sendable {
    public let mode: ThemeMode

    public init(mode: ThemeMode) {
        self.mode = mode
    }

    public init(colorScheme: ColorScheme) {
        self.mode = colorScheme == .dark ? .dark : .light
    }

    public var isDark: Bool { mode.isDark }

    // MARK: - Background Colors

    public var backgroundPrimary: Color {
        MeeshyColors.backgroundPrimary(isDark: mode.isDark)
    }

    public var backgroundSecondary: Color {
        MeeshyColors.backgroundSecondary(isDark: mode.isDark)
    }

    public var backgroundTertiary: Color {
        mode.isDark ? Color(hex: "1E1B4B") : Color(hex: "EEF2FF")
    }

    // MARK: - Surface Colors

    public func surface(tint: String, intensity: Double = 0.15) -> Color {
        let tintColor = Color(hex: tint)
        return mode.isDark ? tintColor.opacity(intensity) : tintColor.opacity(intensity * 0.5)
    }

    public func surfaceGradient(tint: String) -> LinearGradient {
        let intensity = mode.isDark ? 0.15 : 0.08
        return LinearGradient(
            colors: [Color(hex: tint).opacity(intensity), Color(hex: tint).opacity(intensity * 0.3)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    public func surfaceGradient(tint: Color) -> LinearGradient {
        let intensity = mode.isDark ? 0.15 : 0.08
        return LinearGradient(
            colors: [tint.opacity(intensity), tint.opacity(intensity * 0.3)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    // MARK: - Border Colors

    public func border(tint: String, intensity: Double = 0.4) -> LinearGradient {
        LinearGradient(
            colors: [
                Color(hex: tint).opacity(mode.isDark ? intensity : intensity * 0.6),
                Color(hex: tint).opacity(mode.isDark ? intensity * 0.2 : intensity * 0.1)
            ],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    public func border(tint: Color, intensity: Double = 0.4) -> LinearGradient {
        LinearGradient(
            colors: [
                tint.opacity(mode.isDark ? intensity : intensity * 0.6),
                tint.opacity(mode.isDark ? intensity * 0.2 : intensity * 0.1)
            ],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    // MARK: - Text Colors

    public var textPrimary: Color {
        MeeshyColors.textPrimary(isDark: mode.isDark)
    }

    public var textSecondary: Color {
        MeeshyColors.textSecondary(isDark: mode.isDark)
    }

    public var textMuted: Color {
        MeeshyColors.textMuted(isDark: mode.isDark)
    }

    public func accentText(_ hex: String) -> Color {
        Color(hex: DynamicColorGenerator.adaptedColor(hex, for: mode))
    }

    // MARK: - Button/Interactive Colors

    public func buttonGradient(color: String) -> LinearGradient {
        LinearGradient(
            colors: [Color(hex: color), Color(hex: color).opacity(0.75)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    public func buttonShadow(color: String) -> Color {
        Color(hex: color).opacity(mode.isDark ? 0.5 : 0.3)
    }

    // MARK: - Ambient Background

    public var ambientOrbs: [(color: String, opacity: Double, size: CGFloat, offset: CGPoint)] {
        if mode.isDark {
            return [
                ("6366F1", 0.10, 300, CGPoint(x: -100, y: -200)),
                ("4338CA", 0.10, 350, CGPoint(x: 150, y: 300)),
                ("818CF8", 0.08, 250, CGPoint(x: 100, y: -100)),
                ("A5B4FC", 0.06, 200, CGPoint(x: -150, y: 200))
            ]
        } else {
            return [
                ("6366F1", 0.05, 300, CGPoint(x: -100, y: -200)),
                ("4338CA", 0.05, 350, CGPoint(x: 150, y: 300)),
                ("818CF8", 0.04, 250, CGPoint(x: 100, y: -100)),
                ("A5B4FC", 0.03, 200, CGPoint(x: -150, y: 200))
            ]
        }
    }

    public var backgroundGradient: LinearGradient {
        if mode.isDark {
            return LinearGradient(
                colors: [Color(hex: "09090B"), Color(hex: "0F0D19"), Color(hex: "13111C")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        } else {
            return LinearGradient(
                colors: [Color(hex: "FFFFFF"), Color(hex: "FAFAFF"), Color(hex: "F8F7FF")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        }
    }

    // MARK: - Input Field Styling

    public var inputBackground: Color {
        mode.isDark ? Color(hex: "16142A") : Color(hex: "F5F3FF")
    }

    public var inputBorder: Color {
        mode.isDark ? Color(hex: "312E81").opacity(0.6) : Color(hex: "C7D2FE")
    }

    public var glassMaterial: some ShapeStyle {
        .ultraThinMaterial
    }

    // MARK: - Semantic Colors

    public var success: Color { MeeshyColors.success }
    public var error: Color { MeeshyColors.error }
    public var warning: Color { MeeshyColors.warning }
    public var info: Color { MeeshyColors.info }
    public var readReceipt: Color { MeeshyColors.readReceipt }
}
