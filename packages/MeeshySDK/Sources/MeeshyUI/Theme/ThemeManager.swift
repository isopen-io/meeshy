import SwiftUI
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
        case .system: return "45B7D1"
        case .light: return "F8B500"
        case .dark: return "9B59B6"
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

public class ThemeManager: ObservableObject {
    public static let shared = ThemeManager()

    @Published public var mode: ThemeMode = .dark
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
        mode.isDark ? Color(hex: "0F0F14") : Color(hex: "F8F6F2")
    }

    public var backgroundSecondary: Color {
        mode.isDark ? Color(hex: "191920") : Color(hex: "FFFFFF")
    }

    public var backgroundTertiary: Color {
        mode.isDark ? Color(hex: "222230") : Color(hex: "F2EDE6")
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
        mode.isDark ? Color(hex: "F5F5F0") : Color(hex: "1C1917")
    }

    public var textSecondary: Color {
        mode.isDark ? Color(hex: "F5F5F0").opacity(0.7) : Color(hex: "1C1917").opacity(0.6)
    }

    public var textMuted: Color {
        mode.isDark ? Color(hex: "F5F5F0").opacity(0.5) : Color(hex: "1C1917").opacity(0.4)
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

    // MARK: - Background Gradient

    public var backgroundGradient: LinearGradient {
        if mode.isDark {
            return LinearGradient(
                colors: [Color(hex: "141418"), Color(hex: "18161E"), Color(hex: "0F0F14")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        } else {
            return LinearGradient(
                colors: [Color(hex: "FAF8F5"), Color(hex: "F5F0EA"), Color(hex: "F8F6F2")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        }
    }

    // MARK: - Input Field Styling

    public var inputBackground: Color {
        mode.isDark ? Color(hex: "1E1E28") : Color(hex: "F5F2ED")
    }

    public var inputBorder: Color {
        mode.isDark ? Color(hex: "3A3A48") : Color(hex: "DDD8D0")
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

    public var success: Color { Color(hex: "4ADE80") }
    public var error: Color { Color(hex: "FF6B6B") }
    public var warning: Color { Color(hex: "F59E0B") }
    public var info: Color { Color(hex: "45B7D1") }
    public var readReceipt: Color { Color(hex: "34B7F1") }
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
