import SwiftUI
import MeeshySDK

private struct ThemePaletteKey: EnvironmentKey {
    static let defaultValue: ThemePalette? = nil
}

extension EnvironmentValues {
    public var themePalette: ThemePalette? {
        get { self[ThemePaletteKey.self] }
        set { self[ThemePaletteKey.self] = newValue }
    }
}

extension ThemePalette {
    public nonisolated static func resolved(injected: ThemePalette?, colorScheme: ColorScheme) -> ThemePalette {
        injected ?? ThemePalette(colorScheme: colorScheme)
    }
}

@propertyWrapper
public struct ResolvedThemePalette: DynamicProperty {
    @Environment(\.themePalette) private var injected
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public var wrappedValue: ThemePalette {
        ThemePalette.resolved(injected: injected, colorScheme: colorScheme)
    }
}

extension View {
    public func meeshyThemeRoot(_ theme: ThemeManager) -> some View {
        preferredColorScheme(theme.preferredColorScheme)
            .environment(\.themePalette, theme.palette)
    }
}
