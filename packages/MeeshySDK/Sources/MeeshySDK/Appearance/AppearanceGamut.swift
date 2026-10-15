import Foundation

// MARK: - La gamme de 16 couleurs (#10631, spec § 7)
//
// Miroir de `packages/shared/design/appearance/gamut.ts`, lu depuis la copie
// embarquée du catalogue (`Resources/appearance-catalog.json`, gardée identique
// à la source par un témoin vitest). Une clé = la surface d'un fond uni et
// l'accent personnel, en clair et en sombre.

public enum AppearanceScheme: String, Sendable, Hashable {
    case light
    case dark
}

public struct AppearanceGamutShade: Codable, Hashable, Sendable {
    public let surface: String
    public let accent: String
}

public struct AppearanceGamutEntry: Codable, Hashable, Sendable, Identifiable {
    public let key: String
    public let name: String
    public let light: AppearanceGamutShade
    public let dark: AppearanceGamutShade

    public var id: String { key }

    public func shade(_ scheme: AppearanceScheme) -> AppearanceGamutShade {
        scheme == .dark ? dark : light
    }
}

public struct AppearanceGamut: Sendable {
    public let entries: [AppearanceGamutEntry]

    public init(entries: [AppearanceGamutEntry]) {
        self.entries = entries
    }

    public func contains(_ key: String) -> Bool {
        entries.contains { $0.key == key }
    }

    public func entry(_ key: String) -> AppearanceGamutEntry? {
        entries.first { $0.key == key }
    }

    /// `#RRGGBB` du fond uni ; `nil` pour une clé hors gamme (jamais fabriqué).
    public func surface(_ key: String, scheme: AppearanceScheme) -> String? {
        entry(key)?.shade(scheme).surface
    }

    /// `#RRGGBB` de l'accent personnel ; `nil` pour une clé hors gamme.
    public func accent(_ key: String, scheme: AppearanceScheme) -> String? {
        entry(key)?.shade(scheme).accent
    }
}
