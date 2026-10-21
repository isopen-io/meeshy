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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
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
    private var cancellables = Set<AnyCancellable>()

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
            MainActor.assumeIsolated { self?.resolveMode() }
        }

        observeRemoteThemeSync()
    }

    // MARK: - Remote Theme Sync (was push-only — never read back)

    /// Reflète `UserPreferencesManager.application.theme` dans `preference`
    /// quand — et SEULEMENT quand — une synchronisation serveur vient de
    /// s'achever (`lastSyncDate` avance : login via `observeAuth` ou
    /// refresh foreground via `observeForeground`, cf.
    /// `UserPreferencesManager.fetchFromBackend` → `applyRemote`).
    /// `dropFirst()` ignore le rejeu, à l'abonnement, du timestamp persisté
    /// au précédent lancement — sans ça, un choix local jamais encore
    /// synchronisé (`application.theme` toujours à son default `.auto`)
    /// serait écrasé au tout premier cold start post-fix. Corrige la sync
    /// thème auparavant unidirectionnelle (poussée au backend via
    /// `SettingsView.syncThemeToPrefs`, jamais relue).
    private func observeRemoteThemeSync() {
        UserPreferencesManager.shared.$lastSyncDate
            .dropFirst()
            .compactMap { $0 }
            .sink { [weak self] _ in
                guard let self else { return }
                let mapped = Self.mapRemoteTheme(UserPreferencesManager.shared.application.theme)
                guard self.preference != mapped else { return }
                self.preference = mapped
            }
            .store(in: &cancellables)
    }

    /// Pure mapping, `AppThemeMode` (backend) → `ThemePreference` (local
    /// display state) — extracted so it's unit-testable without touching
    /// either singleton. `nonisolated`: no actor-isolated state.
    nonisolated static func mapRemoteTheme(_ remote: AppThemeMode) -> ThemePreference {
        switch remote {
        case .auto: return .system
        case .light: return .light
        case .dark: return .dark
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
        guard preference == .system else { return }
        let resolved: ThemeMode = colorScheme == .dark ? .dark : .light
        guard mode != resolved else { return }
        // Defer the @Published mutation off the current SwiftUI update pass. The
        // colorScheme change that triggers this (SystemThemeDetector, on the
        // RootView path) is itself observed by views in-flight, so mutating
        // `mode` synchronously here republishes ThemeManager *within* that pass →
        // "Publishing changes from within view updates is not allowed" + parasitic
        // re-renders on the watchdog-sensitive root path (P0). Re-check on the
        // next main-actor turn in case `preference` changed meanwhile.
        Task { @MainActor [weak self] in
            guard let self, self.preference == .system, self.mode != resolved else { return }
            self.mode = resolved
        }
    }

    public var preferredColorScheme: ColorScheme? {
        switch preference {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    public var palette: ThemePalette { ThemePalette(mode: mode) }

    // MARK: - Background Colors

    public var backgroundPrimary: Color { palette.backgroundPrimary }
    public var backgroundSecondary: Color { palette.backgroundSecondary }
    public var backgroundTertiary: Color { palette.backgroundTertiary }

    // MARK: - Surface Colors

    public func surface(tint: String, intensity: Double = 0.15) -> Color {
        palette.surface(tint: tint, intensity: intensity)
    }

    public func surfaceGradient(tint: String) -> LinearGradient {
        palette.surfaceGradient(tint: tint)
    }

    public func surfaceGradient(tint: Color) -> LinearGradient {
        palette.surfaceGradient(tint: tint)
    }

    // MARK: - Border Colors

    public func border(tint: String, intensity: Double = 0.4) -> LinearGradient {
        palette.border(tint: tint, intensity: intensity)
    }

    public func border(tint: Color, intensity: Double = 0.4) -> LinearGradient {
        palette.border(tint: tint, intensity: intensity)
    }

    // MARK: - Text Colors

    public var textPrimary: Color { palette.textPrimary }
    public var textSecondary: Color { palette.textSecondary }
    public var textMuted: Color { palette.textMuted }

    public func accentText(_ hex: String) -> Color {
        palette.accentText(hex)
    }

    // MARK: - Button/Interactive Colors

    public func buttonGradient(color: String) -> LinearGradient {
        palette.buttonGradient(color: color)
    }

    public func buttonShadow(color: String) -> Color {
        palette.buttonShadow(color: color)
    }

    public var ambientOrbs: [(color: String, opacity: Double, size: CGFloat, offset: CGPoint)] {
        palette.ambientOrbs
    }

    public var backgroundGradient: LinearGradient { palette.backgroundGradient }

    // MARK: - Input Field Styling

    public var inputBackground: Color { palette.inputBackground }
    public var inputBorder: Color { palette.inputBorder }

    public var glassMaterial: some ShapeStyle { palette.glassMaterial }

    // MARK: - Semantic Colors

    public var success: Color { palette.success }
    public var error: Color { palette.error }
    public var warning: Color { palette.warning }
    public var info: Color { palette.info }
    public var readReceipt: Color { palette.readReceipt }
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
