import SwiftUI
import Combine
import MeeshySDK

// MARK: - Theme Preference

public enum ThemePreference: String, CaseIterable {
    case system
    case light
    case dark

    public var icon: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light: return "sun.max.fill"
        case .dark: return "moon.fill"
        }
    }

    public var label: String {
        switch self {
        case .system: return "Auto"
        case .light: return "Clair"
        case .dark: return "Sombre"
        }
    }

    public var tintColor: String {
        switch self {
        case .system: return "818CF8"
        case .light: return "6366F1"
        case .dark: return "A5B4FC"
        }
    }

    public func next() -> ThemePreference {
        switch self {
        case .system: return .light
        case .light: return .dark
        case .dark: return .system
        }
    }

    public func resolvedMode(systemScheme: ColorScheme) -> ThemeMode {
        switch self {
        case .system: return systemScheme == .dark ? .dark : .light
        case .light: return .light
        case .dark: return .dark
        }
    }
}

// MARK: - Theme Manager

public class ThemeManager: ObservableObject, @unchecked Sendable {
    public static let shared = ThemeManager()

    @Published public var mode: ThemeMode = {
        UITraitCollection.current.userInterfaceStyle == .dark ? .dark : .light
    }()
    @Published public var preference: ThemePreference = .system {
        didSet {
            UserDefaults.standard.set(preference.rawValue, forKey: "themePreference")
            resolveMode()
        }
    }

    private var traitObserver: NSObjectProtocol?

    private init() {
        if let saved = UserDefaults.standard.string(forKey: "themePreference"),
           let pref = ThemePreference(rawValue: saved) {
            preference = pref
        }
        resolveMode()

        traitObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            self?.resolveMode()
        }
    }

    private var systemIsDark: Bool {
        UITraitCollection.current.userInterfaceStyle == .dark
    }

    private var systemScheme: ColorScheme {
        systemIsDark ? .dark : .light
    }

    public func resolveMode() {
        let resolved = preference.resolvedMode(systemScheme: systemScheme)
        if mode != resolved { mode = resolved }
    }

    public func syncWithSystem(_ colorScheme: ColorScheme) {
        if preference == .system {
            let resolved: ThemeMode = colorScheme == .dark ? .dark : .light
            if mode != resolved { mode = resolved }
        }
    }

    public func cyclePreference(systemScheme: ColorScheme) {
        preference = preference.next()
    }

    public var preferredColorScheme: ColorScheme? {
        switch preference {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    // MARK: - Background Colors

    public var backgroundPrimary: Color {
        mode.isDark ? Color(hex: "09090B") : Color(hex: "FFFFFF")
    }

    public var backgroundSecondary: Color {
        mode.isDark ? Color(hex: "13111C") : Color(hex: "F8F7FF")
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

    // MARK: - Text Colors

    public var textPrimary: Color {
        mode.isDark ? Color(hex: "EEF2FF") : Color(hex: "1E1B4B")
    }

    public var textSecondary: Color {
        mode.isDark ? Color(hex: "A5B4FC") : Color(hex: "4338CA").opacity(0.6)
    }

    public var textMuted: Color {
        mode.isDark ? Color(hex: "818CF8").opacity(0.5) : Color(hex: "6366F1").opacity(0.4)
    }

    // MARK: - Accent Text Color (theme-adapted)

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

    // MARK: - Ambient Background Orbs

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

    // MARK: - Background Gradient

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

    public func inputBorderFocused(tint: String) -> LinearGradient {
        LinearGradient(
            colors: [Color(hex: tint), Color(hex: tint).opacity(0.6)],
            startPoint: .leading, endPoint: .trailing
        )
    }

    // MARK: - Material

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

// MARK: - Environment Key

public struct ThemeKey: EnvironmentKey {
    public static let defaultValue = ThemeManager.shared
}

extension EnvironmentValues {
    public var theme: ThemeManager {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

// MARK: - View Extension

extension View {
    public func withTheme(_ mode: ThemeMode) -> some View {
        self.environment(\.theme, ThemeManager.shared)
            .onAppear { ThemeManager.shared.mode = mode }
    }
}
